import { ANALYSIS_EDGE, assessStudioQuality, type QualityResult } from './quality'

/** Browser side of the studio gate: instant feedback, same thresholds as the server. */
export function checkBitmap(bmp: ImageBitmap): QualityResult {
  const scale = Math.min(1, ANALYSIS_EDGE / Math.max(bmp.width, bmp.height))
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  return assessStudioQuality(ctx.getImageData(0, 0, w, h).data, w, h, 4, Math.max(bmp.width, bmp.height))
}
