'use client'
// components/ChildConsentStatus.tsx
//
// 18 Ağustos 2026 — Madde 7 (pratium-bekleyen-isler-uygulama-plani.md):
// veli panelinde çocuğun rıza (consent) durumunun salt-okunur görünürlüğü.
// app/parent/page.tsx'teki seçili çocuk kartına embed edilir.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const CONSENT_LABELS: Record<string, string> = {
  aydinlatma: 'Aydınlatma Metni',
  acik_riza_analiz: 'Açık Rıza (Veri Analizi)',
  veli_onayi: 'Veli Onayı',
}

export default function ChildConsentStatus({ childId }: { childId: string }) {
  const supabase = createClient() as any
  const [status, setStatus] = useState<any[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/parent/child-consent?childId=${childId}`, {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        const data = await res.json()
        if (!cancelled) setStatus(res.ok ? (data.status || []) : null)
      } catch {
        if (!cancelled) setStatus(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [childId])

  if (loading || !status || status.length === 0) return null

  return (
    <div className="card" style={{ marginTop: '1rem' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
        📋 Rıza Durumu
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {status.map((s: any) => (
          <div key={s.consentType} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
            <span>{CONSENT_LABELS[s.consentType] || s.consentType}</span>
            <span style={{
              padding: '2px 8px', borderRadius: '99px', fontWeight: 600,
              color: s.needsReconsent ? 'var(--red)' : s.latestGranted ? 'var(--green)' : 'var(--text3)',
              background: s.needsReconsent ? 'var(--red-bg)' : s.latestGranted ? 'var(--green-bg)' : 'var(--bg2)',
            }}>
              {s.needsReconsent ? '⏳ Güncel onay bekleniyor' : s.latestGranted ? '✓ Onaylandı' : '✗ Onaylanmadı'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
