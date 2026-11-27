import sharp from 'sharp'
import { localFallbacksAllowed } from './config'

export type ModerationResult = { ok: true } | { ok: false; categories: string[] }

/**
 * Content check for every live upload: the photo and the visitor's own text go through OpenAI's
 * moderation endpoint (free of charge) before anything is spent, stored or shown on a public page.
 * Fails closed in production: if the check can't run, the upload is refused.
 */
export async function moderateUpload(image: Buffer, text: string, fetchImpl: typeof fetch = fetch): Promise<ModerationResult> {
  const key = process.env.OPENAI_API_KEY
  if (!key) {
    if (localFallbacksAllowed()) return { ok: true }
    throw new Error('OPENAI_API_KEY is required for the upload check.')
  }
  // A small JPEG is plenty for the classifier and keeps the request small.
  const small = await sharp(image).rotate().resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer()
  const input: unknown[] = [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${small.toString('base64')}` } }]
  if (text.trim()) input.push({ type: 'text', text: text.slice(0, 4000) })

  const res = await fetchImpl('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`moderation returned ${res.status}`)
  const body = (await res.json()) as { results?: { flagged: boolean; categories: Record<string, boolean> }[] }
  if (!body.results?.length) throw new Error('moderation returned no result')

  const flagged = body.results.filter((r) => r.flagged)
  if (flagged.length === 0) return { ok: true }
  const categories = [...new Set(flagged.flatMap((r) => Object.entries(r.categories).filter(([, on]) => on).map(([name]) => name)))]
  return { ok: false, categories }
}
