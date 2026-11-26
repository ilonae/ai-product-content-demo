import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { Gallery } from '@/components/Gallery'
import { Workbench } from '@/components/Workbench'
import { GALLERY } from '@/data/gallery'
import { SAMPLES } from '@/data/samples'
import { BRAND_PRESETS } from '@/lib/brand'
import { studioQuality } from '@/lib/quality-server'

const STEPS = [
  { title: 'Upload a studio photo', text: 'Light plain backdrop, soft even light, at least 1000 px. A sample works too.' },
  { title: 'Studio check', text: 'The photo is checked in your browser in under a second. If it falls short, you get the reason and how to fix it.' },
  { title: 'Prepare', text: 'Retouch stands, clips or tape if needed, pick the brand voice and add product details: price, SKU, material, measurements.' },
  { title: 'Clean image', text: 'The background is removed, edges are cleaned, and the product is centred on a white square with an even margin and a soft shadow.' },
  { title: 'Listing in your brand’s voice', text: 'Product name, description, key features, SEO title and meta description, tags and alt text, in German, English and Spanish.' },
  { title: 'Share or publish', text: 'A shareable result page, a CSV for any shop system, or a draft in Shopify, WooCommerce or another CMS.' },
]

const WRITES = ['Product name', 'Description', 'Key features', 'SEO title', 'Meta description', 'Tags', 'Alt text']

const CMS = [
  { name: 'Demo store', how: 'Built-in sandbox shop, open to everyone' },
  { name: 'Shopify', how: 'Admin GraphQL · draft + uploaded image · verified' },
  { name: 'WooCommerce', how: 'REST v3 · draft product' },
  { name: 'Any CMS', how: 'Signed webhook (HMAC-SHA256)' },
  { name: 'CSV import', how: 'Works with most shop systems' },
]

// The real ProductPayload shape (lib/connectors/types.ts); each connector creates it as a draft.
const PAYLOAD = `{
  "title": "Deep Blue Stoneware Vase",
  "descriptionHtml": "<p>Glazed stoneware in deep blue…</p><ul>…</ul>",
  "bullets": ["Watertight: holds fresh cut flowers", "…"],
  "seo": { "title": "Stoneware Vase in Deep Blue | Nordhaus", "description": "…" },
  "tags": ["vase", "stoneware", "blue", "sale", "featured"],
  "sku": "NH-VA-024", "price": 49, "compareAtPrice": 59,
  "imageUrl": "https://…/runs/…/output.png",
  "altText": "A tall, deep blue stoneware vase…",
  "vendor": "Nordhaus", "category": "Home & Living"
}`

/** Studio samples are offered only if they pass the studio check; the rejected example only if it fails. */
async function availableSamples() {
  const checked = await Promise.all(
    SAMPLES.map(async (s) => {
      const file = path.join(process.cwd(), 'public', s.src)
      if (!existsSync(file)) return null
      const { pass } = await studioQuality(await readFile(file))
      return pass === (s.kind === 'studio') ? s : null
    }),
  )
  return checked.filter((s) => s !== null)
}

type Tone = 'paper' | 'oat' | 'table' | 'brown'
const TONE: Record<Tone, string> = {
  paper: 'bg-paper',
  oat: 'bg-oat',
  table: 'bg-card',
  brown: 'bg-brown-deep text-paper',
}

/** A section: its own surface, a small number and label in the margin, a real heading. */
function Sheet({ n, id, label, title, lede, tone = 'paper', children }: { n: string; id?: string; label: string; title?: string; lede?: string; tone?: Tone; children: React.ReactNode }) {
  const dark = tone === 'brown'
  return (
    <section id={id} className={`scroll-mt-16 border-t ${dark ? 'border-brown-deep' : 'border-sand'} ${TONE[tone]}`}>
      <div className="mx-auto grid max-w-6xl gap-x-10 px-4 sm:px-6 md:grid-cols-[96px_1fr]">
        <div className="flex items-baseline gap-2 pt-8 md:pt-[3.6rem]">
          <p className={`font-mono text-[13px] ${dark ? 'text-paper/50' : 'text-muted'}`}>{n}</p>
          <p className={`caption ${dark ? '!text-paper/60' : ''}`}>{label}</p>
        </div>
        <div className="pb-12 pt-3 md:pb-14 md:pt-14">
          {title && <h2 className="max-w-2xl text-[22px] font-semibold leading-tight sm:text-[26px]">{title}</h2>}
          {lede && <p className={`mt-1.5 max-w-2xl leading-relaxed ${dark ? 'text-paper/75' : 'text-muted'}`}>{lede}</p>}
          <div className={title || lede ? 'mt-6' : ''}>{children}</div>
        </div>
      </div>
    </section>
  )
}

