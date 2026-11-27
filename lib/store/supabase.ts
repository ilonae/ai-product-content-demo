import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { RUN_ID_RE } from '../id'
import type { Run } from '../types'
import { dedupeDrafts, SHOWCASE, visibleTo } from '../visitor'
import type { DemoProduct, ImageName, Store } from './types'

const BUCKET = 'runs'

/** Production store: images in a public Storage bucket, run rows in Postgres (service role only). */
export class SupabaseStore implements Store {
  kind = 'supabase' as const
  private db: SupabaseClient

  constructor(url: string, serviceKey: string) {
    this.db = createClient(url, serviceKey, { auth: { persistSession: false } })
  }

  async putImage(runId: string, name: ImageName, png: Buffer) {
    const key = `${runId}/${name}`
    const { error } = await this.db.storage.from(BUCKET).upload(key, png, { contentType: 'image/png', upsert: false })
    if (error) throw new Error(`storage upload failed: ${error.message}`)
    return this.db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
  }

  async saveRun(run: Run) {
    const { error } = await this.db.from('runs').insert({
      id: run.id,
      created_at: run.createdAt,
      source: run.source,
      est_cost_usd: run.estCostUsd,
      data: run,
    })
    if (error) throw new Error(`run insert failed: ${error.message}`)
  }

  async getRun(id: string) {
    if (!RUN_ID_RE.test(id)) return null
    const { data, error } = await this.db.from('runs').select('data').eq('id', id).maybeSingle()
    if (error || !data) return null
    return data.data as Run
  }

  async saveDemoProduct(entry: DemoProduct) {
    const visitor = entry.visitor ?? SHOWCASE
    const { error } = await this.db.from('demo_store').upsert({ id: `${entry.runId}:${visitor}`, created_at: entry.createdAt, visitor, data: entry })
    if (error) throw new Error(`demo store insert failed: ${error.message}`)
  }

  async listDemoProducts(viewer: string | null, limit = 48) {
    const { data, error } = await this.db
      .from('demo_store')
      .select('data')
      .in('visitor', visibleTo(viewer))
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error || !data) return []
    return dedupeDrafts(data.map((r) => r.data as DemoProduct))
  }

  /** Storage files go through the Storage API (Supabase refuses SQL deletes on storage.objects). */
  async purgeExpired({ runsBefore, draftsBefore }: { runsBefore: Date; draftsBefore: Date }) {
    const drafts = await this.db.from('demo_store').delete({ count: 'exact' }).neq('visitor', SHOWCASE).lt('created_at', draftsBefore.toISOString())
    if (drafts.error) throw new Error(`draft purge failed: ${drafts.error.message}`)

    const old = await this.db.from('runs').select('id').eq('source', 'live').lt('created_at', runsBefore.toISOString()).limit(500)
    if (old.error) throw new Error(`run lookup failed: ${old.error.message}`)
    const ids = (old.data ?? []).map((r) => r.id as string).filter((id) => RUN_ID_RE.test(id))
    if (ids.length > 0) {
      const files = await this.db.storage.from(BUCKET).remove(ids.flatMap((id) => [`${id}/original.png`, `${id}/output.png`]))
      if (files.error) throw new Error(`storage purge failed: ${files.error.message}`)
      const linked = await this.db.from('demo_store').delete().in('data->>runId', ids)
      if (linked.error) throw new Error(`draft purge failed: ${linked.error.message}`)
      const rows = await this.db.from('runs').delete().in('id', ids)
      if (rows.error) throw new Error(`run purge failed: ${rows.error.message}`)
    }
    return { runs: ids.length, drafts: drafts.count ?? 0 }
  }
}
