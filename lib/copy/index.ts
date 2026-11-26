import type { BrandProfile } from '../brand'
import type { Config } from '../config'
import type { ModelImage, ProductCopy, ProductMeta } from '../types'
import { writeCopyAnthropic } from './anthropic'
import { lintCopy } from './lint'
import { writeCopyMock } from './mock'
import { writeCopyOpenAI } from './openai'

export interface CopyResult {
  copy: ProductCopy
  provider: string
  model: string
  /** Paid model calls made (1, or 2 after a revision). */
  calls: number
  /** Rule violations left in the returned copy (ideally none). */
  issues: string[]
}

/**
 * Write the listing, check it against the rules (lint.ts), and if anything breaks a rule,
 * ask the model once to fix exactly those points. Returns whichever version has fewer issues.
 */
export async function writeCopy(cfg: Config, image: ModelImage, brand: BrandProfile, meta: ProductMeta): Promise<CopyResult> {
  if (cfg.copyProvider === 'mock') return { copy: writeCopyMock(brand, meta), provider: 'mock', model: 'template', calls: 0, issues: [] }
  const anthropic = cfg.copyProvider === 'anthropic'
  const provider = anthropic ? 'anthropic' : 'openai'
  const model = anthropic ? cfg.anthropicModel : cfg.openaiModel
  const call = (feedback?: string[]) =>
    anthropic ? writeCopyAnthropic(image, brand, meta, model, feedback) : writeCopyOpenAI(image, brand, meta, model, feedback)

  // One retry if the first call fails outright (network blip, malformed answer).
  let first: ProductCopy
  try {
    first = await call()
  } catch {
    first = await call()
  }
  const firstIssues = lintCopy(first, meta, brand.avoid)
  if (!firstIssues.length) return { copy: first, provider, model, calls: 1, issues: [] }
  try {
    const second = await call(firstIssues)
    const secondIssues = lintCopy(second, meta, brand.avoid)
    return secondIssues.length <= firstIssues.length
      ? { copy: second, provider, model, calls: 2, issues: secondIssues }
      : { copy: first, provider, model, calls: 2, issues: firstIssues }
  } catch {
    return { copy: first, provider, model, calls: 2, issues: firstIssues }
  }
}
