import type { ProductCopy, ProductMeta } from '../types'
import { BANNED, LIMITS } from './prompt'

const LANGS = ['de', 'en', 'es'] as const
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length

/**
 * The numeric values in the owner's notes ("24 cm tall · Ø 9 cm" → 24, 9). The numbers must
 * survive unchanged in every language; units and wording may be localised ("24 h" → "24 Stunden").
 */
export function specFragments(notes?: string): string[] {
  if (!notes) return []
  return [...new Set(notes.match(/\d+(?:[.,]\d+)?/g) ?? [])]
}

const sentenceWith = (text: string, word: string) =>
  text.split(/(?<=[.!?])\s+/).find((s) => s.toLowerCase().includes(word.toLowerCase()))?.trim()

/** Rule violations in a generated listing, phrased so the model can fix them. Empty = good. */
export function lintCopy(copy: ProductCopy, meta: ProductMeta, avoid: string[] = []): string[] {
  const issues: string[] = []
  if (copy.name.length > 50) issues.push(`name is ${copy.name.length} characters (max 50)`)
  const specs = specFragments(meta.notes)
  for (const l of LANGS) {
    const d = copy.descriptions[l]
    const paras = d.split(/\n\s*\n/).filter((p) => p.trim())
    if (paras.length !== 2) issues.push(`${l} description has ${paras.length} paragraph(s), needs exactly 2`)
    const w = words(d)
    if (w < LIMITS.words[0] || w > LIMITS.words[1]) issues.push(`${l} description has ${w} words (${LIMITS.words[0]}–${LIMITS.words[1]})`)
    // Filler is banned in every text field, not just the description.
    const fields: [string, string][] = [
      ['description', d],
      ['bullets', (copy.bullets?.[l] ?? []).join('. ')],
      ['seo texts', copy.seo?.[l] ? `${copy.seo[l].title}. ${copy.seo[l].description}` : ''],
    ]
    for (const [field, text] of fields) {
      const banned = [...BANNED[l], ...(l === 'en' ? avoid : [])].filter((b) => new RegExp(`(^|[^\\p{L}])${b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'iu').test(text))
      if (!banned.length) continue
      const where = sentenceWith(text, banned[0])
      issues.push(`${l} ${field} uses banned word(s): ${banned.join(', ')}${where ? ` (rewrite this without it: "${where}")` : ''}`)
    }
    for (const s of specs) {
      if (!new RegExp(`(^|[^\\d.,])${s.replace('.', '[.,]').replace(',', '[.,]')}(?![\\d])`).test(d)) issues.push(`${l} description is missing the value ${s} from the product details`)
    }
    const b = copy.bullets?.[l] ?? []
    if (b.length < LIMITS.bullets[0] || b.length > LIMITS.bullets[1]) issues.push(`${l} has ${b.length} bullets (${LIMITS.bullets[0]}–${LIMITS.bullets[1]})`)
    if (b.some((x) => words(x) > LIMITS.bulletWords)) issues.push(`${l} has a bullet longer than ${LIMITS.bulletWords} words`)
    const seo = copy.seo?.[l]
    if (seo) {
      if (seo.title.length < LIMITS.seoTitle[0] || seo.title.length > LIMITS.seoTitle[1]) issues.push(`${l} seo.title is ${seo.title.length} characters (${LIMITS.seoTitle[0]}–${LIMITS.seoTitle[1]})`)
      if (seo.description.length < LIMITS.seoDescription[0] || seo.description.length > LIMITS.seoDescription[1]) issues.push(`${l} seo.description is ${seo.description.length} characters (${LIMITS.seoDescription[0]}–${LIMITS.seoDescription[1]})`)
    }
  }
  return issues
}
