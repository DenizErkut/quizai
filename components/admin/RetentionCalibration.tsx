'use client'

import { useState } from 'react'

interface Summary { subject: string; interval_bucket: string; sample_size: number; eligible_sample_size: number; avg_repeat_interval_days: number | null; avg_prior_mastery: number | null; avg_predicted_retention: number | null; avg_predicted_recall_pct: number | null; avg_actual_score_pct: number | null; mean_absolute_error: number | null }
interface Recent { id: string; subject: string; topic: string; repeat_interval_days: number | null; prior_event_count: number; prior_mastery: number; predicted_retention: number; predicted_recall_pct: number; actual_score_pct: number; absolute_error: number; interval_bucket: string; is_eligible: boolean }

const bucketLabel: Record<string, string> = { same_day: 'Aynı gün', '1_6_days': '1–6 gün', '7_13_days': '7–13 gün', '14_29_days': '14–29 gün', '30_plus_days': '30+ gün' }

export default function RetentionCalibration() {
  const [data, setData] = useState<{ summary: Summary[]; recent: Recent[] } | null>(null)
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  async function load() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/retention-calibration')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Retention raporu yüklenemedi.')
      setData(result)
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }
  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🧠 Retention Kalibrasyonu v1</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Önceki mastery ve aradan geçen süreden beklenen hatırlamayı, öğrencinin tekrar testindeki gerçek başarısıyla karşılaştırır. Aynı gün tekrarları ana örnekleme alınmaz.</div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Hesaplanıyor…' : 'Retention raporunu yükle'}</button>
    {message && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{message}</div>}
    {data && <div style={{ marginTop: 10, display: 'grid', gap: 9, fontSize: 11 }}>
      {data.summary.length === 0 && <div style={{ color: 'var(--text3)' }}>Henüz ölçülebilir tekrar testi yok.</div>}
      {data.summary.map((row, index) => <div key={`${row.subject}-${row.interval_bucket}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
        <strong>{row.subject} · {bucketLabel[row.interval_bucket] || row.interval_bucket}</strong>
        <div style={{ color: 'var(--text3)', marginTop: 3 }}>Uygun örneklem: {row.eligible_sample_size}/{row.sample_size} · beklenen hatırlama: %{row.avg_predicted_recall_pct ?? '—'} · gerçek: %{row.avg_actual_score_pct ?? '—'} · mutlak hata: {row.mean_absolute_error ?? '—'}</div>
      </div>)}
      {data.recent.length > 0 && <div><strong>Son tekrarlar</strong>{data.recent.slice(0, 20).map(row => <div key={row.id} style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
        {row.subject} → {row.topic} · {row.repeat_interval_days === null ? 'ilk kanıt' : `${Number(row.repeat_interval_days).toFixed(1)} gün`} · beklenen %{row.predicted_recall_pct} → gerçek %{row.actual_score_pct} · {row.is_eligible ? 'ölçüme dahil' : 'örneklem dışı'}
      </div>)}</div>}
    </div>}
  </div>
}

