export const PIPELINE_STAGES = ['ingest', 'background', 'compose', 'copy', 'persist'] as const
/** Optional stage, only when the visitor marked tape: runs right after ingest. */
export const RETOUCH_STAGE = 'retouch' as const
export type StageName = (typeof PIPELINE_STAGES)[number] | typeof RETOUCH_STAGE

/** The stages a run goes through, in order. */
export const stagesFor = (retouch: boolean): StageName[] => (retouch ? ['ingest', RETOUCH_STAGE, 'background', 'compose', 'copy', 'persist'] : [...PIPELINE_STAGES])

export interface StageRecord {
  name: StageName
  status: 'ok' | 'error'
  ms: number
  provider?: string
  model?: string
  note?: string
}

export const SHOP_CATEGORIES = ['Home & Living', 'Kitchen & Dining', 'Fashion & Shoes', 'Outdoor & Sports', 'Beauty & Care', 'Electronics', 'Toys & Kids', 'Other'] as const
export const BADGES = { new: 'New', sale: 'Sale', bestseller: 'Bestseller' } as const
export type Badge = keyof typeof BADGES

export interface ProductMeta {
  /** Shop category (navigation). */
  category?: string
  /** What the product is, in plain words ("ceramic vase"). */
  productType?: string
  material?: string
  /** Measurements & specials: kept word for word in the copy. */
  notes?: string
  sku?: string
  price?: number
  compareAtPrice?: number
  badge?: Badge
  featured?: boolean
}

type PerLang<T> = { de: T; en: T; es: T }

export interface ProductCopy {
  name: string
  descriptions: PerLang<string>
  altText: string
  /** 3–5 key features per language (runs made before this field existed don't have it). */
  bullets?: PerLang<string[]>
  /** Search snippet per language: title ≤ 60, description ≤ 155 characters. */
  seo?: PerLang<{ title: string; description: string }>
  /** Lower-case English tags for shop filters and search. */
  tags?: string[]
}

export type Lang = keyof ProductCopy['descriptions']

export interface Run {
  id: string
  createdAt: string
  source: 'live' | 'gallery'
  brand: { id: string; name: string }
  meta: ProductMeta
  originalUrl: string
  outputUrl: string
  width: number
  height: number
  copy: ProductCopy
  stages: StageRecord[]
  estCostUsd: number
  watermarked: boolean
  /** Gallery only: what this example proves about the method. */
  showcase?: string
  /** Copy rules the model still broke after its revision (empty = all met; absent on older runs). */
  copyIssues?: string[]
}

export interface ModelImage {
  base64: string
  mediaType: 'image/jpeg' | 'image/png'
}
