import { describe, expect, it } from 'vitest'
import { lintCopy, specFragments } from '@/lib/copy/lint'
import type { ProductCopy } from '@/lib/types'

const para = (n: number, w = 'word') => Array.from({ length: n }, () => w).join(' ')
// 'Durchmesser von 9 cm' must count as containing the 9 from 'Ø 9 cm'
const desc = (spec = '') => `${para(40)} ${spec}\n\n${para(40)}`
const good: ProductCopy = {
  name: 'Deep Blue Stoneware Vase',
  descriptions: { de: desc('24 cm Ø 9 cm'), en: desc('24 cm Ø 9 cm'), es: desc('24 cm Ø 9 cm') },
  bullets: { de: ['a: b', 'c: d', 'e: f'], en: ['a: b', 'c: d', 'e: f'], es: ['a: b', 'c: d', 'e: f'] },
  seo: {
    de: { title: 'x'.repeat(52), description: 'y'.repeat(140) },
    en: { title: 'x'.repeat(52), description: 'y'.repeat(140) },
    es: { title: 'x'.repeat(52), description: 'y'.repeat(140) },
  },
  tags: ['vase'],
  altText: 'A vase.',
}
const meta = { notes: '24 cm tall · Ø 9 cm · watertight' }

describe('copy checker', () => {
  it('extracts the numeric values that must survive unchanged', () => {
    expect(specFragments(meta.notes)).toEqual(['24', '9'])
    expect(specFragments('750 ml · cold for 24 h · 0,5 kg')).toEqual(['750', '24', '0,5'])
  })

  it('accepts a listing that meets every rule', () => {
    expect(lintCopy(good, meta)).toEqual([])
  })

  it('flags filler, missing specs, one paragraph and short SEO texts', () => {
    const bad: ProductCopy = {
      ...good,
      descriptions: { ...good.descriptions, de: `Diese Vase eignet sich perfekt für Blumen. ${para(80)}` },
      seo: { ...good.seo!, en: { title: 'Ceramic Vase', description: 'Elegant.' } },
    }
    const issues = lintCopy(bad, meta)
    expect(issues).toEqual(
      expect.arrayContaining([
        'de description has 1 paragraph(s), needs exactly 2',
        expect.stringContaining('de description uses banned word(s): perfekt (rewrite this without it: "Diese Vase eignet sich perfekt für Blumen.")'),
        'de description is missing the value 24 from the product details',
        expect.stringContaining('en seo.title is 12 characters'),
        expect.stringContaining('en seo.description is 8 characters'),
      ]),
    )
  })

  it('bans filler in bullets and SEO texts too', () => {
    const c = { ...good, bullets: { ...good.bullets!, de: ['Bequem: ideal für lange Strecken', 'b: c', 'd: e'] } }
    expect(lintCopy(c, meta).join()).toContain('de bullets uses banned word(s): ideal')
  })

  it('applies the brand’s own avoid list in English', () => {
    const c = { ...good, descriptions: { ...good.descriptions, en: desc('24 cm Ø 9 cm stunning') } }
    expect(lintCopy(c, meta, ['stunning']).join()).toContain('banned word(s): stunning')
  })
})
