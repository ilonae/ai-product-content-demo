/**
 * Phone photos are often over the 4 MB upload limit (Vercel caps request bodies at 4.5 MB).
 * Instead of refusing them, the browser shrinks them to the size the server works at anyway
 * (`maxEdgePx`, 2048 px) and re-encodes them as JPEG. Photos already under the limit are left untouched.
 */

/** Largest photo the browser will try to shrink; beyond this, decoding gets slow and memory-hungry. */
export const MAX_SHRINK_BYTES = 30 * 1024 * 1024

/** Target size that fits inside `maxEdge` on the longest side, keeping the aspect ratio. Never enlarges. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), 'image/jpeg', q))

export async function shrinkToLimit(
  file: File,
  bitmap: ImageBitmap,
  maxBytes: number,
  maxEdge = 2048,
): Promise<{ file: File; bitmap: ImageBitmap; shrunk: boolean }> {
  if (file.size <= maxBytes) return { file, bitmap, shrunk: false }

  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  // JPEG has no transparency: flatten onto white, which matches the light studio backdrop.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, width, height)

  for (const quality of [0.92, 0.85, 0.75]) {
    const blob = await toBlob(canvas, quality)
    if (blob.size <= maxBytes) {
      const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`
      const out = new File([blob], name, { type: 'image/jpeg' })
      const small = await createImageBitmap(canvas)
      bitmap.close()
      return { file: out, bitmap: small, shrunk: true }
    }
  }
  throw new Error('Photo still too large after shrinking')
}
