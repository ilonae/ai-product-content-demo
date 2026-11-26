import { createHmac } from 'node:crypto'
import type { Connector, ProductPayload } from './types'

export const sign = (body: string, secret: string) => createHmac('sha256', secret).update(body).digest('hex')

/**
 * Generic connector for any other CMS (Contentful, Sanity, Strapi, a custom backend…):
 * POSTs the neutral product JSON, signed with HMAC-SHA256 in `x-signature`.
 */
export const webhook: Connector = {
  id: 'webhook',
  label: 'Any CMS (webhook)',
  ownerOnly: true,
  setupHint: 'Set CMS_WEBHOOK_URL and CMS_WEBHOOK_SECRET; your endpoint verifies x-signature.',
  configured: () => Boolean(process.env.CMS_WEBHOOK_URL && process.env.CMS_WEBHOOK_SECRET),
  async publish(p: ProductPayload) {
    const { image, ...product } = p
    const body = JSON.stringify({ type: 'product.draft', product, image: image ? { filename: image.filename, pngBase64: image.png.toString('base64') } : undefined })
    const res = await fetch(process.env.CMS_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-signature': sign(body, process.env.CMS_WEBHOOK_SECRET!) },
      signal: AbortSignal.timeout(20_000),
      body,
    })
    if (!res.ok) throw new Error(`Webhook HTTP ${res.status}`)
    const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string }
    return { connector: 'webhook', externalId: json.id ?? 'accepted', adminUrl: json.url }
  },
}
