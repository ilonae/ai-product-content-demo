'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { backdropColour, growIntoShadow, type RGB } from '@/lib/editing'

export type EditOp =
  | { kind: 'erase'; colour: RGB; size: number; points: number[]; grow: boolean }
  | { kind: 'tape'; size: number; points: number[] }

export interface PhotoEditorHandle {
  /** The photo with prop erasures applied, plus the tape marks as a PNG mask (repainted on the server). */
  exportFiles(name: string): Promise<{ image: File; mask: File | null }>
}

type Tool = 'erase' | 'tape' | 'pick'
const WORK_EDGE = 2048

interface Props {
  bitmap: ImageBitmap
  ops: EditOp[]
  onOpsChange: (ops: EditOp[]) => void
  /** Whether the server repaints tape with AI (shown in the hint). */
  aiRetouch?: boolean
}

const rgb = (c: RGB) => `rgb(${c[0]},${c[1]},${c[2]})`

function drawStroke(ctx: CanvasRenderingContext2D, pts: number[], size: number, style: string | CanvasPattern) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = size
  ctx.strokeStyle = style
  ctx.fillStyle = style
  if (pts.length === 2) {
    ctx.beginPath()
    ctx.arc(pts[0], pts[1], size / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(pts[0], pts[1])
    for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1])
    ctx.stroke()
  }
  ctx.restore()
}

