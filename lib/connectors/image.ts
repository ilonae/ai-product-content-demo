import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getStore } from '../store'
import { LocalStore } from '../store/local'
import type { Run } from '../types'

/** The run's output image as bytes, wherever it lives (local store, static gallery, or a public URL). */
export async function loadOutputImage(run: Run): Promise<{ png: Buffer; filename: string }> {
  const filename = `${run.id}.png`
  const url = run.outputUrl
  if (url.startsWith('/api/files/')) {
    const store = getStore()
    if (store instanceof LocalStore) return { png: await store.readImage(run.id, 'output.png'), filename }
  }
  if (url.startsWith('/gallery/')) {
    const file = path.join(process.cwd(), 'public', url.split('?')[0])
    if (!file.startsWith(path.join(process.cwd(), 'public', 'gallery'))) throw new Error('invalid gallery path')
    return { png: await readFile(file), filename }
  }
  if (/^https?:\/\//.test(url)) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) throw new Error(`image fetch failed: HTTP ${res.status}`)
    return { png: Buffer.from(await res.arrayBuffer()), filename }
  }
  throw new Error('image not reachable')
}
