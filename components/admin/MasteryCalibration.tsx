'use client'

import { useState } from 'react'

interface Summary {
  subject: string; algorithm_version: string; calibration_bin: number
  predicted_range_start: number; predicted_range_end: number; sample_size: number
  eligible_sample_size: number; avg_predicted_mastery: number | null
  avg_actual_score_pct: number | null; mean_signed_error: number | null
  mean_absolute_error: number | null; root_mean_squared_error: number | null
}
interface Recent {
  id: string; subject: string; topic: string; predicted_mastery: number
  prediction_confidence: number; prior_event_count: number; actual_score_pct: number
  signed_error: number; absolute_error: number; is_eligible: boolean; algorithm_version: string
}

export default function MasteryCalibration() {
  const [data, setData] = useState<{ summary: Summary[]; recent: Recent[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/mastery-calibration')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kalibrasyon raporu yüklenemedi.')
      setData(result)
    } catch (error) {
      setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`)
    } finally { setBusy(false) }
  }

  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🎯 Mastery Kalibrasyonu v1</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>
      Test öncesi mastery tahminini sonraki gerçek test başarısıyla karşılaştırır. En az üç önceki sorusu olan satırlar kalibrasyon örneklemine alınır.
    </div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Hesaplanıyor…' : 'Kalibrasyon raporunu yükle'}</button>
    {message && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{message}</div>}
    {data && <div style={{ marginTop: 10, display: 'grid', gap: 9, fontSize: 11 }}>
      {data.summary.length === 0 && <div style={{ color: 'var(--text3)' }}>Henüz ölçülebilir test yok.</div>}
      {data.summary.map((row) => <div key={`${row.subject}-${row.algorithm_version}-${row.calibration_bin}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
        <strong>{row.subject} · %{row.predicted_range_start}–{row.predicted_range_end} tahmin bandı</strong>
        <div style={{ color: 'var(--text3)', marginTop: 3 }}>
          Uygun örneklem: {row.eligible_sample_size}/{row.sample_size} · ortalama tahmin: %{row.avg_predicted_mastery ?? '—'} · gerçek: %{row.avg_actual_score_pct ?? '—'} · mutlak hata: {row.mean_absolute_error ?? '—'}
        </div>
      </div>)}
      {data.recent.length > 0 && <div><strong>Son ölçümler</strong>{data.recent.slice(0, 20).map(row => <div key={row.id} style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
        {row.subject} → {row.topic} · tahmin %{row.predicted_mastery} → gerçek %{row.actual_score_pct} · hata {row.absolute_error} · {row.is_eligible ? `${row.prior_event_count} önceki kanıt` : 'örneklem dışı (az kanıt)'}
      </div>)}</div>}
    </div>}
  </div>
}

