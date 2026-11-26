/**
 * Builds the zero-cost gallery: runs the real pipeline on samples/* and writes static files.
 *
 *   samples/mug.jpg            the photo (SFW, licensed for reuse)
 *   samples/mug.json           optional: {"brand":"nordhaus","meta":{"category":"mug","notes":"350 ml"}}
 *
 *   npm run gallery:build      -> public/gallery/<id>/*.png + data/gallery.json
 *
 * Uses your provider keys from .env.local (or PIPELINE_MOCK=1 for a dry run).
 */
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveBrand } from '../lib/brand'
import { getConfig } from '../lib/config'
import { defaultDeps, runPipeline } from '../lib/pipeline'
import type { ImageName, Store } from '../lib/store/types'
import type { ProductMeta, Run } from '../lib/types'

process.loadEnvFile?.('.env.local')

const root = process.cwd()
const galleryJson = path.join(root, 'data', 'gallery.json')

const staticStore: Store = {
  kind: 'static',
  async putImage(runId: string, name: ImageName, png: Buffer) {
    const dir = path.join(root, 'public', 'gallery', runId)
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), png)
    return `/gallery/${runId}/${name}`
  },
  async saveRun() {},
  async getRun() {
    return null
  },
  async saveDemoProduct() {},
  async listDemoProducts() {
    return []
  },
}

async function main() {
  const files = (await readdir(path.join(root, 'samples'))).filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
  if (!files.length) throw new Error('No images in samples/. See samples/README.md.')
  const existing = JSON.parse(await readFile(galleryJson, 'utf8')) as Run[]
  const deps = defaultDeps(getConfig(), staticStore)

  for (const file of files) {
    const sidecar = path.join(root, 'samples', file.replace(/\.\w+$/, '.json'))
    const opts = existsSync(sidecar) ? (JSON.parse(await readFile(sidecar, 'utf8')) as { brand?: string; meta?: ProductMeta }) : {}
    const run = await runPipeline(
      { bytes: await readFile(path.join(root, 'samples', file)), meta: opts.meta ?? {}, brand: resolveBrand(opts.brand), source: 'gallery' },
      deps,
      (s) => console.log(`  ${file}  ${s.name.padEnd(10)} ${s.status}  ${s.ms} ms  ${s.provider ?? ''} ${s.model ?? ''}`),
    )
    existing.push(run)
    console.log(`✓ ${file} → /r/${run.id}`)
  }
  await writeFile(galleryJson, `${JSON.stringify(existing, null, 2)}\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
