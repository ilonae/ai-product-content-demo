function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

/**
 * In-memory counters, local file storage and skipping Turnstile are development conveniences.
 * Production refuses them unless ALLOW_LOCAL_FALLBACKS=1 (for `next start` on your own machine only).
 */
export const localFallbacksAllowed = () => process.env.NODE_ENV !== 'production' || process.env.ALLOW_LOCAL_FALLBACKS === '1'

export type CopyProvider = 'anthropic' | 'openai' | 'mock'

/** Read at call time so tests and scripts can change the environment. */
export function getConfig() {
  const mock = process.env.PIPELINE_MOCK === '1'
  // Default: OpenAI (as in the production tool). Claude when only an Anthropic key is set; the mock in mock mode without keys.
  const copyProvider =
    (process.env.COPY_PROVIDER as CopyProvider | undefined) ??
    (process.env.OPENAI_API_KEY ? 'openai' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : mock ? 'mock' : 'openai')
  return {
    mock,
    isProd: process.env.NODE_ENV === 'production',
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
    /** Vercel caps request bodies at 4.5 MB. */
    maxUploadBytes: 4 * 1024 * 1024,
    maxEdgePx: 2048,
    maxRunsPerIpPerDay: num('MAX_RUNS_PER_IP_PER_DAY', 2),
    dailySpendCapUsd: num('DAILY_SPEND_CAP_USD', 1),
    /**
     * Estimated cost per paid stage, reserved against the daily cap BEFORE a run starts,
     * so concurrent runs can never overshoot it.
     * TODO: set these from your providers' current pricing.
     */
    estCostUsd: {
      background: num('EST_COST_BACKGROUND_USD', 0.02),
      enhance: num('EST_COST_ENHANCE_USD', 0.05),
      copy: num('EST_COST_COPY_USD', 0.05),
      retouch: num('EST_COST_RETOUCH_USD', 0.05),
    },
    copyProvider,
    anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-5-5',
    // Chosen in a side-by-side test (gpt-4o, gpt-4.1, gpt-5.5, gpt-6.2-sol): all rules met, ~12 s, best brand voice.
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-6.2-sol',
    rembgUrl: (process.env.REMBG_URL ?? '').replace(/\/$/, ''),
    rembgToken: process.env.REMBG_TOKEN ?? '',
    /** isnet + mask smoothing won a side-by-side test on the samples (cleaner edges, lace gaps removed). */
    rembgModel: process.env.REMBG_MODEL ?? 'isnet-general-use',
    rembgPostProcess: process.env.REMBG_POST_PROCESS !== '0',
    /** Square catalogue image; the product is never upscaled beyond its own resolution. */
    outputMaxSize: num('OUTPUT_MAX_SIZE', 2000),
    stabilityKey: process.env.STABILITY_API_KEY ?? '',
    enhanceDarkProducts: process.env.ENHANCE_DARK_PRODUCTS === '1',
    /** AI repainting of tape marks (Stability inpaint). Without a key, a local fill is used. */
    aiRetouch: Boolean(process.env.STABILITY_API_KEY) && process.env.AI_RETOUCH !== 'off',
    /** Tape marks may cover at most this share of the photo. */
    maxRetouchCoverage: 0.25,
    /** Mean luminance (0–1) of the product pixels below which it counts as "dark". */
    darkLuminance: 0.25,
    watermarkText: process.env.WATERMARK_TEXT ?? 'AI DEMO · not for commercial use',
  }
}

export type Config = ReturnType<typeof getConfig>