export const PhotoEditor = forwardRef<PhotoEditorHandle, Props>(function PhotoEditor({ bitmap, ops, onOpsChange, aiRetouch }, ref) {
  const baseRef = useRef<HTMLCanvasElement>(null)
  const tapeRef = useRef<HTMLCanvasElement>(null)
  const origRef = useRef<HTMLCanvasElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const orig = useRef<ImageData | null>(null)
  const pattern = useRef<CanvasPattern | null>(null)
  const rendered = useRef<EditOp[]>([])
  const drawing = useRef<EditOp | null>(null)
  const opsRef = useRef(ops)
  opsRef.current = ops

  const [tool, setTool] = useState<Tool>('erase')
  const [size, setSize] = useState(40)
  const [grow, setGrow] = useState(true)
  const [colour, setColour] = useState<RGB>([255, 255, 255])
  const [zoom, setZoom] = useState(1)
  const [comparing, setComparing] = useState(false)
  const [redo, setRedo] = useState<EditOp[]>([])
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  const dims = useMemo(() => {
    const s = Math.min(1, WORK_EDGE / Math.max(bitmap.width, bitmap.height))
    return { w: Math.round(bitmap.width * s), h: Math.round(bitmap.height * s) }
  }, [bitmap])

  const applyOp = useCallback(
    (op: EditOp, skipStroke = false) => {
      const ctx = baseRef.current!.getContext('2d', { willReadFrequently: true })!
      if (op.kind === 'tape') {
        if (!skipStroke) drawStroke(tapeRef.current!.getContext('2d')!, op.points, op.size, pattern.current ?? 'rgba(242,181,68,0.6)')
        return
      }
      if (!skipStroke) drawStroke(ctx, op.points, op.size, rgb(op.colour))
      if (!op.grow) return
      // Grow into the prop's shadow, inside the stroke's bounding box only (fast).
      const reach = Math.round(op.size * 0.8 + 6)
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
      for (let i = 0; i < op.points.length; i += 2) {
        x0 = Math.min(x0, op.points[i]); x1 = Math.max(x1, op.points[i])
        y0 = Math.min(y0, op.points[i + 1]); y1 = Math.max(y1, op.points[i + 1])
      }
      const pad = op.size / 2 + reach + 2
      const bx = Math.max(0, Math.floor(x0 - pad)), by = Math.max(0, Math.floor(y0 - pad))
      const bw = Math.min(dims.w, Math.ceil(x1 + pad)) - bx, bh = Math.min(dims.h, Math.ceil(y1 + pad)) - by
      if (bw <= 0 || bh <= 0) return
      const m = document.createElement('canvas')
      m.width = bw
      m.height = bh
      const mctx = m.getContext('2d', { willReadFrequently: true })!
      mctx.translate(-bx, -by)
      drawStroke(mctx, op.points, op.size, '#000')
      const md = mctx.getImageData(0, 0, bw, bh).data
      const mask = new Uint8Array(bw * bh)
      for (let i = 0; i < bw * bh; i++) mask[i] = md[i * 4 + 3] > 0 ? 1 : 0
      const img = ctx.getImageData(bx, by, bw, bh)
      growIntoShadow(img.data, bw, bh, mask, op.colour, reach)
      ctx.putImageData(img, bx, by)
    },
    [dims],
  )

  const fullRender = useCallback(
    (list: EditOp[]) => {
      if (!orig.current) return
      baseRef.current!.getContext('2d')!.putImageData(orig.current, 0, 0)
      tapeRef.current!.getContext('2d')!.clearRect(0, 0, dims.w, dims.h)
      for (const op of list) applyOp(op)
      rendered.current = list
    },
    [applyOp, dims],
  )

  // Load the photo.
  useEffect(() => {
    for (const c of [baseRef.current!, tapeRef.current!, origRef.current!]) {
      c.width = dims.w
      c.height = dims.h
    }
    const octx = origRef.current!.getContext('2d', { willReadFrequently: true })!
    octx.drawImage(bitmap, 0, 0, dims.w, dims.h)
    orig.current = octx.getImageData(0, 0, dims.w, dims.h)
    setColour(backdropColour(orig.current.data, dims.w, dims.h))
    setSize(Math.max(8, Math.round(Math.max(dims.w, dims.h) * 0.03)))
    const p = document.createElement('canvas')
    p.width = p.height = 16
    const pc = p.getContext('2d')!
    pc.fillStyle = 'rgba(242,181,68,0.55)'
    pc.fillRect(0, 0, 16, 16)
    pc.strokeStyle = 'rgba(194,83,47,0.75)'
    pc.lineWidth = 4
    pc.beginPath()
    pc.moveTo(-4, 4); pc.lineTo(4, -4); pc.moveTo(0, 16); pc.lineTo(16, 0); pc.moveTo(12, 20); pc.lineTo(20, 12)
    pc.stroke()
    pattern.current = tapeRef.current!.getContext('2d')!.createPattern(p, 'repeat')
    fullRender(opsRef.current)
  }, [bitmap, dims, fullRender])

  // Re-render on undo/redo/reset; appended ops are applied incrementally.
  useEffect(() => {
    if (!orig.current || ops === rendered.current) return
    const prev = rendered.current
    const isAppend = ops.length >= prev.length && prev.every((op, i) => ops[i] === op)
    if (isAppend) {
      for (const op of ops.slice(prev.length)) applyOp(op)
      rendered.current = ops
    } else fullRender(ops)
  }, [ops, applyOp, fullRender])

  useImperativeHandle(ref, () => ({
    async exportFiles(name: string) {
      const toBlob = (c: HTMLCanvasElement, type: string, q?: number) =>
        new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Export failed'))), type, q))
      const base = name.replace(/\.\w+$/, '')
      const image = new File([await toBlob(baseRef.current!, 'image/jpeg', 0.92)], `${base}-edited.jpg`, { type: 'image/jpeg' })
      const hasTape = opsRef.current.some((o) => o.kind === 'tape')
      const mask = hasTape ? new File([await toBlob(tapeRef.current!, 'image/png')], `${base}-tape.png`, { type: 'image/png' }) : null
      return { image, mask }
    },
  }))

  const toImage = (e: React.PointerEvent) => {
    const r = baseRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) * dims.w) / r.width, y: ((e.clientY - r.top) * dims.h) / r.height }
  }

  function onDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const { x, y } = toImage(e)
    if (tool === 'pick') {
      const o = (Math.floor(y) * dims.w + Math.floor(x)) * 4
      const d = orig.current!.data
      setColour([d[o], d[o + 1], d[o + 2]])
      setTool('erase')
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    const op: EditOp = tool === 'erase' ? { kind: 'erase', colour, size, points: [x, y], grow } : { kind: 'tape', size, points: [x, y] }
    drawing.current = op
    applyOp({ ...op, grow: false } as EditOp)
  }

  function onMove(e: React.PointerEvent) {
    const p = toImage(e)
    setCursor(e.pointerType === 'mouse' ? p : null)
    const op = drawing.current
    if (!op) return
    const n = op.points.length
    const seg = [op.points[n - 2], op.points[n - 1], p.x, p.y]
    op.points.push(p.x, p.y)
    const ctx = op.kind === 'erase' ? baseRef.current!.getContext('2d')! : tapeRef.current!.getContext('2d')!
    drawStroke(ctx, seg, op.size, op.kind === 'erase' ? rgb(op.colour) : pattern.current ?? 'rgba(242,181,68,0.6)')
  }

  function onUp() {
    const op = drawing.current
    if (!op) return
    drawing.current = null
    if (op.kind === 'erase' && op.grow) applyOp(op, true)
    const next = [...opsRef.current, op]
    rendered.current = next
    setRedo([])
    onOpsChange(next)
  }

  const undo = useCallback(() => {
    const cur = opsRef.current
    if (!cur.length) return
    setRedo((r) => [cur[cur.length - 1], ...r])
    onOpsChange(cur.slice(0, -1))
  }, [onOpsChange])

  const redoOne = useCallback(() => {
    if (!redo.length) return
    onOpsChange([...opsRef.current, redo[0]])
    setRedo(redo.slice(1))
  }, [redo, onOpsChange])

  // Shortcuts: E / T / I, [ and ] for size, ⌘Z / ⇧⌘Z.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, [contenteditable]')) return
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redoOne()
        else undo()
      } else if (!e.metaKey && !e.ctrlKey) {
        if (k === 'e') setTool('erase')
        else if (k === 't') setTool('tape')
        else if (k === 'i') setTool('pick')
        else if (k === '[') setSize((s) => Math.max(4, Math.round(s * 0.85)))
        else if (k === ']') setSize((s) => Math.min(300, Math.round(s * 1.18)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redoOne])

  // ⌘/Ctrl + wheel zooms.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.metaKey && !e.ctrlKey) return
      e.preventDefault()
      setZoom((z) => Math.min(4, Math.max(1, +(z * (e.deltaY < 0 ? 1.15 : 0.87)).toFixed(2))))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const toolBtn = (id: Tool, label: string, key: string) => (
    <button
      type="button"
      onClick={() => setTool(id)}
      aria-pressed={tool === id}
      className={`inline-flex min-h-11 items-center gap-2 rounded-[2px] px-3.5 text-sm font-semibold transition-colors duration-200 ${tool === id ? 'bg-brown text-paper' : 'text-ink/80 hover:bg-oat'}`}
    >
      {label}
      <kbd className={`rounded-md px-1.5 font-mono text-[10px] ${tool === id ? 'bg-paper/15' : 'bg-oat text-muted'}`}>{key}</kbd>
    </button>
  )
  const iconBtn = 'min-h-11 min-w-11 rounded-[2px] px-3 text-sm font-medium text-ink/80 transition hover:bg-oat disabled:opacity-30'

  return (
    <div className="animate-editor-in space-y-3">
      <div className="animate-toolbar-in sticky top-16 z-20 flex flex-wrap items-center gap-1 rounded-[3px] border border-sand bg-card/95 p-1.5 shadow-[var(--shadow-soft)] backdrop-blur">
        <div className="flex items-center rounded-full bg-paper p-0.5">
          {toolBtn('erase', 'Erase prop', 'E')}
          {toolBtn('tape', 'Tape', 'T')}
          {toolBtn('pick', 'Pick colour', 'I')}
        </div>
        <span className="mx-1 h-6 w-px bg-sand" />
        <label className="flex items-center gap-2 px-2 text-xs font-medium text-muted">
          Size
          <input type="range" min={4} max={300} value={size} onChange={(e) => setSize(Number(e.target.value))} className="w-24 accent-[#7a5a48]" aria-label="Brush size" />
        </label>
        {tool !== 'tape' && (
          <span className="flex items-center gap-2 px-1">
            <span title="Eraser colour (pick it from the backdrop)" className="h-6 w-6 rounded-full border border-sand shadow-inner" style={{ background: rgb(colour) }} />
            <label className="flex min-h-11 cursor-pointer items-center gap-1.5 text-xs font-medium text-ink/80">
              <input type="checkbox" checked={grow} onChange={(e) => setGrow(e.target.checked)} className="h-4 w-4 accent-[#7a5a48]" /> Grow into shadow
            </label>
          </span>
        )}
        <span className="mx-1 h-6 w-px bg-sand" />
        <button type="button" onClick={undo} disabled={!ops.length} className={iconBtn} aria-label="Undo (⌘Z)" title="Undo (⌘Z)">Undo</button>
        <button type="button" onClick={redoOne} disabled={!redo.length} className={iconBtn} aria-label="Redo (⇧⌘Z)" title="Redo (⇧⌘Z)">Redo</button>
        <button type="button" onClick={() => { setRedo([]); onOpsChange([]) }} disabled={!ops.length} className={iconBtn} aria-label="Reset all edits" title="Reset">Reset</button>
        <span className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setZoom((z) => Math.max(1, +(z / 1.25).toFixed(2)))} className={iconBtn} aria-label="Zoom out">−</button>
          <span className="w-11 text-center font-mono text-xs text-muted">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(4, +(z * 1.25).toFixed(2)))} className={iconBtn} aria-label="Zoom in">+</button>
          <button
            type="button"
            onPointerDown={() => setComparing(true)}
            onPointerUp={() => setComparing(false)}
            onPointerLeave={() => setComparing(false)}
            onKeyDown={(e) => e.key === ' ' && setComparing(true)}
            onKeyUp={() => setComparing(false)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-[2px] px-3 text-sm font-semibold text-ink/80 hover:bg-oat"
            title="Hold to see the original"
          >
            Hold to compare
          </button>
        </span>
      </div>

      <div ref={scrollRef} className="max-h-[70vh] overflow-auto rounded-[3px] border border-sand bg-oat">
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          <canvas
            ref={baseRef}
            className={`block h-auto w-full touch-none ${tool === 'pick' ? 'cursor-crosshair' : 'cursor-none'}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onPointerLeave={() => setCursor(null)}
            aria-label="Photo editor canvas"
          />
          <canvas ref={tapeRef} className="animate-tape pointer-events-none absolute inset-0 h-full w-full" />
          <canvas ref={origRef} className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-200 ${comparing ? 'opacity-100' : 'opacity-0'}`} />
          {cursor && tool !== 'pick' && (
            <span
              className={`pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${tool === 'tape' ? 'border-saffron' : 'border-brown'} shadow-[0_0_0_1px_rgba(255,255,255,0.8)]`}
              style={{ left: `${(cursor.x / dims.w) * 100}%`, top: `${(cursor.y / dims.h) * 100}%`, width: `${(size / dims.w) * 100}%` }}
            />
          )}
          {comparing && <span className="absolute left-3 top-3 rounded-[2px] bg-brown/85 px-2.5 py-1 text-xs font-semibold text-paper">Original</span>}
        </div>
      </div>

      <p className="text-sm text-muted">
        {tool === 'erase' && 'Brush over clips, stands or clutter: they’re painted in the backdrop colour, so the cut-out drops them. “Grow into shadow” also cleans their grey shadow.'}
        {tool === 'tape' && (aiRetouch ? 'Mark tape, pins or small marks: AI repaints them when you generate, edges included.' : 'Mark tape, pins or small marks on the product: they’re filled from the surrounding surface when you generate. Keep marks inside the product, not across its edge.')}
        {tool === 'pick' && 'Click the backdrop to set the eraser colour.'}
        <span className="hidden sm:inline"> · [ ] size · ⌘Z undo · ⌘+scroll zoom</span>
      </p>
    </div>
  )
})
