import type { BrandProfile } from '../brand'
import type { ProductCopy, ProductMeta } from '../types'

/** Deterministic copy for tests and offline development (PIPELINE_MOCK=1). Clearly marked as mock. */
export function writeCopyMock(brand: BrandProfile, meta: ProductMeta): ProductCopy {
  const thing = meta.productType || meta.category || 'product'
  const specs = meta.notes ? ` ${meta.notes}` : ''
  const per = <T,>(de: T, en: T, es: T) => ({ de, en, es })
  return {
    name: `${brand.name} ${thing}`,
    descriptions: per(`[Mock] ${thing} von ${brand.name}.${specs}`, `[Mock] ${thing} by ${brand.name}.${specs}`, `[Mock] ${thing} de ${brand.name}.${specs}`),
    bullets: per(['[Mock] Merkmal eins', '[Mock] Merkmal zwei', '[Mock] Merkmal drei'], ['[Mock] Feature one', '[Mock] Feature two', '[Mock] Feature three'], ['[Mock] Característica uno', '[Mock] Característica dos', '[Mock] Característica tres']),
    seo: per(
      { title: `${thing} | ${brand.name}`, description: `[Mock] ${thing} von ${brand.name}.` },
      { title: `${thing} | ${brand.name}`, description: `[Mock] ${thing} by ${brand.name}.` },
      { title: `${thing} | ${brand.name}`, description: `[Mock] ${thing} de ${brand.name}.` },
    ),
    tags: ['mock', ...thing.toLowerCase().split(/\s+/).slice(0, 3)],
    altText: `A ${thing} on a white background.`,
  }
}
