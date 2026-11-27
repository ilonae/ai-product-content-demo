import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { RUN_ID_RE } from '../id'
import type { Run } from '../types'
import { dedupeDrafts, SHOWCASE, visibleTo, VISITOR_RE } from '../visitor'
import type { DemoProduct, ImageName, Store } from './types'

/** Development store: files under .data/, served by /api/files. Not for serverless production. */
export class LocalStore implements Store {
  kind = 'local' as const
  constructor(private dir = process.env.LOCAL_STORE_DIR || path.join(process.cwd(), '.data')) {}

  private runDir(id: string) {
    if (!RUN_ID_RE.test(id)) throw new Error('invalid run id')
    return path.join(this.dir, 'runs', id)
  }

  async putImage(runId: string, name: ImageName, png: Buffer) {
    const dir = this.runDir(runId)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), png)
    return `/api/files/${runId}/${name}`
  }

  async readImage(runId: string, name: ImageName) {
    return readFile(path.join(this.runDir(runId), name))
  }

  async saveRun(run: Run) {
    const dir = this.runDir(run.id)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'run.json'), JSON.stringify(run, null, 2))
  }

  async getRun(id: string) {
    if (!RUN_ID_RE.test(id)) return null
    try {
      return JSON.parse(await readFile(path.join(this.runDir(id), 'run.json'), 'utf8')) as Run
    } catch {
      return null
    }
  }

  async saveDemoProduct(entry: DemoProduct) {
    const visitor = entry.visitor ?? SHOWCASE
    if (!RUN_ID_RE.test(entry.runId) || !VISITOR_RE.test(visitor)) throw new Error('invalid draft id')
    const dir = path.join(this.dir, 'store')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, `${entry.runId}.${visitor}.json`), JSON.stringify(entry, null, 2))
  }

  async listDemoProducts(viewer: string | null, limit = 48) {
    const dir = path.join(this.dir, 'store')
    let files: string[] = []
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
    } catch {
      return []
    }
    const items = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8')) as DemoProduct))
    const allowed = visibleTo(viewer)
    // Old local drafts without a visitor count as showcase.
    const mine = items.filter((e) => allowed.includes(e.visitor ?? SHOWCASE))
    return dedupeDrafts(mine.sort((a, b) => b.createdAt.localeCompare(a.createdAt))).slice(0, limit)
  }
}
