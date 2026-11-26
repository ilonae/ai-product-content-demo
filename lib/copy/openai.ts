import type { BrandProfile } from '../brand'
import { PipelineError } from '../errors'
import type { ModelImage, ProductCopy, ProductMeta } from '../types'
import { systemPrompt, userPrompt } from './prompt'
import { CopySchema } from './schema'

const str = { type: 'string' }
const perLang = (schema: object) => ({
  type: 'object',
  properties: { de: schema, en: schema, es: schema },
  required: ['de', 'en', 'es'],
  additionalProperties: false,
})

/** Strict structured-output schema (mirrors CopySchema): the model can only answer in this shape. */
const LISTING_SCHEMA = {
  type: 'object',
  properties: {
    name: str,
    descriptions: perLang(str),
    bullets: perLang({ type: 'array', items: str }),
    seo: perLang({ type: 'object', properties: { title: str, description: str }, required: ['title', 'description'], additionalProperties: false }),
    tags: { type: 'array', items: str },
    altText: str,
  },
  required: ['name', 'descriptions', 'bullets', 'seo', 'tags', 'altText'],
  additionalProperties: false,
}

interface ChatResponse {
  choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[]
  error?: { message?: string }
}

export async function writeCopyOpenAI(
  image: ModelImage,
  brand: BrandProfile,
  meta: ProductMeta,
  model: string,
  feedback?: string[],
): Promise<ProductCopy> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new PipelineError('copy', 'OPENAI_API_KEY is not set.')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model,
      // GPT-4-family models take a temperature; newer reasoning models only accept the default
      // and need room for their reasoning tokens.
      ...(/^gpt-4/.test(model) ? { temperature: 0.7, max_completion_tokens: 4000 } : { max_completion_tokens: 16000 }),
      response_format: { type: 'json_schema', json_schema: { name: 'product_listing', strict: true, schema: LISTING_SCHEMA } },
      messages: [
        { role: 'system', content: systemPrompt(brand) },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt(meta, feedback) },
            { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.base64}`, detail: 'low' } },
          ],
        },
      ],
    }),
  })
  const data = (await res.json().catch(() => ({}))) as ChatResponse
  if (!res.ok) throw new PipelineError('copy', `OpenAI returned ${res.status}: ${data.error?.message ?? 'no details'}`)
  const choice = data.choices?.[0]
  if (choice?.message?.refusal) {
    throw new PipelineError('copy', `OpenAI declined: ${choice.message.refusal}`, 422, 'The copy model declined this image. Try another photo.')
  }
  if (choice?.finish_reason === 'length') throw new PipelineError('copy', 'OpenAI answer was cut off (max_tokens).')
  let raw: unknown
  try {
    raw = JSON.parse(choice?.message?.content ?? '')
  } catch {
    throw new PipelineError('copy', `OpenAI returned invalid JSON (finish_reason: ${choice?.finish_reason ?? 'none'}).`)
  }
  const parsed = CopySchema.safeParse(raw)
  if (!parsed.success) throw new PipelineError('copy', 'OpenAI copy did not match the schema.')
  return parsed.data
}
