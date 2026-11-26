'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Lang } from '@/lib/types'

interface Target { id: string; label: string; configured: boolean; ownerOnly: boolean; setupHint?: string }
interface Info { owner: boolean; ownerTokenEnabled: boolean; connectors: Target[] }
type State = { status: 'idle' | 'busy' | 'done' | 'error'; message?: string; url?: string }

const LANGS: { id: Lang; label: string }[] = [
  { id: 'de', label: 'DE' },
  { id: 'en', label: 'EN' },
  { id: 'es', label: 'ES' },
]
const TOKEN_KEY = 'pp.publishToken'

const readToken = () => {
  try {
    return sessionStorage.getItem(TOKEN_KEY) ?? ''
  } catch {
    return ''
  }
}

/** Publish the listing as a draft: to the built-in demo store (anyone) or to a real store (owner). */
export function PublishPanel({ runId }: { runId: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [lang, setLang] = useState<Lang>('de')
  const [states, setStates] = useState<Record<string, State>>({})
  const [tokenInput, setTokenInput] = useState('')

  const load = useCallback(async () => {
    const token = readToken()
    const res = await fetch('/api/publish', { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    setInfo((await res.json()) as Info)
  }, [])

  useEffect(() => {
    load().catch(() => setInfo({ owner: false, ownerTokenEnabled: false, connectors: [] }))
  }, [load])

  async function publish(target: Target) {
    setStates((s) => ({ ...s, [target.id]: { status: 'busy' } }))
    const token = readToken()
    try {
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ runId, connector: target.id, lang }),
      })
      const data = (await res.json()) as { error?: string; adminUrl?: string }
      setStates((s) => ({
        ...s,
        [target.id]: res.ok ? { status: 'done', url: data.adminUrl } : { status: 'error', message: data.error ?? 'Publishing failed.' },
      }))
    } catch {
      setStates((s) => ({ ...s, [target.id]: { status: 'error', message: 'The connection dropped. Please try again.' } }))
    }
  }

  async function unlock(e: React.FormEvent) {
    e.preventDefault()
    try {
      sessionStorage.setItem(TOKEN_KEY, tokenInput.trim())
    } catch {
      /* storage blocked: the token only lives for this request */
    }
    setTokenInput('')
    await load()
  }

  const demo = info?.connectors.find((c) => !c.ownerOnly)
  const stores = info?.connectors.filter((c) => c.ownerOnly) ?? []
  const btn = 'inline-flex min-h-11 items-center rounded-none px-4 text-sm font-semibold disabled:opacity-50'

  const result = (id: string) => {
    const st = states[id]
    if (!st || st.status === 'idle') return null
    if (st.status === 'busy') return <p className="mt-2 text-sm text-muted">Creating the draft…</p>
    if (st.status === 'error') return <p role="alert" className="mt-2 text-sm text-brick">{st.message}</p>
    return (
      <p className="animate-fade-in mt-2 text-sm text-sage">
        Draft created.{' '}
        {st.url && (
          <a href={st.url} target={st.url.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="font-semibold text-ink underline underline-offset-4">
            {st.url.startsWith('http') ? 'Open it in the store admin' : 'See it in the demo store'}
          </a>
        )}
      </p>
    )
  }

  return (
    <div className="border-t border-sand bg-card p-5">
      <h2 className="text-base font-semibold">Publish as a draft</h2>
      <p className="mt-1 text-sm text-muted">Name, description, key features, SEO, tags, price, SKU and the image arrive as a draft. Nothing goes live without a person.</p>

      <div className="mt-4 flex items-center gap-3">
        <span className="caption">Language</span>
        <div className="flex border border-sand">
          {LANGS.map((l) => (
            <button key={l.id} type="button" onClick={() => setLang(l.id)} aria-pressed={lang === l.id} className={`min-h-9 min-w-11 px-3 font-mono text-xs ${lang === l.id ? 'bg-brown text-paper' : 'text-muted hover:text-ink'}`}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {!info ? (
        <p className="mt-4 text-sm text-muted">Loading targets…</p>
      ) : (
        <div className="mt-4 divide-y divide-sand border-y border-sand">
          {demo && (
            <div className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{demo.label}</p>
                  <p className="text-xs text-muted">A sandbox shop in this demo. Try the whole flow.</p>
                </div>
                <button type="button" onClick={() => publish(demo)} disabled={states[demo.id]?.status === 'busy'} className={`${btn} bg-brown text-paper hover:bg-brown-dark`}>
                  {states[demo.id]?.status === 'done' ? 'Publish again' : 'Publish'}
                </button>
              </div>
              {result(demo.id)}
            </div>
          )}
          {stores.map((t) => (
            <div key={t.id} className="py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{t.label}</p>
                  <p className="text-xs text-muted">
                    {!t.configured ? 'Not connected.' : !info.owner ? 'Owner only in the public demo.' : 'Connected.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => publish(t)}
                  disabled={!t.configured || !info.owner || states[t.id]?.status === 'busy'}
                  className={`${btn} border border-sand bg-card hover:border-brown/50`}
                >
                  Publish
                </button>
              </div>
              {!t.configured && info.owner && t.setupHint && <p className="mt-1 font-mono text-[11px] text-muted">{t.setupHint}</p>}
              {result(t.id)}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <a href={`/api/runs/${runId}/export`} className={`${btn} border border-sand bg-card hover:border-brown/50`}>Download CSV</a>
        {info && info.ownerTokenEnabled && !info.owner && (
          <form onSubmit={unlock} className="flex items-center gap-2">
            <input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="Owner token" aria-label="Owner token" className="min-h-11 w-36 border border-sand bg-paper px-3 text-sm outline-none focus:border-brown" />
            <button type="submit" disabled={!tokenInput.trim()} className={`${btn} border border-sand hover:border-brown/50`}>Unlock</button>
          </form>
        )}
      </div>
    </div>
  )
}
