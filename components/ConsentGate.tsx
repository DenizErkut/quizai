'use client'
// components/ConsentGate.tsx
//
// 18 Ağustos 2026 — Madde 7 (pratium-bekleyen-isler-uygulama-plani.md):
// versiyon değiştiğinde (CURRENT_CONSENT_VERSIONS, lib/identity/client.ts)
// kullanıcıya (ya da 18 yaş altıysa veli/öğrenciyle paylaşılan hesaba)
// yeniden onay ekranı gösterir. app/layout.tsx içinde, tüm uygulamayı
// saran UserProvider'ın içine monte edilir.
//
// FAIL-OPEN tasarım: TR-PG'ye erişilemezse ya da kimlik henüz yoksa
// (ör. kayıt akışı ortasında) kullanıcı KİLİTLENMEZ — sadece istek
// başarılı olur ve gerçekten eksik/eski bir onay varsa modal gösterilir.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const CONSENT_LABELS: Record<string, string> = {
  aydinlatma: 'Aydınlatma Metni',
  acik_riza_analiz: 'Açık Rıza (Veri Analizi)',
  veli_onayi: 'Veli Onayı',
}

export default function ConsentGate() {
  const supabase = createClient() as any
  const [needsReconsent, setNeedsReconsent] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { check() }, [])

  async function check() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return // oturum yoksa (login/register/misafir) hiçbir şey gösterme
      const res = await fetch('/api/auth/consent-status', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) return // fail-open
      const data = await res.json()
      setNeedsReconsent(data.needsReconsent || [])
    } catch {
      // fail-open — ağ/TR-PG sorunu kullanıcıyı uygulamadan kilitlemesin
    }
  }

  async function approve() {
    setSubmitting(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/auth/consent-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ types: needsReconsent }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Kaydedilemedi.')
      }
      setNeedsReconsent([])
    } catch (e: any) {
      setError(e.message || 'Bir hata oluştu, tekrar dene.')
    } finally {
      setSubmitting(false)
    }
  }

  if (needsReconsent.length === 0) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 5000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="card" style={{ maxWidth: '440px', width: '100%' }}>
        <div style={{ fontWeight: 700, fontSize: '15px', marginBottom: '8px' }}>📋 Şartlarımız güncellendi</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px', lineHeight: 1.6 }}>
          Devam edebilmek için aşağıdaki güncellenmiş şartları onaylaman gerekiyor:
          <ul style={{ marginTop: '8px', marginBottom: 0, paddingLeft: '20px' }}>
            {needsReconsent.map(t => <li key={t}>{CONSENT_LABELS[t] || t}</li>)}
          </ul>
        </div>
        {error && <div style={{ fontSize: '12px', color: 'var(--red)', marginBottom: '10px' }}>{error}</div>}
        <button disabled={submitting} onClick={approve} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
          {submitting ? 'Kaydediliyor...' : 'Onaylıyorum, devam et'}
        </button>
      </div>
    </div>
  )
}
