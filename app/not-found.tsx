export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-xs text-ink">404</p>
      <h1 className="mt-3 text-[28px] font-semibold leading-tight">That result doesn’t exist.</h1>
      <p className="mt-2 text-muted">It may have been removed, or the link is incomplete.</p>
      <a href="/" className="mt-8 inline-flex min-h-11 items-center rounded-none bg-brown px-6 text-sm font-semibold text-white">Back to the demo</a>
    </main>
  )
}
