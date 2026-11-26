import type { Connector, ProductPayload } from './types'

/** WooCommerce REST API v3 (consumer key/secret over HTTPS). */
/**
 * Upload the image to the WordPress media library (needs a WordPress application password;
 * WooCommerce consumer keys can't upload media). Returns the attachment id.
 */
async function uploadMedia(base: string, png: Buffer, filename: string, alt: string): Promise<number> {
  const auth = Buffer.from(`${process.env.WOO_WP_USER}:${process.env.WOO_WP_APP_PASSWORD}`).toString('base64')
  const res = await fetch(`${base}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="${filename}"` },
    body: new Uint8Array(png),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`WordPress media upload: HTTP ${res.status}`)
  const media = (await res.json()) as { id: number }
  await fetch(`${base}/wp-json/wp/v2/media/${media.id}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ alt_text: alt }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => undefined) // alt text is nice to have
  return media.id
}

export const woocommerce: Connector = {
  id: 'woocommerce',
  label: 'WooCommerce',
  ownerOnly: true,
  setupHint: 'Set WOO_URL, WOO_CONSUMER_KEY and WOO_CONSUMER_SECRET; for image upload also WOO_WP_USER and WOO_WP_APP_PASSWORD.',
  configured: () => Boolean(process.env.WOO_URL && process.env.WOO_CONSUMER_KEY && process.env.WOO_CONSUMER_SECRET),
  async publish(p: ProductPayload) {
    const base = process.env.WOO_URL!.replace(/\/$/, '')
    const canUpload = Boolean(p.image && process.env.WOO_WP_USER && process.env.WOO_WP_APP_PASSWORD)
    const imageRef = canUpload ? { id: await uploadMedia(base, p.image!.png, p.image!.filename, p.altText) } : { src: p.imageUrl, alt: p.altText }
    const auth = Buffer.from(`${process.env.WOO_CONSUMER_KEY}:${process.env.WOO_CONSUMER_SECRET}`).toString('base64')
    const res = await fetch(`${base}/wp-json/wc/v3/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      signal: AbortSignal.timeout(20_000),
      body: JSON.stringify({
        name: p.title,
        status: 'draft',
        description: p.descriptionHtml,
        short_description: p.bullets.length ? `<ul>${p.bullets.map((b) => `<li>${b.replace(/[<>&]/g, '')}</li>`).join('')}</ul>` : undefined,
        sku: p.sku,
        // Woo models a discount as regular (was) + sale (now) price.
        regular_price: (p.compareAtPrice ?? p.price)?.toFixed(2),
        sale_price: p.compareAtPrice !== undefined && p.price !== undefined ? p.price.toFixed(2) : undefined,
        featured: Boolean(p.featured),
        tags: p.tags.map((name) => ({ name })),
        images: [imageRef],
      }),
    })
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { message?: string }
      throw new Error(`WooCommerce HTTP ${res.status}${err.message ? `: ${err.message}` : ''}`)
    }
    const json = (await res.json()) as { id: number }
    return { connector: 'woocommerce', externalId: String(json.id), adminUrl: `${base}/wp-admin/post.php?post=${json.id}&action=edit` }
  },
}
