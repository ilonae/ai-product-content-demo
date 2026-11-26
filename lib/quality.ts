/**
 * Studio-quality gate. Pure functions (no Node or DOM APIs), so the browser runs the exact
 * same check for instant feedback that the server runs to enforce it.
 *
 * Callers pass RGB(A) pixels downscaled so the long edge is ANALYSIS_EDGE: the sharpness
 * measure depends on scale, and 512 px keeps the check fast on phones.
 */

export const ANALYSIS_EDGE = 512

/**
 * Calibrated on a real studio catalogue shot (light-grey seamless sweep, diffused light):
 * backdrop 0.69 bright, cast 4.5, unevenness 0.11, edge sharpness 95, 1500×2000 px.
 * A 3 px blur of that shot scores 46 on sharpness; a 1.5 px blur 78.
 */
export const STUDIO_THRESHOLDS = {
  minBackdrop: 0.55, // mean brightness of the outer frame (0–1)
  maxCast: 15, // largest RGB channel difference in the backdrop (0–255)
  maxUnevenness: 0.14, // brightness standard deviation of the backdrop (0–1)
  maxClipHigh: 0.1, // share of blown-out pixels inside the frame (a white backdrop may clip)
  meanRange: [0.3, 0.92] as const, // overall exposure
  minSharpness: 55, // mean of the strongest 1 % Laplacian responses at ANALYSIS_EDGE (edge crispness)
  minLongEdge: 1000, // pixels, original file
}

export type CheckId = 'backdrop' | 'neutral' | 'even' | 'exposure' | 'sharp' | 'resolution'

export interface QualityCheck {
  id: CheckId
  label: string
  ok: boolean
  detail: string
  tip: string
}

export interface QualityMetrics {
  mean: number
  clipHigh: number
  backdrop: number
  unevenness: number
  cast: number
  castHue: 'warm' | 'cool' | 'green' | 'magenta' | 'neutral'
  sharpness: number
  longEdge: number
}

export interface QualityResult {
  pass: boolean
  checks: QualityCheck[]
  metrics: QualityMetrics
}

const pct = (x: number) => `${Math.round(x * 100)} %`

export function measure(px: ArrayLike<number>, width: number, height: number, channels: number, longEdge: number): QualityMetrics {
  const n = width * height
  const lum = new Float32Array(n)
  let sum = 0
  for (let i = 0; i < n; i++) {
    const o = i * channels
    const l = 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2]
    lum[i] = l
    sum += l
  }

  // Backdrop = the outer 8 % frame of the picture, where a studio sweep is.
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.08))
  let bSum = 0
  let bSq = 0
  let bN = 0
  let clip = 0
  let inner = 0
  const rgb = [0, 0, 0]
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      if (x >= band && y >= band && x < width - band && y < height - band) {
        inner++
        if (lum[i] > 250) clip++
        continue
      }
      const o = i * channels
      bSum += lum[i]
      bSq += lum[i] * lum[i]
      rgb[0] += px[o]
      rgb[1] += px[o + 1]
      rgb[2] += px[o + 2]
      bN++
    }
  }
  const bMean = bSum / bN
  const [r, g, b] = rgb.map((v) => v / bN)
  const cast = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b))
  let castHue: QualityMetrics['castHue'] = 'neutral'
  if (cast > 8) {
    if (r - b > 8 && r >= g) castHue = 'warm'
    else if (b - r > 8) castHue = 'cool'
    else if (g > r && g > b) castHue = 'green'
    else castHue = 'magenta'
  }

  // Sharpness: how crisp the strongest edges are (mean of the top 1 % |Laplacian|).
  // Unlike the Laplacian variance, this doesn't punish minimal shots with large smooth areas.
  const hist = new Uint32Array(1021) // |L| ranges 0..1020 (4·255)
  let k = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      hist[Math.min(1020, Math.round(Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - width] - lum[i + width])))]++
      k++
    }
  }
  let want = Math.max(1, Math.ceil(k * 0.01))
  let edgeSum = 0
  const take = want
  for (let v = 1020; v >= 0 && want > 0; v--) {
    const c = Math.min(hist[v], want)
    edgeSum += c * v
    want -= c
  }

  return {
    mean: sum / n / 255,
    clipHigh: inner ? clip / inner : 0,
    backdrop: bMean / 255,
    unevenness: Math.sqrt(Math.max(0, bSq / bN - bMean * bMean)) / 255,
    cast,
    castHue,
    sharpness: k ? edgeSum / take : 0,
    longEdge,
  }
}

export function assessStudioQuality(
  px: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
  longEdge: number,
  t = STUDIO_THRESHOLDS,
): QualityResult {
  const m = measure(px, width, height, channels, longEdge)
  const exposureOk = m.clipHigh <= t.maxClipHigh && m.mean >= t.meanRange[0] && m.mean <= t.meanRange[1]
  const checks: QualityCheck[] = [
    {
      id: 'backdrop',
      label: 'Light backdrop',
      ok: m.backdrop >= t.minBackdrop,
      detail: `Backdrop is ${pct(m.backdrop)} bright`,
      tip: 'Shoot on a light grey or white seamless backdrop (a sheet of paper curved up the wall works).',
    },
    {
      id: 'neutral',
      label: 'Neutral colour',
      ok: m.cast <= t.maxCast,
      detail: m.cast <= t.maxCast ? 'No colour cast' : `Strong ${m.castHue} colour cast`,
      tip: 'Use daylight-balanced light (5000–5600 K) and switch off warm room lamps.',
    },
    {
      id: 'even',
      label: 'Even light',
      ok: m.unevenness <= t.maxUnevenness,
      detail: m.unevenness <= t.maxUnevenness ? 'Backdrop is evenly lit' : 'Backdrop is uneven or cluttered',
      tip: 'Clear everything else out of the frame and light the backdrop evenly from both sides.',
    },
    {
      id: 'exposure',
      label: 'Exposure',
      ok: exposureOk,
      detail: m.clipHigh > t.maxClipHigh ? `${pct(m.clipHigh)} blown out` : m.mean < t.meanRange[0] ? 'Too dark overall' : m.mean > t.meanRange[1] ? 'Too bright overall' : 'Well exposed',
      tip: 'Diffuse the light (a softbox, or baking paper in front of the lamp) and avoid direct sun.',
    },
    {
      id: 'sharp',
      label: 'Sharp',
      ok: m.sharpness >= t.minSharpness,
      detail: m.sharpness >= t.minSharpness ? 'In focus' : 'Looks soft or blurry',
      tip: 'Use a tripod or rest the phone on something, and tap the product to focus.',
    },
    {
      id: 'resolution',
      label: `≥ ${t.minLongEdge} px`,
      ok: m.longEdge >= t.minLongEdge,
      detail: `${m.longEdge} px on the long edge`,
      tip: `Upload at least ${t.minLongEdge} px on the long edge; the original camera file is best.`,
    },
  ]
  return { pass: checks.every((c) => c.ok), checks, metrics: m }
}
