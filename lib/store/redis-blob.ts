import { del, put } from '@vercel/blob'
import type { Redis } from '@upstash/redis'
import { RUN_ID_RE } from '../id'
import { retention } from '../retention'
import type { Run } from '../types'
import { dedupeDrafts, SHOWCASE, visibleTo, VISITOR_RE } from '../visitor'
import type { DemoProduct, ImageName, Store } from './types'

/** The two Blob calls this store makes; swapped for a fake in tests. */
export interface BlobApi {
  put(pathname: string, body: Buffer, contentType: string): Promise<{ url: string }>
  del(urls: string[]): Promise<void>
}

export const vercelBlob: BlobApi = {
  put: (pathname, body, contentType) => put(pathname, body, { access: 'public', contentType, addRandomSuffix: false }),
  del: (urls) => del(urls),
}

const DAY_S = 86_400
const K = {
  run: (id: string) => `demo:run:${id}`,
  /** Blob URLs of a run, for the purge. */
  files: (id: string) => `demo:files:${id}`,
  /** Draft keys that show a run, for the purge. */
  runDrafts: (id: string) => `demo:run-drafts:${id}`,
  /** Every run with stored files, scored by upload time. */
  runs: 'demo:runs',
  draft: (runId: string, visitor: string) => `demo:draft:${runId}:${visitor}`,
  /** One list per visitor (and one for the showcase), scored by creation time. */
  drafts: (visitor: string) => `demo:drafts:${visitor}`,
}

/**
 * Serverless store without a database. Run records and demo-store drafts live in Upstash Redis
 * and expire on their own (RETENTION_DAYS, DRAFT_RETENTION_DAYS). Images live in a public
 * Vercel Blob store; Blob has no expiry, so the daily purge deletes them.
 */
export class RedisBlobStore implements Store {
  kind = 'redis' as const

  constructor(
    private r: Redis,
    private blob: BlobApi = vercelBlob,
  ) {}

  async putImage(runId: string, name: ImageName, png: Buffer) {
    if (!RUN_ID_RE.test(runId)) throw new Error('invalid run id')
    const { url } = await this.blob.put(`runs/${runId}/${name}`, png, 'image/png')
    // Indexed on upload, so files of a run that failed before saveRun are purged too.
    await Promise.all([this.r.sadd(K.files(runId), url), this.r.zadd(K.runs, { nx: true }, { score: Date.now(), member: runId })])
    return url
  }

  async saveRun(run: Run) {
    if (!RUN_ID_RE.test(run.id)) throw new Error('invalid run id')
    if (run.source === 'live') await this.r.set(K.run(run.id), run, { ex: retention().runDays * DAY_S })
    else await this.r.set(K.run(run.id), run)
  }

  async getRun(id: string) {
    if (!RUN_ID_RE.test(id)) return null
    return (await this.r.get<Run>(K.run(id))) ?? null
  }

  async saveDemoProduct(entry: DemoProduct) {
    const visitor = entry.visitor ?? SHOWCASE
    if (!RUN_ID_RE.test(entry.runId) || !VISITOR_RE.test(visitor)) throw new Error('invalid draft id')
    const key = K.draft(entry.runId, visitor)
    const ttl = visitor === SHOWCASE ? null : retention().draftDays * DAY_S
    const p = this.r.pipeline()
    if (ttl) p.set(key, { ...entry, visitor }, { ex: ttl })
    else p.set(key, { ...entry, visitor })
    p.zadd(K.drafts(visitor), { score: Date.parse(entry.createdAt), member: key })
    // A visitor's list expires with their newest draft; older entries just point at expired keys.
    if (ttl) p.expire(K.drafts(visitor), ttl)
    p.sadd(K.runDrafts(entry.runId), key)
    await p.exec()
  }

  async listDemoProducts(viewer: string | null, limit = 48) {
    const lists = await Promise.all(visibleTo(viewer).map((v) => this.r.zrange<string[]>(K.drafts(v), 0, limit - 1, { rev: true })))
    const keys = lists.flat()
    if (keys.length === 0) return []
    const rows = await this.r.mget<(DemoProduct | null)[]>(...keys)
    const items = rows.filter((e): e is DemoProduct => Boolean(e))
    return dedupeDrafts(items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))).slice(0, limit)
  }

  /** Drafts expire by themselves; this deletes runs older than `runsBefore`, their images and any drafts showing them. */
  async purgeExpired({ runsBefore }: { runsBefore: Date; draftsBefore: Date }) {
    const old = await this.r.zrange<string[]>(K.runs, 0, runsBefore.getTime(), { byScore: true, offset: 0, count: 500 })
    const ids = old.filter((id) => RUN_ID_RE.test(id))
    if (ids.length === 0) return { runs: 0, drafts: 0 }

    const files = (await Promise.all(ids.map((id) => this.r.smembers(K.files(id))))).flat()
    for (let i = 0; i < files.length; i += 100) await this.blob.del(files.slice(i, i + 100))

    const draftKeys = (await Promise.all(ids.map((id) => this.r.smembers(K.runDrafts(id))))).flat()
    const p = this.r.pipeline()
    for (const id of ids) p.del(K.run(id), K.files(id), K.runDrafts(id))
    for (const key of draftKeys) {
      p.del(key)
      p.zrem(K.drafts(key.slice(key.lastIndexOf(':') + 1)), key)
    }
    p.zrem(K.runs, ...ids)
    await p.exec()
    return { runs: ids.length, drafts: draftKeys.length }
  }
}
