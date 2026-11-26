import { z } from 'zod'
import { MAX_BIO, resolveBrand } from '@/lib/brand'
import { getConfig } from '@/lib/config'
import { errorMessage, PipelineError } from '@/lib/errors'
import { admitLiveRun, clientIp, getCounter, hashIp, settleLiveRun, verifyTurnstile } from '@/lib/guards'
import { validateImage } from '@/lib/image'
import { studioGateEnabled, studioQuality } from '@/lib/quality-server'
import { defaultDeps, runPipeline, type PipelineFailure } from '@/lib/pipeline'
import { maskCoverage } from '@/lib/providers/retouch'
import sharp from 'sharp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const Fields = z.object({
  brandPreset: z.string().max(40).optional(),
  customBio: z.string().max(MAX_BIO).optional(),
  category: z.string().max(80).optional(),
  productType: z.string().max(80).optional(),
  material: z.string().max(80).optional(),
  notes: z.string().max(600).optional(),
  sku: z.string().max(64).regex(/^[\w.\-/ ]*$/).optional(),
  price: z.coerce.number().min(0).max(1_000_000).optional(),
  compareAtPrice: z.coerce.number().min(0).max(1_000_000).optional(),
  badge: z.enum(['new', 'sale', 'bestseller']).optional(),
  featured: z.literal('1').optional(),
  framing: z.enum(['tight', 'standard', 'airy']).optional(),
  shadow: z.enum(['0', '1']).optional(),
})

const json = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const text = (v: FormDataEntryValue | null) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const OFFLINE = { error: 'The live demo is offline right now. Browse the gallery instead.', reason: 'capacity' }

/**
 * Order matters: cheap checks before expensive ones, and nothing is buffered or decoded
 * before the bot check passes. Streams one NDJSON line per finished stage, then {type:"done", id}.
 */
