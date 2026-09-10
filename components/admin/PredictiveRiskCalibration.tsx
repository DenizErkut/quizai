'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
type Row = { level: string; sample_size: number; hits: number; false_positives: number; precision_pct: number | null }
type Recent = { subject: string; topic: string; risk_level: string; risk_score: number; actual_score_pct: number | null; outcome: string }

export default function PredictiveRiskCalibration() {
  const [data, setData] = useState<{ summary: Row[]; snapshot_count: number; completed_count: number; pending_count: number; recent: Recent[] } | null>(null)
  const [busy, setBusy] = useState(false)
  async function load() {
    setBusy(true)
    const { data: { session } } = await createClient().auth.getSession()
    const response = await fetch('/api/admin/predictive-risk-calibration', { headers: { Authorization: `Bearer ${session?.access_token}` } })
    if (response.ok) setData(await response.json())
    setBusy(false)
  }
  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>📐 Predictive Risk Kalibrasyonu v1</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Risk snapshot’ını izleyen 14 gün içindeki ilk öğrenme olayıyla isabet ve yanlış pozitif oranını ölçer.</div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Hesaplanıyor…' : 'Kalibrasyon raporunu yükle'}</button>
    {data && <div style={{ marginTop: 12, display: 'grid', gap: 8, fontSize: 11 }}>
      <div style={{ color: 'var(--text3)' }}>Snapshot: {data.snapshot_count} · değerlendirilen: {data.completed_count} · bekleyen: {data.pending_count}</div>
      {data.summary.map(row => <div key={row.level} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}><strong>{row.level === 'high' ? 'Yüksek' : 'Orta'} risk</strong><div style={{ color: 'var(--text3)', marginTop: 3 }}>Örneklem: {row.sample_size} · isabet: {row.hits} · yanlış pozitif: {row.false_positives} · isabet oranı: %{row.precision_pct ?? '—'}</div></div>)}
      {data.recent.slice(0, 8).map((row, index) => <div key={`${row.subject}-${row.topic}-${index}`} style={{ borderTop: '1px solid var(--border)', paddingTop: 5, color: 'var(--text3)' }}>{row.subject} → {row.topic} · {row.risk_level} · {row.actual_score_pct == null ? 'takip bekliyor' : `sonraki skor %${row.actual_score_pct} · ${row.outcome === 'at_risk' ? 'isabet' : 'toparlandı'}`}</div>)}
    </div>}
  </div>
}
