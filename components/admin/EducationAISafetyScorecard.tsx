'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Dimension = {
  key: string; label: string; status: 'measured' | 'not_measured'; score: number | null
  numerator: number | null; denominator: number | null; lastEvidenceAt: string | null; evidence: string[]; reason?: string
}
type Scorecard = {
  periodDays: number; overall: number | null; status: 'strong' | 'watch' | 'action_required' | 'insufficient_evidence'; generatedAt: string
  coverage: { measured: number; total: number }; dimensions: Dimension[]; alerts: { severity: string; message: string }[]
}

const tone = (score: number) => score >= 85 ? 'var(--green)' : score >= 70 ? 'var(--amber)' : 'var(--red)'
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) : '—'

export default function EducationAISafetyScorecard() {
  const [data, setData] = useState<Scorecard | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    void (async () => {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      const response = await fetch('/api/admin/ai-safety-scorecard', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (response.ok) setData(await response.json())
      else setError('Safety Scorecard yüklenemedi.')
    })()
  }, [])
  if (error) return <div className="card" style={{ color: 'var(--red)', marginBottom: 16 }}>{error}</div>
  if (!data) return <div className="card" style={{ marginBottom: 16 }}>Safety Scorecard hazırlanıyor…</div>
  return <section className="card" style={{ marginBottom: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 16 }}>
      <div>
        <div className="badge badge-purple" style={{ marginBottom: 6 }}>Education AI Safety Scorecard</div>
        <h2 className="serif" style={{ fontSize: 22 }}>Eğitim yapay zekâsı güvenlik görünümü</h2>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>Son {data.periodDays} gün · {data.coverage.measured}/{data.coverage.total} alan ölçüldü · {day(data.generatedAt)}</div>
      </div>
      {data.overall === null || data.status === 'insufficient_evidence'
        ? <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text3)', textAlign: 'right' }}>Genel puan için<br />yeterli kanıt yok{data.overall !== null && <div style={{ fontSize: 11, fontWeight: 500 }}>(ölçülen alanların ort.: {data.overall})</div>}</div>
        : <div style={{ fontSize: 38, fontWeight: 800, color: tone(data.overall) }}>{data.overall}<span style={{ fontSize: 14 }}>/100</span></div>}
    </div>
    {data.alerts.length > 0 && <div style={{ padding: 10, borderRadius: 10, background: 'var(--red-bg)', color: 'var(--red)', marginBottom: 12, fontSize: 12 }}>{data.alerts.map(a => <div key={a.message}>⚠️ {a.message}</div>)}</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
      {data.dimensions.map(d => <article key={d.key} style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12, opacity: d.status === 'measured' ? 1 : 0.85 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 13 }}>{d.label}</strong>
          {d.score === null ? <strong style={{ color: 'var(--text3)', fontSize: 12, whiteSpace: 'nowrap' }}>Ölçülmedi</strong> : <strong style={{ color: tone(d.score) }}>{d.score}</strong>}
        </div>
        {d.score !== null && <div style={{ height: 6, background: 'var(--bg2)', borderRadius: 99, margin: '9px 0', overflow: 'hidden' }}><div style={{ height: '100%', width: `${d.score}%`, background: tone(d.score) }} /></div>}
        {d.reason && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>{d.reason}</div>}
        {d.evidence.map(item => <div key={item} style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>• {item}</div>)}
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>Son kanıt: {day(d.lastEvidenceAt)}</div>
      </article>)}
    </div>
    <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 12 }}>Bu görünüm bir sertifika değildir. Yalnızca payda ve kaynak kaydı olan alanlar puanlanır; ölçülmeyen alanlar “Ölçülmedi” gösterilir ve genel puana katılmaz.</div>
  </section>
}