export default async function Home() {
  const samples = await availableSamples()
  // Hero: the hardest case (white product on a light backdrop, thin wire struts).
  const hero = GALLERY.find((r) => r.meta.productType?.includes('armchair')) ?? GALLERY[0]
  return (
    <main>
      <Sheet n="00" label="Intro">
        <h1 className="text-[2.1rem] font-semibold leading-[1.08] sm:text-[44px]">
          Product photo in.<br /><span className="text-brown">Shop listing out.</span>
        </h1>
        <div className="mt-6 grid items-start gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <p className="max-w-xl leading-relaxed text-ink/85">
              Upload a studio photo. You get a clean catalogue image on white and a complete listing, written in your
              brand’s voice from your company bio or a preset, in German, English and Spanish.
            </p>
            <div className="mt-6 border-t border-sand pt-4">
              <p className="caption">What gets written</p>
              <p className="mt-2 font-mono text-[13px] leading-7 text-ink">{WRITES.join(' / ')}</p>
            </div>
            <a href="#try" className="mt-8 inline-flex min-h-12 items-center rounded-none bg-brown px-6 text-[15px] font-semibold text-paper hover:bg-brown-dark">
              Try it with a photo
            </a>
          </div>
          {hero && (
            <figure>
              <div className="grid grid-cols-2 border-t border-sand bg-card">
                <div className="border-r border-sand">
                  <p className="caption border-b border-sand px-3 py-2">Raw photo</p>
                  <img src={hero.originalUrl} alt={`Raw photo: ${hero.copy.altText}`} className="aspect-square w-full bg-oat object-cover" />
                </div>
                <div>
                  <p className="caption border-b border-sand px-3 py-2">Catalogue image</p>
                  <img src={hero.outputUrl} alt={hero.copy.altText} className="aspect-square w-full object-contain" />
                </div>
              </div>
              <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{hero.copy.name}</span>
                <a href={`/r/${hero.id}`} className="text-sm text-ink underline underline-offset-4">Open the full listing</a>
              </figcaption>
            </figure>
          )}
        </div>
      </Sheet>

      <Sheet n="01" id="how" label="How it works" tone="oat" title="Six steps, one run." lede="From a raw studio photo to a draft in your shop. Most of it runs in about fifteen seconds.">
        {/* A table row, not a second set of circles: the circles belong to the progress rings in the tool. */}
        <ol className="grid border-t border-sand sm:grid-cols-2 lg:grid-cols-6">
          {STEPS.map(({ title, text }, i) => (
            <li key={title} className="border-b border-rule-soft py-4 pr-4 sm:border-b-0 lg:[&:not(:first-child)]:border-l lg:[&:not(:first-child)]:pl-4">
              <p className="font-mono text-xs text-muted">{String(i + 1).padStart(2, '0')}</p>
              <p className="mt-1.5 text-[15px] font-semibold leading-snug">{title}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 max-w-3xl text-sm text-muted">
          Every number from your product details appears in all three languages, filler words are filtered out, and each
          stage reports its time and the model it used.
        </p>
      </Sheet>

      <Sheet n="02" id="try" label="Light table" tone="table" title="Try it on the light table." lede="Drop your own studio photo, or start with one of the samples.">
        <Workbench presets={BRAND_PRESETS.map(({ id, name, bio }) => ({ id, name, bio }))} samples={samples} siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY} />
      </Sheet>

      <Sheet n="03" id="gallery" label="Gallery" title="Real runs, nothing staged." lede="Each one is a cached pipeline run. Open it to see every stage, its timing and the model that ran it.">
        <Gallery runs={GALLERY} />
      </Sheet>

      <Sheet n="04" id="cms" label="Publish" tone="brown" title="Publishes to any CMS." lede="One neutral product format, one small connector per system. Every product lands as a draft, so a person signs off on AI copy before it goes live.">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <table className="w-full border-collapse text-sm">
              <tbody>
                {CMS.map((c) => (
                  <tr key={c.name} className="border-t border-paper/20 last:border-b">
                    <td className="py-3 pr-4 font-medium">{c.name}</td>
                    <td className="py-3 text-paper/65">{c.how}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-6 text-sm leading-relaxed text-paper/65">
              Shopify and WooCommerce receive the image as a file upload, so publishing works even from a laptop. Shopify is
              verified end to end on a real development store. Every visitor can try the flow in the built-in{' '}
              <a href="/store" className="text-paper underline underline-offset-4">demo store</a>; real stores are owner-only.
              Any other CMS gets signed JSON with the image included.
            </p>
          </div>
          <div className="border-t border-paper/30 bg-brown-dark">
            <p className="caption border-b border-paper/20 px-4 py-2.5 !text-paper/60">ProductPayload → connector · created as draft</p>
            <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-relaxed text-paper/90">{PAYLOAD}</pre>
          </div>
        </div>
      </Sheet>
    </main>
  )
}
