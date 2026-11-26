import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { composeProduct, ingest, meanLuminance, naiveCutout, validateImage, watermark } from '@/lib/image'
import { productPhoto } from './helpers'

describe('image stages', () => {
  it('rejects files that are not images', async () => {
    await expect(ingest(Buffer.from('not an image'), 2048)).rejects.toMatchObject({ stage: 'ingest', status: 400 })
  })

  it('rejects images with too many pixels (decompression bombs)', async () => {
    await expect(validateImage(await productPhoto(200), 10_000)).rejects.toMatchObject({ status: 400 })
    await expect(validateImage(await productPhoto(200))).resolves.toBe('jpeg')
  })

  it('caps the long edge', async () => {
    const r = await ingest(await productPhoto(400), 100)
    expect([r.width, r.height]).toEqual([100, 100])
  })

  it('detects a dark product, crops it and centres it on a white square with an even margin', async () => {
    const { png } = await ingest(await productPhoto(200), 2048) // 100×100 product, off-centre in a 200 px photo
    const cut = await naiveCutout(png)
    expect(await meanLuminance(cut)).toBeLessThan(0.25)

    const { png: out, size } = await composeProduct(cut, { framing: 'standard', shadow: false, maxSize: 2000 })
    expect(size).toBe(Math.ceil(100 / 0.84)) // product + 8 % margin each side, never upscaled
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([size, size])
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]) // corner is white
    const at = (x: number, y: number) => data[(y * size + x) * info.channels]
    expect(at(size >> 1, size >> 1)).toBeLessThan(60) // product in the centre
    expect(at(4, size >> 1)).toBe(255) // margin left
    expect(at(size - 5, size >> 1)).toBe(255) // margin right (centred)
  })

  it('adds a soft shadow under the product, not above it', async () => {
    const { png } = await ingest(await productPhoto(200, '#3a6b4a'), 2048)
    const cut = await naiveCutout(png)
    const { png: out, size } = await composeProduct(cut, { framing: 'airy', shadow: true, maxSize: 2000 })
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true })
    const at = (x: number, y: number) => data[(y * size + x) * info.channels]
    const productBottom = Math.round(size * 0.86)
    expect(at(size >> 1, productBottom + 2)).toBeLessThan(250) // shadow just below
    expect(at(size >> 1, Math.round(size * 0.1))).toBe(255) // nothing above
  })

  it('refuses an empty cut-out', async () => {
    const empty = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()
    await expect(composeProduct(empty, { framing: 'standard', shadow: true, maxSize: 2000 })).rejects.toMatchObject({ stage: 'compose', status: 422 })
  })

  it('watermarks without changing the size', async () => {
    const out = await watermark(await sharp({ create: { width: 300, height: 200, channels: 3, background: '#fff' } }).png().toBuffer(), 'DEMO')
    expect(await sharp(out).metadata()).toMatchObject({ width: 300, height: 200 })
  })
})
