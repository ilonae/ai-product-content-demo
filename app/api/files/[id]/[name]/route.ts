import { RUN_ID_RE } from '@/lib/id'
import { getStore } from '@/lib/store'
import { LocalStore } from '@/lib/store/local'

export const runtime = 'nodejs'

const NAMES = new Set(['original.png', 'output.png'])

/** Serves images only for the local development store; Supabase serves its own public URLs. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params
  if (!RUN_ID_RE.test(id) || !NAMES.has(name)) return new Response('Not found', { status: 404 })
  let store
  try {
    store = getStore()
  } catch {
    return new Response('Not found', { status: 404 })
  }
  if (!(store instanceof LocalStore)) return new Response('Not found', { status: 404 })
  try {
    const png = await store.readImage(id, name as 'original.png' | 'output.png')
    return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' } })
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
