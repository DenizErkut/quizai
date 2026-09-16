'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export const LIVE_DATA_REFRESH_EVENT = 'pratium:data-refresh'

export default function LiveDataRefresh() {
  const router = useRouter()

  useEffect(() => {
    let lastRefresh = 0
    const refresh = () => {
      if (document.visibilityState === 'hidden') return
      const now = Date.now()
      if (now - lastRefresh < 10_000) return
      lastRefresh = now
      router.refresh()
      window.dispatchEvent(new Event(LIVE_DATA_REFRESH_EVENT))
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) refresh()
    }

    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('online', refresh)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router])

  return null
}
