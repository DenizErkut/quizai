'use client'

import { useEffect, useState } from 'react'

type Data = {
  events: { total: number; objectiveLinked: number }; bank: { approved: number; objectiveLinked: number };
  completedTransferChecks: number; teacherReviewedGainMeasurements: number;
  verifiedInventory: { objectiveId: string; code: string; count: number; difficulty: Record<string, number> }[];
  warning: string
}

export default function LearningEvidenceReadiness() {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    fetch('/api/admin/learning-evidence-readiness').then(async response => {
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Durum alınamadı.')
      setData(body)
    }).catch(reason => setError(reason instanceof Error ? reason.message : 'Durum alınamadı.'))
  }, [])
  if (error) return <p role="alert">{error}</p>
  if (!data) return <p>Kanıt hazırlığı yükleniyor…</p>
  const ratio = (numerator: number, denominator: number) => denominator ? `%${Math.round(numerator / denominator * 100)}` : '—'
  return <section style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
    <h3 style={{ fontSize: 16, marginBottom: 8 }}>Öğrenme kanıtı hazırlığı</h3>
    <p style={{ margin: '4px 0' }}>Kazanıma bağlı öğrenme olayı: {data.events.objectiveLinked}/{data.events.total} ({ratio(data.events.objectiveLinked, data.events.total)})</p>
    <p style={{ margin: '4px 0' }}>Kazanıma bağlı onaylı havuz sorusu: {data.bank.objectiveLinked}/{data.bank.approved} ({ratio(data.bank.objectiveLinked, data.bank.approved)})</p>
    <p style={{ margin: '4px 0' }}>Tamamlanmış gecikmeli kontrol: {data.completedTransferChecks} · Öğretmen incelemeli kazanım ölçümü: {data.teacherReviewedGainMeasurements}</p>
    <details style={{ marginTop: 8 }}><summary style={{ cursor: 'pointer' }}>Doğrulanmış soru stoğu (ilk 20 kazanım)</summary>
      {data.verifiedInventory.map(row => <div key={row.objectiveId} style={{ fontSize: 13, padding: '5px 0' }}>{row.code || row.objectiveId}: {row.count} soru · {Object.entries(row.difficulty).map(([key, value]) => `${key} ${value}`).join(', ')}</div>)}
    </details>
    <small style={{ color: 'var(--text3)' }}>{data.warning}</small>
  </section>
}
