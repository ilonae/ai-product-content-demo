import { getRun } from '@/lib/runs'

export const runtime = 'nodejs'

/** The run behind a permalink, as JSON (the same data the /r/<id> page shows). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  return run ? Response.json(run) : Response.json({ error: 'Not found' }, { status: 404 })
}
