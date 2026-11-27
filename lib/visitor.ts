import { createHash, randomBytes } from 'node:crypto'
import type { DemoProduct } from './store/types'

/**
 * Anonymous visitor id for the demo store. Each visitor sees only their own drafts plus the
 * owner's showcase drafts, so nothing one visitor publishes is ever shown to anyone else.
 * The cookie holds a random id; the store only keeps its hash.
 */
export const VISITOR_COOKIE = 'demo_visitor'
/** Drafts the owner published: shown to every visitor. */
export const SHOWCASE = 'showcase'
export const VISITOR_RE = /^(?:[a-f0-9]{32}|showcase)$/

const RAW_RE = /^[a-f0-9]{32}$/

export const newVisitorId = () => randomBytes(16).toString('hex')

export const visitorKey = (raw: string) => createHash('sha256').update(`demo-visitor:${raw}`).digest('hex').slice(0, 32)

/** The visitor's hashed id from a raw cookie value, or null if missing or malformed. */
export const keyFromCookieValue = (raw: string | undefined | null) => (raw && RAW_RE.test(raw) ? visitorKey(raw) : null)

export function readVisitorCookie(cookieHeader: string | null): string | null {
  for (const part of (cookieHeader ?? '').split(';')) {
    const [k, v] = part.trim().split('=')
    if (k === VISITOR_COOKIE && v && RAW_RE.test(v)) return v
  }
  return null
}

export const visitorCookie = (raw: string) =>
  `${VISITOR_COOKIE}=${raw}; Path=/; Max-Age=${30 * 86_400}; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`

/** Whose drafts a viewer may see. */
export const visibleTo = (viewer: string | null) => (viewer ? [viewer, SHOWCASE] : [SHOWCASE])

/** One card per run (newest first wins), so a run the viewer and the owner both published shows once. */
export function dedupeDrafts(items: DemoProduct[]): DemoProduct[] {
  const seen = new Set<string>()
  return items.filter((e) => !seen.has(e.runId) && Boolean(seen.add(e.runId)))
}
