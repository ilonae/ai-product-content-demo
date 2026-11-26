import { GALLERY } from '@/data/gallery'
import { getStore } from './store'
import type { Run } from './types'

/** Gallery runs are static files (zero cost); everything else comes from the store. */
export async function getRun(id: string): Promise<Run | null> {
  const fromGallery = GALLERY.find((r) => r.id === id)
  if (fromGallery) return fromGallery
  try {
    return await getStore().getRun(id)
  } catch {
    return null
  }
}
