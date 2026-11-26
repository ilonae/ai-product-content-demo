import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { RUN_ID_RE } from '../id'
import type { Run } from '../types'
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
    const { error } = await this.db.from('demo_store').upsert({ id: entry.runId, created_at: entry.createdAt, data: entry })
    if (error) throw new Error(`demo store insert failed: ${error.message}`)
  }

  async listDemoProducts(limit = 48) {
    const { data, error } = await this.db.from('demo_store').select('data').order('created_at', { ascending: false }).limit(limit)
    if (error || !data) return []
    return data.map((r) => r.data as DemoProduct)
  }
}
