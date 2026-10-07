'use client'
import { useState } from 'react'

type Link = { key: string; label: string; state: 'done' | 'missing'; at: string | null }
type Row = {
  cycleId: string; studentId: string; status: string; createdAt: string; links: Link[]; complete: boolean; firstMissing: string | null; warnings: string[]
  scores: { baseline: number | null; post: number | null; transfer: number | null }; gapsDays: { baselineToPost: number | null; postToTransfer: number | null }
  delayedChecks: { total: number; completed: number }; objective: { objective_code: string | null; subject: string | null; grade: string | null; topic: string | null } | null
}
type Report = { generatedAt: string; totals: { cycles: number; completeChains: number; students: number; objectives: number; byLink: Record<string, number>; withWarnings: number }; rows: Row[] }

const WARNING: Record<string, string> = {
  pre_post_gap_out_of_range: 'Ön/son test aralığı 1–90 gün dışında', out_of_order: 'Aşamalar zaman sırasına uymuyor',
  cycle_completed_with_missing_links: 'Döngü “tamamlandı” ama halka eksik',
}
const day = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }) : ''

export default function LearningChainAudit() {
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function load() {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/learning-chain-audit')
    const result = await response.json()
    if (response.ok) setReport(result)
    else setMessage(`❌ ${result.error || 'Rapor yüklenemedi.'}`)
    setBusy(false)
  }

  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🔗 Öğrenme Döngüsü Zincir Denetimi</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Öğretmenin atadığı her döngü için halkalar: ön test → rehberli çalışma → son test → öğretmen incelemesi → aktarım testi → aktarım incelemesi. Salt okunur; ilk eksik halka vurgulanır.</div>
    <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Hesaplanıyor…' : 'Denetimi çalıştır'}</button>
    {message && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{message}</div>}
    {report && <>
      <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.7 }}>
        <strong>{report.totals.cycles}</strong> döngü · <strong>{report.totals.students}</strong> öğrenci · <strong>{report.totals.objectives}</strong> kazanım · tam zincir: <strong>{report.totals.completeChains}</strong>
        {report.totals.students < 5 && <div style={{ color: '#b45309' }}>⚠️ Bu veri {report.totals.students} öğrenciye dayanıyor; genelleme için kanıt değildir.</div>}
      </div>
      <div style={{ display: 'grid', gap: 9, marginTop: 10 }}>
        {report.rows.map(row => <div key={row.cycleId} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{row.objective?.objective_code ?? 'Kazanım'} · {row.objective?.subject} {row.objective?.grade} · öğrenci …{row.studentId}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>{row.objective?.topic} · döngü {row.status === 'completed' ? 'tamamlandı' : row.status === 'active' ? 'aktif' : row.status} · başlangıç {day(row.createdAt)}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {row.links.map(link => <span key={link.key} style={{
              fontSize: 11, padding: '3px 8px', borderRadius: 99, border: '1px solid var(--border)',
              background: link.state === 'done' ? 'rgba(22,163,74,0.12)' : link.key === row.firstMissing ? 'rgba(220,38,38,0.12)' : 'transparent',
              color: link.state === 'done' ? '#15803d' : link.key === row.firstMissing ? '#b91c1c' : 'var(--text3)' }}>
              {link.state === 'done' ? '✓' : link.key === row.firstMissing ? '✕' : '○'} {link.label}{link.at ? ` · ${day(link.at)}` : ''}
            </span>)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6 }}>
            Puan: ön {row.scores.baseline ?? '—'} → son {row.scores.post ?? '—'} → aktarım {row.scores.transfer ?? '—'} ·
            ön→son {row.gapsDays.baselineToPost ?? '—'} gün · son→aktarım {row.gapsDays.postToTransfer ?? '—'} gün ·
            gecikmeli tek maddelik kontrol (ayrı hat): {row.delayedChecks.completed}/{row.delayedChecks.total}
          </div>
          {row.warnings.length > 0 && <div style={{ fontSize: 11, color: '#b45309', marginTop: 4 }}>⚠️ {row.warnings.map(w => WARNING[w] ?? w).join(' · ')}</div>}
        </div>)}
        {report.rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Henüz döngü yok.</div>}
      </div>
    </>}
  </div>
}
