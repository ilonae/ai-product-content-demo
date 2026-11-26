import { describe, expect, it } from 'vitest'
import { resolveBrand } from '@/lib/brand'
import { systemPrompt, userPrompt } from '@/lib/copy/prompt'
import { CopySchema } from '@/lib/copy/schema'

describe('copy prompt', () => {
  it('carries the brand voice and the no-invention rule', () => {
    const p = systemPrompt(resolveBrand('trailmark'))
    expect(p).toContain('Trailmark')
    expect(p).toContain('Never invent')
    expect(p).toContain('ultimate')
  })

  it('passes SKU and product type, and never asks for prices', () => {
    const u = userPrompt({ productType: 'vase', sku: 'NH-1', price: 49 })
    expect(u).toContain('Product: vase')
    expect(u).toContain('SKU: NH-1')
    expect(u).not.toContain('49')
    expect(systemPrompt(resolveBrand())).toContain('Never mention prices')
  })

  it('marks specs as mandatory', () => {
    expect(userPrompt({ notes: '1 l · gooseneck' })).toContain('include every value')
    expect(userPrompt({})).toContain('photo only')
  })

  it('validates model output', () => {
    const per = <T,>(v: T) => ({ de: v, en: v, es: v })
    const ok = { name: 'x', descriptions: per('a'), bullets: per(['b']), seo: per({ title: 't', description: 'd' }), tags: ['x'], altText: 'd' }
    expect(CopySchema.safeParse(ok).success).toBe(true)
    expect(CopySchema.safeParse({ name: 'x', descriptions: { de: 'a' } }).success).toBe(false)
  })
})
