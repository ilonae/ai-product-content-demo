import { getConfig } from '@/lib/config'
import { payloadFromRun, toCsv } from '@/lib/connectors'
import { handle } from '@/lib/connectors/csv'
import { getRun } from '@/lib/runs'

export const runtime = 'nodejs'

/** Universal export: a product CSV any shop system or CMS with an importer can read. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return new Response('Not found', { status: 404 })
  const csv = toCsv([payloadFromRun(run, getConfig().siteUrl)])
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${handle(run.copy.name)}.csv"`,
    },
  })
}
