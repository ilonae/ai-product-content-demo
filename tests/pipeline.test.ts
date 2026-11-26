import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { beforeAll, describe, expect, it } from 'vitest'
import { resolveBrand } from '@/lib/brand'
import { getConfig } from '@/lib/config'
import { writeCopyMock } from '@/lib/copy/mock'
import { naiveCutout } from '@/lib/image'
import { runPipeline, type PipelineDeps } from '@/lib/pipeline'
import { LocalStore } from '@/lib/store/local'
import { retouch } from '@/lib/providers/retouch'
import { PIPELINE_STAGES, type StageRecord } from '@/lib/types'
import { productPhoto } from './helpers'

let store: LocalStore
let deps: PipelineDeps

beforeAll(async () => {
  store = new LocalStore(await mkdtemp(path.join(tmpdir(), 'pipeline-')))
  deps = {
    config: getConfig(),
    store,
    removeBackground: async (png) => ({ png: await naiveCutout(png), provider: 'mock', model: 'white-threshold' }),
    enhance: async (png) => png,
    writeCopy: async (_img, brand, meta) => ({ copy: writeCopyMock(brand, meta), provider: 'mock', model: 'template', calls: 0, issues: [] }),
    retouch: (png, mask, w, h) => retouch(png, mask, w, h, { ...getConfig(), aiRetouch: false }),
  }
})

describe('runPipeline', () => {
  it('runs all five stages in order, reports each one live, and stores a permalinkable run', async () => {
    const seen: StageRecord[] = []
    const run = await runPipeline(
      { bytes: await productPhoto(), meta: { category: 'mug', notes: '350 ml' }, brand: resolveBrand('nordhaus'), source: 'live' },
      deps,
      (s) => seen.push(s),
    )
    expect(seen.map((s) => s.name)).toEqual([...PIPELINE_STAGES])
    expect(seen.every((s) => s.status === 'ok' && s.ms >= 0)).toBe(true)
    expect(run.stages.map((s) => s.name)).toEqual([...PIPELINE_STAGES])
    expect(run.stages.find((s) => s.name === 'compose')?.note).toContain('dark product')
    expect(run.copy.descriptions.de).toContain('350 ml')
    expect(run.watermarked).toBe(true)
    expect(run.outputUrl).toBe(`/api/files/${run.id}/output.png`)

    expect(await store.getRun(run.id)).toMatchObject({ id: run.id, copy: run.copy })
    const outMeta = await sharp(await store.readImage(run.id, 'output.png')).metadata()
    expect(outMeta.width).toBe(outMeta.height) // square catalogue image
    expect(run.width).toBe(outMeta.width)
  })

  it('records the failing stage and stops', async () => {
    const seen: StageRecord[] = []
    const failing = { ...deps, removeBackground: async () => { throw new Error('service down') } }
    await expect(
      runPipeline({ bytes: await productPhoto(), meta: {}, brand: resolveBrand(), source: 'live' }, failing, (s) => seen.push(s)),
    ).rejects.toThrow('service down')
    expect(seen.map((s) => `${s.name}:${s.status}`)).toEqual(['ingest:ok', 'background:error'])
  })

  it('keeps the plain cut-out when the optional upscale fails', async () => {
    const flaky = { ...deps, enhance: async () => { throw new Error('HTTP 400') } }
    const run = await runPipeline({ bytes: await productPhoto(), meta: {}, brand: resolveBrand(), source: 'gallery' }, flaky)
    expect(run.stages.find((s) => s.name === 'compose')).toMatchObject({ status: 'ok', note: expect.stringContaining('upscale skipped') })
  })

  it('adds a retouch stage when tape is marked, and keeps the uploaded photo as "before"', async () => {
    const bytes = await productPhoto()
    const mask = await sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: Buffer.from('<svg width="200" height="200"><rect x="60" y="90" width="80" height="20" fill="#f2b544"/></svg>') }])
      .png()
      .toBuffer()
    const seen: string[] = []
    const run = await runPipeline({ bytes, meta: {}, brand: resolveBrand(), source: 'gallery', mask }, deps, (s) => seen.push(s.name))
    expect(seen).toEqual(['ingest', 'retouch', 'background', 'compose', 'copy', 'persist'])
    expect(run.stages.find((s) => s.name === 'retouch')).toMatchObject({ status: 'ok', provider: 'local' })
    const before = await sharp(await store.readImage(run.id, 'original.png')).metadata()
    expect(before).toMatchObject({ width: 200, height: 200 })
  })

  it('uses a custom company bio when given', () => {
    expect(resolveBrand('nordhaus', '  We sell handmade ceramics.  ')).toMatchObject({ id: 'custom', bio: 'We sell handmade ceramics.' })
  })
})
