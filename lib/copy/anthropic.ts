import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import type { BrandProfile } from '../brand'
import { PipelineError } from '../errors'
import type { ModelImage, ProductCopy, ProductMeta } from '../types'
import { systemPrompt, userPrompt } from './prompt'
import { CopySchema } from './schema'

export async function writeCopyAnthropic(
  image: ModelImage,
  brand: BrandProfile,
  meta: ProductMeta,
  model: string,
  feedback?: string[],
): Promise<ProductCopy> {
  if (!process.env.ANTHROPIC_API_KEY) throw new PipelineError('copy', 'ANTHROPIC_API_KEY is not set.')
  const client = new Anthropic({ timeout: 50_000, maxRetries: 1 })
  const res = await client.messages.parse({
    model,
    max_tokens: 16000,
    // Short, well-specified task: low effort keeps it fast and cheap.
    output_config: { effort: 'low', format: zodOutputFormat(CopySchema) },
    system: systemPrompt(brand),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.base64 } },
          { type: 'text', text: userPrompt(meta, feedback) },
        ],
      },
    ],
  })
  if (res.stop_reason === 'refusal') {
    throw new PipelineError('copy', 'The model declined this image.', 422, 'The copy model declined this image. Try another photo.')
  }
  if (!res.parsed_output) throw new PipelineError('copy', `No parsable copy (stop_reason: ${res.stop_reason}).`)
  return res.parsed_output
}
