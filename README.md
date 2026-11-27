# AI Product-Content Pipeline

Upload a raw product photo. The pipeline returns a **catalogue-ready image** (background removed, composited on white) and **on-brand product copy in German, English and Spanish**, written in the shop's own voice from a short company bio. Every run gets a **shareable permalink** (`/r/<id>`), and any result can be **published to a CMS as a draft** (Shopify, WooCommerce, any other system via a signed webhook, or CSV import).

This is a portfolio-safe rebuild of a tool I built and ran in production for an e-commerce start-up. It uses SFW sample products, a cached gallery as the default proof, and a **capped** live path, so anyone can try it without running up a bill.

---

## Why it's built this way (the one hard problem)

The production tool ran on the shop owner's machine with their own API keys. A public demo can't do that, and it can't expose the owner's keys to the internet either. So this demo is a **hybrid**:

- **Gallery**: real cached pipeline runs, permalinked and served as static files. Zero marginal cost, always on. It shows hard cases on purpose: a white product on a light backdrop, open gaps between legs and rungs, and a dark product.
- **Live path**: a limited "try it yourself" flow behind guardrails:
  - Cloudflare **Turnstile** bot check on submit.
  - A **content check** on every upload: the photo and the visitor's text go through OpenAI's moderation endpoint (free) before anything is spent or stored. If the check can't run in production, the upload is refused.
  - **Privacy and retention**: a visitor's result page is shareable by link but never indexed; in the demo store each visitor sees only their own drafts (plus the owner's showcase). A daily schedule (`vercel.json` → `/api/purge`, protected by `CRON_SECRET`) deletes visitors' runs and images after 30 days and their drafts after 7.
  - Per-IP **rate limit** via Upstash Redis (default: 2 runs per IP per day). It only ever stores a salted hash of the IP, and it trusts Cloudflare's `cf-connecting-ip` only when told the origin sits behind Cloudflare (`TRUST_CLOUDFLARE=1`), since that header can otherwise be spoofed.
  - A hard **daily spend cap**. Each run **reserves** its estimated cost *before* it starts, so concurrent runs can't overshoot. Afterwards the reservation is settled to the run's actual estimate, and a run that fails on our side is given back. When the cap is hit, the page switches to "at capacity — browse the gallery".
  - Cheap checks come before expensive ones: the declared size, then the bot check (its token travels in a header, so it runs before the upload is read), then a header-only image check with a 40-megapixel limit against decompression bombs, and only then the rate limit.
  - A light **watermark** on live outputs, so they can't be passed off as commercial assets.

When the cap trips, the experience falls back to the gallery. It never errors out, and it never costs more than you set.

---

## Architecture

```
Browser ──> Next.js 16 (Vercel)
              │  app/page.tsx            gallery + "try it" form (Turnstile)
              │  app/api/generate        server-side orchestration, streams each stage (NDJSON)
              │  app/r/[id]              SSR results permalink (+ OG tags for sharing)
              │  app/api/runs/[id]/export  CSV for any CMS importer
              │  app/api/publish         owner-only: push a run into a CMS as a draft
              │
              ├──> rembg service (Docker; Fly.io/Railway)   background removal (CPU)
              ├──> Stability AI                             fallback cut-out + optional upscale
              ├──> LLM: OpenAI gpt-6.2-sol (default) or Claude product copy in DE/EN/ES
              ├──> Supabase                                 Storage (images) + Postgres (runs)
              └──> Upstash Redis                            rate limits + daily spend counter
```

### Pipeline stages (shown live to the visitor: this is the "provable" part)

| # | Stage | What happens | Code |
|---|---|---|---|
| 1 | **Ingest** | Validate the file by its content (not its name), fix EXIF rotation, cap the long edge, convert to PNG | `lib/image.ts` |
| 2 | **Background removal** | rembg service (isnet-general-use + mask smoothing, chosen in a side-by-side test against u2net and alpha matting) → transparent PNG; Stability AI as cloud fallback | `lib/providers/background.ts` |
| 3 | **Compose** | Clean the edge (no fringe), crop to the product, centre it on a white square (tight / standard / airy margin, never upscaled, max 2000 px), optional soft contact shadow; dark products can get an AI upscale first | `lib/image.ts` |
| 4 | **Copy** | A vision-language model reads the image + metadata and writes the name, descriptions and alt text in the brand voice | `lib/copy/` |
| 5 | **Persist** | Store images + run row, return `/r/<id>` | `lib/store/` |
| (1b) | **Retouch** | Only when tape is marked: AI inpainting (Stability) or a local fill | `lib/providers/retouch.ts` |

