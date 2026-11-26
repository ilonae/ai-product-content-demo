import type { Run } from '@/lib/types'
import { Reveal } from './Reveal'

export function Gallery({ runs }: { runs: Run[] }) {
  if (!runs.length) {
    return (
      <div className="rounded-[3px] border border-dashed border-sand bg-card/60 px-6 py-12 text-center">
        <p className="font-semibold">The gallery is being curated.</p>
        <p className="mt-1 text-sm text-muted">Meanwhile, try your own photo above. It takes about fifteen seconds.</p>
      </div>
    )
  }
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {runs.map((run, i) => (
        <Reveal as="li" key={run.id} delay={i * 80}>
          <a href={`/r/${run.id}`} className="group block overflow-hidden rounded-[3px] border border-sand bg-card shadow-[var(--shadow-soft)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)]">
            <div className="relative aspect-square bg-white">
              <img src={run.originalUrl} alt={`Raw photo: ${run.copy.altText}`} width={run.width} height={run.height} loading="lazy" className="absolute inset-0 h-full w-full bg-oat object-cover transition-opacity duration-300 group-hover:opacity-0" />
              <img src={run.outputUrl} alt={run.copy.altText} width={run.width} height={run.height} loading="lazy" className="absolute inset-0 h-full w-full object-contain opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
              <span className="absolute left-3 top-3 rounded-[2px] bg-card/90 px-2.5 py-1 text-xs font-semibold">Hover for the result</span>
            </div>
            <div className="p-4">
              <p className="font-semibold group-hover:text-ink">{run.copy.name}</p>
              <p className="mt-0.5 text-sm text-muted">{run.brand.name} voice · {(run.stages.reduce((t, s) => t + s.ms, 0) / 1000).toFixed(1)} s</p>
              {run.showcase && <p className="mt-2 border-t border-sand pt-2 text-sm text-ink/80"><span className="caption mr-1.5">Proves</span>{run.showcase}</p>}
            </div>
          </a>
        </Reveal>
      ))}
    </ul>
  )
}
