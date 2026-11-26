import type { Lang, Run } from '../types'
import type { ProductPayload } from './types'

const escapeHtml = (s: string) =>
  s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!)

export const toHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
    .join('')

const listHtml = (items: string[]) => (items.length ? `<ul>${items.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : '')

export function absoluteUrl(url: string, siteUrl: string) {
  return url.startsWith('http') ? url : `${siteUrl.replace(/\/$/, '')}${url}`
}

export function payloadFromRun(run: Run, siteUrl: string, lang: Lang = 'en'): ProductPayload {
  const bullets = run.copy.bullets?.[lang] ?? []
  const flags = [run.meta.badge, run.meta.featured ? 'featured' : undefined].filter((t): t is NonNullable<typeof t> => Boolean(t))
  return {
    title: run.copy.name,
    descriptionHtml: toHtml(run.copy.descriptions[lang]) + listHtml(bullets),
    descriptions: run.copy.descriptions,
    bullets,
    seo: run.copy.seo?.[lang],
    tags: [...new Set([...(run.copy.tags ?? []), ...flags])],
    altText: run.copy.altText,
    imageUrl: absoluteUrl(run.outputUrl, siteUrl),
    sku: run.meta.sku,
    price: run.meta.price,
    compareAtPrice: run.meta.compareAtPrice,
    featured: run.meta.featured,
    category: run.meta.category ?? run.meta.productType,
    vendor: run.brand.name,
    sourceRunId: run.id,
    lang,
  }
}
