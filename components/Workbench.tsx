'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sample } from '@/data/samples'
import type { QualityCheck, QualityResult } from '@/lib/quality'
import { checkBitmap } from '@/lib/quality-client'
import { BADGES, SHOP_CATEGORIES, stagesFor, type Badge, type StageName, type StageRecord } from '@/lib/types'
import { PhotoEditor, type EditOp, type PhotoEditorHandle } from './PhotoEditor'
import { StageTimeline } from './StageTimeline'
import { Stepper } from './Stepper'
import { StudioCheck } from './StudioCheck'
import { useToast } from './useToast'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void }) => string
      reset: (id?: string) => void
    }
  }
}

type Step = 'photo' | 'check' | 'prepare' | 'running' | 'done'
const STEP_INDEX: Record<Step, number> = { photo: 0, check: 1, prepare: 2, running: 3, done: 4 }
interface Status { live: boolean; maxRunsPerIpPerDay: number; remaining: number; aiRetouch?: boolean }

const MAX_BYTES = 4 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png', 'image/webp']
const VOICE_KEY = 'pp.voice'

interface Props {
  presets: { id: string; name: string; bio: string }[]
  samples: Sample[]
  siteKey?: string
}

export function Workbench({ presets, samples, siteKey }: Props) {
  const [status, setStatus] = useState<Status | null>(null)
  const [step, setStep] = useState<Step>('photo')
  const [file, setFile] = useState<File | null>(null)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)
  const [thumb, setThumb] = useState<string | null>(null)
  const [quality, setQuality] = useState<QualityResult | null>(null)
  const [ops, setOps] = useState<EditOp[]>([])
  const [preview, setPreview] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [voice, setVoice] = useState(presets[0]?.id ?? '')
  const [bio, setBio] = useState('')
  const [specsOpen, setSpecsOpen] = useState(true)
  const emptyMeta = { category: '', productType: '', material: '', notes: '', sku: '', price: '', compareAtPrice: '', badge: '' as Badge | '', featured: false }
  const [meta, setMeta] = useState(emptyMeta)
  const [stages, setStages] = useState<StageRecord[]>([])
  const [elapsed, setElapsed] = useState(0)
  const [message, setMessage] = useState('')
  const [token, setToken] = useState('')
  const [shake, setShake] = useState(0)
  const [withRetouch, setWithRetouch] = useState(false)
  const [framing, setFraming] = useState<'tight' | 'standard' | 'airy'>('standard')
  const [shadow, setShadow] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<PhotoEditorHandle>(null)
  const widget = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | undefined>(undefined)
  const topRef = useRef<HTMLDivElement>(null)
  const { toast } = useToast()
  const router = useRouter()
  const [doneId, setDoneId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ live: false, maxRunsPerIpPerDay: 2, remaining: 0 }))
  }, [])

  useEffect(() => {
    try {
      const v = localStorage.getItem(VOICE_KEY)
      if (v && (v === 'custom' || presets.some((p) => p.id === v))) setVoice(v)
    } catch {
      /* storage blocked */
    }
  }, [presets])
  function pickVoice(v: string) {
    setVoice(v)
    try {
      localStorage.setItem(VOICE_KEY, v)
    } catch {
      /* storage blocked */
    }
  }

  useEffect(() => {
    if (!siteKey || widgetId.current) return
    const render = () => {
      if (window.turnstile && widget.current && !widgetId.current) {
        widgetId.current = window.turnstile.render(widget.current, { sitekey: siteKey, callback: setToken, 'expired-callback': () => setToken('') })
      }
    }
    if (window.turnstile) return render()
    const s = document.createElement('script')
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    s.async = true
    s.onload = render
    document.head.appendChild(s)
  }, [siteKey])

  useEffect(() => {
    if (step !== 'running') return
    const start = performance.now()
    const t = setInterval(() => setElapsed(performance.now() - start), 100)
    return () => clearInterval(t)
  }, [step])

  useEffect(() => () => { if (thumb) URL.revokeObjectURL(thumb) }, [thumb])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const scrollTop = () => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    topRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  // Keep the step guide in view whenever the step changes.
  useEffect(() => {
    if (step === 'photo' || !topRef.current) return
    if (topRef.current.getBoundingClientRect().top < 64) scrollTop()
  }, [step])

  const choose = useCallback(async (f: File | null) => {
    setMessage('')
    if (!f) return
    if (!TYPES.includes(f.type)) return setMessage('That file type won’t work. Use a JPEG, PNG or WebP photo.')
    if (f.size > MAX_BYTES) return setMessage(`This photo is ${(f.size / 1024 / 1024).toFixed(1)} MB. The limit is 4 MB.`)
    try {
      const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' })
      setFile(f)
      setBitmap(bmp)
      setThumb(URL.createObjectURL(f))
      setQuality(checkBitmap(bmp))
      setOps([])
      setStep('check')
    } catch {
      setMessage('That image could not be opened. Try another file.')
    }
  }, [])

  // Paste an image from the clipboard (⌘V / Ctrl+V) on the first step.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (step !== 'photo' && step !== 'check') return
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (f) {
        e.preventDefault()
        choose(new File([f], `pasted.${f.type.split('/')[1]}`, { type: f.type }))
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [choose, step])

  async function useSample(s: Sample) {
    try {
      const blob = await (await fetch(s.src)).blob()
      pickVoice(s.brand)
      setMeta({
        ...emptyMeta,
        category: s.meta.category ?? '',
        productType: s.meta.productType ?? '',
        material: s.meta.material ?? '',
        notes: s.meta.notes ?? '',
        sku: s.meta.sku ?? '',
        price: s.meta.price !== undefined ? String(s.meta.price) : '',
        compareAtPrice: s.meta.compareAtPrice !== undefined ? String(s.meta.compareAtPrice) : '',
        badge: s.meta.badge ?? '',
        featured: Boolean(s.meta.featured),
      })
      await choose(new File([blob], s.src.split('/').pop() ?? 'sample.jpg', { type: blob.type || 'image/jpeg' }))
    } catch {
      setMessage('That sample could not be loaded.')
    }
  }

  async function generate() {
    if (!file) return
    setMessage('')
    let upload = file
    let mask: File | null = null
    try {
      if (ops.length && editorRef.current) ({ image: upload, mask } = await editorRef.current.exportFiles(file.name))
    } catch {
      return setMessage('Your edits could not be applied. Try again.')
    }
    if (upload.size + (mask?.size ?? 0) > MAX_BYTES) return setMessage('The edited photo is over 4 MB. Try a smaller original.')

    const body = new FormData()
    body.set('image', upload)
    if (mask) body.set('mask', mask)
    body.set('framing', framing)
    body.set('shadow', shadow ? '1' : '0')
    setWithRetouch(Boolean(mask))
    if (voice === 'custom') body.set('customBio', bio)
    else body.set('brandPreset', voice)
    for (const [k, v] of Object.entries(meta)) {
      if (typeof v === 'boolean') { if (v) body.set(k, '1') }
      else if (v.trim()) body.set(k, v.trim())
    }

    setPreview(URL.createObjectURL(upload))
    setStep('running')
    scrollTop()
    setStages([])
    let ended = false
    const fail = (msg: string) => {
      ended = true
      setMessage(msg)
      setStep('prepare')
      setShake((n) => n + 1)
    }
    try {
      // The bot token goes in a header so the server checks it before reading the upload.
      const res = await fetch('/api/generate', { method: 'POST', body, headers: { 'x-turnstile-token': token } })
      if (!res.ok || !res.body) {
        const err = (await res.json().catch(() => ({}))) as { error?: string; reason?: string; checks?: QualityCheck[] }
        if (err.reason === 'quality' && err.checks) {
          ended = true
          setQuality({ pass: false, checks: err.checks, metrics: quality!.metrics })
          setStep('check')
          return
        }
        if (err.reason === 'capacity') setStatus((s) => (s ? { ...s, live: false } : s))
        if (err.reason === 'rate_limit') setStatus((s) => (s ? { ...s, remaining: 0 } : s))
        return fail(err.error ?? 'Something went wrong.')
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          const evt = JSON.parse(line) as { type: string; stage?: StageRecord; id?: string; message?: string }
          if (evt.type === 'stage' && evt.stage) setStages((s) => [...s, evt.stage!])
          if (evt.type === 'error') fail(evt.message ?? 'Something went wrong.')
          if (evt.type === 'done' && evt.id) {
            ended = true
            const id = evt.id
            setDoneId(id)
            setStep('done')
            setStatus((s) => (s ? { ...s, remaining: Math.max(0, s.remaining - 1) } : s))
            // Let the finished rings and stages register for a moment, then open the listing.
            setTimeout(() => router.push(`/r/${id}?new=1`), 1200)
          }
        }
      }
      if (!ended) fail('The run was interrupted. Please try again.')
    } catch {
      if (!ended) fail('The connection dropped. Please try again.')
    } finally {
      setToken('')
      window.turnstile?.reset(widgetId.current)
    }
  }

  function startOver() {
    setStep('photo')
    setFile(null)
    setBitmap(null)
    setThumb(null)
    setQuality(null)
    setOps([])
    setStages([])
    setMessage('')
    setDoneId(null)
  }

  const priceN = parseFloat(meta.price)
  const compareN = parseFloat(meta.compareAtPrice)
  const discount = meta.compareAtPrice && meta.price && priceN > 0 ? (compareN > priceN ? Math.round((1 - priceN / compareN) * 100) : 0) : null
  // Real progress per step for the rings: photo chosen, checks passed, details filled, stages done.
  const order = STEP_INDEX[step]
  const detailsFilled = [meta.productType, meta.category, meta.sku, meta.material, meta.price, meta.notes].filter((v) => v.trim()).length
  const stepProgress = [
    file ? 1 : 0,
    order > 1 && quality?.pass ? 1 : quality ? quality.checks.filter((c) => c.ok).length / quality.checks.length : 0,
    order > 2 ? 1 : order === 2 ? 0.25 + 0.75 * (detailsFilled / 6) * 0.9 : 0,
    step === 'done' ? 1 : step === 'running' ? stages.filter((s) => s.status === 'ok').length / stagesFor(withRetouch).length : 0,
  ]
  const running: StageName | null = step === 'running' ? stagesFor(withRetouch).find((n) => !stages.some((s) => s.name === n)) ?? null : null
  const doneCount = stages.filter((s) => s.status === 'ok').length
  const atCapacity = status && !status.live
  const noRunsLeft = status && status.live && status.remaining <= 0
  const canGenerate = discount !== 0 && Boolean(file) && step === 'prepare' && !atCapacity && !noRunsLeft && (!siteKey || Boolean(token)) && (voice !== 'custom' || bio.trim().length > 0)
  const activePreset = presets.find((p) => p.id === voice)
  const field = 'mt-1 w-full rounded-[3px] border border-sand bg-card px-3 py-2.5 text-sm outline-none transition focus:border-brown focus:shadow-[var(--shadow-glow)]'
  const studioSamples = samples.filter((s) => s.kind === 'studio')
  const rejectedSample = samples.find((s) => s.kind === 'rejected')

  return (
    <div ref={topRef} className="scroll-mt-20">
      <Stepper current={Math.min(3, STEP_INDEX[step])} progress={stepProgress} />

      {/* ① Photo */}
      {step === 'photo' && (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
          <div className="relative">
          <p className="caption absolute left-3 top-2.5 z-10">Frame 01 · Your photo</p>
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a product photo"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), inputRef.current?.click())}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(true)
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setOver(false)
              choose(e.dataTransfer.files?.[0] ?? null)
            }}
            className={`dropzone relative h-full cursor-pointer overflow-hidden transition-colors duration-150 ${over ? 'is-over bg-wash-active' : 'bg-wash hover:bg-wash-active/70'}`}
          >
            <div className="flex h-full flex-col items-center justify-center px-5 pb-12 pt-14 text-center">
              <p className="text-lg font-semibold">Drop a studio photo, paste it, or browse</p>
              <p className="mt-1 text-sm text-muted">Light plain backdrop · soft even light · at least 1000 px · JPEG, PNG or WebP up to 4 MB</p>
              {studioSamples.length > 0 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <span className="text-sm text-muted">No photo handy?</span>
                  {studioSamples.map((s) => (
                    <button key={s.id} type="button" onClick={() => useSample(s)} className="min-h-11 rounded-[2px] border border-sand bg-card px-4 text-sm font-medium transition hover:border-brown/50 active:scale-95">
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>
          <div className="relative hidden border border-sand bg-card lg:block" aria-hidden>
            <p className="caption absolute left-3 top-2.5">Frame 02 · Listing</p>
            <div className="flex h-full flex-col justify-center gap-3 px-8 py-12">
              <div className="mx-auto aspect-square w-40 border border-dashed border-sand bg-paper" />
              <p className="text-center text-sm text-muted">Clean image on white, plus name, description, key features, SEO and tags in DE · EN · ES.</p>
            </div>
          </div>
          </div>
          <input ref={inputRef} type="file" accept={TYPES.join(',')} className="sr-only" onChange={(e) => choose(e.target.files?.[0] ?? null)} />
          {rejectedSample && (
            <p className="text-center text-sm text-muted">
              Curious what gets rejected?{' '}
              <button type="button" onClick={() => useSample(rejectedSample)} className="min-h-11 font-semibold text-ink underline-offset-4 hover:underline">
                Try a {rejectedSample.label.toLowerCase()}
              </button>
            </p>
          )}
        </div>
      )}

      {/* ② Studio check */}
      {step === 'check' && quality && thumb && (
        <StudioCheck result={quality} thumb={thumb} onContinue={() => setStep('prepare')} onReplace={startOver} />
      )}

      {/* ③ Prepare */}
      {step === 'prepare' && bitmap && (
        <div key={shake} className={`space-y-6 ${shake ? 'animate-shake' : ''}`}>
          <PhotoEditor ref={editorRef} bitmap={bitmap} ops={ops} onOpsChange={setOps} aiRetouch={status?.aiRetouch} />

          <div className="grid gap-6 rounded-[3px] border border-sand bg-card p-5 shadow-[var(--shadow-soft)] sm:p-6">
            <div>
              <p className="mb-2 text-sm font-semibold">Brand voice</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button key={p.id} type="button" onClick={() => pickVoice(p.id)} aria-pressed={voice === p.id} className={`min-h-11 rounded-[2px] border px-4 text-sm font-medium transition-colors duration-200 ${voice === p.id ? 'border-brown bg-brown text-paper' : 'border-sand bg-card hover:border-brown/50'}`}>
                    {p.name}
                  </button>
                ))}
                <button type="button" onClick={() => pickVoice('custom')} aria-pressed={voice === 'custom'} className={`min-h-11 rounded-[2px] border px-4 text-sm font-medium transition-colors duration-200 ${voice === 'custom' ? 'border-brown bg-brown text-paper' : 'border-dashed border-ink/30 bg-card text-ink hover:border-brown/50'}`}>
                  ＋ Your own bio
                </button>
              </div>
              {voice === 'custom' ? (
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={600} rows={3} placeholder="Paste your company bio: who you are, who you sell to, how you sound." className={`${field} animate-fade-in`} />
              ) : (
                <p className="mt-2 text-sm italic text-muted">“{activePreset?.bio}”</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold">Image</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm text-muted">Framing</span>
                {([['tight', 'Tight'], ['standard', 'Standard'], ['airy', 'Airy']] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setFraming(id)} aria-pressed={framing === id} className={`min-h-11 rounded-[2px] border px-3.5 text-sm font-medium transition-colors ${framing === id ? 'border-brown bg-brown text-paper' : 'border-sand bg-card hover:border-brown/50'}`}>
                    {label}
                  </button>
                ))}
                <label className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[2px] border border-sand bg-card px-3.5 text-sm font-medium">
                  <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} className="h-4 w-4 accent-[#7a5a48]" /> Soft shadow
                </label>
              </div>
              <p className="mt-2 text-xs text-muted">The product is cut out, cropped and centred on a white square, ready for any shop grid.</p>
            </div>

            <div>
              <button type="button" onClick={() => setSpecsOpen((o) => !o)} aria-expanded={specsOpen} className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-ink/80 hover:text-ink">
                                Product details <span className="font-normal text-muted">(all optional, the more the better)</span>
              </button>
              {specsOpen && (
                <div className="animate-fade-in mt-2 grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium">Product
                      <input value={meta.productType} onChange={(e) => setMeta({ ...meta, productType: e.target.value })} maxLength={80} placeholder="ceramic vase" className={field} />
                    </label>
                    <label className="text-sm font-medium">Shop category
                      <select value={meta.category} onChange={(e) => setMeta({ ...meta, category: e.target.value })} className={field}>
                        <option value="">Choose…</option>
                        {SHOP_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                    <label className="text-sm font-medium">SKU / article no.
                      <input value={meta.sku} onChange={(e) => setMeta({ ...meta, sku: e.target.value })} maxLength={64} pattern="[\w.\-/ ]*" placeholder="NH-VA-024" className={`${field} font-mono`} />
                    </label>
                    <label className="text-sm font-medium">Material
                      <input value={meta.material} onChange={(e) => setMeta({ ...meta, material: e.target.value })} maxLength={80} placeholder="glazed stoneware" className={field} />
                    </label>
                    <label className="text-sm font-medium">Price (€)
                      <input value={meta.price} onChange={(e) => setMeta({ ...meta, price: e.target.value })} inputMode="decimal" type="number" min={0} step="0.01" placeholder="49.00" className={field} />
                    </label>
                    <label className="text-sm font-medium">
                      <span className="flex justify-between">Compare-at price (€)
                        {discount !== null && <span className={discount > 0 ? 'font-semibold text-ink' : 'text-brick'}>{discount > 0 ? `−${discount} %` : 'must be higher'}</span>}
                      </span>
                      <input value={meta.compareAtPrice} onChange={(e) => setMeta({ ...meta, compareAtPrice: e.target.value })} inputMode="decimal" type="number" min={0} step="0.01" placeholder="59.00" className={field} />
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="mr-1 text-sm font-medium">Badge</span>
                    {([['', 'None'], ...Object.entries(BADGES)] as [string, string][]).map(([id, label]) => (
                      <button key={id || 'none'} type="button" onClick={() => setMeta({ ...meta, badge: id as Badge | '' })} aria-pressed={meta.badge === id} className={`min-h-11 rounded-[2px] border px-3.5 text-sm font-medium transition-colors ${meta.badge === id ? 'border-brown bg-brown text-paper' : 'border-sand bg-card hover:border-brown/50'}`}>
                        {label}
                      </button>
                    ))}
                    <label className="ml-auto inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-[2px] border border-sand bg-card px-3.5 text-sm font-medium">
                      <input type="checkbox" checked={meta.featured} onChange={(e) => setMeta({ ...meta, featured: e.target.checked })} className="h-4 w-4 accent-[#7a5a48]" /> Featured
                    </label>
                  </div>


                  <label className="text-sm font-medium">Measurements &amp; specials <span className="font-normal text-muted">(kept word for word in every language)</span>
                    <textarea value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} maxLength={600} rows={2} placeholder="24 cm tall · Ø 9 cm · watertight · handmade in Portugal" className={field} />
                  </label>
                </div>
              )}
            </div>

            {atCapacity ? (
              <div className="rounded-[3px] bg-oat p-4 text-sm">
                <p className="font-semibold">The live demo is resting for today.</p>
                <p className="mt-1 text-muted">It resets at midnight UTC. Every example in the <a href="#gallery" className="font-semibold text-ink underline">gallery</a> is a real pipeline run.</p>
              </div>
            ) : noRunsLeft ? (
              <div className="rounded-[3px] bg-oat p-4 text-sm">
                <p className="font-semibold">You’ve used today’s free runs. Thanks for trying it!</p>
                <p className="mt-1 text-muted">Come back tomorrow, or browse the <a href="#gallery" className="font-semibold text-ink underline">gallery</a>.</p>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <button type="button" onClick={generate} disabled={!canGenerate} className="group inline-flex min-h-12 items-center gap-2 rounded-[2px] bg-brown px-7 text-[15px] font-semibold text-white shadow-[var(--shadow-soft)] transition hover:-translate-y-px hover:bg-brown-dark hover:shadow-[var(--shadow-lift)] active:scale-[0.97] disabled:translate-y-0 disabled:opacity-40 disabled:shadow-none">
                  Generate listing                 </button>
                <p className="text-sm text-muted">
                  {ops.length ? `${ops.length} edit${ops.length > 1 ? 's' : ''} · ` : 'No edits needed? Go ahead · '}
                  {status ? `${status.remaining} of ${status.maxRunsPerIpPerDay} free runs left today` : 'Checking availability…'}
                </p>
                <button type="button" onClick={startOver} className="min-h-11 text-sm font-semibold text-muted hover:text-ink sm:ml-auto">Use another photo</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ④ Listing */}
      {(step === 'running' || step === 'done') && (
        <div className="animate-fade-in space-y-6">
          <div className="grid gap-5 rounded-[3px] border border-sand bg-card p-4 shadow-[var(--shadow-lift)] sm:p-6 md:grid-cols-[1.15fr_1fr]">
            <div>
              {(
                <div className="relative overflow-hidden rounded-[3px] bg-oat">
                  {preview && <img src={preview} alt="Your photo, being processed" className="aspect-square w-full object-contain" />}
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <div className="animate-shimmer h-1/3 w-full bg-gradient-to-b from-transparent via-white/70 to-transparent" />
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold">{step === 'done' ? 'Done' : 'Working on it…'}</p>
                <p className="font-mono text-xs tabular-nums text-muted">
                  {`${(elapsed / 1000).toFixed(1)} s`}
                </p>
              </div>
              <StageTimeline stages={stages} running={running} retouch={withRetouch} />
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-oat">
                <div className="h-full rounded-full bg-gradient-to-r from-sand to-brown transition-[width] duration-500 ease-out" style={{ width: `${step === 'done' ? 100 : (doneCount / stagesFor(withRetouch).length) * 100}%` }} />
              </div>
              {step === 'running' && elapsed > 15000 && <p className="mt-2 text-xs text-muted">Still working: the copy model can take a little longer on detailed photos.</p>}
              {step === 'done' && doneId && (
                <div className="mt-auto pt-5">
                  <p className="font-[family-name:var(--font-display)] text-lg font-semibold">Done. Opening your listing…</p>
                  <a href={`/r/${doneId}?new=1`} className="caption !text-ink mt-1 inline-block underline underline-offset-4">Open it now</a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {message && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-[3px] border border-brick/30 bg-brick/5 px-4 py-3 text-sm text-brick">
          <span>{message}</span>
          {step === 'prepare' && file && canGenerate && (
            <button type="button" onClick={generate} className="inline-flex min-h-11 items-center gap-1.5 rounded-[2px] bg-card px-3 font-semibold text-ink">
              Try again
            </button>
          )}
        </div>
      )}

      {/* Turnstile stays mounted across steps; visible where the visitor generates. */}
      {siteKey && <div ref={widget} className={step === 'prepare' ? 'mt-4' : 'hidden'} />}
      {toast}
    </div>
  )
}
