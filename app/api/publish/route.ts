import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { getConfig } from '@/lib/config'
import { CONNECTORS, findConnector, payloadFromRun } from '@/lib/connectors'
import { loadOutputImage } from '@/lib/connectors/image'
import { errorMessage } from '@/lib/errors'
import { clientIp, dayKey, getCounter, hashIp } from '@/lib/guards'
import { RUN_ID_RE } from '@/lib/id'
import { getRun } from '@/lib/runs'
import { newVisitorId, readVisitorCookie, SHOWCASE, visitorCookie, visitorKey } from '@/lib/visitor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const Body = z.object({ runId: z.string().regex(RUN_ID_RE), connector: z.string().max(40), lang: z.enum(['de', 'en', 'es']).optional() })

function hasOwnerToken(req: Request): boolean {
  const token = process.env.PUBLISH_TOKEN
  if (!token) return false
  const given = Buffer.from(req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '')
  const want = Buffer.from(token)
  return given.length === want.length && timingSafeEqual(given, want)
}

/**
 * Owner = valid PUBLISH_TOKEN, or local development. Deliberately NOT tied to ALLOW_LOCAL_FALLBACKS:
 * a production build never treats a visitor as the owner without the token.
 */
const isOwner = (req: Request) => hasOwnerToken(req) || process.env.NODE_ENV !== 'production'

/** Which targets exist, which are set up, and whether this visitor may use the owner-only ones. */
export async function GET(req: Request) {
  return Response.json(
    {
      owner: isOwner(req),
      ownerTokenEnabled: Boolean(process.env.PUBLISH_TOKEN),
      connectors: CONNECTORS.map((c) => ({ id: c.id, label: c.label, configured: c.configured(), ownerOnly: c.ownerOnly, setupHint: c.configured() ? undefined : c.setupHint })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

/**
 * Publish a run as a draft. The demo store is open to everyone (rate-limited);
 * real stores need the owner (PUBLISH_TOKEN as a Bearer token, or local development).
 */
export async function POST(req: Request) {
  const body = Body.safeParse(await req.json().catch(() => null))
  if (!body.success) return Response.json({ error: 'Expected {runId, connector, lang?}.' }, { status: 400 })

  const connector = findConnector(body.data.connector)
  if (!connector) return Response.json({ error: 'Unknown target.' }, { status: 400 })
  if (!connector.configured()) return Response.json({ error: `${connector.label} isn’t connected yet.`, setupHint: connector.setupHint }, { status: 400 })

  let counter
  try {
    counter = getCounter()
  } catch {
    counter = null
  }
  const ipKey = (() => {
    try {
      return hashIp(clientIp(req.headers))
    } catch {
      return 'unknown'
    }
  })()

  if (connector.ownerOnly && !isOwner(req)) {
    // Slow down token guessing: 10 failed attempts per IP per day.
    if (req.headers.get('authorization') && counter) {
      const fails = await counter.incrBy(`pub401:${dayKey()}:${ipKey}`, 1, 86_400)
      if (fails > 10) return Response.json({ error: 'Too many attempts.' }, { status: 429 })
    }
    return Response.json({ error: `Publishing to ${connector.label} is reserved for the owner of this demo.` }, { status: 401 })
  }
  if (!connector.ownerOnly && counter) {
    const n = await counter.incrBy(`pubdemo:${dayKey()}:${ipKey}`, 1, 86_400)
    if (n > 30) return Response.json({ error: 'That’s enough publishing for today. Thanks for trying it!' }, { status: 429 })
  }

  const run = await getRun(body.data.runId)
  if (!run) return Response.json({ error: 'Run not found.' }, { status: 404 })

  try {
    const payload = payloadFromRun(run, getConfig().siteUrl, body.data.lang)
    // Real stores get the image file itself (works without a public URL); the demo store only needs the URL.
    if (connector.ownerOnly) payload.image = await loadOutputImage(run)
    // Demo store: the owner's drafts are the showcase; a visitor's drafts are visible to that visitor only.
    let visitor: string | undefined
    let setCookie: string | undefined
    if (!connector.ownerOnly) {
      if (isOwner(req)) visitor = SHOWCASE
      else {
        let raw = readVisitorCookie(req.headers.get('cookie'))
        if (!raw) {
          raw = newVisitorId()
          setCookie = visitorCookie(raw)
        }
        visitor = visitorKey(raw)
      }
    }
    const result = await connector.publish(payload, { visitor })
    return Response.json(result, setCookie ? { headers: { 'set-cookie': setCookie } } : undefined)
  } catch (e) {
    console.error('[publish]', connector.id, errorMessage(e))
    return Response.json({ error: errorMessage(e) }, { status: 502 })
  }
}
