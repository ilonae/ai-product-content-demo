'use client'

import { useCallback, useRef, useState } from 'react'

/** A tiny toast: slides up, stays 1.5 s, fades. */
export function useToast() {
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = useCallback((t: string) => {
    setText(t)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setText(null), 1700)
  }, [])
  const el = text ? (
    <div role="status" className="animate-toast fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-[2px] bg-brown px-4 py-2.5 text-sm font-medium text-paper shadow-[var(--shadow-lift)]">
      {text}
    </div>
  ) : null
  return { toast: el, showToast: show }
}