Each stage records its duration and the provider/model that ran it. The live form shows them as they finish, and the results page shows them permanently, so visitors can see it's a real pipeline, not a mock-up.

### Studio-quality gate and retouching

Only studio-quality photos get through, because the pipeline needs the input a catalogue photographer would deliver. Right after upload, the browser checks the photo in under a second: a light backdrop, neutral colour, even light, exposure, sharpness and at least 1000 px. The server runs the same check again (`lib/quality.ts`, used by both sides), so it can't be bypassed. A failed photo gets a reason and a fix for each problem, and it doesn't cost the visitor a run. The thresholds are calibrated on a real catalogue shot: a light-grey seamless sweep with diffused light.

Then an optional editor (`components/PhotoEditor.tsx`) retouches the photo before generation, with tools ported from the production tool:

| Tool | What it does |
|---|---|
| Erase prop (E) | Paints over stands, clips or clutter in the backdrop colour, so the cut-out drops them. "Grow into shadow" also cleans their grey shadow and stops at the product. |
| Tape (T) | Marks tape, pins or small marks. The browser sends them as a PNG mask, and the server repaints them in an extra **retouch** stage: Stability AI inpainting (`lib/providers/retouch.ts`) rebuilds texture and edges, and only the masked area is taken over. Without a key, or if the AI call fails, a free local fill takes over (`lib/editing.ts`). That fill is meant for marks on the product surface, not across its edge. The mask may cover at most 25 % of the photo, and its cost is reserved against the daily cap. |
| Pick colour (I) | Sets the eraser colour from the backdrop. |

The editor also has undo/redo (⌘Z / ⇧⌘Z), brush size ([ ]), zoom (⌘+scroll) and hold-to-compare.

### Product details and output

Inputs match what a shop needs: product type, shop category, SKU, material, price, compare-at price (the discount is shown live), badge (New, Sale, Bestseller), Featured, image framing and shadow, and measurements that are kept word for word. The model gets everything except price, badge and featured, which the shop renders itself.

Per language, the output has a name, a description, 3–5 key features, an SEO title (≤ 60) and meta description (≤ 155) with live character counters, plus tags and alt text. A shop-card preview shows the badge, price, strike-through price and SKU. The CSV and the connectors carry all of it: compare-at/sale price, tags, SEO fields and Featured.

### Copy quality checks

Every listing is checked against explicit rules (`lib/copy/lint.ts`):
- length limits for name, descriptions, key features and SEO texts;
- banned filler words in every field ("perfekt", "ideal", "stunning"…);
- every number from the product details present in all three languages.

If anything breaks a rule, the model gets one revision with the exact problems quoted, and the version with fewer issues wins. Rules that are still open are shown on the result, not hidden. OpenAI answers use strict structured outputs (a JSON schema), so the shape is guaranteed.

### Model choice

The default copy model is **gpt-6.2-sol**, chosen in a side-by-side test of four OpenAI models on the same three products, prompt and checks:

| Model | Open rules (3 products) | Avg. time | Calls |
|---|---|---|---|
| gpt-4o | 3 | 12.8 s | 6 |
| gpt-4.1 | 3 | 10.0 s | 5 |
| gpt-5.5 | 0 | 39.8 s | 4 |
| gpt-6.2-sol | 0 | 12.2 s | 3 |

It's one run per product, so read it as a trend. Override with `OPENAI_MODEL`; newer reasoning models get no temperature and more completion tokens automatically.

### Brand voice

Pick a preset (`lib/brand.ts`) or paste your own company bio (up to 600 characters). The prompt (`lib/copy/prompt.ts`) asks for native writing in each language, not translation. It must open with the product's defining property and include every spec the owner gave, with exact values. It may never invent materials, sizes or certifications, and it treats the bio and specs as data, not as instructions. Output is schema-validated: strict structured outputs on OpenAI (the default provider, as in the production tool), or structured outputs on Claude (`COPY_PROVIDER=anthropic`).

### CMS connectors

Publishing happens on the result page: pick the language, press **Publish**, and get a link to the draft. Every connector maps one neutral `ProductPayload` (`lib/connectors/types.ts`) onto its own API and **always creates a draft**, so a person reviews AI copy before it goes live.

| Target | How | Who can publish |
|---|---|---|
| **Demo store** | Built-in sandbox shop at `/store`: drafts with image, name, description, key features, price, tags | Every visitor (rate-limited; each sees only their own drafts) |
| Shopify | Admin GraphQL: the image file goes up as a staged upload, then `productCreate` (title, description, tags, SEO, image) and `productVariantsBulkUpdate` (price, compare-at, SKU) | Owner |
| WooCommerce | REST v3 draft (regular/sale price, SKU, Featured, tags, key features); the image goes to the WordPress media library via an application password | Owner |
| Any other CMS | Signed JSON POST (HMAC-SHA256 in `x-signature`), image included as base64 | Owner |
| CSV | Shopify-format CSV, formula-safe; importable by most shop systems | Everyone |

