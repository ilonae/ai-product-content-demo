import type { Run } from '@/lib/types'

/** Shows how the copy did against the rules (lint.ts): transparent instead of hidden. */
export function CopyChecks({ run }: { run: Run }) {
  if (!run.copyIssues) return null
  const open = run.copyIssues
  return (
    <div className={`rounded-none border p-4 text-sm ${open.length ? 'border-saffron/50 bg-saffron/10' : 'border-sage/40 bg-sage/10'}`}>
      <p className="font-semibold">{open.length ? `Copy check: ${open.length} rule${open.length > 1 ? 's' : ''} still open` : 'Copy check: all rules met ✓'}</p>
      <p className="mt-0.5 text-xs text-muted">Length limits, filler words and every product value in all three languages; one automatic revision.</p>
      {open.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-ink/75">
          {open.map((i) => (
            <li key={i} className="flex gap-2"><span className="text-saffron">●</span>{i.replace(/ \(rewrite this without it: .*\)$/, '')}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
