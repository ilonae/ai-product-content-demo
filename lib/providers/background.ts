import type { Config } from '../config'
import { errorMessage, PipelineError } from '../errors'
import sharp from 'sharp'
import { naiveCutout } from '../image'

export interface CutoutResult {
  png: Buffer
  provider: string
  model?: string
}

const STABILITY = 'https://api.stability.ai/v2beta/stable-image'

async function rembg(png: Buffer, cfg: Config): Promise<Buffer> {
  const q = new URLSearchParams({ model: cfg.rembgModel, ...(cfg.rembgPostProcess ? { post_process: '1' } : {}) })
  const res = await fetch(`${cfg.rembgUrl}/remove-bg?${q}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/png',
      ...(cfg.rembgToken ? { Authorization: `Bearer ${cfg.rembgToken}` } : {}),
    },
    body: new Uint8Array(png),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function stability(path: string, png: Buffer, key: string): Promise<Buffer> {
  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'image.png')
  form.append('output_format', 'png')
  const res = await fetch(`${STABILITY}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, Accept: 'image/*' },
    body: form,
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`Stability ${path}: HTTP ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

/** rembg service first (cheap CPU), Stability AI as cloud fallback, naive threshold only in mock mode. */
export async function removeBackground(png: Buffer, cfg: Config): Promise<CutoutResult> {
  const errors: string[] = []
  if (cfg.rembgUrl) {
    try {
      return { png: await rembg(png, cfg), provider: 'rembg', model: `${cfg.rembgModel}${cfg.rembgPostProcess ? ' + smoothing' : ''}` }
    } catch (e) {
      errors.push(`rembg: ${errorMessage(e)}`)
    }
  }
  if (cfg.stabilityKey) {
    try {
      return { png: await stability('edit/remove-background', png, cfg.stabilityKey), provider: 'stability', model: 'remove-background' }
    } catch (e) {
      errors.push(errorMessage(e))
    }
  }
  if (cfg.mock) return { png: await naiveCutout(png), provider: 'mock', model: 'white-threshold' }
  throw new PipelineError(
    'background',
    errors.length ? errors.join('; ') : 'No background-removal provider configured (set REMBG_URL or STABILITY_API_KEY).',
  )
}

/** Stability's fast upscaler accepts about 1 megapixel of input. */
const UPSCALE_MAX_PIXELS = 1_000_000

/** Optional AI upscale for dark products, where cut-outs lose the most detail. */
export function enhancer(cfg: Config): ((png: Buffer) => Promise<Buffer>) | null {
  if (!cfg.enhanceDarkProducts || !cfg.stabilityKey) return null
  return async (png) => {
    const { width = 0, height = 0 } = await sharp(png).metadata()
    const scale = Math.min(1, Math.sqrt(UPSCALE_MAX_PIXELS / Math.max(1, width * height)))
    const input = scale < 1 ? await sharp(png).resize(Math.floor(width * scale), Math.floor(height * scale)).png().toBuffer() : png
    return stability('upscale/fast', input, cfg.stabilityKey)
  }
}
