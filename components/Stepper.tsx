const STEPS = ['Photo', 'Studio check', 'Prepare', 'Listing']
const R = 15
const C = 2 * Math.PI * R

/**
 * Four progress rings. Each fills with the real progress of its step (photo chosen, checks passed,
 * details filled in, pipeline stages done) and turns sage with a check when complete.
 */
export function Stepper({ current, progress }: { current: number; progress: number[] }) {
  return (
    <ol className="mb-6 flex items-start gap-2 sm:gap-3" aria-label="Progress">
      {STEPS.map((label, i) => {
        const p = Math.max(0, Math.min(1, progress[i] ?? 0))
        const done = p >= 1
        const active = i === current && !done
        return (
          <li key={label} className="flex flex-1 items-start gap-2 last:flex-none sm:gap-3" aria-current={i === current ? 'step' : undefined}>
            <div className="flex flex-col items-center gap-1.5">
              <div className="relative h-10 w-10" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
                <svg viewBox="0 0 36 36" className="h-10 w-10 -rotate-90">
                  <circle cx="18" cy="18" r={R} fill="none" strokeWidth="1.5" className="stroke-sand" />
                  <circle
                    cx="18"
                    cy="18"
                    r={R}
                    fill="none"
                    strokeWidth="1.5"
                    strokeLinecap="butt"
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - p)}
                    className={`transition-[stroke-dashoffset,stroke] duration-500 ease-out ${done ? 'stroke-sage' : 'stroke-brown'}`}
                  />
                </svg>
                <span className={`absolute inset-0 grid place-items-center font-mono text-xs font-semibold ${done ? 'text-sage' : active ? 'text-brown' : 'text-muted'}`}>
                  {done ? '✓' : active && p > 0 ? `${Math.round(p * 100)}` : i + 1}
                </span>
              </div>
              <span className={`caption whitespace-nowrap ${i === current ? '!text-ink' : ''}`}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <span className="mt-[19px] h-px min-w-3 flex-1 overflow-hidden bg-sand">
                <span className={`block h-full origin-left bg-sage transition-transform duration-500 ${done ? 'scale-x-100' : 'scale-x-0'}`} />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
