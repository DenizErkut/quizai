'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
export default function DataLifecycleRequests() {
  const [items, setItems] = useState<any[]>([])
  const load = async () => { const { data: { session } } = await createClient().auth.getSession(); if (!session) return; const r = await fetch('/api/admin/data-lifecycle-requests?status=pending', { headers: { Authorization: `Bearer ${session.access_token}` } }); if (r.ok) setItems((await r.json()).requests || []) }
  useEffect(() => { void load() }, [])
  async function update(id: string, status: string) { const { data: { session } } = await createClient().auth.getSession(); if (!session) return; await fetch('/api/admin/data-lifecycle-requests', { method: 'PATCH', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); load() }
  if (!items.length) return null
  return <div className="card" style={{ marginBottom: '1rem' }}><strong style={{ color: 'var(--primary)' }}>🔐 KVKK talepleri</strong>{items.map(item => <div key={item.id} style={{ borderTop: '1px solid var(--border)', marginTop: 8, paddingTop: 8, fontSize: 12 }}><div><strong>{item.request_kind}</strong> · kapsam: {item.scope}</div><div style={{ color: 'var(--text3)', margin: '3px 0 7px' }}>Talep: {new Date(item.created_at).toLocaleString('tr-TR')}</div><button onClick={() => update(item.id, 'verified')} style={{ marginRight: 6 }}>Doğrula</button><button onClick={() => update(item.id, 'rejected')}>Reddet</button></div>)}</div>
}
