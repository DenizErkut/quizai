'use client'
import { useState, useMemo } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/client'

type ColRole = 'ignore' | 'school_no' | 'class' | 'name' | 'subject'

interface RosterStudent {
  id: string
  schoolNo: string | null
  fullName: string
  grade?: string | null
  classroomName?: string | null
}

interface MatchedRow {
  rowIndex: number
  rawSchoolNo: string
  rawClass: string
  rawName: string
  subjectValues: Record<string, string>
  studentId: string | null
  matchType: 'school_no' | 'name' | 'manual' | 'none'
  skip: boolean
}

function normalizeName(s: string): string {
  return s
    .toLocaleUpperCase('tr-TR')
    .replace(/İ/g, 'I').replace(/Ğ/g, 'G').replace(/Ü/g, 'U')
    .replace(/Ş/g, 'S').replace(/Ö/g, 'O').replace(/Ç/g, 'C')
    .replace(/[^A-Z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function GradeImportWizard({
  scope,
  rosterEndpoint,
  commitEndpoint,
}: {
  scope: 'institution' | 'teacher'
  rosterEndpoint: string
  commitEndpoint: string
}) {
  const supabase = createClient() as any
  const [mode, setMode] = useState<'file' | 'manual'>('file')
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'done'>('upload')
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<string[][]>([])
  const [colRoles, setColRoles] = useState<ColRole[]>([])
  const [subjectNames, setSubjectNames] = useState<string[]>([])
  const [roster, setRoster] = useState<RosterStudent[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [matchedRows, setMatchedRows] = useState<MatchedRow[]>([])
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ matchedRows: number; totalRows: number; gradesInserted: number } | null>(null)

  // ---------- Elle not girişi (dosyasız) ----------
  const [manualStudentId, setManualStudentId] = useState('')
  const [manualLabel, setManualLabel] = useState('')
  const [manualSubjects, setManualSubjects] = useState([{ name: '', value: '' }])
  const [manualSaving, setManualSaving] = useState(false)
  const [manualResult, setManualResult] = useState<{ gradesInserted: number } | null>(null)

  useEffect(() => {
    if (mode === 'manual' && roster.length === 0) loadRoster()
  }, [mode])

  function addManualSubjectRow() {
    setManualSubjects(prev => [...prev, { name: '', value: '' }])
  }
  function removeManualSubjectRow(i: number) {
    setManualSubjects(prev => prev.filter((_, idx) => idx !== i))
  }
  function updateManualSubjectRow(i: number, field: 'name' | 'value', val: string) {
    setManualSubjects(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r))
  }

  async function submitManual() {
    if (!manualStudentId) { setError('Önce bir öğrenci seç.'); return }
    const subjects: Record<string, string> = {}
    for (const r of manualSubjects) {
      if (r.name.trim() && r.value.trim()) subjects[r.name.trim()] = r.value.trim()
    }
    if (Object.keys(subjects).length === 0) { setError('En az bir ders + not girmelisin.'); return }

    setManualSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(commitEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          label: manualLabel.trim() || 'Elle Girildi',
          rows: [{ studentId: manualStudentId, subjects }],
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Kaydetme başarısız.'); setManualSaving(false); return }
      setManualResult({ gradesInserted: json.gradesInserted })
      setManualSubjects([{ name: '', value: '' }])
    } catch (e: any) {
      setError(e?.message || 'Kaydetme başarısız.')
    }
    setManualSaving(false)
  }

  // ---------- 1. Dosya yükleme ----------
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError('')
    setFileName(file.name)
    if (!label.trim()) setLabel(file.name.replace(/\.[^.]+$/, ''))

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' })
    if (rows.length < 2) { setError('Dosyada yeterli veri bulunamadı (en az 1 başlık + 1 veri satırı gerekli).'); return }

    const head = rows[0].map((h: any) => String(h ?? '').trim())
    const body = rows.slice(1).map(r => head.map((_, i) => String(r[i] ?? '').trim()))

    // Otomatik sütun tahmini
    const roles: ColRole[] = head.map(h => {
      const hl = h.toLocaleLowerCase('tr-TR')
      if (hl.includes('no')) return 'school_no'
      if (hl.includes('sınıf') || hl.includes('sinif') || hl === 'şube' || hl === 'sube') return 'class'
      if (hl.includes('isim') || hl.includes('ad soyad') || hl === 'ad') return 'name'
      return 'subject'
    })

    setHeaders(head)
    setDataRows(body)
    setColRoles(roles)
    setSubjectNames(head.map(h => h))
    setStep('mapping')
    loadRoster()
  }

  async function loadRoster() {
    setRosterLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(rosterEndpoint, { headers: { Authorization: `Bearer ${session?.access_token}` } })
      const json = await res.json()
      if (res.ok) setRoster(json.students ?? [])
    } catch { /* no-op */ }
    setRosterLoading(false)
  }

  // ---------- 2. Sütun eşleştirme ----------
  function setColRole(i: number, role: ColRole) {
    setColRoles(prev => prev.map((r, idx) => idx === i ? role : r))
  }
  function setSubjectName(i: number, name: string) {
    setSubjectNames(prev => prev.map((n, idx) => idx === i ? name : n))
  }

  const schoolNoColIdx = colRoles.findIndex(r => r === 'school_no')
  const classColIdx = colRoles.findIndex(r => r === 'class')
  const nameColIdx = colRoles.findIndex(r => r === 'name')
  const subjectColIdxs = colRoles.map((r, i) => r === 'subject' ? i : -1).filter(i => i !== -1)

  function buildMatches() {
    if (schoolNoColIdx === -1 && nameColIdx === -1) {
      setError('En az bir sütunu "Öğrenci No" veya "İsim" olarak işaretlemelisin (eşleştirme için gerekli).')
      return
    }
    const rosterBySchoolNo = new Map(roster.filter(r => r.schoolNo).map(r => [String(r.schoolNo).trim(), r]))
    const rosterByName = new Map(roster.map(r => [normalizeName(r.fullName), r]))

    const matches: MatchedRow[] = dataRows.map((row, idx) => {
      const rawSchoolNo = schoolNoColIdx !== -1 ? row[schoolNoColIdx] : ''
      const rawClass = classColIdx !== -1 ? row[classColIdx] : ''
      const rawName = nameColIdx !== -1 ? row[nameColIdx] : ''
      const subjectValues: Record<string, string> = {}
      subjectColIdxs.forEach(ci => { subjectValues[subjectNames[ci] || headers[ci]] = row[ci] })

      let studentId: string | null = null
      let matchType: MatchedRow['matchType'] = 'none'

      if (rawSchoolNo && rosterBySchoolNo.has(rawSchoolNo.trim())) {
        studentId = rosterBySchoolNo.get(rawSchoolNo.trim())!.id
        matchType = 'school_no'
      } else if (rawName && rosterByName.has(normalizeName(rawName))) {
        studentId = rosterByName.get(normalizeName(rawName))!.id
        matchType = 'name'
      }

      return { rowIndex: idx, rawSchoolNo, rawClass, rawName, subjectValues, studentId, matchType, skip: false }
    })

    setMatchedRows(matches)
    setStep('preview')
  }

  function setManualMatch(rowIndex: number, studentId: string) {
    setMatchedRows(prev => prev.map(r => r.rowIndex === rowIndex
      ? { ...r, studentId: studentId || null, matchType: studentId ? 'manual' : 'none' }
      : r))
  }
  function toggleSkip(rowIndex: number) {
    setMatchedRows(prev => prev.map(r => r.rowIndex === rowIndex ? { ...r, skip: !r.skip } : r))
  }

  const matchedCount = matchedRows.filter(r => r.studentId && !r.skip).length
  const unmatchedCount = matchedRows.filter(r => !r.studentId && !r.skip).length

  // ---------- 3. Kaydet ----------
  async function commit() {
    setSaving(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const rows = matchedRows
        .filter(r => r.studentId && !r.skip)
        .map(r => ({ studentId: r.studentId, schoolNo: r.rawSchoolNo || undefined, subjects: r.subjectValues }))

      const res = await fetch(commitEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ label: label.trim(), sourceFilename: fileName, rows }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Kaydetme başarısız.'); setSaving(false); return }
      setResult(json)
      setStep('done')
    } catch (e: any) {
      setError(e?.message || 'Kaydetme başarısız.')
    }
    setSaving(false)
  }

  function reset() {
    setStep('upload'); setFileName(''); setHeaders([]); setDataRows([]); setColRoles([])
    setSubjectNames([]); setMatchedRows([]); setLabel(''); setResult(null); setError('')
  }

  const roleLabels: Record<ColRole, string> = {
    ignore: 'Yoksay', school_no: 'Öğrenci No', class: 'Sınıf', name: 'İsim', subject: 'Ders',
  }

  return (
    <div className="card" style={{ padding: '1.5rem' }}>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
        <button className="btn btn-sm" onClick={() => setMode('file')}
          style={mode === 'file' ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}>
          📄 Dosyadan İçe Aktar
        </button>
        <button className="btn btn-sm" onClick={() => setMode('manual')}
          style={mode === 'manual' ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}}>
          ✍️ Elle Gir
        </button>
      </div>

      {error && (
        <div style={{ marginBottom: '1rem', padding: '10px 14px', borderRadius: '10px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '13px' }}>
          {error}
        </div>
      )}

      {mode === 'manual' ? (
        <div>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1rem' }}>
            Tek bir öğrenciye, dosya yüklemeden doğrudan not/değer gir.
          </p>
          {rosterLoading ? <div className="spinner" /> : (
            <>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <select className="input" style={{ minWidth: '220px' }} value={manualStudentId} onChange={e => setManualStudentId(e.target.value)}>
                  <option value="">— Öğrenci seç —</option>
                  {roster.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.fullName}{s.schoolNo ? ` (No: ${s.schoolNo})` : ''}{s.classroomName ? ` · ${s.classroomName}` : ''}
                    </option>
                  ))}
                </select>
                <input className="input" placeholder="Etiket (örn. 1. Dönem 2. Yazılı)" value={manualLabel}
                  onChange={e => setManualLabel(e.target.value)} style={{ minWidth: '220px' }} />
              </div>

              {manualSubjects.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input className="input" placeholder="Ders (örn. Matematik)" value={r.name}
                    onChange={e => updateManualSubjectRow(i, 'name', e.target.value)} style={{ flex: 1 }} />
                  <input className="input" placeholder="Not (örn. 85)" value={r.value}
                    onChange={e => updateManualSubjectRow(i, 'value', e.target.value)} style={{ width: '120px' }} />
                  <button className="btn btn-sm" onClick={() => removeManualSubjectRow(i)}>✕</button>
                </div>
              ))}
              <button className="btn btn-sm" onClick={addManualSubjectRow} style={{ marginBottom: '1.25rem' }}>+ Ders Ekle</button>

              <div>
                <button className="btn btn-primary" onClick={submitManual} disabled={manualSaving || !manualStudentId}>
                  {manualSaving ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>

              {manualResult && (
                <p style={{ marginTop: '1rem', fontSize: '13px', color: 'var(--green)', fontWeight: 600 }}>
                  ✅ {manualResult.gradesInserted} not kaydedildi.
                </p>
              )}
            </>
          )}
        </div>
      ) : (
      <>

      {/* ADIM 1: Yükleme */}
      {step === 'upload' && (
        <div>
          <p style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '1rem' }}>
            Excel (.xlsx) veya CSV dosyası yükle. İlk satır sütun başlığı olmalı — örn. <b>Ö.No</b>, <b>Sınıf</b>, <b>İsim</b>,
            sonrasında ders sütunları (<b>Türkçe</b>, <b>Matematik</b>, ... gibi).
          </p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile}
            style={{ fontSize: '13px' }} className="input" />
        </div>
      )}

      {/* ADIM 2: Sütun eşleştirme */}
      {step === 'mapping' && (
        <div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <input className="input" placeholder="İçe aktarım adı (örn. Mozaik TG5 - Nisan 2026)"
              value={label} onChange={e => setLabel(e.target.value)} style={{ maxWidth: '360px' }} />
            <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{fileName} · {dataRows.length} satır</span>
          </div>

          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' }}>
            Her sütunun ne olduğunu seç. Ders sütunlarının adını (kayıtlarda görünecek ders/kolon adı) düzenleyebilirsin.
          </p>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', minWidth: '130px' }}>
                      <div style={{ fontWeight: 700, marginBottom: '4px' }}>{h || `Sütun ${i + 1}`}</div>
                      <select className="input" style={{ fontSize: '11px', padding: '4px 6px' }}
                        value={colRoles[i]} onChange={e => setColRole(i, e.target.value as ColRole)}>
                        {(['school_no', 'class', 'name', 'subject', 'ignore'] as ColRole[]).map(r => (
                          <option key={r} value={r}>{roleLabels[r]}</option>
                        ))}
                      </select>
                      {colRoles[i] === 'subject' && (
                        <input className="input" style={{ fontSize: '11px', padding: '4px 6px', marginTop: '4px' }}
                          value={subjectNames[i]} onChange={e => setSubjectName(i, e.target.value)}
                          placeholder="Ders adı" />
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.slice(0, 5).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>İlk 5 satır önizleme olarak gösteriliyor.</p>

          <div style={{ display: 'flex', gap: '10px', marginTop: '1.25rem' }}>
            <button className="btn" onClick={reset}>← Baştan başla</button>
            <button className="btn btn-primary" onClick={buildMatches} disabled={rosterLoading}>
              {rosterLoading ? 'Öğrenci listesi yükleniyor…' : 'Devam Et →'}
            </button>
          </div>
        </div>
      )}

      {/* ADIM 3: Eşleştirme önizleme */}
      {step === 'preview' && (
        <div>
          <div style={{ display: 'flex', gap: '16px', marginBottom: '1rem', flexWrap: 'wrap', fontSize: '13px' }}>
            <span style={{ color: 'var(--green)', fontWeight: 600 }}>✅ {matchedCount} eşleşti</span>
            {unmatchedCount > 0 && <span style={{ color: 'var(--red)', fontWeight: 600 }}>⚠️ {unmatchedCount} eşleşmedi</span>}
            <span style={{ color: 'var(--text3)' }}>Toplam {matchedRows.length} satır</span>
          </div>

          <div style={{ overflowX: 'auto', maxHeight: '480px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ position: 'sticky', top: 0, background: 'var(--bg)' }}>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Dosyadaki İsim / No</th>
                  <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Eşleşen Öğrenci</th>
                  {subjectColIdxs.map(ci => (
                    <th key={ci} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>{subjectNames[ci]}</th>
                  ))}
                  <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)' }}></th>
                </tr>
              </thead>
              <tbody>
                {matchedRows.map(r => (
                  <tr key={r.rowIndex} style={{ opacity: r.skip ? 0.4 : 1 }}>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>
                      {r.rawSchoolNo && <div style={{ color: 'var(--text3)' }}>No: {r.rawSchoolNo}</div>}
                      <div>{r.rawName || '—'}</div>
                      {r.rawClass && <div style={{ color: 'var(--text3)' }}>{r.rawClass}</div>}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>
                      <select className="input" style={{ fontSize: '11px', padding: '4px 6px', minWidth: '160px' }}
                        value={r.studentId ?? ''} onChange={e => setManualMatch(r.rowIndex, e.target.value)}>
                        <option value="">— Eşleşmedi, seç —</option>
                        {roster.map(s => (
                          <option key={s.id} value={s.id}>
                            {s.fullName}{s.schoolNo ? ` (No: ${s.schoolNo})` : ''}{s.classroomName ? ` · ${s.classroomName}` : ''}
                          </option>
                        ))}
                      </select>
                      {r.matchType !== 'none' && r.studentId && (
                        <div style={{ fontSize: '10px', color: 'var(--green)', marginTop: '2px' }}>
                          {r.matchType === 'school_no' ? 'Okul no ile eşleşti' : r.matchType === 'name' ? 'İsimle eşleşti' : 'Elle seçildi'}
                        </div>
                      )}
                    </td>
                    {subjectColIdxs.map(ci => (
                      <td key={ci} style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text2)' }}>
                        {r.subjectValues[subjectNames[ci]]}
                      </td>
                    ))}
                    <td style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>
                      <button className="btn btn-sm" onClick={() => toggleSkip(r.rowIndex)}>
                        {r.skip ? 'Geri al' : 'Atla'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginTop: '1.25rem' }}>
            <button className="btn" onClick={() => setStep('mapping')}>← Sütunlara dön</button>
            <button className="btn btn-primary" onClick={commit} disabled={saving || matchedCount === 0}>
              {saving ? 'Kaydediliyor…' : `${matchedCount} öğrenci için Kaydet`}
            </button>
          </div>
        </div>
      )}

      {/* ADIM 4: Tamamlandı */}
      {step === 'done' && result && (
        <div style={{ textAlign: 'center', padding: '2rem 0' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>✅</div>
          <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>İçe aktarma tamamlandı</p>
          <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1.25rem' }}>
            {result.matchedRows}/{result.totalRows} satır eşleşti, {result.gradesInserted} not kaydedildi.
          </p>
          <button className="btn btn-primary" onClick={reset}>Yeni Dosya Yükle</button>
        </div>
      )}
      </>
      )}
    </div>
  )
}
