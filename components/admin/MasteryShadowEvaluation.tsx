'use client'

import { useState } from 'react'

interface Summary { subject: string; sample_size: number; eligible_sample_size: number; v1_wins: number; v2_wins: number; ties: number; v1_mean_absolute_error: number | null; v2_mean_absolute_error: number | null; mean_absolute_error_improvement: number | null }
interface Recent { id: string; subject: string; topic: string; prior_event_count: number; days_since_practice: number | null; v1_predicted_mastery: number; v2_predicted_mastery: number; actual_score_pct: number; difficulty_adjustment: number; v1_absolute_error: number; v2_absolute_error: number; winning_model: 'v1' | 'v2' | 'tie'; is_eligible: boolean }

export default function MasteryShadowEvaluation() {
  const [data, setData] = useState<{ summary: Summary[]; recent: Recent[] } | null>(null)
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  async function load() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/mastery-shadow')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Gölge değerlendirme yüklenemedi.')
      setData(result)
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }
  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🌓 Mastery v1 / v2 Gölge Değerlendirmesi</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Aynı gerçek test sonucuna karşı iki test-öncesi tahmini karşılaştırır. v2 yalnızca ölçülür; öğrenci puanını ve önerileri değiştirmez.</div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Hesaplanıyor…' : 'Gölge raporunu yükle'}</button>
    {message && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{message}</div>}
    {data && <div style={{ marginTop: 10, display: 'grid', gap: 9, fontSize: 11 }}>
      {data.summary.map(row => <div key={row.subject} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
        <strong>{row.subject} · uygun örneklem {row.eligible_sample_size}/{row.sample_size}</strong>
        <div style={{ color: 'var(--text3)', marginTop: 3 }}>v1 hata: {row.v1_mean_absolute_error ?? '—'} · v2 hata: {row.v2_mean_absolute_error ?? '—'} · iyileşme: {row.mean_absolute_error_improvement ?? '—'} · galibiyet v1/v2/berabere: {row.v1_wins}/{row.v2_wins}/{row.ties}</div>
      </div>)}
      {data.recent.length > 0 && <div><strong>Son ölçümler</strong>{data.recent.slice(0, 20).map(row => <div key={row.id} style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
        {row.subject} → {row.topic} · v1 %{row.v1_predicted_mastery} / v2 %{row.v2_predicted_mastery} → gerçek %{row.actual_score_pct} · {row.is_eligible ? `kazanan: ${row.winning_model}` : 'örneklem dışı'}
      </div>)}</div>}
    </div>}
  </div>
}
