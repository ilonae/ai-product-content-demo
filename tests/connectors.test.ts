import { afterEach, describe, expect, it, vi } from 'vitest'
import { csvCell, toCsv } from '@/lib/connectors/csv'
import { payloadFromRun, toHtml } from '@/lib/connectors/payload'
import { shopify } from '@/lib/connectors/shopify'
import { sign, webhook } from '@/lib/connectors/webhook'
import type { Run } from '@/lib/types'

const run = {
  id: 'abcdefgh1234',
  createdAt: '2026-11-23T10:00:00.000Z',
  source: 'gallery',
  brand: { id: 'nordhaus', name: 'Nordhaus' },
  meta: { category: 'Home & Living', productType: 'mug', sku: 'NH-1', price: 24, compareAtPrice: 30, badge: 'sale', featured: true },
  originalUrl: '/gallery/abcdefgh1234/original.png',
  outputUrl: '/gallery/abcdefgh1234/output.png',
  width: 800,
  height: 800,
  copy: {
    name: 'Stoneware Mug "Fjord"',
    descriptions: { de: 'DE', en: 'Holds 350 ml.\n\nDishwasher-safe.', es: 'ES' },
    bullets: { de: ['a'], en: ['350 ml', 'Dishwasher-safe'], es: ['b'] },
    seo: { de: { title: 't', description: 'd' }, en: { title: 'Stoneware Mug Fjord | Nordhaus', description: 'A 350 ml mug.' }, es: { title: 't', description: 'd' } },
    tags: ['mug', 'stoneware'],
    altText: 'A grey mug',
  },
  stages: [],
  estCostUsd: 0,
  watermarked: false,
} satisfies Run

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('connectors', () => {
  it('builds a neutral payload with an absolute image URL and safe HTML', () => {
    const p = payloadFromRun(run, 'https://demo.example')
    expect(p.imageUrl).toBe('https://demo.example/gallery/abcdefgh1234/output.png')
    expect(p.descriptionHtml).toBe('<p>Holds 350 ml.</p><p>Dishwasher-safe.</p><ul><li>350 ml</li><li>Dishwasher-safe</li></ul>')
    expect(p.tags).toEqual(['mug', 'stoneware', 'sale', 'featured'])
    expect(toHtml('<script>')).toBe('<p>&lt;script&gt;</p>')
  })

  it('exports CSV with quoting and formula neutralising', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    const csv = toCsv([payloadFromRun(run, 'https://demo.example')])
    expect(csv.split('\r\n')[1]).toContain('"stoneware-mug-fjord"')
    expect(csv).toContain('"draft"')
    expect(csv).toContain('"24.00","30.00"')
    expect(csv).toContain('"Stoneware Mug Fjord | Nordhaus"')
  })

  it('creates Shopify products as drafts through the Admin GraphQL API', async () => {
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'demo.myshopify.com')
    vi.stubEnv('SHOPIFY_ADMIN_TOKEN', 'shpat_test')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ data: { productCreate: { product: { id: 'gid://shopify/Product/42', handle: 'mug', variants: { nodes: [{ id: 'gid://shopify/ProductVariant/7' }] } }, userErrors: [] } } }),
      )
      .mockResolvedValueOnce(Response.json({ data: { productVariantsBulkUpdate: { userErrors: [] } } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await shopify.publish(payloadFromRun(run, 'https://demo.example'))
    expect(result).toEqual({ connector: 'shopify', externalId: 'gid://shopify/Product/42', adminUrl: 'https://demo.myshopify.com/admin/products/42' })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://demo.myshopify.com/admin/api/2025-01/graphql.json')
    const body = JSON.parse(String(init.body))
    expect(body.variables.product.status).toBe('DRAFT')
    expect(body.variables.product.tags).toContain('sale')
    expect(body.variables.product.seo.title).toBe('Stoneware Mug Fjord | Nordhaus')
    // second call: price, compare-at price and SKU on the default variant
    const variant = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body)).variables
    expect(variant).toEqual({
      productId: 'gid://shopify/Product/42',
      variants: [{ id: 'gid://shopify/ProductVariant/7', price: '24.00', compareAtPrice: '30.00', inventoryItem: { sku: 'NH-1' } }],
    })
    expect(body.variables.media[0].originalSource).toBe('https://demo.example/gallery/abcdefgh1234/output.png')
  })

  it('surfaces Shopify user errors', async () => {
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'demo.myshopify.com')
    vi.stubEnv('SHOPIFY_ADMIN_TOKEN', 'shpat_test')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { productCreate: { product: null, userErrors: [{ message: 'Title is too long' }] } } })))
    await expect(shopify.publish(payloadFromRun(run, 'https://x.example'))).rejects.toThrow('Title is too long')
  })

  it('signs webhook payloads so the receiving CMS can verify them', async () => {
    vi.stubEnv('CMS_WEBHOOK_URL', 'https://cms.example/hooks/products')
    vi.stubEnv('CMS_WEBHOOK_SECRET', 'whsec')
    const fetchMock = vi.fn(async () => Response.json({ id: 'entry_1' }))
    vi.stubGlobal('fetch', fetchMock)

    await webhook.publish(payloadFromRun(run, 'https://demo.example'))
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers['x-signature']).toBe(sign(String(init.body), 'whsec'))
  })
})
