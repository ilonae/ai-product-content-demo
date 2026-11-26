import { stagesFor, type StageName, type StageRecord } from '@/lib/types'

const LABELS: Record<StageName, string> = {
  ingest: 'Checking photo',
  retouch: 'Repainting tape',
  background: 'Removing background',
  compose: 'Placing on white',
  copy: 'Writing copy · DE EN ES',
  persist: 'Saving + share link',
}

function Dot({ state, n }: { state: 'ok' | 'error' | 'running' | 'pending'; n: number }) {
  if (state === 'ok')
    return (
      <span className="animate-pop grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage text-white">
        <svg className="check-draw" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    )
  if (state === 'error') return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brick text-xs font-bold text-white">!</span>
  if (state === 'running')
    return (
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-apricot">
        <span className="animate-pulse-dot h-2.5 w-2.5 rounded-full bg-brown" />
      </span>
    )
  return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-oat font-mono text-[11px] text-muted">{n}</span>
}

/** Live list (form) or waterfall with proportional bars (results page). Pure display. */
export function StageTimeline({ stages, running, variant = 'list', retouch }: { stages: StageRecord[]; running?: StageName | null; variant?: 'list' | 'waterfall'; retouch?: boolean }) {
  const byName = new Map(stages.map((s) => [s.name, s]))
  const maxMs = Math.max(1, ...stages.map((s) => s.ms))
  return (
    <ol className="space-y-1">
      {stagesFor(Boolean(retouch) || stages.some((s) => s.name === 'retouch')).map((name, i) => {
        const s = byName.get(name)
        const state = s ? s.status : running === name ? 'running' : 'pending'
        return (
          <li key={name} className="flex items-start gap-3 rounded-[3px] px-2 py-2">
            <Dot state={state} n={i + 1} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-sm ${state === 'pending' ? 'text-muted' : 'font-semibold'}`}>{LABELS[name]}</span>
                {s && <span className="font-mono text-xs tabular-nums text-muted">{s.ms < 1000 ? `${s.ms} ms` : `${(s.ms / 1000).toFixed(1)} s`}</span>}
              </div>
              {variant === 'waterfall' && s && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-oat">
                  <div className="h-full rounded-full bg-gradient-to-r from-sand to-brown" style={{ width: `${Math.max(3, (s.ms / maxMs) * 100)}%` }} />
                </div>
              )}
              {s && (s.provider || s.model || s.note) && (
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                  {[s.provider, s.model].filter(Boolean).join(' · ')}
                  {s.note ? `${s.provider || s.model ? ' — ' : ''}${s.note}` : ''}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
