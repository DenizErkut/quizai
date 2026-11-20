'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { enableGoogleTag, disableGoogleTag, prepareGoogleTag } from '@/lib/google-tag'

type Choice = { analytics?: boolean }

// Google etiketi yalnızca "analiz çerezleri" izni varsa yüklenir (bkz. lib/google-tag.ts, Çerez Politikası §3-4).
export default function GoogleTag() {
  useEffect(() => {
    let cancelled = false
    prepareGoogleTag()
    const apply = (choice: Choice | null) => { if (choice?.analytics) enableGoogleTag(); else disableGoogleTag() }
    createClient().auth.getUser().then(({ data: { user } }) => {
      if (cancelled || !user) return
      try { apply(JSON.parse(localStorage.getItem(`pratium-cookie-consent:${user.id}`) || 'null') as Choice | null) } catch { /* kayıt okunamadı: rıza yok sayılır */ }
    })
    const onChange = (event: Event) => apply((event as CustomEvent<Choice>).detail)
    window.addEventListener('pratium:cookie-consent', onChange)
    return () => { cancelled = true; window.removeEventListener('pratium:cookie-consent', onChange) }
  }, [])
  return null
}
