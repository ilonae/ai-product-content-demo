import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getStore } from '@/lib/store'
import type { DemoProduct } from '@/lib/store/types'
import { BADGES } from '@/lib/types'
import { keyFromCookieValue, VISITOR_COOKIE } from '@/lib/visitor'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Demo store | AI product-content pipeline', description: 'Drafts published from the AI product-content demo.' }

const eur = (n: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(n)
const BADGE_TAGS = Object.keys(BADGES) as (keyof typeof BADGES)[]

async function products(): Promise<DemoProduct[]> {
  try {
    const viewer = keyFromCookieValue((await cookies()).get(VISITOR_COOKIE)?.value)
    return await getStore().listDemoProducts(viewer, 48)
  } catch {
    return []
  }
}

/** The built-in demo store: what a shop's draft list looks like after publishing from a result page. */
export default async function StorePage() {
  const items = await products()
  return (
    <main className="mx-auto max-w-6xl px-4 pb-20 pt-10 sm:px-6">
      <p className="caption">Demo store · drafts</p>
      <h1 className="mt-2 text-[28px] font-semibold leading-tight sm:text-[34px]">A shop that receives your listings.</h1>
      <p className="mt-3 max-w-2xl text-muted">
        What you publish to the demo store lands here as a draft, exactly as a real shop would receive it: image, name,
        description, key features, price and tags. Only you see your drafts, and they are deleted after 7 days.
      </p>

      {items.length === 0 ? (
        <div className="mt-10 border border-dashed border-muted/60 bg-card px-6 py-12 text-center">
          <p className="font-semibold">No drafts yet.</p>
          <p className="mt-1 text-sm text-muted">Generate a listing, then press “Publish” next to Demo store on its result page.</p>
          <a href="/#try" className="mt-5 inline-flex min-h-11 items-center rounded-none bg-brown px-5 text-sm font-semibold text-paper">Make a listing</a>
        </div>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map(({ runId, createdAt, lang, product: p }) => {
            const badge = BADGE_TAGS.find((b) => p.tags.includes(b))
            const discount = p.price && p.compareAtPrice && p.compareAtPrice > p.price ? Math.round((1 - p.price / p.compareAtPrice) * 100) : null
            return (
              <li key={runId} id={runId} className="scroll-mt-24 border-t border-sand bg-card target:outline target:outline-2 target:outline-brown">
                <div className="relative aspect-square bg-white">
                  <img src={p.imageUrl} alt={p.altText} className="h-full w-full object-contain" loading="lazy" />
                  <span className="caption absolute left-3 top-3 border border-sand bg-paper px-2 py-1">Draft</span>
                  {badge && <span className="absolute right-3 top-3 bg-clay px-2 py-1 text-xs font-semibold text-white">{BADGES[badge]}</span>}
                </div>
                <div className="space-y-2 border-t border-sand p-4">
                  <p className="caption">{p.vendor}{p.category ? ` · ${p.category}` : ''} · {lang.toUpperCase()}</p>
                  <p className="text-base font-semibold leading-snug">{p.title}</p>
                  {p.price !== undefined && (
                    <p className="flex items-baseline gap-2">
                      <span className="font-semibold">{eur(p.price)}</span>
                      {discount && <span className="text-sm text-muted line-through">{eur(p.compareAtPrice!)}</span>}
                      {discount && <span className="text-xs font-semibold text-clay-dark">−{discount} %</span>}
                    </p>
                  )}
                  {p.bullets.length > 0 && (
                    <ul className="space-y-1 text-sm text-muted">
                      {p.bullets.slice(0, 3).map((b) => <li key={b}>– {b}</li>)}
                    </ul>
                  )}
                  <p className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="caption">{new Date(createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <a href={`/r/${runId}`} className="text-xs text-ink underline underline-offset-4">Open listing</a>
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
