import { createHash } from 'node:crypto'
import { Redis } from '@upstash/redis'
import { localFallbacksAllowed, type Config } from './config'

/** A counter that expires; backs both the per-IP rate limit and the daily spend total. */
export interface Counter {
  incrBy(key: string, by: number, ttlSec: number): Promise<number>
  get(key: string): Promise<number>
}

export class MemoryCounter implements Counter {
  private m = new Map<string, { v: number; exp: number }>()
  async incrBy(key: string, by: number, ttlSec: number) {
    const now = Date.now()
    const cur = this.m.get(key)
    const live = cur && cur.exp > now ? cur : null
    const next = { v: (live?.v ?? 0) + by, exp: live?.exp ?? now + ttlSec * 1000 }
    this.m.set(key, next)
    return next.v
  }
  async get(key: string) {
    const cur = this.m.get(key)
    return cur && cur.exp > Date.now() ? cur.v : 0
  }
}

class RedisCounter implements Counter {
  constructor(private r: Redis) {}
  async incrBy(key: string, by: number, ttlSec: number) {
    const v = Number(Number.isInteger(by) ? await this.r.incrby(key, by) : await this.r.incrbyfloat(key, by))
    if (Math.abs(v - by) < 1e-9) await this.r.expire(key, ttlSec) // first write of the day
    return v
  }
  async get(key: string) {
    return Number((await this.r.get<number | string>(key)) ?? 0)
  }
}

let counter: Counter | null = null

export function getCounter(): Counter {
  if (counter) return counter
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  if (url && token) counter = new RedisCounter(new Redis({ url, token }))
  else if (!localFallbacksAllowed()) {
    // In-memory counters reset per serverless instance: not a real cap.
    throw new Error('Upstash Redis is required in production for rate limits and the spend cap.')
  } else counter = new MemoryCounter()
  return counter
}

export const dayKey = (d = new Date()) => d.toISOString().slice(0, 10)

function secondsLeftInUtcDay(d = new Date()) {
  const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  return Math.max(60, Math.ceil((end - d.getTime()) / 1000))
}

/**
 * The visitor's IP. Behind Cloudflare, x-forwarded-for holds Cloudflare's IP, so cf-connecting-ip is the
 * real one — but anyone can send that header straight to the origin, so it is trusted only when
 * TRUST_CLOUDFLARE=1 (and the origin should only accept Cloudflare). Otherwise use the platform's x-real-ip.
 */
export function clientIp(h: Headers): string {
  const cf = process.env.TRUST_CLOUDFLARE === '1' ? h.get('cf-connecting-ip') : null
  return cf ?? h.get('x-real-ip') ?? h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

/** Raw IPs are never stored. */
export function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_SALT || (localFallbacksAllowed() ? 'dev-salt' : '')
  // A known salt makes IPv4 hashes reversible, so production must set its own.
  if (!salt) throw new Error('RATE_LIMIT_SALT is required in production.')
  return createHash('sha256')
    .update(`${salt}:${ip}`)
    .digest('hex')
    .slice(0, 32)
}

export async function verifyTurnstile(token: string | null, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return localFallbacksAllowed()
  if (!token) return false
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`Turnstile siteverify HTTP ${res.status}`)
  const data = (await res.json().catch(() => ({}))) as { success?: boolean }
  return data.success === true
}

/** The most a single live run can cost, reserved up front. */
export function runEstimateUsd(cfg: Config, opts: { retouch?: boolean } = {}): number {
  const { background, enhance, copy, retouch } = cfg.estCostUsd
  // Copy may take two calls (one automatic revision), so the worst case is reserved.
  return background + 2 * copy + (cfg.enhanceDarkProducts ? enhance : 0) + (opts.retouch && cfg.aiRetouch ? retouch : 0)
}

const spendKey = () => `spend:${dayKey()}`

/** Float sums (0.1 + 0.2…) must not trip the cap a cent early. */
const EPS = 1e-9

export async function capacity(c: Counter, cfg: Config) {
  const spentUsd = await c.get(spendKey())
  return { live: spentUsd + runEstimateUsd(cfg) <= cfg.dailySpendCapUsd + EPS, spentUsd, capUsd: cfg.dailySpendCapUsd }
}

export type Admission = { ok: true; reservedUsd: number } | { ok: false; reason: 'capacity' | 'rate_limit' }

const rlKey = (ipHash: string) => `rl:${dayKey()}:${ipHash}`

/**
 * Admit a live run: spend cap first (so blocked visitors don't burn their quota),
 * then the per-IP limit, then reserve the estimate. The reservation is re-checked
 * after incrementing, so concurrent runs can't push the day over the cap.
 */
export async function admitLiveRun(ipHash: string, c: Counter, cfg: Config, opts: { retouch?: boolean } = {}): Promise<Admission> {
  const ttl = secondsLeftInUtcDay()
  const estimate = runEstimateUsd(cfg, opts)
  if ((await c.get(spendKey())) + estimate > cfg.dailySpendCapUsd + EPS) return { ok: false, reason: 'capacity' }
  const runs = await c.incrBy(rlKey(ipHash), 1, ttl)
  if (runs > cfg.maxRunsPerIpPerDay) return { ok: false, reason: 'rate_limit' }
  const spent = await c.incrBy(spendKey(), estimate, ttl)
  if (spent > cfg.dailySpendCapUsd + EPS) {
    await c.incrBy(spendKey(), -estimate, ttl)
    await c.incrBy(rlKey(ipHash), -1, ttl)
    return { ok: false, reason: 'capacity' }
  }
  return { ok: true, reservedUsd: estimate }
}

/**
 * After a run: replace the reservation with the run's estimated actual cost
 * (e.g. the free rembg service ran, so the paid fallback's estimate comes back).
 * A run that failed on our side also gives the visitor their run back.
 */
export async function settleLiveRun(
  ipHash: string,
  c: Counter,
  reservedUsd: number,
  outcome: { actualUsd: number } | { failed: true; spentUsd: number },
) {
  const ttl = secondsLeftInUtcDay()
  const actual = 'failed' in outcome ? outcome.spentUsd : outcome.actualUsd
  const delta = Math.min(0, actual - reservedUsd) // only ever refund: estimates are the ceiling
  if (delta !== 0) await c.incrBy(spendKey(), delta, ttl)
  if ('failed' in outcome) await c.incrBy(rlKey(ipHash), -1, ttl)
}

export async function remainingRuns(ipHash: string, c: Counter, cfg: Config): Promise<number> {
  return Math.max(0, cfg.maxRunsPerIpPerDay - (await c.get(rlKey(ipHash))))
}
