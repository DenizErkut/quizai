'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Item = { id:string; agent_name:string; policy_version:string; proposed_action:string; title:string; rationale:string; created_at:string }

async function request(path:string, init?:RequestInit) {
  const { data:{ session } } = await createClient().auth.getSession()
  if (!session) return null
  const response = await fetch(path, { ...init, headers:{ ...init?.headers, Authorization:`Bearer ${session.access_token}` } })
  return response.ok ? response.json() : null
}

export default function AgentApprovalQueue() {
  const [items, setItems] = useState<Item[]>([])
  useEffect(() => {
    void request('/api/teacher/agent-approvals').then(data => setItems(data?.items ?? []))
  }, [])
  async function decide(id:string, status:'approved'|'rejected') {
    const data = await request('/api/teacher/agent-approvals', { method:'PATCH', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ id, status }) })
    if (data) setItems(current => current.filter(item => item.id !== id))
  }
  if (!items.length) return null
  return <div className="card" style={{ marginBottom:'1rem' }}>
    <strong style={{ color:'var(--primary)' }}>🤖 Öğretmen onayı bekleyen ajan önerileri</strong>
    <div style={{ fontSize:11, color:'var(--text3)', margin:'4px 0 10px' }}>Ajan yalnızca önerir; onayınız olmadan öğrenciye işlem uygulanmaz.</div>
    {items.map(item => <div key={item.id} style={{ borderTop:'1px solid var(--border)', padding:'9px 0', fontSize:12 }}>
      <strong>{item.title}</strong>
      <div style={{ color:'var(--text2)', margin:'4px 0' }}>{item.rationale}</div>
      <div style={{ fontSize:10, color:'var(--text4)', marginBottom:6 }}>{item.agent_name} · {item.policy_version} · {new Date(item.created_at).toLocaleString('tr-TR')}</div>
      <button className="btn btn-sm" onClick={() => void decide(item.id,'approved')} style={{ marginRight:6 }}>Onayla</button>
      <button className="btn btn-sm" onClick={() => void decide(item.id,'rejected')}>Reddet</button>
    </div>)}
  </div>
}
