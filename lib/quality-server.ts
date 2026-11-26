import sharp from 'sharp'
import { MAX_INPUT_PIXELS } from './image'
import { ANALYSIS_EDGE, assessStudioQuality, type QualityResult } from './quality'

/** Server side of the studio gate: same check as the browser, on the uploaded bytes. */
export async function studioQuality(bytes: Buffer): Promise<QualityResult> {
  const img = sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).rotate()
  const meta = await sharp(bytes, { limitInputPixels: MAX_INPUT_PIXELS }).metadata()
  const longEdge = Math.max(meta.width ?? 0, meta.height ?? 0)
  const { data, info } = await img
    .resize(ANALYSIS_EDGE, ANALYSIS_EDGE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return assessStudioQuality(data, info.width, info.height, info.channels, longEdge)
}

export const studioGateEnabled = () => process.env.STUDIO_GATE !== 'off'
