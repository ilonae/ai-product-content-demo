import type { ProductMeta } from '@/lib/types'

/**
 * One-click sample photos for visitors who have none at hand (public/samples/, credits in CREDITS.md).
 * "studio" samples are offered only if they pass the studio check; the "rejected" one shows the check at work.
 * Their details are illustrative demo values.
 */
export interface Sample {
  id: string
  label: string
  emoji: string
  src: string
  brand: string
  meta: ProductMeta
  kind: 'studio' | 'rejected'
}

export const SAMPLES: Sample[] = [
  {
    id: 'vase', label: 'Vase', emoji: '🏺', src: '/samples/vase.jpg', brand: 'nordhaus', kind: 'studio',
    meta: { productType: 'ceramic vase', category: 'Home & Living', material: 'glazed stoneware', sku: 'NH-VA-024', price: 49, compareAtPrice: 59, badge: 'sale', featured: true },
  },
  {
    id: 'sneaker', label: 'Sneaker', emoji: '👟', src: '/samples/sneaker.jpg', brand: 'trailmark', kind: 'studio',
    meta: { productType: 'running shoe', category: 'Fashion & Shoes', sku: 'TM-RS-118', price: 129, badge: 'new' },
  },
  {
    id: 'bottle', label: 'Bottle', emoji: '🧴', src: '/samples/bottle.jpg', brand: 'trailmark', kind: 'studio',
    meta: { productType: 'insulated bottle', category: 'Outdoor & Sports', material: 'stainless steel', sku: 'TM-BT-750', price: 34.9, badge: 'bestseller', notes: '750 ml · keeps drinks cold for 24 h' },
  },
  { id: 'mug-on-table', label: 'Mug on a table', emoji: '☕', src: '/samples/mug-on-table.jpg', brand: 'kaffeewerk', kind: 'rejected', meta: { productType: 'coffee mug' } },
]
