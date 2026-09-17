'use client'
// components/CoachMascot.tsx — Pratium Koç'un global maskot ikonu.
//
// 17 Eylül 2026 — Deniz'in isteği: "Koç ikonu tüm ekranlarda olsun ve ben
// buradayım desin, tepesinde bir baloncuk çıksın ve hadi şimdi birlikte
// çalışalım tarzı bir mesaj versin." Faz E/D'de bu ikon sadece
// app/dashboard/page.tsx'e gömülüydü (sadece ana sayfada görünüyordu) —
// bu bileşen onu app/layout.tsx'e taşıyarak GERÇEKTEN her sayfada
// (dashboard, /quiz, /analysis, her yerde) görünür hale getiriyor, ve
// AIChatBot'un (bkz. components/AIChatBot.tsx) "Merhaba, ben Prati!"
// balonuyla aynı kalıpta kendi davetkâr balonunu ekliyor.
//
// AIChatBot sağ altta (genel satış/destek asistanı), bu ikon sol altta
// (kişisel koç) — birbirlerinin üstüne binmiyorlar.
//
// useUser() UserProvider içinde çağrılmalı — bu yüzden layout.tsx'te
// <UserProvider> içine, AIChatBot'un DIŞINDA monte ediliyor.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useUser } from '@/lib/user-context'
import { createClient } from '@/lib/supabase/client'

export default function CoachMascot() {
  const { user, loading, isTeacher, isParent, isInstitution } = useUser()
  const [unread, setUnread] = useState(0)
  const [bubbleDismissed, setBubbleDismissed] = useState(false)

  useEffect(() => {
    if (!user) { setUnread(0); return }
    let cancelled = false
    async function loadUnread() {
      const supabase = createClient() as any
      const { count } = await supabase.from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id).eq('type', 'coach_nudge').eq('read', false)
      if (!cancelled) setUnread(count || 0)
    }
    void loadUnread()
    return () => { cancelled = true }
  }, [user])

  // Koç sadece öğrenciler için — öğretmen/veli/kurum hesaplarında
  // gösterilmiyor (bu hesaplar zaten /koc'a erişemez, kendi verisi yok).
  if (loading || !user || isTeacher || isParent || isInstitution) return null

  return (
    <>
      {!bubbleDismissed && (
        <div
          onClick={() => setBubbleDismissed(true)}
          style={{
            position: 'fixed', bottom: '100px', left: '24px', zIndex: 9998,
            maxWidth: '220px',
            background: '#fff',
            borderRadius: '18px 18px 18px 4px',
            padding: '12px 16px',
            boxShadow: '0 10px 32px rgba(41,72,61,0.2)',
            border: '1.5px solid rgba(168,85,247,0.25)',
            cursor: 'pointer',
            animation: 'coachBubbleUp 0.3s ease',
          }}
        >
          <button
            onClick={e => { e.stopPropagation(); setBubbleDismissed(true) }}
            aria-label="Kapat"
            style={{
              position: 'absolute', top: '-8px', right: '-8px',
              width: 22, height: 22, borderRadius: '50%',
              background: '#fff', border: '1.5px solid #e2e8f0',
              color: '#64748b', fontSize: '13px', lineHeight: 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
            }}
          >×</button>
          <Link href="/koc" style={{ textDecoration: 'none' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#082465', marginBottom: '2px' }}>
              Ben buradayım! ✦
            </div>
            <div style={{ fontSize: '12.5px', color: '#475569', lineHeight: 1.5 }}>
              Hadi şimdi birlikte çalışalım — sana özel önerim var 💪
            </div>
          </Link>
          {/* balon kuyruğu */}
          <div style={{
            position: 'absolute', bottom: '-8px', left: '28px',
            width: 0, height: 0,
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid #fff',
            filter: 'drop-shadow(0 2px 1px rgba(41,72,61,0.06))',
          }} />
        </div>
      )}

      <Link href="/koc" aria-label="Pratium Koç ile sohbet et" onClick={() => setBubbleDismissed(true)}
        style={{
          position: 'fixed', bottom: '24px', left: '24px', zIndex: 9998,
          width: 68, height: 68, borderRadius: '20px',
          background: '#fff', border: '2px solid rgba(168,85,247,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 28px rgba(41,72,61,0.25)', textDecoration: 'none',
        }}>
        <span style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', padding: '6px' }}>
          <img src="/mascot-prati-face-v2.webp" alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </span>
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, height: 20, padding: '0 4px', borderRadius: '999px', background: '#a855f7', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
            {unread}
          </span>
        )}
      </Link>

      <style>{`
        @keyframes coachBubbleUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  )
}
