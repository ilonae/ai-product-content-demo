/**
 * Retouching helpers for the photo editor (pure, RGBA, browser and tests).
 * Ported from the production tool: the prop eraser's "grow into shadow" and tape inpainting.
 */

export type RGB = [number, number, number]

const lumOf = (d: ArrayLike<number>, o: number) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]

/** Average colour of the outer frame: the default colour of the prop eraser. */
export function backdropColour(d: ArrayLike<number>, w: number, h: number): RGB {
  const band = Math.max(1, Math.round(Math.min(w, h) * 0.04))
  const s = [0, 0, 0]
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x >= band && y >= band && x < w - band && y < h - band) continue
      const o = (y * w + x) * 4
      s[0] += d[o]
      s[1] += d[o + 1]
      s[2] += d[o + 2]
      n++
    }
  }
  return [Math.round(s[0] / n), Math.round(s[1] / n), Math.round(s[2] / n)]
}

/**
 * After an erase stroke, also paint over the prop's grey shadow halo: walk outward from the
 * stroke (up to maxDist px) through low-saturation pixels that are darker than the backdrop but
 * not product-dark, and paint them with the backdrop colour. Stops at the product.
 */
export function growIntoShadow(d: Uint8ClampedArray | Uint8Array, w: number, h: number, stroke: Uint8Array, colour: RGB, maxDist: number): number {
  const backLum = 0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2]
  const dist = new Int32Array(w * h).fill(-1)
  const queue = new Int32Array(w * h)
  let head = 0
  let tail = 0
  for (let i = 0; i < w * h; i++) if (stroke[i]) { dist[i] = 0; queue[tail++] = i }
  let painted = 0
  while (head < tail) {
    const i = queue[head++]
    if (dist[i] >= maxDist) continue
    const x = i % w
    const y = (i - x) / w
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const j = ny * w + nx
      if (dist[j] !== -1) continue
      const o = j * 4
      const sat = Math.max(d[o], d[o + 1], d[o + 2]) - Math.min(d[o], d[o + 1], d[o + 2])
      const l = lumOf(d, o)
      dist[j] = dist[i] + 1
      // shadow = grey, lighter than the product, darker than the backdrop
      if (sat < 40 && l >= backLum * 0.45 && l < backLum - 2) {
        d[o] = colour[0]
        d[o + 1] = colour[1]
        d[o + 2] = colour[2]
        painted++
        queue[tail++] = j
      }
    }
  }
  return painted
}

/**
 * Fill masked pixels from their surroundings, layer by layer from the edge inwards
 * ("onion peel"): each pixel becomes the mean of its already-known 8 neighbours.
 * Good for tape, clips and small marks; not for large holes.
 */
export function inpaint(d: Uint8ClampedArray | Uint8Array, w: number, h: number, mask: Uint8Array): number {
  const known = new Uint8Array(w * h)
  const queued = new Uint8Array(w * h)
  let frontier: number[] = []
  let left = 0
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) known[i] = 1
    else left++
  }
  const neighbours = (i: number, fn: (j: number) => void) => {
    const x = i % w
    const y = (i - x) / w
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue
        const nx = x + dx
        const ny = y + dy
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) fn(ny * w + nx)
      }
  }
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue
    let edge = false
    neighbours(i, (j) => { if (known[j]) edge = true })
    if (edge) { frontier.push(i); queued[i] = 1 }
  }
  const total = left
  while (frontier.length) {
    const fills: number[] = []
    for (const i of frontier) {
      let r = 0, g = 0, b = 0, n = 0
      neighbours(i, (j) => {
        if (!known[j]) return
        const o = j * 4
        r += d[o]; g += d[o + 1]; b += d[o + 2]; n++
      })
      if (n) fills.push(i, r / n, g / n, b / n)
    }
    const next: number[] = []
    for (let k = 0; k < fills.length; k += 4) {
      const i = fills[k]
      const o = i * 4
      d[o] = fills[k + 1]; d[o + 1] = fills[k + 2]; d[o + 2] = fills[k + 3]; d[o + 3] = 255
      known[i] = 1
      left--
    }
    for (let k = 0; k < fills.length; k += 4) {
      neighbours(fills[k], (j) => {
        if (!known[j] && !queued[j]) { queued[j] = 1; next.push(j) }
      })
    }
    frontier = next
  }
  return total - left
}
