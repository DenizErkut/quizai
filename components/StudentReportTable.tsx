'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ReportStudent {
  id: string
  fullName: string
  schoolNo: string | null
  grade: string | null
  classroomName?: string | null
  grades: Record<string, string>
  pratium: { avgPct: number | null; totalTests: number; streak: number }
}

interface ReportData {
  imports: { id: string; label: string; created_at: string }[]
  selectedImportId: string | null
  students: ReportStudent[]
  subjectColumns: string[]
  classrooms?: { id: string; name: string }[]
}

export default function StudentReportTable({ fetchEndpoint }: { fetchEndpoint: string }) {
  const supabase = createClient() as any
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [importId, setImportId] = useState<string>('')
  const [classroomId, setClassroomId] = useState<string>('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (opts?: { importId?: string; classroomId?: string }) => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const params = new URLSearchParams()
      const iid = opts?.importId ?? importId
      const cid = opts?.classroomId ?? classroomId
      if (iid) params.set('importId', iid)
      if (cid) params.set('classroomId', cid)
      const qs = params.toString()
      const res = await fetch(`${fetchEndpoint}${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Rapor yüklenemedi.'); setLoading(false); return }
      setData(json)
      if (json.selectedImportId) setImportId(json.selectedImportId)
    } catch (e: any) {
      setError(e?.message || 'Rapor yüklenemedi.')
    }
    setLoading(false)
  }, [fetchEndpoint])

  useEffect(() => { load() }, [])

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}><div className="spinner" /></div>
  if (error) return <div style={{ padding: '1rem', color: 'var(--red)', fontSize: '13px' }}>{error}</div>
  if (!data) return null

  const filtered = data.students.filter(s => !search.trim() || s.fullName.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR')))
  const hasClassroomCol = filtered.some(s => s.classroomName)

  return (
    <div>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {data.imports.length > 0 && (
          <select className="input" style={{ maxWidth: '260px' }} value={importId}
            onChange={e => { setImportId(e.target.value); load({ importId: e.target.value }) }}>
            {data.imports.map(imp => (
              <option key={imp.id} value={imp.id}>
                {imp.label} · {new Date(imp.created_at).toLocaleDateString('tr-TR')}
              </option>
            ))}
          </select>
        )}
        {data.classrooms && data.classrooms.length > 1 && (
          <select className="input" style={{ maxWidth: '200px' }} value={classroomId}
            onChange={e => { setClassroomId(e.target.value); load({ classroomId: e.target.value }) }}>
            <option value="">Tüm sınıflarım</option>
            {data.classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <input className="input" placeholder="İsimle ara…" value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: '200px' }} />
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => window.print()}>🖨️ Yazdır</button>
      </div>

      {data.imports.length === 0 && (
        <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>
          Henüz içe aktarılmış bir not bulunmuyor — sadece Pratium test sonuçları gösteriliyor.
        </p>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              <th style={th}>Ö.No</th>
              <th style={th}>İsim</th>
              {hasClassroomCol && <th style={th}>Sınıf</th>}
              {!hasClassroomCol && <th style={th}>Seviye</th>}
              {data.subjectColumns.map(subj => <th key={subj} style={th}>{subj}</th>)}
              <th style={{ ...th, color: 'var(--accent)' }}>Pratium Ort. %</th>
              <th style={{ ...th, color: 'var(--accent)' }}>Test Sayısı</th>
              <th style={{ ...th, color: 'var(--accent)' }}>🔥 Streak</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td style={td}>{s.schoolNo ?? '—'}</td>
                <td style={{ ...td, fontWeight: 600 }}>{s.fullName}</td>
                {hasClassroomCol && <td style={td}>{s.classroomName ?? '—'}</td>}
                {!hasClassroomCol && <td style={td}>{s.grade ?? '—'}</td>}
                {data.subjectColumns.map(subj => <td key={subj} style={td}>{s.grades[subj] ?? '—'}</td>)}
                <td style={{ ...td, fontWeight: 700, color: s.pratium.avgPct != null && s.pratium.avgPct < 50 ? 'var(--red)' : 'var(--green)' }}>
                  {s.pratium.avgPct != null ? `%${s.pratium.avgPct}` : '—'}
                </td>
                <td style={td}>{s.pratium.totalTests}</td>
                <td style={td}>{s.pratium.streak}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && (
        <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '2rem 0' }}>Gösterilecek öğrenci bulunamadı.</p>
      )}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', fontWeight: 700 }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', color: 'var(--text2)' }
