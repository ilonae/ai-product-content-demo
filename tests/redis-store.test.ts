import type { Redis } from '@upstash/redis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RedisBlobStore, type BlobApi } from '@/lib/store/redis-blob'
import type { Run } from '@/lib/types'
import { newVisitorId, SHOWCASE, visitorKey } from '@/lib/visitor'

/** In-memory stand-in for the Upstash calls the store makes. */
function fakeRedis() {
  const kv = new Map<string, unknown>()
  const ttl = new Map<string, number>()
  const sets = new Map<string, Set<string>>()
  const zsets = new Map<string, Map<string, number>>()
  const z = (k: string) => zsets.get(k) ?? zsets.set(k, new Map()).get(k)!
  const s = (k: string) => sets.get(k) ?? sets.set(k, new Set()).get(k)!
  const api = {
    async set(k: string, v: unknown, o?: { ex?: number }) {
      kv.set(k, structuredClone(v))
      if (o?.ex) ttl.set(k, o.ex)
      else ttl.delete(k)
      return 'OK'
    },
    async get(k: string) { return kv.has(k) ? structuredClone(kv.get(k)) : null },
    async mget(...ks: string[]) { return ks.map((k) => (kv.has(k) ? structuredClone(kv.get(k)) : null)) },
    async del(...ks: string[]) { for (const k of ks) { kv.delete(k); sets.delete(k); zsets.delete(k) } return ks.length },
    async expire(k: string, sec: number) { ttl.set(k, sec); return 1 },
    async sadd(k: string, ...m: string[]) { m.forEach((x) => s(k).add(x)); return m.length },
    async smembers(k: string) { return [...(sets.get(k) ?? [])] },
    async zadd(k: string, ...args: ({ nx?: boolean } | { score: number; member: string })[]) {
      const nx = 'nx' in args[0] && args[0].nx
      for (const a of args) if ('member' in a && !(nx && z(k).has(a.member))) z(k).set(a.member, a.score)
      return 1
    },
    async zrem(k: string, ...m: string[]) { m.forEach((x) => z(k).delete(x)); return m.length },
    async zrange(k: string, min: number, max: number, o: { rev?: boolean; byScore?: boolean; offset?: number; count?: number } = {}) {
      let e = [...z(k).entries()].sort((a, b) => a[1] - b[1])
      if (o.byScore) return e.filter(([, sc]) => sc >= min && sc <= max).slice(o.offset ?? 0, (o.offset ?? 0) + (o.count ?? Infinity)).map(([m]) => m)
      if (o.rev) e = e.reverse()
      return e.slice(min, max + 1).map(([m]) => m)
    },
    pipeline() {
      const q: (() => Promise<unknown>)[] = []
      const p = new Proxy({} as Record<string, unknown>, {
        get: (_, name: string) => (name === 'exec' ? async () => { for (const f of q) await f() } : (...a: unknown[]) => { q.push(() => (api as any)[name](...a)); return p }),
      })
      return p
    },
  }
  return { redis: api as unknown as Redis, kv, ttl, zsets }
}

function fakeBlob() {
  const files = new Map<string, Buffer>()
  const blob: BlobApi = {
    async put(pathname, body) { const url = `https://blob.test/${pathname}`; files.set(url, body); return { url } },
    async del(urls) { urls.forEach((u) => files.delete(u)) },
  }
  return { blob, files }
}

const run = (id: string, createdAt = '2026-11-01T10:00:00Z') => ({ id, createdAt, source: 'live' }) as unknown as Run
const product = { title: 't', description: 'd', bullets: [], tags: [], vendor: 'v', imageUrl: '/x.png', altText: 'a' } as never

afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers() })

describe('Redis + Blob store', () => {
  it('stores images in Blob and runs in Redis with the retention expiry', async () => {
    vi.stubEnv('RETENTION_DAYS', '30')
    const { redis, ttl } = fakeRedis()
    const { blob, files } = fakeBlob()
    const store = new RedisBlobStore(redis, blob)
    const url = await store.putImage('aaaaaaaaaaaa', 'output.png', Buffer.from('png'))
    expect(url).toBe('https://blob.test/runs/aaaaaaaaaaaa/output.png')
    expect(files.size).toBe(1)
    await store.saveRun(run('aaaaaaaaaaaa'))
    expect((await store.getRun('aaaaaaaaaaaa'))?.id).toBe('aaaaaaaaaaaa')
    expect(ttl.get('demo:run:aaaaaaaaaaaa')).toBe(30 * 86_400)
    expect(await store.getRun('../etc')).toBeNull()
  })

  it('shows each visitor their own drafts plus the showcase; only visitor drafts expire', async () => {
    const { redis, ttl } = fakeRedis()
    const store = new RedisBlobStore(redis, fakeBlob().blob)
    const a = visitorKey(newVisitorId())
    const b = visitorKey(newVisitorId())
    await store.saveDemoProduct({ runId: 'aaaaaaaaaaaa', visitor: a, createdAt: '2026-11-01T10:00:00Z', lang: 'en', product })
    await store.saveDemoProduct({ runId: 'bbbbbbbbbbbb', visitor: b, createdAt: '2026-11-01T11:00:00Z', lang: 'en', product })
    await store.saveDemoProduct({ runId: 'cccccccccccc', visitor: SHOWCASE, createdAt: '2026-11-01T09:00:00Z', lang: 'en', product })
    expect((await store.listDemoProducts(a)).map((e) => e.runId)).toEqual(['aaaaaaaaaaaa', 'cccccccccccc'])
    expect((await store.listDemoProducts(null)).map((e) => e.runId)).toEqual(['cccccccccccc'])
    expect(ttl.get(`demo:draft:aaaaaaaaaaaa:${a}`)).toBe(7 * 86_400)
    expect(ttl.has(`demo:draft:cccccccccccc:${SHOWCASE}`)).toBe(false)
  })

  it('purges old runs with their images and drafts, and keeps recent ones', async () => {
    const { redis, kv } = fakeRedis()
    const { blob, files } = fakeBlob()
    const store = new RedisBlobStore(redis, blob)
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    await store.putImage('oldoldoldold', 'original.png', Buffer.from('1'))
    await store.putImage('oldoldoldold', 'output.png', Buffer.from('2'))
    await store.saveRun(run('oldoldoldold', '2026-10-01T00:00:00Z'))
    await store.saveDemoProduct({ runId: 'oldoldoldold', visitor: SHOWCASE, createdAt: '2026-10-01T00:00:00Z', lang: 'en', product })
    vi.setSystemTime(new Date('2026-11-20T00:00:00Z'))
    await store.putImage('newnewnewnew', 'output.png', Buffer.from('3'))

    const result = await store.purgeExpired({ runsBefore: new Date('2026-10-28T00:00:00Z'), draftsBefore: new Date('2026-11-13T00:00:00Z') })
    expect(result).toEqual({ runs: 1, drafts: 1 })
    expect([...files.keys()]).toEqual(['https://blob.test/runs/newnewnewnew/output.png'])
    expect(kv.has('demo:run:oldoldoldold')).toBe(false)
    expect(await store.listDemoProducts(null)).toEqual([])
  })
})
