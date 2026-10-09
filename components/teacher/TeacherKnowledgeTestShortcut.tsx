'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// The bar is always there; when the periodic AI test is due (every 10 days) the button blinks.
export default function TeacherKnowledgeTestShortcut() {
  const pathname = usePathname()
  const [due, setDue] = useState(false)
  const [level, setLevel] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: { session } } = await createClient().auth.getSession()
        if (!session?.access_token) return
        const response = await fetch('/api/teacher/ai-quiz', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store' })
        const data = await response.json().catch(() => null)
        if (!cancelled && response.ok && data) { setDue(Boolean(data.due)); setLevel(data.level ?? null) }
      } catch { /* the shortcut still works without the status */ }
    })()
    return () => { cancelled = true }
  }, [pathname])

  if (pathname === '/teacher/ai-training') return null

  return (
    <div style={{ background: '#173f52', padding: '10px 20px', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
      <style>{`@keyframes pratium-blink{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(255,214,102,.9)}50%{opacity:.55;box-shadow:0 0 0 10px rgba(255,214,102,0)}}.pratium-blink{animation:pratium-blink 1.1s ease-in-out infinite}@media (prefers-reduced-motion: reduce){.pratium-blink{animation:none;outline:3px solid #ffd666}}`}</style>
      <span style={{ color: '#fff', fontSize: '14px', fontWeight: 600 }}>
        {due ? `Yeni AI bilgi testin hazır${level ? ` (Seviye ${level})` : ''}!` : 'Öğretmen bilgi testine hazır mısınız?'}
      </span>
      <Link href="/teacher/ai-training" className={due ? 'pratium-blink' : undefined} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '40px', padding: '8px 18px', borderRadius: '10px', background: due ? '#ffd666' : '#fff', color: '#173f52', fontSize: '14px', fontWeight: 800, textDecoration: 'none', ...(due ? {} : { boxShadow: '0 3px 10px rgba(0,0,0,0.15)' }) }}>
        🎓 Öğretmen Bilgi Testi →
      </Link>
    </div>
  )
}
