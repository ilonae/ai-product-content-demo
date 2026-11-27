import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { demoStore } from '@/lib/connectors/demo'
import { payloadFromRun } from '@/lib/connectors/payload'
import { shopify } from '@/lib/connectors/shopify'
import { woocommerce } from '@/lib/connectors/woocommerce'
import { getStore } from '@/lib/store'
import type { Run } from '@/lib/types'

const run = {
  id: 'pubtest12345',
  createdAt: '2026-11-26T10:00:00.000Z',
  source: 'live',
  brand: { id: 'nordhaus', name: 'Nordhaus' },
  meta: { productType: 'vase', category: 'Home & Living', sku: 'NH-1', price: 49, compareAtPrice: 59, badge: 'sale' },
  originalUrl: '/api/files/pubtest12345/original.png',
  outputUrl: '/api/files/pubtest12345/output.png',
  width: 800,
  height: 800,
  copy: { name: 'Deep Blue Vase', descriptions: { de: 'DE', en: 'EN', es: 'ES' }, bullets: { de: ['a'], en: ['b'], es: ['c'] }, tags: ['vase'], altText: 'A vase' },
  stages: [],
  estCostUsd: 0,
  watermarked: true,
} satisfies Run

const png = Buffer.from('fake-png-bytes')

beforeAll(async () => {
  process.env.LOCAL_STORE_DIR = await mkdtemp(path.join(tmpdir(), 'publish-'))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('publishing', () => {
  it('publishes to the built-in demo store and lists the draft, newest first', async () => {
    const res = await demoStore.publish(payloadFromRun(run, 'http://localhost:3100', 'de'), { visitor: 'showcase' })
    expect(res).toEqual({ connector: 'demo', externalId: 'pubtest12345', adminUrl: '/store#pubtest12345' })
    const items = await getStore().listDemoProducts(null)
    expect(items[0]).toMatchObject({ runId: 'pubtest12345', lang: 'de', product: { title: 'Deep Blue Vase', price: 49, tags: ['vase', 'sale'] } })
    expect(demoStore.ownerOnly).toBe(false)
  })

  it('uploads the image file to Shopify (staged upload), so a public URL isn’t needed', async () => {
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'demo.myshopify.com')
    vi.stubEnv('SHOPIFY_ADMIN_TOKEN', 'shpat_test')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ data: { stagedUploadsCreate: { stagedTargets: [{ url: 'https://upload.example/s3', resourceUrl: 'https://cdn.shopify.example/tmp/abc.png', parameters: [{ name: 'key', value: 'tmp/abc.png' }] }], userErrors: [] } } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(Response.json({ data: { productCreate: { product: { id: 'gid://shopify/Product/1', handle: 'v', variants: { nodes: [{ id: 'gid://shopify/ProductVariant/2' }] } }, userErrors: [] } } }))
      .mockResolvedValueOnce(Response.json({ data: { productVariantsBulkUpdate: { userErrors: [] } } }))
    vi.stubGlobal('fetch', fetchMock)

    const payload = { ...payloadFromRun(run, 'http://localhost:3100', 'en'), image: { png, filename: 'pubtest12345.png' } }
    await shopify.publish(payload)

    const call = (i: number) => fetchMock.mock.calls[i] as unknown as [string, RequestInit]
    expect(call(1)[0]).toBe('https://upload.example/s3') // bytes go to Shopify's upload target
    expect(call(1)[1].body).toBeInstanceOf(FormData)
    const create = JSON.parse(String(call(2)[1].body))
    expect(create.variables.media[0].originalSource).toBe('https://cdn.shopify.example/tmp/abc.png') // not localhost
  })

  it('uploads the image to the WordPress media library for WooCommerce when an app password is set', async () => {
    vi.stubEnv('WOO_URL', 'https://shop.example')
    vi.stubEnv('WOO_CONSUMER_KEY', 'ck')
    vi.stubEnv('WOO_CONSUMER_SECRET', 'cs')
    vi.stubEnv('WOO_WP_USER', 'owner')
    vi.stubEnv('WOO_WP_APP_PASSWORD', 'app pass')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 55 }))
      .mockResolvedValueOnce(Response.json({ id: 55 }))
      .mockResolvedValueOnce(Response.json({ id: 9 }))
    vi.stubGlobal('fetch', fetchMock)

    const res = await woocommerce.publish({ ...payloadFromRun(run, 'http://localhost:3100', 'de'), image: { png, filename: 'x.png' } })
    expect(res.externalId).toBe('9')
    const [mediaUrl] = fetchMock.mock.calls[0] as unknown as [string]
    expect(mediaUrl).toBe('https://shop.example/wp-json/wp/v2/media')
    const product = JSON.parse(String((fetchMock.mock.calls[2] as unknown as [string, RequestInit])[1].body))
    expect(product.images).toEqual([{ id: 55 }])
    expect(product).toMatchObject({ status: 'draft', regular_price: '59.00', sale_price: '49.00' })
  })
})

describe('Shopify token (Dev Dashboard apps, 2026)', () => {
  it('exchanges client id + secret for a 24 h token and reuses it', async () => {
    const { shopifyToken, resetShopifyToken } = await import('@/lib/connectors/shopify')
    resetShopifyToken()
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'demo.myshopify.com')
    vi.stubEnv('SHOPIFY_ADMIN_TOKEN', '')
    vi.stubEnv('SHOPIFY_CLIENT_ID', 'cid')
    vi.stubEnv('SHOPIFY_CLIENT_SECRET', 'csecret')
    const fetchMock = vi.fn(async () => Response.json({ access_token: 'shpat_temp', scope: 'write_products,write_files', expires_in: 86399 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await shopifyToken()).toBe('shpat_temp')
    expect(await shopifyToken()).toBe('shpat_temp')
    expect(fetchMock).toHaveBeenCalledTimes(1) // cached
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://demo.myshopify.com/admin/oauth/access_token')
    expect(String(init.body)).toBe('grant_type=client_credentials&client_id=cid&client_secret=csecret')
  })

  it('explains the usual cause when the exchange fails', async () => {
    const { shopifyToken, resetShopifyToken } = await import('@/lib/connectors/shopify')
    resetShopifyToken()
    vi.stubEnv('SHOPIFY_STORE_DOMAIN', 'demo.myshopify.com')
    vi.stubEnv('SHOPIFY_ADMIN_TOKEN', '')
    vi.stubEnv('SHOPIFY_CLIENT_ID', 'cid')
    vi.stubEnv('SHOPIFY_CLIENT_SECRET', 'wrong')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: 'shop_not_permitted' }, { status: 400 })))
    await expect(shopifyToken()).rejects.toThrow('same organisation')
  })
})
