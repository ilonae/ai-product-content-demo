import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import { maskCoverage, retouch } from '@/lib/providers/retouch'

const W = 100
const H = 100
const grey = () => sharp({ create: { width: W, height: H, channels: 3, background: '#b4b4b4' } }).png().toBuffer()
/** Tape mark: a 20×20 square (4 % of the photo). */
const mask = () =>
  sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from('<svg width="100" height="100"><rect x="40" y="40" width="20" height="20" fill="#f2b544"/></svg>') }])
    .png()
    .toBuffer()
const pixel = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const o = (y * info.width + x) * info.channels
  return [data[o], data[o + 1], data[o + 2]]
}
const cfg = (over: Partial<ReturnType<typeof getConfig>> = {}) => ({ ...getConfig(), mock: false, stabilityKey: 'sk-test', aiRetouch: true, ...over })

afterEach(() => vi.unstubAllGlobals())

describe('retouch (tape repainting)', () => {
  it('measures how much of the photo the tape covers', async () => {
    const m = await maskCoverage(await mask())
    expect(m).toMatchObject({ width: 100, height: 100 })
    expect(m.coverage).toBeCloseTo(0.04, 2)
  })

  it('uses AI inpainting when configured and only takes over the masked area', async () => {
    const red = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#ff0000' } }).png().toBuffer()
    const fetchMock = vi.fn(async () => new Response(new Uint8Array(red), { status: 200, headers: { 'Content-Type': 'image/png' } }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await retouch(await grey(), await mask(), W, H, cfg())
    expect(r).toMatchObject({ provider: 'stability', model: 'inpaint', paid: true })
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/stable-image/edit/inpaint')
    expect(await pixel(r.png, 50, 50)).toEqual([255, 0, 0]) // inside the tape: AI result
    expect(await pixel(r.png, 5, 5)).toEqual([180, 180, 180]) // outside: untouched
  })

  it('falls back to the local fill when the AI call fails, and never fails the run', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const r = await retouch(await grey(), await mask(), W, H, cfg())
    expect(r).toMatchObject({ provider: 'local', paid: true })
    expect(r.note).toContain('filled locally')
    expect(await pixel(r.png, 50, 50)).toEqual([180, 180, 180])
  })

  it('fills locally for free when no AI is configured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const r = await retouch(await grey(), await mask(), W, H, cfg({ aiRetouch: false }))
    expect(r).toMatchObject({ provider: 'local', paid: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
