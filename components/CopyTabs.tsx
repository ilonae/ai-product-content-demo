'use client'

import { useState } from 'react'
import type { Lang, ProductCopy } from '@/lib/types'
import { useToast } from './useToast'

const LANGS: { id: Lang; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
]

function Counter({ n, max }: { n: number; max: number }) {
  const ok = n <= max
  return <span className={`font-mono text-[11px] ${ok ? 'text-sage' : 'text-brick'}`}>{ok ? '✓' : '!'} {n}/{max}</span>
}

export function CopyTabs({ copy }: { copy: ProductCopy }) {
  const [lang, setLang] = useState<Lang>('de')
  const { toast, showToast } = useToast()
  const idx = LANGS.findIndex((l) => l.id === lang)
  const bullets = copy.bullets?.[lang] ?? []
  const seo = copy.seo?.[lang]

  async function copyAll() {
    const parts = [
      copy.name,
      copy.descriptions[lang],
      bullets.length ? bullets.map((b) => `• ${b}`).join('\n') : '',
      seo ? `SEO title: ${seo.title}\nMeta description: ${seo.description}` : '',
      copy.tags?.length ? `Tags: ${copy.tags.join(', ')}` : '',
      `Alt text: ${copy.altText}`,
    ].filter(Boolean)
    try {
      await navigator.clipboard.writeText(parts.join('\n\n'))
      showToast('✓ Copied')
    } catch {
      showToast('Copy blocked by the browser')
    }
  }

  return (
    <div className="rounded-[3px] border border-sand bg-card shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between gap-2 border-b border-sand px-3 pt-2">
        <div role="tablist" aria-label="Language" className="relative flex">
          {LANGS.map((l) => (
            <button
              key={l.id}
              role="tab"
              aria-selected={lang === l.id}
              onClick={() => setLang(l.id)}
              className={`min-h-11 w-[5.25rem] text-sm transition-colors ${lang === l.id ? 'font-semibold text-ink' : 'text-muted hover:text-ink'}`}
            >
              {l.label}
            </button>
          ))}
          <span className="absolute bottom-0 h-0.5 w-[5.25rem] rounded-full bg-brown transition-transform duration-200" style={{ transform: `translateX(${idx * 100}%)` }} />
        </div>
        <button onClick={copyAll} className="min-h-11 shrink-0 whitespace-nowrap rounded-[2px] px-3 text-sm font-medium text-muted hover:bg-oat hover:text-ink">
          Copy all
        </button>
      </div>

      <div key={lang} role="tabpanel" className="animate-fade-in space-y-4 p-5">
        <h3 className="text-xl font-bold tracking-tight">{copy.name}</h3>
        <p className="whitespace-pre-line leading-relaxed text-ink/85">{copy.descriptions[lang]}</p>

        {bullets.length > 0 && (
          <ul className="space-y-1.5">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-ink/85">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brown" />
                {b}
              </li>
            ))}
          </ul>
        )}

        {seo && (
          <div className="space-y-2 rounded-[3px] border border-sand bg-paper p-4">
            <p className="font-mono text-[11px] uppercase tracking-widest text-muted">Search snippet</p>
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[15px] font-semibold text-ink">{seo.title}</p>
                <Counter n={seo.title.length} max={60} />
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-3">
                <p className="text-sm text-ink/75">{seo.description}</p>
                <Counter n={seo.description.length} max={155} />
              </div>
            </div>
          </div>
        )}

        {copy.tags && copy.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {copy.tags.map((t) => (
              <span key={t} className="rounded-[2px] bg-apricot/70 px-2.5 py-1 text-xs font-medium text-ink/80">#{t}</span>
            ))}
          </div>
        )}

        <p className="rounded-[3px] bg-oat px-3 py-2 text-xs text-muted">
          <span className="font-mono font-medium text-ink">alt</span> · {copy.altText}
        </p>
      </div>
      {toast}
    </div>
  )
}
