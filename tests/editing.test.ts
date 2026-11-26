import { describe, expect, it } from 'vitest'
import { backdropColour, growIntoShadow, inpaint } from '@/lib/editing'

function canvas(w: number, h: number, fill: [number, number, number]) {
  const d = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) d.set([...fill, 255], i * 4)
  return d
}
const px = (d: Uint8ClampedArray, w: number, x: number, y: number) => Array.from(d.slice((y * w + x) * 4, (y * w + x) * 4 + 3))

describe('editing tools', () => {
  it('finds the backdrop colour from the frame', () => {
    const d = canvas(50, 50, [200, 200, 198])
    expect(backdropColour(d, 50, 50)).toEqual([200, 200, 198])
  })

  it('inpaints a taped stripe from its surroundings', () => {
    const w = 40, h = 40
    const d = canvas(w, h, [180, 180, 180])
    const mask = new Uint8Array(w * h)
    for (let y = 15; y < 25; y++) for (let x = 0; x < w; x++) { mask[y * w + x] = 1; d.set([230, 200, 60], (y * w + x) * 4) } // yellow tape
    expect(inpaint(d, w, h, mask)).toBe(10 * w)
    expect(px(d, w, 20, 20)).toEqual([180, 180, 180])
  })

  it('grows an erase stroke into the grey shadow but stops at the dark product', () => {
    const w = 60, h = 20
    const d = canvas(w, h, [210, 210, 210]) // backdrop
    for (let y = 0; y < h; y++) {
      for (let x = 10; x < 20; x++) d.set([150, 150, 150, 255], (y * w + x) * 4) // shadow
      for (let x = 20; x < 30; x++) d.set([30, 30, 30, 255], (y * w + x) * 4) // product
    }
    const stroke = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 5; x < 10; x++) stroke[y * w + x] = 1
    growIntoShadow(d, w, h, stroke, [210, 210, 210], 30)
    expect(px(d, w, 15, 10)).toEqual([210, 210, 210]) // shadow cleaned
    expect(px(d, w, 25, 10)).toEqual([30, 30, 30]) // product untouched
  })
})
