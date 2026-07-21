'use client'
import { useState, useEffect, useCallback, Fragment } from 'react'
import { createClient } from '@/lib/supabase/client'

interface SectionalCell {
  importedGrade: string | null
  pratiumAvgPct: number | null
  pratiumTestCount: number
}

interface SectionalStudent {
  id: string
  fullName: string
  schoolNo: string | null
  grade: string | null
  classroomName?: string | null
  sections: Record<string, SectionalCell>
}

interface ReportData {
  imports: { id: string; label: string; created_at: string }[]
  selectedImportId: string | null
  students: SectionalStudent[]
  subjects: string[]
  classrooms?: { id: string; name: string }[]
}

export default function SectionalReportTable({ fetchEndpoint }: { fetchEndpoint: string }) {
  const supabase = createClient() as any
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const [importId, setImportId] = useState('')
  const [classroomId, setClassroomId] = useState('')
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async (opts?: { importId?: string; classroomId?: string }) => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const params = new URLSearchParams({ mode: 'sectional' })
      const iid = opts?.importId ?? importId
      const cid = opts?.classroomId ?? classroomId
      if (iid) params.set('importId', iid)
      if (cid) params.set('classroomId', cid)
      const res = await fetch(`${fetchEndpoint}?${params.toString()}`, {
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
              <option key={imp.id} value={imp.id}>{imp.label} · {new Date(imp.created_at).toLocaleDateString('tr-TR')}</option>
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

      <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>
        Her ders başlığı altında: soldaki sütun içe aktarılan okul notu, sağdaki sütun o dersle ilgili
        Pratium'da çözülen testlerin ortalama başarı yüzdesi (parantez içinde test sayısı).
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr style={{ background: 'var(--bg2)' }}>
              <th rowSpan={2} style={thBase}>Ö.No</th>
              <th rowSpan={2} style={thBase}>İsim</th>
              <th rowSpan={2} style={thBase}>{hasClassroomCol ? 'Sınıf' : 'Seviye'}</th>
              {data.subjects.map(subj => (
                <th key={subj} colSpan={2} style={{ ...thBase, textAlign: 'center', borderLeft: '2px solid var(--border2)' }}>{subj}</th>
              ))}
            </tr>
            <tr style={{ background: 'var(--bg2)' }}>
              {data.subjects.map(subj => (
                <Fragment key={subj}>
                  <th style={{ ...thSub, borderLeft: '2px solid var(--border2)' }}>Okul Notu</th>
                  <th style={{ ...thSub, color: 'var(--accent)' }}>Pratium %</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id}>
                <td style={td}>{s.schoolNo ?? '—'}</td>
                <td style={{ ...td, fontWeight: 600 }}>{s.fullName}</td>
                <td style={td}>{hasClassroomCol ? (s.classroomName ?? '—') : (s.grade ?? '—')}</td>
                {data.subjects.map(subj => {
                  const cell = s.sections[subj]
                  return (
                    <Fragment key={subj}>
                      <td style={{ ...td, borderLeft: '2px solid var(--border2)' }}>{cell?.importedGrade ?? '—'}</td>
                      <td style={{ ...td, fontWeight: 700, color: cell?.pratiumAvgPct != null && cell.pratiumAvgPct < 50 ? 'var(--red)' : cell?.pratiumAvgPct != null ? 'var(--green)' : 'var(--text3)' }}>
                        {cell?.pratiumAvgPct != null ? `%${cell.pratiumAvgPct} (${cell.pratiumTestCount})` : '—'}
                      </td>
                    </Fragment>
                  )
                })}
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

const thBase: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', fontWeight: 700 }
const thSub: React.CSSProperties = { padding: '6px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', whiteSpace: 'nowrap', fontWeight: 600, fontSize: '11px', color: 'var(--text2)' }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', color: 'var(--text2)' }
