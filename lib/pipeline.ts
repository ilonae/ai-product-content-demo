import type { BrandProfile } from './brand'
import { getConfig, type Config } from './config'
import { writeCopy, type CopyResult } from './copy'
import { errorMessage } from './errors'
import { newRunId } from './id'
import { composeProduct, ingest, meanLuminance, toModelImage, watermark, type Framing } from './image'
import { enhancer, removeBackground, type CutoutResult } from './providers/background'
import { retouch, type RetouchResult } from './providers/retouch'
import { getStore, type Store } from './store'
import type { ModelImage, ProductMeta, Run, StageName, StageRecord } from './types'

export interface PipelineInput {
  bytes: Buffer
  meta: ProductMeta
  brand: BrandProfile
  source: 'live' | 'gallery'
  /** Optional tape mask (PNG, alpha > 0 = repaint), same size as the photo. */
  mask?: Buffer
  /** How the product sits in the square image. */
  image?: { framing: Framing; shadow: boolean }
}

/** Every external dependency is injectable, so the pipeline runs offline in tests. */
export interface PipelineDeps {
  config: Config
  store: Store
  removeBackground: (png: Buffer) => Promise<CutoutResult>
  enhance: ((png: Buffer) => Promise<Buffer>) | null
  writeCopy: (image: ModelImage, brand: BrandProfile, meta: ProductMeta) => Promise<CopyResult>
  retouch: (png: Buffer, mask: Buffer, width: number, height: number) => Promise<RetouchResult>
}

export function defaultDeps(config = getConfig(), store = getStore()): PipelineDeps {
  return {
    config,
    store,
    removeBackground: (png) => removeBackground(png, config),
    enhance: enhancer(config),
    writeCopy: (image, brand, meta) => writeCopy(config, image, brand, meta),
    retouch: (png, mask, w, h) => retouch(png, mask, w, h, config),
  }
}

interface StageOutput<T> {
  value: T
  provider?: string
  model?: string
  note?: string
}

/** The spend recorded so far, for refunds when a run fails part-way. */
export type PipelineFailure = Error & { spentUsd?: number }

export async function runPipeline(
  input: PipelineInput,
  deps: PipelineDeps,
  onStage?: (stage: StageRecord) => void,
): Promise<Run> {
  const { config } = deps
  const id = newRunId()
  const stages: StageRecord[] = []
  let estCostUsd = 0

  const record = (rec: StageRecord) => {
    stages.push(rec)
    onStage?.(rec)
  }

  async function stage<T>(name: StageName, fn: () => Promise<StageOutput<T>>): Promise<T> {
    const t0 = performance.now()
    try {
      const out = await fn()
      record({ name, status: 'ok', ms: Math.round(performance.now() - t0), provider: out.provider, model: out.model, note: out.note })
      return out.value
    } catch (e) {
      record({ name, status: 'error', ms: Math.round(performance.now() - t0), note: errorMessage(e) })
      // A failed paid call may still be billed: count copy as spent once it was attempted.
      if (name === 'copy') estCostUsd += config.estCostUsd.copy
      if (e instanceof Error) (e as PipelineFailure).spentUsd = estCostUsd
      throw e
    }
  }

  // 1. Ingest: validate by content, normalise orientation and size.
  const img = await stage('ingest', async () => {
    const r = await ingest(input.bytes, config.maxEdgePx)
    return { value: r, provider: 'sharp', note: `${r.format} → ${r.width}×${r.height} PNG` }
  })

  // "Before" shows the photo as uploaded, not the retouched version.
  const uploadedPng = img.png
  let photo: Buffer = img.png

  // 1b. Retouch (optional): repaint the tape marks before the cut-out sees them.
  if (input.mask) {
    const mask = input.mask
    photo = await stage('retouch', async () => {
      const r = await deps.retouch(img.png, mask, img.width, img.height)
      if (r.paid) estCostUsd += config.estCostUsd.retouch
      return { value: r.png, provider: r.provider, model: r.model, note: r.note }
    })
  }

  // 2. Background removal → transparent PNG.
  const cutout = await stage('background', async () => {
    const r = await deps.removeBackground(photo)
    if (r.provider === 'stability') estCostUsd += config.estCostUsd.background
    return { value: r.png, provider: r.provider, model: r.model }
  })

  let outSize = 0
  // 3. Compose: product centred on a white square, clean edges, optional soft shadow (+ optional upscale for dark products).
  const composed = await stage('compose', async () => {
    const lum = await meanLuminance(cutout)
    const dark = lum < config.darkLuminance
    let source = cutout
    let note = `product luminance ${lum.toFixed(2)}`
    let enhanced = false
    if (dark && deps.enhance) {
      // Optional polish: if the upscaler fails, keep the plain cut-out instead of failing the run.
      try {
        source = await deps.enhance(cutout)
        enhanced = true
        estCostUsd += config.estCostUsd.enhance
        note += ' · dark product, upscaled before compositing'
      } catch (e) {
        note += ` · upscale skipped (${errorMessage(e)})`
      }
    }
    const framing = input.image?.framing ?? 'standard'
    const shadow = input.image?.shadow ?? true
    const framed = await composeProduct(source, { framing, shadow, maxSize: config.outputMaxSize })
    outSize = framed.size
    let out = framed.png
    note += ` · ${outSize}×${outSize} px, ${framing} framing${shadow ? ', soft shadow' : ''}`
    if (input.source === 'live') out = await watermark(out, config.watermarkText)
    return { value: out, provider: 'sharp', model: enhanced ? 'stability upscale/fast' : undefined, note }
  })

  // 4. Copy: a vision-language model reads the image + metadata → name and DE/EN/ES descriptions.
  let copyIssues: string[] = []
  const copy = await stage('copy', async () => {
    const r = await deps.writeCopy(await toModelImage(composed), input.brand, input.meta)
    estCostUsd += config.estCostUsd.copy * r.calls
    copyIssues = r.issues
    const quality = r.calls > 1 ? (r.issues.length ? ` · revised, ${r.issues.length} rule(s) still open` : ' · revised once, all rules met') : r.calls ? ' · all rules met' : ''
    return { value: r.copy, provider: r.provider, model: r.model, note: `brand: ${input.brand.name}${quality}` }
  })

  // 5. Persist: images + run row. The stored record times the image uploads; the row insert follows it.
  const t0 = performance.now()
  try {
    const [originalUrl, outputUrl] = await Promise.all([
      deps.store.putImage(id, 'original.png', uploadedPng),
      deps.store.putImage(id, 'output.png', composed),
    ])
    const run: Run = {
      id,
      createdAt: new Date().toISOString(),
      source: input.source,
      brand: { id: input.brand.id, name: input.brand.name },
      meta: input.meta,
      originalUrl,
      outputUrl,
      width: outSize,
      height: outSize,
      copy,
      stages: [...stages],
      estCostUsd: Math.round(estCostUsd * 1000) / 1000,
      watermarked: input.source === 'live',
      copyIssues,
    }
    // Upload time is what the visitor waits for; the row insert follows.
    const persist: StageRecord = { name: 'persist', status: 'ok', ms: Math.round(performance.now() - t0), provider: deps.store.kind, note: `/r/${id}` }
    run.stages.push(persist)
    await deps.store.saveRun(run)
    record({ ...persist })
    return run
  } catch (e) {
    record({ name: 'persist', status: 'error', ms: Math.round(performance.now() - t0), note: errorMessage(e) })
    if (e instanceof Error) (e as PipelineFailure).spentUsd = estCostUsd
    throw e
  }
}
