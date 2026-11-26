import { BADGES, type Run } from '@/lib/types'

const eur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)

/** How the result would look as a product card in a shop. */
export function ShopPreview({ run }: { run: Run }) {
  const { meta } = run
  const discount = meta.price && meta.compareAtPrice && meta.compareAtPrice > meta.price ? Math.round((1 - meta.price / meta.compareAtPrice) * 100) : null
  return (
    <div className="rounded-[3px] border border-sand bg-card p-4 shadow-[var(--shadow-soft)]">
      <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-muted">Shop preview</p>
      <div className="flex gap-4">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-[3px] bg-white sm:h-32 sm:w-32">
          <img src={run.outputUrl} alt={run.copy.altText} className="h-full w-full object-contain" />
          {meta.badge && <span className="absolute left-1.5 top-1.5 rounded-[2px] bg-clay px-2 py-0.5 text-[11px] font-semibold text-white">{BADGES[meta.badge]}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{run.brand.name}{meta.category ? ` · ${meta.category}` : ''}</p>
          <p className="mt-0.5 font-semibold leading-snug">{run.copy.name}</p>
          {meta.price !== undefined ? (
            <p className="mt-2 flex flex-wrap items-baseline gap-2">
              <span className="text-lg font-bold">{eur(meta.price)}</span>
              {discount && <span className="text-sm text-muted line-through">{eur(meta.compareAtPrice!)}</span>}
              {discount && <span className="rounded-[2px] bg-clay/10 px-2 py-0.5 text-xs font-semibold text-clay-dark">−{discount} %</span>}
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">No price given</p>
          )}
          <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
            {meta.sku && <span className="font-mono">SKU {meta.sku}</span>}
            {meta.featured && <span className="font-semibold text-ink">Featured</span>}
          </p>
        </div>
      </div>
    </div>
  )
}
