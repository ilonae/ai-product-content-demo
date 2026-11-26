import type { Run } from '@/lib/types'
import entries from './gallery.json'

/**
 * Curated before/after examples, served as static files: zero cost, always on.
 * Generate them with `npm run gallery:build` (see samples/README.md).
 */
export const GALLERY = entries as unknown as Run[]
