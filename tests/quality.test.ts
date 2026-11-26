import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { assessStudioQuality } from '@/lib/quality'
import { studioQuality } from '@/lib/quality-server'

/** A product with real edges on a backdrop. */
async function shot(opts: { size?: number; backdrop?: string; blur?: number; noise?: boolean } = {}) {
  const size = opts.size ?? 1200
  const box = await sharp({ create: { width: Math.round(size / 3), height: Math.round(size / 2), channels: 3, background: '#2b2b2b' } })
    .composite([{ input: Buffer.from(`<svg width="${Math.round(size / 3)}" height="${Math.round(size / 2)}"><rect x="10%" y="10%" width="80%" height="15%" fill="#d0d0d0"/><rect x="10%" y="40%" width="80%" height="15%" fill="#909090"/></svg>`) }])
    .png()
    .toBuffer()
  let img = sharp({ create: { width: size, height: size, channels: 3, background: opts.backdrop ?? '#c8c8c6' } }).composite([{ input: box, left: Math.round(size / 3), top: Math.round(size / 4) }])
  let buf = await img.png().toBuffer()
  if (opts.blur) buf = await sharp(buf).blur(opts.blur).png().toBuffer()
  return buf
}

const failed = (r: Awaited<ReturnType<typeof studioQuality>>) => r.checks.filter((c) => !c.ok).map((c) => c.id)

describe('studio quality gate', () => {
  it('passes a studio shot: light, neutral, even backdrop, sharp, big enough', async () => {
    const r = await studioQuality(await shot())
    expect(failed(r)).toEqual([])
    expect(r.pass).toBe(true)
  })

  it('rejects a dark, warm backdrop (e.g. a wooden table)', async () => {
    const r = await studioQuality(await shot({ backdrop: '#5a3c22' }))
    expect(failed(r)).toEqual(expect.arrayContaining(['backdrop', 'neutral']))
    expect(r.checks.find((c) => c.id === 'neutral')?.detail).toContain('warm')
  })

  it('rejects a blurry photo', async () => {
    expect(failed(await studioQuality(await shot({ blur: 6 })))).toContain('sharp')
  })

  it('rejects small images', async () => {
    expect(failed(await studioQuality(await shot({ size: 600 })))).toContain('resolution')
  })

  it('rejects a cluttered backdrop', async () => {
    // half dark, half light frame
    const px = new Uint8Array(100 * 100 * 3)
    for (let i = 0; i < 100 * 100; i++) px.fill(i % 100 < 50 ? 40 : 220, i * 3, i * 3 + 3)
    const r = assessStudioQuality(px, 100, 100, 3, 2000)
    expect(r.checks.find((c) => c.id === 'even')?.ok).toBe(false)
  })

  it('gives a fix for every failed check', async () => {
    const r = await studioQuality(await shot({ backdrop: '#3a2a1a', size: 700, blur: 5 }))
    for (const c of r.checks.filter((c) => !c.ok)) expect(c.tip.length).toBeGreaterThan(20)
  })
})
