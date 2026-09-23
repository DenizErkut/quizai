'use client'
// components/admin/UnitEconomics.tsx — Birleşik "birim ekonomisi" görünümü.
//
// 23 Eylül 2026 — bkz. app/api/admin/unit-economics/route.ts başlık
// yorumu. Bilinçli tasarım: mevcut PipelineHealth/CoachAnalytics/
// AdaptiveStatistics panellerini KALDIRMIYOR — onlar detay/derinlik için
// kalıyor. Bu bileşen sadece üçünü tek bir üst-özet/anlatıya bağlıyor,
// admin panelinin en üstünde ayrı bir sekme olarak.
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

function pct(value: number | null): string {
  return value == null ? '—' : `%${Math.round(value * 100)}`
}
function usd(value: number | null): string {
  if (value == null) return '—'
  return `$${value.toFixed(value < 1 ? 4 : 2)}`
}

const CLAIM_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  supported_by_pilot: { label: '✅ Pilot veriyle destekleniyor', color: 'var(--green)' },
  not_demonstrated: { label: '🟡 Henüz gösterilemedi', color: '#d97706' },
  insufficient_data: { label: '⚪ Yetersiz veri', color: 'var(--text3)' },
}

export default function UnitEconomics() {
  const supabase = createClient() as any
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch('/api/admin/unit-economics', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        })
        const json = await res.json()
        if (!res.ok) { if (!cancelled) setError(json.error || 'Yüklenemedi.'); return }
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setError('Bağlantı hatası.')
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
  if (error) return <p style={{ color: 'var(--red)', fontSize: '13px' }}>{error}</p>
  if (!data) return null

  const claimInfo = data.learning_outcome?.claim_status ? CLAIM_STATUS_LABELS[data.learning_outcome.claim_status] : null

  return (
    <div>
      {data.narrative && (
        <div className="card" style={{ marginBottom: '1.25rem', background: 'var(--bg2)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
            📌 Tek Cümlede Birim Ekonomisi
          </div>
          <p style={{ fontSize: '14px', lineHeight: 1.7 }}>{data.narrative}</p>
        </div>
      )}

      {data.missing_sources?.length > 0 && (
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '1rem' }}>
          ⚠️ Şu kaynaklardan veri alınamadı, aşağıdaki kartlar eksik olabilir: {data.missing_sources.join(', ')}
        </p>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card">
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>💰 Maliyet (30 gün)</div>
          {data.cost ? (
            <>
              <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>{usd(data.cost.platform_cost_usd_30d)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>toplam platform maliyeti</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.8 }}>
                Test başına: <strong>{usd(data.cost.cost_per_test_usd)}</strong><br />
                Öğrenci başına: <strong>{usd(data.cost.cost_per_student_usd)}</strong><br />
                Koç'un payı: <strong>{pct(data.cost.coach_share_of_platform)}</strong>
              </div>
            </>
          ) : <div style={{ color: 'var(--text3)', fontSize: '13px' }}>Veri yok</div>}
        </div>

        <div className="card">
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>🎓 Kullanım (Koç)</div>
          {data.usage ? (
            <>
              <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>{pct(data.usage.adoption_rate)}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>benimseme oranı ({data.usage.eligible_students ?? '—'} uygun öğrenci)</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.8 }}>
                30 günlük aktif kullanıcı: <strong>{data.usage.active_users_30d ?? '—'}</strong><br />
                Kullanıcı başına mesaj: <strong>{data.usage.avg_messages_per_active_user != null ? data.usage.avg_messages_per_active_user.toFixed(1) : '—'}</strong><br />
                Öneri tıklama oranı: <strong>{pct(data.usage.click_through_rate)}</strong>
              </div>
            </>
          ) : <div style={{ color: 'var(--text3)', fontSize: '13px' }}>Veri yok</div>}
        </div>

        <div className="card">
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>📈 Öğrenme Sonucu</div>
          {data.learning_outcome ? (
            <>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '8px', color: claimInfo?.color || 'var(--text)' }}>
                {claimInfo?.label || data.learning_outcome.claim_status}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '8px' }}>{data.learning_outcome.claim_message}</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                {(data.learning_outcome.cohort_sample_sizes || []).map((c: any) => `${c.cohort}: ${c.completed_sample}`).join(' · ')}
              </div>
              {data.learning_outcome.isolation_note && (
                <div style={{ fontSize: '11px', color: '#8a5200', marginTop: '8px' }}>⚠️ {data.learning_outcome.isolation_note}</div>
              )}
            </>
          ) : <div style={{ color: 'var(--text3)', fontSize: '13px' }}>Veri yok</div>}
        </div>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
        Detaylı kırılımlar için: 📊 İstatistikler (maliyet detayı "Pipeline Health"), 🎓 Koç Kullanımı, 🧪 Adaptive Pilot sekmeleri.
      </p>
    </div>
  )
}
