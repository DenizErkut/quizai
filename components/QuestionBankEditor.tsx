'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function QuestionBankEditor() {
  const [rows, setRows] = useState<any[]>([]); const [editing, setEditing] = useState<any>(null); const [msg, setMsg] = useState('')
  const [filters, setFilters] = useState({ grade: '', subject: '', topic: '' })
  async function load() { const { data: { session } } = await createClient().auth.getSession(); const r = await fetch('/api/admin/question-bank-review', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } }); const d = await r.json(); if (r.ok) setRows(d.questions || []) }
  useEffect(() => { void load() }, [])
  async function save() { const { data: { session } } = await createClient().auth.getSession(); const r = await fetch('/api/admin/question-bank-review', { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token || ''}` }, body: JSON.stringify({ id: editing.id, question: editing.question }) }); const d = await r.json(); setMsg(r.ok ? '✓ Düzenlendi ve yeniden onaya gönderildi.' : `❌ ${d.error || 'Hata'}`); if (r.ok) { setEditing(null); void load() } }
  const values = (key: string) => [...new Set(rows.map(r => r[key]).filter(Boolean))].sort()
  const filtered = rows.filter(r => (!filters.grade || r.grade_key === filters.grade) && (!filters.subject || r.subject_key === filters.subject) && (!filters.topic || r.topic_key === filters.topic))
  return <div className="card"><div style={{display:'flex',justifyContent:'space-between'}}><strong>📝 Soru havuzu inceleme</strong><button className="btn btn-sm" onClick={()=>void load()}>Yenile</button></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:12}}>{(['grade','subject','topic'] as const).map(key=><select key={key} className="input" value={filters[key]} onChange={e=>setFilters({...filters,[key]:e.target.value})}><option value="">{key==='grade'?'Tüm sınıflar':key==='subject'?'Tüm dersler':'Tüm konular'}</option>{values(`${key}_key`).map(v=><option key={v} value={v}>{v}</option>)}</select>)}</div>
    {msg&&<p style={{fontSize:12}}>{msg}</p>}<div style={{display:'grid',gap:8,marginTop:12}}>{filtered.map(r=><div key={r.id} style={{borderTop:'1px solid var(--border)',paddingTop:8,fontSize:12}}><div><b>{r.topic_key}</b> · {r.difficulty} · {r.review_status}</div><div style={{margin:'5px 0'}}>{r.question?.q}</div><button className="btn btn-sm" onClick={()=>setEditing({...r,question:{...r.question}})}>Düzenle</button></div>)}</div>{editing&&<div style={{marginTop:16}}><textarea className="input" rows={4} value={editing.question.q} onChange={e=>setEditing({...editing,question:{...editing.question,q:e.target.value}})} /><button className="btn btn-primary" onClick={()=>void save()} style={{marginTop:8}}>Yeniden onaya gönder</button></div>}</div>
}
