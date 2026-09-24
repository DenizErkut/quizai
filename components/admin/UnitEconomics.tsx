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

const LEARNING_METRIC_LABELS: Record<string, string> = {
  mastery: 'Mastery değişimi',
  retention: '7 günlük kalıcılık değişimi',
  test_pct: 'Test başarısı değişimi',
}

type UnitEconomicsData = {
  narrative?: string
  missing_sources?: string[]
  cost?: {
    platform_cost_usd_30d: number | null
    cost_per_test_usd: number | null
    cost_per_student_usd: number | null
    cost_per_test_sample: number | null
    cost_per_student_sample: number | null
    coach_share_of_platform: number | null
    pricing?: {
      total_calls?: number | null
      priced_calls?: number | null
      unknown_pricing_calls?: number | null
      unknown_pricing_tokens?: number | null
      legacy_unclassified_calls?: number | null
      pricing_coverage?: number | null
    } | null
  } | null
  usage?: {
    adoption_rate: number | null
    eligible_students: number | null
    active_users_30d: number | null
    avg_messages_per_active_user: number | null
    click_through_rate: number | null
  } | null
  learning_outcome?: {
    claim_status: string | null
    claim_message: string | null
    cohort_sample_sizes: Array<{ cohort: string; completed_sample: number }>
    primary_metrics?: Array<{ metric: string; difference: number; confidence_interval_95: number[] }>
    minimum_interpretation_sample: number | null
    isolation_note: string | null
  } | null
  financial_completeness?: { revenue_included: boolean }
}

export default function UnitEconomics() {
  const supabase = createClient()
  const [data, setData] = useState<UnitEconomicsData | null>(null)
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
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>kayıtlara geçen AI maliyeti</div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.8 }}>
                Test başına: <strong>{usd(data.cost.cost_per_test_usd)}</strong><br />
                AI kullanılan öğrenci başına: <strong>{usd(data.cost.cost_per_student_usd)}</strong><br />
                Koç&apos;un payı: <strong>{pct(data.cost.coach_share_of_platform)}</strong>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: 8 }}>
                Birim maliyet örneklemi: {data.cost.cost_per_test_sample ?? '—'} test · {data.cost.cost_per_student_sample ?? '—'} öğrenci
              </div>
              {data.cost.pricing && (
                <div style={{ fontSize: '11px', color: data.cost.pricing.unknown_pricing_calls ? '#8a5200' : 'var(--text3)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  Fiyatı bilinen çağrılar: {data.cost.pricing.priced_calls ?? 0} / {data.cost.pricing.total_calls ?? 0} · kapsam %{data.cost.pricing.pricing_coverage == null ? '—' : Math.round(data.cost.pricing.pricing_coverage * 100)}<br />
                  Fiyatı tanımsız: {data.cost.pricing.unknown_pricing_calls ?? 0} çağrı · {data.cost.pricing.unknown_pricing_tokens ?? 0} token
                  {(data.cost.pricing.legacy_unclassified_calls ?? 0) > 0 && <><br />Eski kayıtlarda fiyat bilgisi yok: {data.cost.pricing.legacy_unclassified_calls}</>}
                  {((data.cost.pricing.unknown_pricing_calls ?? 0) > 0 || (data.cost.pricing.legacy_unclassified_calls ?? 0) > 0) && <><br />⚠️ Fiyatı tanımsız/eskiden sınıflandırılmamış çağrılar yüzünden gerçek maliyet daha yüksek olabilir.</>}
                </div>
              )}
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
                {(data.learning_outcome.cohort_sample_sizes || []).map(c => `${c.cohort}: ${c.completed_sample}`).join(' · ')}
              </div>
              {data.learning_outcome.primary_metrics?.length > 0 && (
                <div style={{ marginTop: 8, fontSize: '12px', color: 'var(--text2)', lineHeight: 1.8 }}>
                  {data.learning_outcome.primary_metrics.map(metric => (
                    <div key={metric.metric}>
                      {LEARNING_METRIC_LABELS[metric.metric] || metric.metric}: adaptive − standard <strong>{metric.difference > 0 ? '+' : ''}{metric.difference}</strong>
                      {Array.isArray(metric.confidence_interval_95) && <> · %95 aralık [{metric.confidence_interval_95[0]}, {metric.confidence_interval_95[1]}]</>}
                    </div>
                  ))}
                </div>
              )}
              {data.learning_outcome.minimum_interpretation_sample && <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: 6 }}>Yorum eşiği: kohort başına en az {data.learning_outcome.minimum_interpretation_sample} tamamlanmış ölçüm.</div>}
              {data.learning_outcome.isolation_note && (
                <div style={{ fontSize: '11px', color: '#8a5200', marginTop: '8px' }}>⚠️ {data.learning_outcome.isolation_note}</div>
              )}
            </>
          ) : <div style={{ color: 'var(--text3)', fontSize: '13px' }}>Veri yok</div>}
        </div>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text3)' }}>
        Detaylı kırılımlar için: 📊 İstatistikler (maliyet detayı &quot;Pipeline Health&quot;), 🎓 Koç Kullanımı, 🧪 Adaptive Pilot sekmeleri.
      </p>
      {data.financial_completeness?.revenue_included === false && <p style={{ fontSize: '12px', color: '#8a5200' }}>⚠️ Bu henüz tam kârlılık hesabı değil: ödeme geliri, PayTR komisyonu/iade ve brüt marj dahil değil.</p>}
    </div>
  )
}
