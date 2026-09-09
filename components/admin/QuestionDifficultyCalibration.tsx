'use client'

import { useState } from 'react'

interface LabelRow { subject: string; grade: string | null; assigned_difficulty: string; sample_size: number; eligible_sample_size: number; eligible_students: number; avg_predicted_success_pct: number | null; avg_actual_score_pct: number | null; mean_signed_error: number | null; mean_absolute_error: number | null; calibration_status: string }
interface ItemRow { question_id: string; subject: string; topic: string; assigned_difficulty: string; attempts: number; unique_students: number; observed_success_pct: number; expected_success_pct: number; mean_signed_error: number }

const labels: Record<string, string> = { easy: 'Kolay', normal: 'Normal', hard: 'Zor', very_hard: 'Çok zor' }
const statuses: Record<string, string> = { insufficient_sample: 'Örneklem yetersiz', easier_than_label: 'Etiketinden daha kolay', harder_than_label: 'Etiketinden daha zor', calibrated: 'Dengeli' }

export default function QuestionDifficultyCalibration() {
  const [data, setData] = useState<{ labels: LabelRow[]; items: ItemRow[] } | null>(null)
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('')
  async function load() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/question-difficulty-calibration')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Zorluk kalibrasyonu yüklenemedi.')
      setData(result)
    } catch (error) { setMessage(`❌ ${error instanceof Error ? error.message : 'Beklenmeyen hata'}`) }
    finally { setBusy(false) }
  }
  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>⚖️ Soru Zorluk Kalibrasyonu v1</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Üretim zorluk etiketini, öğrencinin konu mastery seviyesi hesaba katıldıktan sonraki gerçek başarısıyla karşılaştırır. Sonuçlar şimdilik yalnızca ölçümdür.</div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Hesaplanıyor…' : 'Zorluk raporunu yükle'}</button>
    {message && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 12 }}>{message}</div>}
    {data && <div style={{ marginTop: 10, display: 'grid', gap: 9, fontSize: 11 }}>
      {data.labels.map((row, index) => <div key={`${row.subject}-${row.grade}-${row.assigned_difficulty}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 9 }}>
        <strong>{row.subject}{row.grade ? ` · ${row.grade}` : ''} · {labels[row.assigned_difficulty] || row.assigned_difficulty}</strong>
        <div style={{ color: 'var(--text3)', marginTop: 3 }}>Uygun örneklem: {row.eligible_sample_size}/{row.sample_size} · öğrenci: {row.eligible_students} · beklenen: %{row.avg_predicted_success_pct ?? '—'} · gerçek: %{row.avg_actual_score_pct ?? '—'} · {statuses[row.calibration_status] || row.calibration_status}</div>
      </div>)}
      {data.items.length > 0 && <div><strong>Yeterli tekrarı olan tekil sorular</strong>{data.items.map(row => <div key={`${row.question_id}-${row.assigned_difficulty}`} style={{ marginTop: 5, paddingTop: 5, borderTop: '1px solid var(--border)' }}>
        {row.subject} → {row.topic} · {row.attempts} yanıt/{row.unique_students} öğrenci · beklenen %{row.expected_success_pct} → gerçek %{row.observed_success_pct}
      </div>)}</div>}
    </div>}
  </div>
}
