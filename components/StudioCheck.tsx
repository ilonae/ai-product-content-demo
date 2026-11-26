'use client'

import type { QualityResult } from '@/lib/quality'

interface Props {
  result: QualityResult
  thumb: string
  onContinue: () => void
  onReplace: () => void
}

export function StudioCheck({ result, thumb, onContinue, onReplace }: Props) {
  const failed = result.checks.filter((c) => !c.ok)
  const passedCount = result.checks.length - failed.length
  return (
    <div
      className={`rounded-[3px] border bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6 ${
        result.pass ? 'animate-glow-sage border-sage/60' : 'animate-shake border-brick/30'
      }`}
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <img src={thumb} alt="Your photo" className="h-36 w-36 shrink-0 self-center rounded-[3px] bg-oat object-cover sm:self-start" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-bold">{result.pass ? 'Studio quality ✓' : `Not studio quality yet (${failed.length} ${failed.length === 1 ? 'issue' : 'issues'})`}</p>
            <span className={`rounded-[2px] px-3 py-1 font-mono text-xs font-medium ${result.pass ? 'bg-sage/15 text-sage' : 'bg-brick/10 text-brick'}`}>
              {passedCount} of {result.checks.length}
            </span>
          </div>

          {result.pass ? (
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {result.checks.map((c, i) => (
                <li key={c.id} className="animate-slide-in flex items-center gap-2 rounded-[3px] bg-oat/70 px-3 py-2 text-sm" style={{ animationDelay: `${i * 90}ms` }}>
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sage text-white">✓</span>
                  {c.label}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-4 space-y-2">
              {failed.map((c, i) => (
                <li key={c.id} className="animate-slide-in rounded-[3px] border border-brick/20 bg-brick/5 px-4 py-3" style={{ animationDelay: `${i * 90}ms` }}>
                  <p className="flex items-center gap-2 text-sm font-semibold text-brick">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brick text-white">✕</span>
                    {c.detail}
                  </p>
                  <p className="animate-fade-in mt-1 pl-7 text-sm text-ink/75">{c.tip}</p>
                </li>
              ))}
              <li className="flex flex-wrap gap-2 pt-1 text-xs text-muted">
                {result.checks.filter((c) => c.ok).map((c) => (
                  <span key={c.id} className="rounded-[2px] bg-sage/15 px-2.5 py-1 font-medium text-sage">✓ {c.label}</span>
                ))}
              </li>
            </ul>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {result.pass ? (
              <button onClick={onContinue} autoFocus className="animate-fade-in inline-flex min-h-12 items-center gap-2 rounded-[2px] bg-brown px-6 text-[15px] font-semibold text-white shadow-[var(--shadow-soft)] transition hover:-translate-y-px hover:bg-brown-dark">
                Continue to prepare               </button>
            ) : null}
            <button onClick={onReplace} className={`inline-flex min-h-12 items-center gap-2 rounded-[2px] px-5 text-sm font-semibold ${result.pass ? 'text-muted hover:bg-oat hover:text-ink' : 'bg-brown text-paper hover:bg-brown-dark'}`}>
              Choose another photo
            </button>
          </div>
        </div>
      </div>

      <details className="group mt-5 rounded-[3px] bg-oat/60 px-4 py-3 text-sm">
        <summary className="cursor-pointer list-none font-semibold text-ink/80 [&::-webkit-details-marker]:hidden">
          <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> What a studio shot looks like
        </summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-ink/75">
          <li><b>Light, plain backdrop:</b> a light grey or white sweep behind and under the product, nothing else in frame.</li>
          <li><b>Soft, even light:</b> diffused daylight-balanced lamps from both sides; no warm room light, no harsh sun.</li>
          <li><b>Sharp and large:</b> product in focus, at least 1000 px on the long edge.</li>
        </ol>
      </details>
    </div>
  )
}
