import sharp, { type OverlayOptions } from 'sharp'
import { PipelineError } from './errors'
import type { ModelImage } from './types'

const ACCEPTED = new Set(['jpeg', 'png', 'webp'])

/** A 4 MB file can still decode to gigabytes (decompression bomb): cap the pixel count. */
export const MAX_INPUT_PIXELS = 40_000_000

/** Check the file by its content (not its name). Cheap: reads the header only. */
export async function validateImage(bytes: Buffer, maxPixels = MAX_INPUT_PIXELS): Promise<string> {
  let format: string | undefined
  let pixels = 0
  try {
    const meta = await sharp(bytes, { limitInputPixels: maxPixels }).metadata()
    format = meta.format
    pixels = (meta.width ?? 0) * (meta.height ?? 0)
  } catch {
    throw new PipelineError('ingest', 'That file is not a readable image.', 400)
  }
  if (!format || !ACCEPTED.has(format)) {
    throw new PipelineError('ingest', 'Please upload a JPEG, PNG or WebP image.', 400)
  }
  if (pixels > maxPixels) throw new PipelineError('ingest', 'That image has too many pixels (max 40 MP).', 400)
  return format
}

/** Validate, fix EXIF rotation, cap the long edge, convert to PNG. */
export async function ingest(bytes: Buffer, maxEdgePx: number) {
  const format = await validateImage(bytes)
  const { data, info } = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: maxEdgePx, height: maxEdgePx, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true })
  return { png: data, width: info.width, height: info.height, format }
}

/** Mean luminance (0–1) of the visible (alpha ≥ 128) pixels of a cut-out. */
export async function meanLuminance(cutout: Buffer): Promise<number> {
  const { data, info } = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let sum = 0
  let n = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] < 128) continue
    sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    n++
  }
  return n ? sum / n / 255 : 1
}

export type Framing = 'tight' | 'standard' | 'airy'
export const FRAMING_MARGIN: Record<Framing, number> = { tight: 0.05, standard: 0.08, airy: 0.14 }

export interface ComposeOptions {
  framing: Framing
  shadow: boolean
  maxSize: number
}

/**
 * Catalogue composition:
 * 1. clean the edge: drop near-transparent pixels and tighten the alpha ramp (no bright or dark fringe),
 * 2. crop to the product,
 * 3. centre it on a pure white square with an even margin (never upscaled beyond its own resolution),
 * 4. optionally add a soft contact shadow under it.
 */
export async function composeProduct(cutout: Buffer, opts: ComposeOptions): Promise<{ png: Buffer; size: number }> {
  const { data, info } = await sharp(cutout).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h } = info
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4 + 3
      const a = data[k]
      data[k] = a < 16 ? 0 : a > 239 ? 255 : Math.round(((a - 16) * 255) / 223)
      if (data[k] > 8) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) throw new PipelineError('compose', 'No product was found after background removal.', 422, 'No product was found in this photo. Try another one.')

  const pw = x1 - x0 + 1
  const ph = y1 - y0 + 1
  const margin = FRAMING_MARGIN[opts.framing]
  const size = Math.min(opts.maxSize, Math.ceil(Math.max(pw, ph) / (1 - 2 * margin)))
  const fit = Math.floor(size * (1 - 2 * margin))
  const product = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: x0, top: y0, width: pw, height: ph })
    .resize({ width: fit, height: fit, fit: 'inside', withoutEnlargement: true, kernel: 'lanczos3' })
    .png()
    .toBuffer({ resolveWithObject: true })
  const left = Math.round((size - product.info.width) / 2)
  const top = Math.round((size - product.info.height) / 2)

  const layers: OverlayOptions[] = []
  if (opts.shadow) {
    const sw = Math.round(product.info.width * 0.72)
    const sh = Math.max(4, Math.round(Math.min(product.info.height * 0.05, sw * 0.18)))
    const cy = top + product.info.height - Math.round(sh * 0.3)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><ellipse cx="${size / 2}" cy="${cy}" rx="${sw / 2}" ry="${sh / 2}" fill="#000" fill-opacity="0.22"/></svg>`
    layers.push({ input: await sharp(Buffer.from(svg)).blur(Math.max(1, sh * 0.6)).png().toBuffer() })
  }
  layers.push({ input: product.data, left, top })

  const png = await sharp({ create: { width: size, height: size, channels: 3, background: '#ffffff' } }).composite(layers).png().toBuffer()
  return { png, size }
}

const escapeXml = (s: string) =>
  s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!)

/** Light watermark so live outputs can't be passed off as commercial assets. */
export async function watermark(png: Buffer, text: string): Promise<Buffer> {
  const { width = 1, height = 1 } = await sharp(png).metadata()
  const size = Math.max(12, Math.round(Math.min(width, height) * 0.035))
  // TODO: if the host has no system fonts (text renders as boxes), embed a font via @font-face.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <text x="${width - size}" y="${height - size}" text-anchor="end" font-family="sans-serif"
        font-size="${size}" font-weight="600" fill="#000" fill-opacity="0.3">${escapeXml(text)}</text></svg>`
  return sharp(png).composite([{ input: Buffer.from(svg) }]).png().toBuffer()
}

/** A smaller JPEG for the vision model: cheaper, and under provider image limits. */
export async function toModelImage(png: Buffer): Promise<ModelImage> {
  const data = await sharp(png)
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85 })
    .toBuffer()
  return { base64: data.toString('base64'), mediaType: 'image/jpeg' }
}

/** Offline stand-in for background removal (mock mode/tests): near-white pixels become transparent. */
export async function naiveCutout(png: Buffer, threshold = 235): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > threshold && data[i + 1] > threshold && data[i + 2] > threshold) data[i + 3] = 0
  }
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
}
