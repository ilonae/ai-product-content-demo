'use client'

import { useEffect, useState } from 'react'

interface Props {
  before: string
  after: string
  alt: string
  width: number
  height: number
  /** Nudge the handle once so people see it can be dragged. */
  hint?: boolean
}

export function BeforeAfter({ before, after, alt, width, height, hint = true }: Props) {
  const [pos, setPos] = useState(50)
  const [animating, setAnimating] = useState(false)

  useEffect(() => {
    if (!hint || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const steps = [38, 60, 50]
    let i = 0
    setAnimating(true)
    const t = setInterval(() => {
      setPos(steps[i++])
      if (i >= steps.length) {
        clearInterval(t)
        setTimeout(() => setAnimating(false), 300)
      }
    }, 300)
    return () => clearInterval(t)
  }, [hint])

  const ease = animating ? 'transition-all duration-300 ease-in-out' : ''

  return (
    <div className="relative select-none overflow-hidden rounded-[3px] bg-white" style={{ aspectRatio: `${width} / ${height}` }}>
      <img src={after} alt={alt} width={width} height={height} className="absolute inset-0 h-full w-full object-contain" />
      <div className={`absolute inset-0 ${ease}`} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        <img src={before} alt="" width={width} height={height} className="h-full w-full bg-oat object-contain" />
      </div>
      <div className={`pointer-events-none absolute inset-y-0 ${ease}`} style={{ left: `${pos}%` }}>
        <div className="h-full w-0.5 -translate-x-1/2 bg-white shadow-[0_0_8px_rgb(0_0_0/0.15)]" />
        <div className="absolute top-1/2 grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-[var(--shadow-lift)]">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 6l-5 6 5 6M15 6l5 6-5 6" /></svg>
        </div>
      </div>
      <span className="pointer-events-none absolute left-3 top-3 rounded-[2px] bg-brown/80 px-2.5 py-1 text-xs font-semibold text-paper">Before</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-[2px] bg-brown px-2.5 py-1 text-xs font-semibold text-white">After</span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => {
          setAnimating(false)
          setPos(Number(e.target.value))
        }}
        aria-label="Compare the raw photo with the result"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  )
}