Because the image is uploaded as a file, publishing to Shopify and WooCommerce also works from `localhost`. "Owner" means local development, or `PUBLISH_TOKEN` entered once on a result page of a deployment. Shopify is verified end to end against a real development store (draft with image uploaded from localhost, price, SKU, tags, SEO; read back through the Admin API). WooCommerce and the webhook are tested against their request formats with mocked responses. Shopify apps from the Dev Dashboard (2026) authenticate with Client ID + secret; the connector exchanges them for a 24 h token and caches it.

---

## Hosting (cheap: a few $/month)

| Piece | Where | Notes |
|---|---|---|
| Next.js app | Vercel | hobby tier is fine for a demo |
| rembg service | Fly.io or Railway | CPU container that scales to zero (`services/rembg/`) |
| Database + image storage | Supabase | free tier covers a demo |
| Rate limit / spend counter | Upstash Redis | free tier covers a demo |
| CDN / Turnstile | Cloudflare | free |

---

## Setup

```bash
cp .env.example .env.local      # fill in the values; PIPELINE_MOCK=1 runs fully offline
npm install

# 1) create the DB schema: paste supabase/schema.sql into the Supabase SQL editor
# 2) start or deploy the rembg service (services/rembg/README.md)
# 3) run the app
npm run dev
```

If the repo sits in an iCloud-synced folder (Desktop & Documents), Turbopack's build output gets corrupted by the sync: build locally with `npm run build:local` (webpack). Vercel uses the default build.

With `PIPELINE_MOCK=1` and no keys, everything runs locally: a naive cut-out, template copy, files in `.data/` and in-memory limits. Production refuses those fallbacks unless `ALLOW_LOCAL_FALLBACKS=1` is set, which is only meant for `next start` on your own machine; on Vercel the flag is ignored, so it can never switch off the bot check or the shared spend cap. A production visitor is the owner only with `PUBLISH_TOKEN`, whatever else is set.

**Gallery:** put a few SFW product photos in `samples/` and run `npm run gallery:build` (see `samples/README.md`).

---

## Cost controls (read before going live)

- `DAILY_SPEND_CAP_USD`: hard ceiling for all visitors together, default **$0.15 a day**. The live path closes for the rest of the UTC day when the next run's worst case would exceed it; the gallery stays open.
- `MAX_RUNS_PER_IP_PER_DAY`: default 2.
- `EST_COST_*_USD`: per-stage estimates reserved against the cap. The defaults use November 2026 prices: Stability charges $0.05 for a background removal or an inpaint and $0.02 for a fast upscale; a copy call on gpt-6.2-sol measured about 1,040 input and 880 output tokens, about $0.011. A typical run (self-hosted rembg, one copy call) costs about a cent. Check them when prices change.
- Uploads are capped at 4 MB (Vercel's body limit is 4.5 MB). The vision model gets a 1024 px JPEG, not the full image.
- The gallery is always free: it serves cached outputs and makes no provider calls.
- **Retention:** live uploads are public via their permalink. Schedule the 30-day purge in `supabase/schema.sql` before sharing the link widely.

---

## Quality

```bash
npm run typecheck && npm test && npm run build
```

There are 62 tests covering the image stages, the pipeline (stage order, live reporting, failure path), the studio-quality gate, the retouching tools (AI inpainting with a local fallback, only the masked area changes, grow into shadow), the guardrails (rate limit, spend cap and refunds, the $0.15 daily cap across all visitors, trusted client IP, salt, pixel limit), upload moderation (fails closed), demo-store privacy, the purge secret, the prompt and the copy checker, publishing (demo store drafts, image uploads to Shopify and WordPress, the Shopify token exchange), and every connector (Shopify draft creation and user errors, webhook signature, CSV escaping and formula injection). CI runs the same on every push (`.github/workflows/ci.yml`).

## What to customise

- `lib/brand.ts`: brand presets.
- `lib/copy/prompt.ts`: copy rules and tone.
- `lib/pipeline.ts`: stages; every provider is injectable.
- `lib/connectors/`: add a CMS.
- `components/Workbench.tsx`: the upload, studio check, editor and live progress (with the Turnstile check).
- Sample products: **keep them SFW and generic, with no visible brand logos** (vase, speaker, bottle).

`TODO:` markers flag the spots that need your provider keys or a decision.
