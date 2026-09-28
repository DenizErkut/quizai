'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Facets = { grades: string[]; subjects: string[]; topics: string[] }
type Pagination = { page: number; page_size: number; total: number; total_pages: number }

export default function QuestionBankEditor() {
  const [rows, setRows] = useState<any[]>([])
  const [editing, setEditing] = useState<any>(null)
  const [msg, setMsg] = useState('')
  const [filters, setFilters] = useState({ grade: '', subject: '', topic: '' })
  const [facets, setFacets] = useState<Facets>({ grades: [], subjects: [], topics: [] })
  const [pagination, setPagination] = useState<Pagination>({ page: 1, page_size: 50, total: 0, total_pages: 1 })

  async function load(f: typeof filters, requestedPage = pagination.page) {
    const { data: { session } } = await createClient().auth.getSession()
    const params = new URLSearchParams({ page: String(requestedPage), page_size: String(pagination.page_size) })
    if (f.grade) params.set('grade', f.grade)
    if (f.subject) params.set('subject', f.subject)
    if (f.topic) params.set('topic', f.topic)
    const r = await fetch(`/api/admin/question-bank-review?${params}`, { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const d = await r.json()
    if (r.ok) {
      setRows(d.questions || [])
      if (d.facets) setFacets(d.facets)
      if (d.pagination) setPagination(d.pagination)
    }
  }

  useEffect(() => { void load(filters, pagination.page) }, [filters.grade, filters.subject, filters.topic, pagination.page])

  function updateFilter(key: 'grade' | 'subject' | 'topic', value: string) {
    setEditing(null)
    setPagination(current => ({ ...current, page: 1 }))
    setFilters(current => key === 'grade'
      ? { grade: value, subject: '', topic: '' }
      : key === 'subject'
        ? { ...current, subject: value, topic: '' }
        : { ...current, topic: value })
  }

  async function save() {
    const { data: { session } } = await createClient().auth.getSession()
    const r = await fetch('/api/admin/question-bank-review', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ id: editing.id, question: editing.question }) })
    const d = await r.json()
    setMsg(r.ok ? '✓ Düzenlendi ve yeniden onaya gönderildi.' : `❌ ${d.error || 'Hata'}`)
    if (r.ok) { setEditing(null); void load(filters, pagination.page) }
  }

  async function decide(id: string, decision: 'approved' | 'rejected') {
    const { data: { session } } = await createClient().auth.getSession()
    const r = await fetch('/api/admin/question-bank-review', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ id, decision }) })
    const d = await r.json()
    setMsg(r.ok ? (decision === 'approved' ? '✓ Onaylandı.' : '✓ Reddedildi.') : `❌ ${d.error || 'Hata'}`)
    if (r.ok) void load(filters, pagination.page)
  }

  const optionsFor = (key: 'grade' | 'subject' | 'topic') => key === 'grade' ? facets.grades : key === 'subject' ? facets.subjects : facets.topics
  return <div className="card">
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}>
      <strong>📝 Soru havuzu inceleme</strong>
      <span style={{fontSize:12,color:'var(--text3)'}}>{pagination.total.toLocaleString('tr-TR')} soru</span>
      <button className="btn btn-sm" onClick={()=>void load(filters,pagination.page)}>Yenile</button>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:12}}>
      {(['grade','subject','topic'] as const).map(key=><select key={key} className="input" value={filters[key]} onChange={e=>updateFilter(key,e.target.value)}>
        <option value="">{key==='grade'?'Tüm sınıflar':key==='subject'?'Tüm dersler':'Tüm konular'}</option>
        {optionsFor(key).map(v=><option key={v} value={v}>{v}</option>)}
      </select>)}
    </div>
    {msg&&<p style={{fontSize:12}}>{msg}</p>}
    <div style={{display:'grid',gap:8,marginTop:12}}>{rows.map(r=><div key={r.id} style={{borderTop:'1px solid var(--border)',paddingTop:8,fontSize:12}}>
      <div><b>{r.topic_key}</b> · {r.difficulty} · {r.review_status}
        {r.review_status === 'candidate' && (r.awaiting_expert_review
          ? <span style={{color:'var(--red, #c0392b)'}}> · ⚠️ uzman incelemesi bekliyor{r.report_count ? ` (${r.report_count} rapor)` : ''}</span>
          : <span style={{color:'var(--text2)'}}> · 🕒 gölge inceleme (rapor gelmezse otomatik onaylanır)</span>)}
        {r.ai_provider && <span style={{color:'var(--text3)'}}> · {r.ai_provider}/{r.ai_model}</span>}
      </div>
      {editing?.id === r.id ? <div style={{marginTop:8,padding:'10px',border:'1px solid var(--border)',borderRadius:10,background:'var(--bg2)'}}>
        <textarea autoFocus className="input" rows={4} value={editing.question.q} onChange={e=>setEditing({...editing,question:{...editing.question,q:e.target.value}})} />
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <button className="btn btn-primary btn-sm" onClick={()=>void save()}>Kaydet ve yeniden onaya gönder</button>
          <button className="btn btn-sm" onClick={()=>setEditing(null)}>Vazgeç</button>
        </div>
      </div> : <>
        <div style={{margin:'5px 0'}}>{r.question?.q}</div>
        <div style={{display:'flex',gap:6}}>
          <button className="btn btn-sm" onClick={()=>setEditing({...r,question:{...r.question}})}>Düzenle</button>
          {r.review_status === 'candidate' && <>
            <button className="btn btn-sm" onClick={()=>void decide(r.id,'approved')}>Onayla</button>
            <button className="btn btn-sm" onClick={()=>void decide(r.id,'rejected')}>Reddet</button>
          </>}
        </div>
      </>}
    </div>)}</div>
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:10,marginTop:16}}>
      <button className="btn btn-sm" disabled={pagination.page <= 1} onClick={()=>setPagination(current=>({...current,page:current.page-1}))}>← Önceki</button>
      <span style={{fontSize:12,color:'var(--text2)'}}>Sayfa {pagination.page} / {pagination.total_pages}</span>
      <button className="btn btn-sm" disabled={pagination.page >= pagination.total_pages} onClick={()=>setPagination(current=>({...current,page:current.page+1}))}>Sonraki →</button>
    </div>
  </div>
}
