import type { StageName } from './types'

/** An error that belongs to one pipeline stage. `publicMessage` is safe to show visitors. */
export class PipelineError extends Error {
  constructor(
    public stage: StageName,
    message: string,
    public status = 502,
    public publicMessage = status < 500 ? message : `The ${stage} stage failed. Please try again later.`,
  ) {
    super(message)
    this.name = 'PipelineError'
  }
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
