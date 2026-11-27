import type { ProductPayload } from '../connectors/types'
import type { Lang, Run } from '../types'

/** A draft in the built-in demo store. */
export interface DemoProduct {
  runId: string
  /** Hashed visitor id, or 'showcase' (the owner's drafts, shown to everyone). Old local drafts have none. */
  visitor?: string
  createdAt: string
  lang: Lang
  product: Omit<ProductPayload, 'image'>
}

export type ImageName = 'original.png' | 'output.png'

export interface Store {
  kind: 'local' | 'supabase' | 'static'
  /** Returns the public URL of the stored image. */
  putImage(runId: string, name: ImageName, png: Buffer): Promise<string>
  saveRun(run: Run): Promise<void>
  getRun(id: string): Promise<Run | null>
  saveDemoProduct(entry: DemoProduct): Promise<void>
  /** The drafts this viewer may see: their own plus the showcase. */
  listDemoProducts(viewer: string | null, limit?: number): Promise<DemoProduct[]>
  /** Retention: deletes visitors' live runs and drafts older than the given dates. */
  purgeExpired?(o: { runsBefore: Date; draftsBefore: Date }): Promise<{ runs: number; drafts: number }>
}
