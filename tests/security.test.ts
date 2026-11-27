import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/publish/route'
import { localFallbacksAllowed } from '@/lib/config'

afterEach(() => vi.unstubAllEnvs())

const owner = async (headers: Record<string, string> = {}) =>
  ((await (await GET(new Request('http://localhost/api/publish', { headers }))).json()) as { owner: boolean }).owner

describe('production safety', () => {
  it('never switches off the bot check or the shared spend cap on Vercel', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_LOCAL_FALLBACKS', '1')
    expect(localFallbacksAllowed()).toBe(true) // next start on your own machine
    vi.stubEnv('VERCEL', '1')
    expect(localFallbacksAllowed()).toBe(false) // a stray env var on Vercel is ignored
  })

  it('treats a production visitor as the owner only with the token', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('ALLOW_LOCAL_FALLBACKS', '1')
    vi.stubEnv('PUBLISH_TOKEN', 'owner-secret-123')
    expect(await owner()).toBe(false)
    expect(await owner({ authorization: 'Bearer wrong-token-xyz' })).toBe(false)
    expect(await owner({ authorization: 'Bearer owner-secret-123' })).toBe(true)
  })

  it('treats local development as the owner', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(await owner()).toBe(true)
  })
})
