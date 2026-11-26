import type { Connector, ProductPayload } from './types'

const CREATE = `mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
  productCreate(product: $product, media: $media) {
    product { id handle variants(first: 1) { nodes { id } } }
    userErrors { field message }
  }
}`

// Upload the image file itself, so publishing also works when the image URL isn't public (localhost).
const STAGED_UPLOAD = `mutation StagedUpload($input: [StagedUploadInput!]!) {
  stagedUploadsCreate(input: $input) {
    stagedTargets { url resourceUrl parameters { name value } }
    userErrors { field message }
  }
}`

// Price, compare-at price and SKU live on the variant, not the product.
const SET_VARIANT = `mutation SetVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
  productVariantsBulkUpdate(productId: $productId, variants: $variants) {
    userErrors { field message }
  }
}`

interface GqlResponse<T> {
  data?: T
  errors?: { message: string }[]
}

let cached: { token: string; expiresAt: number } | null = null

/**
 * Admin API token. Since 2026, apps from the Shopify Dev Dashboard exchange their Client ID and
 * secret for a token valid 24 h (client credentials grant; the store must be in the same
 * organisation and have the app installed). A fixed SHOPIFY_ADMIN_TOKEN from a legacy custom
 * app still works too.
 */
export async function shopifyToken(): Promise<string> {
  if (process.env.SHOPIFY_ADMIN_TOKEN) return process.env.SHOPIFY_ADMIN_TOKEN
  if (cached && cached.expiresAt > Date.now()) return cached.token
  const domain = process.env.SHOPIFY_STORE_DOMAIN!
  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID ?? '',
      client_secret: process.env.SHOPIFY_CLIENT_SECRET ?? '',
    }),
    signal: AbortSignal.timeout(15_000),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string }
  if (!res.ok || !data.access_token) {
    throw new Error(`Shopify token: ${data.error_description ?? data.error ?? `HTTP ${res.status}`} (is the app installed on this store, in the same organisation?)`)
  }
  // Renew five minutes before Shopify's 24 h expiry.
  cached = { token: data.access_token, expiresAt: Date.now() + Math.max(60, (data.expires_in ?? 86_399) - 300) * 1000 }
  return cached.token
}

/** For tests. */
export const resetShopifyToken = () => {
  cached = null
}

async function gql<T>(query: string, variables: object): Promise<GqlResponse<T>> {
  const domain = process.env.SHOPIFY_STORE_DOMAIN!
  const version = process.env.SHOPIFY_API_VERSION ?? '2025-01'
  const token = await shopifyToken()
  const res = await fetch(`https://${domain}/admin/api/${version}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`)
  return (await res.json()) as GqlResponse<T>
}

/** Shopify Admin GraphQL API (custom app access token, scope write_products). */
/** Returns a Shopify-hosted resource URL for the image bytes (two requests: reserve, then upload). */
async function stageImage(png: Buffer, filename: string): Promise<string> {
  const staged = await gql<{
    stagedUploadsCreate?: { stagedTargets: { url: string; resourceUrl: string; parameters: { name: string; value: string }[] }[]; userErrors: { message: string }[] }
  }>(STAGED_UPLOAD, { input: [{ resource: 'IMAGE', filename, mimeType: 'image/png', httpMethod: 'POST', fileSize: String(png.length) }] })
  const target = staged.data?.stagedUploadsCreate?.stagedTargets?.[0]
  const problem = staged.errors?.[0]?.message ?? staged.data?.stagedUploadsCreate?.userErrors?.[0]?.message
  if (problem || !target) throw new Error(`Shopify image upload: ${problem ?? 'no upload target'}`)
  const form = new FormData()
  for (const { name, value } of target.parameters) form.append(name, value)
  form.append('file', new Blob([new Uint8Array(png)], { type: 'image/png' }), filename)
  const res = await fetch(target.url, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Shopify image upload: HTTP ${res.status}`)
  return target.resourceUrl
}

export const shopify: Connector = {
  id: 'shopify',
  label: 'Shopify',
  ownerOnly: true,
  setupHint: 'Set SHOPIFY_STORE_DOMAIN plus SHOPIFY_CLIENT_ID and SHOPIFY_CLIENT_SECRET (Dev Dashboard app, scopes write_products and write_files).',
  configured: () =>
    Boolean(process.env.SHOPIFY_STORE_DOMAIN && (process.env.SHOPIFY_ADMIN_TOKEN || (process.env.SHOPIFY_CLIENT_ID && process.env.SHOPIFY_CLIENT_SECRET))),
  async publish(p: ProductPayload) {
    const imageSource = p.image ? await stageImage(p.image.png, p.image.filename) : p.imageUrl
    const created = await gql<{
      productCreate?: { product?: { id: string; handle: string; variants: { nodes: { id: string }[] } }; userErrors: { message: string }[] }
    }>(CREATE, {
      product: {
        title: p.title,
        descriptionHtml: p.descriptionHtml,
        productType: p.category,
        vendor: p.vendor,
        status: 'DRAFT',
        tags: p.tags,
        ...(p.seo ? { seo: { title: p.seo.title, description: p.seo.description } } : {}),
      },
      media: [{ originalSource: imageSource, alt: p.altText, mediaContentType: 'IMAGE' }],
    })
    const result = created.data?.productCreate
    const problem = created.errors?.[0]?.message ?? result?.userErrors?.[0]?.message
    if (problem || !result?.product) throw new Error(`Shopify: ${problem ?? 'no product returned'}`)
    const product = result.product

    const variantId = product.variants.nodes[0]?.id
    if (variantId && (p.price !== undefined || p.sku)) {
      const updated = await gql<{ productVariantsBulkUpdate?: { userErrors: { message: string }[] } }>(SET_VARIANT, {
        productId: product.id,
        variants: [
          {
            id: variantId,
            ...(p.price !== undefined ? { price: p.price.toFixed(2) } : {}),
            ...(p.compareAtPrice !== undefined ? { compareAtPrice: p.compareAtPrice.toFixed(2) } : {}),
            ...(p.sku ? { inventoryItem: { sku: p.sku } } : {}),
          },
        ],
      })
      const vProblem = updated.errors?.[0]?.message ?? updated.data?.productVariantsBulkUpdate?.userErrors?.[0]?.message
      if (vProblem) throw new Error(`Shopify (product created as draft, but price/SKU failed): ${vProblem}`)
    }

    const domain = process.env.SHOPIFY_STORE_DOMAIN!
    return { connector: 'shopify', externalId: product.id, adminUrl: `https://${domain}/admin/products/${product.id.split('/').pop()}` }
  },
}
