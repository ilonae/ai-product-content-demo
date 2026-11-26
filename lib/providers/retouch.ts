import sharp from 'sharp'
import type { Config } from '../config'
import { inpaint } from '../editing'
import { errorMessage } from '../errors'

export interface RetouchResult {
  png: Buffer
  provider: string
  model?: string
  note: string
  /** True when a paid call was made (even if it failed and the local fill took over). */
  paid: boolean
}

const PROMPT =
  'Seamless continuation of the surrounding product surface and studio backdrop. Same material, colour, texture and lighting. Clean product photo, no tape, no stickers, no text.'

/** Tape mask from the browser (alpha > 0 = tape) → single-channel 0/255 mask at the photo's size. */
export async function normaliseMask(mask: Buffer, width: number, height: number): Promise<{ png: Buffer; raw: Buffer; coverage: number }> {
  const raw = await sharp(mask)
    .ensureAlpha()
    .extractChannel(3)
    .resize(width, height, { fit: 'fill', kernel: 'nearest' })
    .threshold(1)
    .raw()
    .toBuffer()
  let on = 0
  for (let i = 0; i < raw.length; i++) if (raw[i]) on++
  const png = await sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer()
  return { png, raw, coverage: on / (width * height) }
}

/** Header-only check used by the route before a run is admitted: size, format and coverage. */
export async function maskCoverage(mask: Buffer): Promise<{ width: number; height: number; coverage: number }> {
  const meta = await sharp(mask, { limitInputPixels: 40_000_000 }).metadata()
  if (meta.format !== 'png') throw new Error('mask must be a PNG')
  const width = meta.width ?? 0
  const height = meta.height ?? 0
  const { coverage } = await normaliseMask(mask, width, height)
  return { width, height, coverage }
}

/** Local fill: onion-peel inpainting from the surrounding pixels (free, no network). */
async function localFill(png: Buffer, maskRaw: Buffer, width: number, height: number): Promise<Buffer> {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const m = new Uint8Array(width * height)
  for (let i = 0; i < m.length; i++) m[i] = maskRaw[i] ? 1 : 0
  inpaint(data, width, height, m)
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer()
}

/** Stability AI inpaint; only the masked area (feathered) is taken over, every other pixel stays exact. */
async function stabilityInpaint(png: Buffer, maskPng: Buffer, width: number, height: number, key: string): Promise<Buffer> {
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'image.png')
  form.append('mask', new Blob([new Uint8Array(maskPng)], { type: 'image/png' }), 'mask.png')
  form.append('prompt', PROMPT)
  form.append('output_format', 'png')
  const res = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
    body: form,
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`Stability inpaint: HTTP ${res.status}`)
  const ai = await sharp(Buffer.from(await res.arrayBuffer())).resize(width, height, { fit: 'fill' }).removeAlpha().png().toBuffer()
  const feather = await sharp(maskPng).blur(1.5).png().toBuffer()
  const aiMasked = await sharp(ai).joinChannel(feather).png().toBuffer()
  return sharp(png).composite([{ input: aiMasked }]).png().toBuffer()
}

/**
 * Repaint the tape marks. AI when configured (it can rebuild edges and texture), otherwise the
 * local fill. An AI failure never fails the run: the local fill takes over.
 */
export async function retouch(png: Buffer, mask: Buffer, width: number, height: number, cfg: Config): Promise<RetouchResult> {
  const m = await normaliseMask(mask, width, height)
  const share = `${Math.max(0.1, Math.round(m.coverage * 1000) / 10)} % of the photo`
  if (cfg.aiRetouch && !cfg.mock) {
    try {
      return { png: await stabilityInpaint(png, m.png, width, height, cfg.stabilityKey), provider: 'stability', model: 'inpaint', note: `${share} repainted`, paid: true }
    } catch (e) {
      return { png: await localFill(png, m.raw, width, height), provider: 'local', model: 'fill', note: `AI repaint failed (${errorMessage(e)}), filled locally`, paid: true }
    }
  }
  return { png: await localFill(png, m.raw, width, height), provider: 'local', model: 'fill', note: `${share} filled from surroundings`, paid: false }
}
