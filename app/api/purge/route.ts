import { timingSafeEqual } from 'node:crypto'
import { errorMessage } from '@/lib/errors'
import { getStore } from '@/lib/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DAY = 86_400_000
const days = (name: string, fallback: number) => {
  const n = Number(process.env[name])
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const want = Buffer.from(`Bearer ${secret}`)
  return given.length === want.length && timingSafeEqual(given, want)
}

/**
 * Daily clean-up, called by the Vercel schedule in vercel.json (it sends `Authorization: Bearer $CRON_SECRET`).
 * Deletes visitors' live runs (images + rows) after RETENTION_DAYS (30) and their demo-store drafts after
 * DRAFT_RETENTION_DAYS (7). Gallery runs and the owner's showcase drafts are kept.
 */
export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'Unauthorized.' }, { status: 401 })
  try {
    const store = getStore()
    if (!store.purgeExpired) return Response.json({ skipped: `the ${store.kind} store keeps everything` })
    const now = Date.now()
    const result = await store.purgeExpired({
      runsBefore: new Date(now - days('RETENTION_DAYS', 30) * DAY),
      draftsBefore: new Date(now - days('DRAFT_RETENTION_DAYS', 7) * DAY),
    })
    console.info('[purge]', result)
    return Response.json(result)
  } catch (e) {
    console.error('[purge]', errorMessage(e))
    return Response.json({ error: 'Purge failed.' }, { status: 500 })
  }
}
