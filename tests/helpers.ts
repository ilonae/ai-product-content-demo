import sharp from 'sharp'

/** A dark square "product" on a white background. */
export async function productPhoto(size = 200, productColor = '#202020') {
  const inner = Math.round(size / 2)
  const square = await sharp({ create: { width: inner, height: inner, channels: 3, background: productColor } }).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 3, background: '#ffffff' } })
    .composite([{ input: square, left: Math.round(size / 4), top: Math.round(size / 4) }])
    .jpeg()
    .toBuffer()
}
