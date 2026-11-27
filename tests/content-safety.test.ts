import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GET as purge } from '@/app/api/purge/route'
import { moderateUpload } from '@/lib/moderation'
import { LocalStore } from '@/lib/store/local'
import { keyFromCookieValue, newVisitorId, readVisitorCookie, SHOWCASE, visitorKey } from '@/lib/visitor'

afterEach(() => vi.unstubAllEnvs())

const png = () => sharp({ create: { width: 16, height: 16, channels: 3, background: '#ffffff' } }).png().toBuffer()
const reply = (results: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify({ results }), { status })) as unknown as typeof fetch

describe('upload moderation', () => {
  it('passes a clean upload and refuses a flagged one', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    expect(await moderateUpload(await png(), 'ceramic vase', reply([{ flagged: false, categories: {} }]))).toEqual({ ok: true })
    const r = await moderateUpload(await png(), '', reply([{ flagged: true, categories: { sexual: true, violence: false } }]))
    expect(r).toEqual({ ok: false, categories: ['sexual'] })
  })

  it('fails closed when the check errors or has no key in production', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    await expect(moderateUpload(await png(), '', reply(null, 500))).rejects.toThrow()
    vi.stubEnv('OPENAI_API_KEY', '')
    vi.stubEnv('NODE_ENV', 'production')
    await expect(moderateUpload(await png(), '')).rejects.toThrow('OPENAI_API_KEY')
  })
})

describe('demo store privacy', () => {
  it('reads only a well-formed visitor cookie', () => {
    const raw = newVisitorId()
    expect(readVisitorCookie(`a=1; demo_visitor=${raw}`)).toBe(raw)
    expect(readVisitorCookie('demo_visitor=../../etc')).toBeNull()
    expect(keyFromCookieValue('nope')).toBeNull()
    expect(keyFromCookieValue(raw)).toBe(visitorKey(raw))
    expect(visitorKey(raw)).not.toContain(raw)
  })

  it('shows each visitor their own drafts plus the showcase, never someone else’s', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'demo-store-'))
    try {
      const store = new LocalStore(dir)
      const product = { title: 't', description: 'd', bullets: [], tags: [], vendor: 'v', imageUrl: '/x.png', altText: 'a' } as never
      const a = visitorKey(newVisitorId())
      const b = visitorKey(newVisitorId())
      await store.saveDemoProduct({ runId: 'aaaaaaaaaaaa', visitor: a, createdAt: '2026-11-01T10:00:00Z', lang: 'en', product })
      await store.saveDemoProduct({ runId: 'bbbbbbbbbbbb', visitor: b, createdAt: '2026-11-01T11:00:00Z', lang: 'en', product })
      await store.saveDemoProduct({ runId: 'cccccccccccc', visitor: SHOWCASE, createdAt: '2026-11-01T09:00:00Z', lang: 'en', product })
      expect((await store.listDemoProducts(a)).map((e) => e.runId)).toEqual(['aaaaaaaaaaaa', 'cccccccccccc'])
      expect((await store.listDemoProducts(null)).map((e) => e.runId)).toEqual(['cccccccccccc'])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('retention purge', () => {
  it('refuses calls without the schedule secret', async () => {
    vi.stubEnv('CRON_SECRET', '')
    expect((await purge(new Request('http://localhost/api/purge'))).status).toBe(401)
    vi.stubEnv('CRON_SECRET', 'cron-secret-123')
    expect((await purge(new Request('http://localhost/api/purge', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
  })
})
