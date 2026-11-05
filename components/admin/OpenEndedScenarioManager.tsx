'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sanitizeFigureSvg, svgDataUri } from '@/lib/open-ended-scenarios'

type Criterion = { criterion: string; maxPoints: number; description: string }
type Example = { id: string; grade_number: number; subject: string; term: number; scenario_no: number; title: string; scenario: string; question: string; rubric: Criterion[]; figure_svg?: string | null; figure_image?: string | null; status: string; source_note: string | null }
type Form = { id: string; gradeNumber: number; subject: string; term: number; scenarioNo: number; title: string; scenario: string; question: string; rubric: Criterion[]; figureSvg: string; figureImage: string; sourceNote: string }

const field: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }
const emptyForm = (over: Partial<Form> = {}): Form => ({
  id: '', gradeNumber: 7, subject: '', term: 1, scenarioNo: 1, title: '', scenario: '', question: '', figureSvg: '', figureImage: '', sourceNote: '',
  rubric: [{ criterion: '', maxPoints: 50, description: '' }, { criterion: '', maxPoints: 50, description: '' }], ...over,
})
const total = (rubric: Criterion[]) => rubric.reduce((sum, item) => sum + (Number(item.maxPoints) || 0), 0)

export default function OpenEndedScenarioManager() {
  const [examples, setExamples] = useState<Example[]>([])
  const [filterGrade, setFilterGrade] = useState(0)
  const [filterTerm, setFilterTerm] = useState(0)
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [pdfOpen, setPdfOpen] = useState(false)
  const [pdfMeta, setPdfMeta] = useState({ gradeNumber: 7, subject: 'Matematik', term: 1, startNo: 1 })
  const [pdfFile, setPdfFile] = useState<File | null>(null)

  const authHeader = async () => {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Yönetici oturumu gerekli.')
    return { Authorization: `Bearer ${session.access_token}` }
  }

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterGrade) params.set('grade', String(filterGrade))
      if (filterTerm) params.set('term', String(filterTerm))
      const response = await fetch(`/api/admin/open-ended-scenarios?${params}`, { headers: await authHeader(), cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Örnekler yüklenemedi.')
      setExamples(data.examples)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Örnekler yüklenemedi.') }
  }, [filterGrade, filterTerm])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function save(publish: boolean) {
    if (!form) return
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/open-ended-scenarios', {
        method: 'POST', headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, id: form.id || undefined, publish }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kayıt başarısız.')
      setMessage(`Kaydedildi (${data.status === 'published' ? 'yayında' : 'taslak'}).`)
      setForm(null); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kayıt başarısız.') }
    finally { setBusy(false) }
  }

  async function act(method: 'PATCH' | 'DELETE', example: Example, status?: string) {
    if (method === 'DELETE' && !window.confirm('Bu örnek silinsin mi?')) return
    const response = await fetch('/api/admin/open-ended-scenarios', { method, headers: { ...(await authHeader()), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: example.id, status }) })
    if (!response.ok) setMessage((await response.json()).error || 'İşlem başarısız.')
    await load()
  }

  // Aynı sınıf+ders+dönem içinde bir sonraki boş senaryo numarasını önerir.
  function nextNumber(grade: number, subject: string, term: number) {
    const used = examples.filter(e => e.grade_number === grade && e.subject.toLocaleLowerCase('tr') === subject.trim().toLocaleLowerCase('tr') && e.term === term).map(e => e.scenario_no)
    return used.length ? Math.max(...used) + 1 : 1
  }

  // PDF'den ayıkla: dosyadaki senaryoları sırayla numaralayıp TASLAK olarak kaydeder; yönetici inceleyip yayınlar.
  async function importPdf() {
    if (!pdfFile) return
    setBusy(true); setMessage('PDF okunuyor ve senaryolar ayıklanıyor (1-2 dk sürebilir)…')
    try {
      const body = new FormData(); body.append('file', pdfFile)
      const response = await fetch('/api/admin/open-ended-scenarios/parse', { method: 'POST', headers: await authHeader(), body })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'PDF işlenemedi.')
      let saved = 0
      for (const [i, item] of (data.items as Array<{ title: string; scenario: string; question: string; rubric: Criterion[]; figureSvg?: string | null; figureImage?: string | null }>).entries()) {
        const res = await fetch('/api/admin/open-ended-scenarios', {
          method: 'POST', headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...item, gradeNumber: pdfMeta.gradeNumber, subject: pdfMeta.subject, term: pdfMeta.term, scenarioNo: pdfMeta.startNo + i, sourceNote: `PDF: ${pdfFile.name}`, publish: false }),
        })
        if (res.ok) saved++
      }
      setMessage(`${saved} / ${data.items.length} senaryo taslak olarak kaydedildi. ${data.imageCount ? ` ${data.imageCount} şekil PDF'ten otomatik kırpıldı.` : ''} Gözden geçirip yayınlayın.${data.truncated ? ' (Dosya uzun: sonraki bölümler okunmadı.)' : ''}`)
      setPdfOpen(false); setPdfFile(null); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'PDF işlenemedi.') }
    finally { setBusy(false) }
  }

  const patchRubric = (index: number, patch: Partial<Criterion>) => setForm(f => f && ({ ...f, rubric: f.rubric.map((c, i) => i === index ? { ...c, ...patch } : c) }))

  if (form) {
    const sum = total(form.rubric)
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="card" style={{ display: 'grid', gap: 10 }}>
          {!form.id && <div><button className="btn btn-primary" onClick={() => { setForm(null); setPdfOpen(true) }}>📄 PDF'den yükle (tüm senaryoları otomatik ayıkla)</button></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <label style={{ fontSize: 12 }}>Sınıf<select style={field} value={form.gradeNumber} onChange={e => setForm({ ...form, gradeNumber: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}. sınıf</option>)}</select></label>
            <label style={{ fontSize: 12 }}>Ders<input style={field} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Fen Bilimleri" /></label>
            <label style={{ fontSize: 12 }}>Dönem<select style={field} value={form.term} onChange={e => setForm({ ...form, term: Number(e.target.value) })}><option value={1}>1. dönem</option><option value={2}>2. dönem</option></select></label>
            <label style={{ fontSize: 12 }}>Senaryo no<input style={field} type="number" min={1} max={99} value={form.scenarioNo} onChange={e => setForm({ ...form, scenarioNo: Number(e.target.value) })} /></label>
          </div>
          <label style={{ fontSize: 12 }}>Başlık (opsiyonel)<input style={field} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
          <label style={{ fontSize: 12 }}>Senaryo<textarea style={{ ...field, minHeight: 110 }} value={form.scenario} onChange={e => setForm({ ...form, scenario: e.target.value })} placeholder="Durum / senaryo metni" /></label>
          <label style={{ fontSize: 12 }}>Soru<textarea style={{ ...field, minHeight: 60 }} value={form.question} onChange={e => setForm({ ...form, question: e.target.value })} placeholder="Senaryoya dayanan açık uçlu soru" /></label>
          <label style={{ fontSize: 12 }}>Şekil / görsel (SVG, opsiyonel — AI benzer şekil çizer)
            <textarea style={{ ...field, minHeight: 70, fontFamily: 'monospace', fontSize: 11 }} value={form.figureSvg} onChange={e => setForm({ ...form, figureSvg: e.target.value })} placeholder="<svg viewBox='0 0 400 260' ...>...</svg>" />
          </label>
          {form.figureImage && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={form.figureImage} alt="PDF şekli" style={{ maxWidth: 360, background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }} />
              <button className="btn btn-ghost" onClick={() => setForm(f => f && ({ ...f, figureImage: '' }))}>Görseli kaldır</button>
            </div>
          )}
          {form.figureSvg.trim() && (sanitizeFigureSvg(form.figureSvg)
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={svgDataUri(sanitizeFigureSvg(form.figureSvg)!)} alt="Şekil önizleme" style={{ maxWidth: 360, background: '#fff', border: '1px solid var(--border)', borderRadius: 8 }} />
            : <div style={{ fontSize: 12, color: '#c0392b' }}>SVG geçersiz veya çok büyük (en fazla 20.000 karakter).</div>)}
          <div style={{ fontSize: 12, fontWeight: 700, color: sum === 100 ? '#0a9e90' : '#c0392b' }}>Rubrik: {sum} / 100 puan</div>
          {form.rubric.map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <input style={{ ...field, width: 180 }} value={c.criterion} onChange={e => patchRubric(i, { criterion: e.target.value })} placeholder="Ölçüt" />
              <input style={{ ...field, width: 70 }} type="number" min={1} max={100} value={c.maxPoints} onChange={e => patchRubric(i, { maxPoints: Number(e.target.value) })} />
              <textarea style={{ ...field, flex: 1, minHeight: 40 }} value={c.description} onChange={e => patchRubric(i, { description: e.target.value })} placeholder="Tam puan koşulu" />
              <button className="btn btn-ghost" onClick={() => setForm(f => f && ({ ...f, rubric: f.rubric.filter((_, j) => j !== i) }))}>×</button>
            </div>
          ))}
          <div><button className="btn btn-ghost" onClick={() => setForm(f => f && ({ ...f, rubric: [...f.rubric, { criterion: '', maxPoints: 10, description: '' }] }))}>+ Ölçüt</button></div>
          <label style={{ fontSize: 12 }}>Kaynak notu<input style={field} value={form.sourceNote} onChange={e => setForm({ ...form, sourceNote: e.target.value })} placeholder="Örn. MEB ortak sınav örneğinden uyarlandı" /></label>
        </div>
        {message && <p style={{ fontSize: 13, color: '#c0392b' }}>{message}</p>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" disabled={busy} onClick={() => save(false)}>Taslak kaydet</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>Kaydet ve yayınla</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => { setForm(null); setMessage('') }}>Vazgeç</button>
        </div>
      </div>
    )
  }

  // Gruplama: sınıf › ders › dönem › senaryo no
  const groups = new Map<string, Example[]>()
  for (const e of examples) {
    const key = `${e.grade_number}. sınıf · ${e.subject} · ${e.term}. dönem · ${e.scenario_no}. senaryo`
    groups.set(key, [...(groups.get(key) || []), e])
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => setForm(emptyForm({ gradeNumber: filterGrade || 7, term: filterTerm || 1 }))}>+ Yeni örnek senaryo</button>
        <button className="btn btn-primary" onClick={() => setPdfOpen(o => !o)}>📄 PDF'den yükle (senaryo + şekil)</button>
        <select style={{ ...field, width: 130 }} value={filterGrade} onChange={e => setFilterGrade(Number(e.target.value))}><option value={0}>Tüm sınıflar</option>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}. sınıf</option>)}</select>
        <select style={{ ...field, width: 130 }} value={filterTerm} onChange={e => setFilterTerm(Number(e.target.value))}><option value={0}>Tüm dönemler</option><option value={1}>1. dönem</option><option value={2}>2. dönem</option></select>
      </div>
      {pdfOpen && (
        <div className="card" style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <label style={{ fontSize: 12 }}>Sınıf<select style={field} value={pdfMeta.gradeNumber} onChange={e => setPdfMeta({ ...pdfMeta, gradeNumber: Number(e.target.value) })}>{Array.from({ length: 12 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}. sınıf</option>)}</select></label>
            <label style={{ fontSize: 12 }}>Ders<input style={field} value={pdfMeta.subject} onChange={e => setPdfMeta({ ...pdfMeta, subject: e.target.value })} /></label>
            <label style={{ fontSize: 12 }}>Dönem<select style={field} value={pdfMeta.term} onChange={e => setPdfMeta({ ...pdfMeta, term: Number(e.target.value) })}><option value={1}>1. dönem</option><option value={2}>2. dönem</option></select></label>
            <label style={{ fontSize: 12 }}>İlk senaryo no<input style={field} type="number" min={1} max={99} value={pdfMeta.startNo} onChange={e => setPdfMeta({ ...pdfMeta, startNo: Number(e.target.value) })} /></label>
          </div>
          <input type="file" accept="application/pdf" onChange={e => setPdfFile(e.target.files?.[0] || null)} />
          <div><button className="btn btn-primary" disabled={busy || !pdfFile} onClick={importPdf}>Senaryoları ayıkla ve taslak kaydet</button></div>
        </div>
      )}
      {message && <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>{message}</p>}
      {groups.size === 0 && <p style={{ color: 'var(--text2)', fontSize: 13 }}>Henüz örnek senaryo yok.</p>}
      <div style={{ display: 'grid', gap: 10 }}>
        {[...groups.entries()].map(([key, list]) => (
          <div key={key} className="card" style={{ padding: '10px 14px' }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>{key} <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--text2)' }}>({list.length} örnek)</span></div>
            {list.map(e => (
              <div key={e.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--border)', padding: '6px 0' }}>
                <div style={{ flex: 1, minWidth: 220, fontSize: 13 }}>{e.title || e.scenario.slice(0, 90)}{!e.title && e.scenario.length > 90 ? '…' : ''}</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: e.status === 'published' ? '#0a9e90' : 'var(--text2)' }}>{e.status === 'published' ? 'Yayında' : 'Taslak'}</span>
                <button className="btn btn-ghost" onClick={() => setForm({ id: e.id, gradeNumber: e.grade_number, subject: e.subject, term: e.term, scenarioNo: e.scenario_no, title: e.title, scenario: e.scenario, question: e.question, rubric: e.rubric, figureSvg: e.figure_svg || '', figureImage: e.figure_image || '', sourceNote: e.source_note || '' })}>Düzenle</button>
                <button className="btn btn-ghost" onClick={() => act('PATCH', e, e.status === 'published' ? 'draft' : 'published')}>{e.status === 'published' ? 'Taslağa al' : 'Yayınla'}</button>
                <button className="btn btn-ghost" onClick={() => setForm(emptyForm({ gradeNumber: e.grade_number, subject: e.subject, term: e.term, scenarioNo: nextNumber(e.grade_number, e.subject, e.term) }))}>+ Sonraki senaryo</button>
                <button className="btn btn-ghost" onClick={() => act('DELETE', e)}>Sil</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
