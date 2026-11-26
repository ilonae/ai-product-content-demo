'use client'

import { useEffect } from 'react'

/**
 * Coming from another page to /#try, the browser's anchor jump happens before React has
 * hydrated, and the page ends up at the top. Jump to the anchor once the page is ready.
 */
export function HashScroll() {
  useEffect(() => {
    const go = () => {
      const id = decodeURIComponent(window.location.hash.slice(1))
      if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
    }
    const t = setTimeout(go, 60)
    window.addEventListener('hashchange', go)
    return () => {
      clearTimeout(t)
      window.removeEventListener('hashchange', go)
    }
  }, [])
  return null
}
