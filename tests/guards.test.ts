import { afterEach, describe, expect, it, vi } from 'vitest'
import { getConfig } from '@/lib/config'
import { admitLiveRun, capacity, clientIp, hashIp, MemoryCounter, runEstimateUsd, settleLiveRun } from '@/lib/guards'

afterEach(() => vi.unstubAllEnvs())

const cfg = () => ({ ...getConfig(), maxRunsPerIpPerDay: 2, dailySpendCapUsd: 0.6, estCostUsd: { background: 0, enhance: 0, copy: 0.1, retouch: 0.05 } })

describe('guards', () => {
  it('uses cf-connecting-ip only when Cloudflare is trusted', () => {
    const h = new Headers({ 'x-real-ip': '172.70.1.1', 'cf-connecting-ip': '203.0.113.9' })
    expect(clientIp(h)).toBe('172.70.1.1') // a spoofed header is ignored by default
    vi.stubEnv('TRUST_CLOUDFLARE', '1')
    expect(clientIp(h)).toBe('203.0.113.9')
  })

  it('refuses the default salt in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('RATE_LIMIT_SALT', '')
    expect(() => hashIp('203.0.113.9')).toThrow('RATE_LIMIT_SALT')
  })

  it('refunds unused reservations and gives back the run when we fail', async () => {
    const c = new MemoryCounter()
    const conf = cfg()
    const ip = hashIp('198.51.100.7')
    const a = await admitLiveRun(ip, c, conf)
    expect(a.ok).toBe(true)
    await settleLiveRun(ip, c, 0.2, { failed: true, spentUsd: 0 })
    expect((await capacity(c, conf)).spentUsd).toBeCloseTo(0)
    // the visitor still has both runs
    expect((await admitLiveRun(ip, c, conf)).ok).toBe(true)
    expect((await admitLiveRun(ip, c, conf)).ok).toBe(true)
  })

  it('never exposes the raw IP', () => {
    expect(hashIp('203.0.113.9')).not.toContain('203')
    expect(hashIp('203.0.113.9')).toHaveLength(32)
  })

  it('allows 2 runs per IP per day', async () => {
    const c = new MemoryCounter()
    const ip = hashIp('198.51.100.1')
    expect((await admitLiveRun(ip, c, cfg())).ok).toBe(true)
    expect((await admitLiveRun(ip, c, cfg())).ok).toBe(true)
    expect(await admitLiveRun(ip, c, cfg())).toEqual({ ok: false, reason: 'rate_limit' })
  })

  it('stops at the daily spend cap and reports capacity (each run reserves 2 copy calls = 0.2)', async () => {
    const c = new MemoryCounter()
    const conf = cfg()
    for (let i = 0; i < 3; i++) expect((await admitLiveRun(hashIp(`10.0.0.${i}`), c, conf)).ok).toBe(true)
    expect(await admitLiveRun(hashIp('10.0.0.99'), c, conf)).toEqual({ ok: false, reason: 'capacity' })
    expect((await capacity(c, conf)).live).toBe(false)
  })

  it('reserves the full estimate up front', () => {
    expect(runEstimateUsd({ ...cfg(), enhanceDarkProducts: true, estCostUsd: { background: 0.01, enhance: 0.05, copy: 0.1, retouch: 0.05 } })).toBeCloseTo(0.26)
  })
})
