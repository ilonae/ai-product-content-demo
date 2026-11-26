import type { Metadata } from 'next'
import { IBM_Plex_Mono, IBM_Plex_Sans } from 'next/font/google'
import { HashScroll } from '@/components/HashScroll'
import './globals.css'

// Theme 2 "Plain Workshop": IBM Plex Sans for text and headings, IBM Plex Mono only for data.
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex-sans' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' })

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: 'Product photo → ready listing | AI product-content pipeline',
  description:
    'Drop a product photo: get a clean image on white and on-brand copy in German, English and Spanish, ready to publish to any CMS.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-sand bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
            <a href="/" className="text-[15px] font-semibold text-ink">
              Product <span className="font-normal text-muted">/</span> listing
            </a>
            <nav className="flex shrink-0 items-center gap-5 whitespace-nowrap text-sm text-muted">
              <a href="/#how" className="hidden hover:text-ink sm:inline">How it works</a>
              <a href="/#try" className="hidden hover:text-ink sm:inline">Try it</a>
              <a href="/#gallery" className="hover:text-ink">Gallery</a>
              <a href="/#cms" className="hidden hover:text-ink sm:inline">CMS</a>
              <a href="/store" className="hover:text-ink">Store</a>
              <a href="https://github.com/ilonae/ai-product-content-demo" className="border-b border-ink pb-0.5 text-ink">Code</a>
            </nav>
          </div>
        </header>
        {children}
        <HashScroll />
        <footer className="border-t border-sand">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 sm:flex-row sm:justify-between sm:px-6">
            <p className="caption">
              <a href="https://github.com/ilonae/ai-product-content-demo" className="text-ink underline underline-offset-4">GitHub demo</a> · rebuilt from a production e-commerce tool
            </p>
            <p className="caption">Live outputs are watermarked and capped per day</p>
          </div>
        </footer>
      </body>
    </html>
  )
}
