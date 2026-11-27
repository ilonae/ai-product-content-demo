import { Redis } from '@upstash/redis'
import { localFallbacksAllowed } from '../config'
import { LocalStore } from './local'
import { RedisBlobStore } from './redis-blob'
import { SupabaseStore } from './supabase'
import type { Store } from './types'

let cached: Store | null = null

/** Upstash Redis + Vercel Blob when a Blob token is set, else Supabase, else local files (development only). */
export function getStore(): Store {
  if (cached) return cached
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (process.env.BLOB_READ_WRITE_TOKEN && redisUrl && redisToken) cached = new RedisBlobStore(new Redis({ url: redisUrl, token: redisToken }))
  else if (url && key) cached = new SupabaseStore(url, key)
  else if (!localFallbacksAllowed()) {
    throw new Error('Set BLOB_READ_WRITE_TOKEN with Upstash Redis, or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (serverless file systems are read-only).')
  } else cached = new LocalStore()
  return cached
}

export type { Store } from './types'
