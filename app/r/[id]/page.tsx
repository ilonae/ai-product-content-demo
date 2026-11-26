import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BeforeAfter } from '@/components/BeforeAfter'
import { CopyTabs } from '@/components/CopyTabs'
import { ShareButton } from '@/components/ShareButton'
import { ShopPreview } from '@/components/ShopPreview'
import { CopyChecks } from '@/components/CopyChecks'
import { PublishPanel } from '@/components/PublishPanel'
import { StageTimeline } from '@/components/StageTimeline'
import { getRun } from '@/lib/runs'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const run = await getRun(id)
  if (!run) return { title: 'Result not found' }
  const description = run.copy.descriptions.en.slice(0, 155)
  return {
    title: `${run.copy.name} | AI product-content pipeline`,
    description,
    openGraph: { title: run.copy.name, description, images: [{ url: run.outputUrl, width: run.width, height: run.height, alt: run.copy.altText }] },
    twitter: { card: 'summary_large_image', title: run.copy.name, description, images: [run.outputUrl] },
  }
}


export default async function ResultPage({ params, searchParams }: Props) {
  const { id } = await params
  const fresh = (await searchParams).new === '1'
  const run = await getRun(id)
  if (!run) notFound()
  const totalS = (run.stages.reduce((t, s) => t + s.ms, 0) / 1000).toFixed(1)

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 pb-20 pt-8 sm:px-6">
      {fresh && (
        <div className="animate-fade-in flex flex-wrap items-center justify-between gap-4 border border-sage/50 bg-sage/10 px-5 py-4">
          <div>
            <p className="caption !text-sage">Fresh from the light table</p>
            <p className="mt-1 font-semibold">Your listing is ready.</p>
            <p className="text-sm text-muted">Share this page, download the image or the CSV for your shop, or publish it as a draft.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href={run.outputUrl} download={`${run.id}.png`} className="inline-flex min-h-11 items-center rounded-none border border-sand bg-card px-4 text-sm font-semibold hover:border-brown/50">Download image</a>
            <a href={`/api/runs/${run.id}/export`} className="inline-flex min-h-11 items-center rounded-none border border-sand bg-card px-4 text-sm font-semibold hover:border-brown/50">Download CSV</a>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <a href="/" className="inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-ink">Back to the demo</a>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight sm:text-[34px]">{run.copy.name}</h1>
          <p className="mt-1.5 flex flex-wrap gap-x-2 text-sm text-muted">
            <span className="text-ink">{run.brand.name} voice</span><span aria-hidden>·</span>
            <span className="font-mono text-[13px]">{totalS} s end to end</span><span aria-hidden>·</span>
            <span>{run.source === 'gallery' ? 'Gallery example' : 'Live run'} · {new Date(run.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <ShareButton id={run.id} />
          <a href="/#try" className="inline-flex min-h-11 items-center rounded-none bg-brown px-5 text-sm font-semibold text-white hover:bg-brown-dark">Make another</a>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="space-y-6">
          <div className="border-t border-sand bg-card p-3">
            <BeforeAfter before={run.originalUrl} after={run.outputUrl} alt={run.copy.altText} width={run.width} height={run.height} />
            <p className="px-2 pb-1 pt-3 text-xs text-muted">
              Output {run.width}×{run.height} px on white{run.watermarked ? ' · watermarked demo output' : ''} · drag to compare
            </p>
          </div>
          <div className="border-t border-sand bg-card p-5">
            <h2 className="mb-2 font-semibold">How it was made</h2>
            <StageTimeline stages={run.stages} variant="waterfall" />
          </div>
        </div>

        <div className="space-y-6">
          <CopyTabs copy={run.copy} />
          <ShopPreview run={run} />
          <CopyChecks run={run} />
          <PublishPanel runId={run.id} />
        </div>
      </div>
    </main>
  )
}
