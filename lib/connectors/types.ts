import type { Lang } from '../types'

/** CMS-neutral product, built from a run. Every connector maps this onto its own API. */
export interface ProductPayload {
  title: string
  descriptionHtml: string
  descriptions: Record<Lang, string>
  altText: string
  imageUrl: string
  /** Key features, also rendered as a list in descriptionHtml. */
  bullets: string[]
  seo?: { title: string; description: string }
  /** Copy tags plus badge/featured flags (e.g. "sale", "featured"). */
  tags: string[]
  sku?: string
  price?: number
  compareAtPrice?: number
  featured?: boolean
  category?: string
  vendor?: string
  /** The run this product came from (used by the demo store and for idempotency). */
  sourceRunId?: string
  /** Language of title/description/SEO in this payload. */
  lang?: Lang
  /** Image bytes, so connectors can upload the file instead of relying on a public URL. */
  image?: { png: Buffer; filename: string }
}

export interface PublishResult {
  connector: string
  externalId: string
  adminUrl?: string
}

export interface Connector {
  id: string
  label: string
  /** True when the env vars it needs are set. */
  configured(): boolean
  /** Real stores are owner-only; the built-in demo store is open to every visitor. */
  ownerOnly: boolean
  /** One line for the UI when it isn't configured. */
  setupHint?: string
  /** Always creates a draft: a human reviews AI copy before it goes live. */
  publish(product: ProductPayload): Promise<PublishResult>
}
