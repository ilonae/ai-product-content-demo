import type { Metadata } from 'next'
import { DM_Sans, IBM_Plex_Mono, Space_Grotesk } from 'next/font/google'
import { HashScroll } from '@/components/HashScroll'
import './globals.css'

// Contact-sheet type: Space Grotesk for headlines, DM Sans for text, IBM Plex Mono for frame captions.
const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const display = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Product photo → ready listing | AI product-content pipeline',
  description:
    'Drop a product photo: get a clean image on white and on-brand copy in German, English and Spanish, ready to publish to any CMS.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-sand bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
            <a href="/" className="font-mono text-[13px] font-medium uppercase tracking-[0.14em] text-ink">
              Product<span className="text-muted">/</span>Listing
            </a>
            <nav className="flex shrink-0 items-center gap-5 whitespace-nowrap text-sm text-muted">
              <a href="/#how" className="hidden hover:text-ink sm:inline">How it works</a>
              <a href="/#try" className="hidden hover:text-ink sm:inline">Try it</a>
              <a href="/#gallery" className="hover:text-ink">Gallery</a>
              <a href="/#cms" className="hidden hover:text-ink sm:inline">CMS</a>
              <a href="/store" className="hover:text-ink">Store</a>
              {/* TODO: point at your public repository */}
              <a href="https://github.com/" className="border-b border-ink pb-0.5 text-ink">Code</a>
            </nav>
          </div>
        </header>
        {children}
        <HashScroll />
        <footer className="border-t border-sand">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:flex-row sm:justify-between sm:px-6">
            <p className="caption">
              {/* TODO: link to your public repository */}
              <a href="https://github.com/" className="text-ink underline underline-offset-4">GitHub demo</a> · rebuilt from a production e-commerce tool
            </p>
            <p className="caption">Live outputs are watermarked and capped per day</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
