import type { ProductPayload } from './types'

/** Shopify's product CSV columns; WooCommerce and most shop systems can map them on import. */
export const CSV_COLUMNS = [
  'Handle', 'Title', 'Body (HTML)', 'Vendor', 'Type', 'Tags', 'Published', 'Status',
  'Variant SKU', 'Variant Price', 'Variant Compare At Price', 'Image Src', 'Image Alt Text',
  'SEO Title', 'SEO Description', 'Description DE', 'Description EN', 'Description ES',
] as const

/** Quote every cell; neutralise spreadsheet formulas (CSV injection). */
export function csvCell(value: unknown): string {
  let s = value === undefined || value === null ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return `"${s.replace(/"/g, '""')}"`
}

export const handle = (title: string) =>
  title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'product'

const money = (n?: number) => (n === undefined ? '' : n.toFixed(2))

export function toCsv(products: ProductPayload[]): string {
  const rows = products.map((p) => [
    handle(p.title), p.title, p.descriptionHtml, p.vendor, p.category, ['ai-generated', ...p.tags].join(', '), 'FALSE', 'draft',
    p.sku, money(p.price), money(p.compareAtPrice), p.imageUrl, p.altText,
    p.seo?.title, p.seo?.description, p.descriptions.de, p.descriptions.en, p.descriptions.es,
  ])
  return [CSV_COLUMNS, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
