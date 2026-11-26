'use client'

import { useToast } from './useToast'

export function ShareButton({ id }: { id: string }) {
  const { toast, showToast } = useToast()
  async function share() {
    const url = `${window.location.origin}/r/${id}`
    try {
      await navigator.clipboard.writeText(url)
      showToast('✓ Link copied')
    } catch {
      window.prompt('Copy this link:', url)
    }
  }
  return (
    <>
      <button onClick={share} className="inline-flex min-h-11 items-center gap-2 rounded-[2px] border border-sand bg-card px-4 text-sm font-semibold hover:border-brown/50">
        Share
      </button>
      {toast}
    </>
  )
}
