'use client'
import { useState } from 'react'

type Row = { id: string; grade: string; subject: string; status: 'ok' | 'needs_backfill' | 'no_catalog_match' | 'ambiguous_grade'
  storedTopics: number; derivedTopics: number; missingTopics: number; currentObjectives: number; otherObjectives: number }
type Report = {
  generatedAt: string
  totals: { catalogRows: number; currentObjectives: number; otherObjectives: number; curriculumRows: number; ok: number; needsBackfill: number; noCatalogMatch: number; ambiguousGrade: number }
  rows: Row[]; orphanGroups: { grade: string | null; subject: string | null; objectives: number }[]
}

const LABEL: Record<Row['status'], string> = {
  ok: 'Tamam', needs_backfill: 'Konu eklenebilir', no_catalog_match: 'Katalogda eşleşme yok', ambiguous_grade: 'Sınıf belirsiz',
}

export default function CurriculumCoverage() {
  const [report, setReport] = useState<Report | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [onlyProblems, setOnlyProblems] = useState(true)

  async function load() {
    setBusy(true); setMessage('')
    const response = await fetch('/api/admin/curriculum-coverage')
    const result = await response.json()
    if (response.ok) setReport(result)
    else setMessage(`❌ ${result.error || 'Rapor yüklenemedi.'}`)
    setBusy(false)
  }

  const rows = (report?.rows || []).filter(row => !onlyProblems || row.status !== 'ok')
  return <div className="card" style={{ marginBottom: '1rem' }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>🧮 Müfredat–Katalog Kapsam Raporu</div>
    <div style={{ fontSize: 12, color: 'var(--text3)', margin: '4px 0 10px' }}>Her müfredat satırı için katalogdaki güncel kazanım sayısı, çıkarılabilen konu sayısı ve “0 konu” nedeni. Katalog sayfalanarak tamamen okunur.</div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <button className="btn btn-sm" disabled={busy} onClick={load}>{busy ? 'Hesaplanıyor…' : 'Raporu oluştur'}</button>
      <label style={{ fontSize: 12 }}><input type="checkbox" checked={onlyProblems} onChange={event => setOnlyProblems(event.target.checked)} /> Yalnızca sorunlular</label>
    </div>
    {message && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 8 }}>{message}</div>}
    {report && <>
      <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.7 }}>
        Katalog: <strong>{report.totals.catalogRows}</strong> satır ({report.totals.currentObjectives} güncel, {report.totals.otherObjectives} taslak/eski/inceleme bekleyen) ·
        Müfredat satırı: <strong>{report.totals.curriculumRows}</strong> — tamam {report.totals.ok}, konu eklenebilir {report.totals.needsBackfill}, katalogda eşleşme yok {report.totals.noCatalogMatch}, sınıf belirsiz {report.totals.ambiguousGrade}
      </div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--text3)' }}><th>Sınıf</th><th>Ders</th><th>Durum</th><th>Kayıtlı konu</th><th>Katalogdan konu</th><th>Eksik konu</th><th>Güncel kazanım</th><th>Diğer kazanım</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
            <td>{row.grade}</td><td>{row.subject}</td><td>{LABEL[row.status]}</td><td>{row.storedTopics}</td><td>{row.derivedTopics}</td><td>{row.missingTopics}</td><td>{row.currentObjectives}</td><td>{row.otherObjectives}</td>
          </tr>)}</tbody>
        </table>
        {rows.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)', padding: 8 }}>Gösterilecek satır yok.</div>}
      </div>
      {report.orphanGroups.length > 0 && <div style={{ fontSize: 12, marginTop: 10 }}>
        <strong>Müfredat satırı olmayan katalog grupları:</strong> {report.orphanGroups.map(group => `${group.grade} ${group.subject} (${group.objectives})`).join(' · ')}
      </div>}
    </>}
  </div>
}
