import { localFallbacksAllowed } from '../config'
import { LocalStore } from './local'
import { SupabaseStore } from './supabase'
import type { Store } from './types'

let cached: Store | null = null

export function getStore(): Store {
  if (cached) return cached
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (url && key) cached = new SupabaseStore(url, key)
  else if (!localFallbacksAllowed()) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (serverless file systems are read-only).')
  } else cached = new LocalStore()
  return cached
}

export type { Store } from './types'