export async function POST(req: Request) {
  const cfg = getConfig()

  // 1. Size, from the header, before reading the body.
  const declared = Number(req.headers.get('content-length') ?? 0)
  if (!declared || declared > cfg.maxUploadBytes + 100_000) return json({ error: 'Images up to 4 MB, please.' }, 413)

  // 2. Bot check: the token travels in a header, so it is verified before the body is parsed.
  const ip = clientIp(req.headers)
  try {
    if (!(await verifyTurnstile(req.headers.get('x-turnstile-token'), ip))) {
      return json({ error: 'The bot check failed. Reload the page and try again.', reason: 'turnstile' }, 403)
    }
  } catch (e) {
    console.error('[generate] turnstile unavailable:', errorMessage(e))
    return json({ error: 'The bot check is unavailable. Please try again in a minute.', reason: 'turnstile' }, 503)
  }

  // 3. Body and fields.
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return json({ error: 'Expected multipart form data.' }, 400)
  }
  const file = form.get('image')
  if (!(file instanceof File) || file.size === 0) return json({ error: 'Choose an image first.' }, 400)
  if (file.size > cfg.maxUploadBytes) return json({ error: 'Images up to 4 MB, please.' }, 413)
  const fields = Fields.safeParse({
    brandPreset: text(form.get('brandPreset')),
    customBio: text(form.get('customBio')),
    category: text(form.get('category')),
    productType: text(form.get('productType')),
    material: text(form.get('material')),
    notes: text(form.get('notes')),
    sku: text(form.get('sku')),
    price: text(form.get('price')),
    compareAtPrice: text(form.get('compareAtPrice')),
    badge: text(form.get('badge')),
    featured: text(form.get('featured')),
    framing: text(form.get('framing')),
    shadow: text(form.get('shadow')),
  })
  if (!fields.success) return json({ error: 'Please check the product details: one of them is too long or not valid.' }, 400)
  if (fields.data.compareAtPrice !== undefined && fields.data.price !== undefined && fields.data.compareAtPrice <= fields.data.price) {
    return json({ error: 'The compare-at price must be higher than the price.' }, 400)
  }

  // 4. Reject non-images (by content, header only) before they cost the visitor a run.
  const bytes = Buffer.from(await file.arrayBuffer())
  try {
    await validateImage(bytes)
  } catch (e) {
    return json({ error: e instanceof PipelineError ? e.publicMessage : 'Unreadable image.' }, 400)
  }

  // 4a. Optional tape mask: a PNG the size of the photo, covering at most a quarter of it.
  let mask: Buffer | undefined
  const maskFile = form.get('mask')
  if (maskFile instanceof File && maskFile.size > 0) {
    if (maskFile.size > 1_000_000) return json({ error: 'The tape marks file is too large.' }, 413)
    mask = Buffer.from(await maskFile.arrayBuffer())
    try {
      const m = await maskCoverage(mask)
      const photo = await sharp(bytes).rotate().metadata()
      const [pw, ph] = photo.orientation && photo.orientation >= 5 ? [photo.height, photo.width] : [photo.width, photo.height]
      if (m.width !== pw || m.height !== ph) return json({ error: 'The tape marks don’t match the photo. Reload and try again.' }, 400)
      if (m.coverage > cfg.maxRetouchCoverage) return json({ error: 'The tape marks cover too much of the photo. Mark only small areas.' }, 400)
      if (m.coverage === 0) mask = undefined
    } catch {
      return json({ error: 'The tape marks could not be read.' }, 400)
    }
  }

  // 4b. Studio-quality gate (same check the browser runs; enforced here). Free for the visitor.
  if (studioGateEnabled()) {
    const q = await studioQuality(bytes)
    if (!q.pass) return json({ error: 'This photo isn’t studio quality yet.', reason: 'quality', checks: q.checks }, 422)
  }

  // 5. Spend cap + per-IP limit; reserves the run's estimated cost.
  let counter, ipHash, admission
  try {
    counter = getCounter()
    ipHash = hashIp(ip)
    admission = await admitLiveRun(ipHash, counter, cfg, { retouch: Boolean(mask) })
  } catch (e) {
    console.error('[generate] guards unavailable:', errorMessage(e))
    return json(OFFLINE, 503)
  }
  if (!admission.ok) {
    return admission.reason === 'capacity'
      ? json({ error: 'The demo is at capacity for today. Browse the gallery instead.', reason: 'capacity' }, 503)
      : json({ error: `You've used your ${cfg.maxRunsPerIpPerDay} runs for today.`, reason: 'rate_limit' }, 429)
  }
  const { reservedUsd } = admission

  let deps
  try {
    deps = defaultDeps(cfg)
  } catch (e) {
    console.error('[generate] store unavailable:', errorMessage(e))
    await settleLiveRun(ipHash, counter, reservedUsd, { failed: true, spentUsd: 0 }).catch(() => {})
    return json(OFFLINE, 503)
  }

  const { brandPreset, customBio, featured, framing, shadow, ...rest } = fields.data
  const meta = { ...rest, featured: featured === '1' }
  const image = { framing: framing ?? 'standard', shadow: shadow !== '0' }
  const brand = resolveBrand(brandPreset, customBio)
  const enc = new TextEncoder()
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // If the visitor leaves, keep running: the paid calls are made, so finish and persist the result.
      const send = (o: unknown) => {
        if (closed) return
        try {
          controller.enqueue(enc.encode(`${JSON.stringify(o)}\n`))
        } catch {
          closed = true
        }
      }
      try {
        const run = await runPipeline({ bytes, meta, brand, source: 'live', mask, image }, deps, (stage) =>
          send({ type: 'stage', stage: { ...stage, note: stage.status === 'error' ? undefined : stage.note } }),
        )
        await settleLiveRun(ipHash, counter, reservedUsd, { actualUsd: run.estCostUsd }).catch(() => {})
        send({ type: 'done', id: run.id })
      } catch (e) {
        console.error('[generate] pipeline failed:', errorMessage(e))
        const spentUsd = (e as PipelineFailure).spentUsd ?? reservedUsd
        await settleLiveRun(ipHash, counter, reservedUsd, { failed: true, spentUsd }).catch(() => {})
        send({ type: 'error', message: e instanceof PipelineError ? e.publicMessage : 'Something went wrong. Please try again.' })
      } finally {
        if (!closed) {
          closed = true
          try {
            controller.close()
          } catch {
            /* already closed by the client */
          }
        }
      }
    },
    cancel() {
      closed = true
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}
