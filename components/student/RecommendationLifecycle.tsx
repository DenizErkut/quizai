'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Recommendation = {
  id: string; subject: string; topic: string; reason: string
  status: 'active' | 'accepted' | 'deferred'; deferred_until?: string | null
}

export default function RecommendationLifecycle() {
  const [items, setItems] = useState<Recommendation[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  async function request(method = 'GET', body?: object) {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) return null
    const response = await fetch('/api/recommendations', {
      method, headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
    return response.ok ? response.json() : null
  }

  useEffect(() => { request().then(data => setItems(data?.recommendations ?? [])) }, [])

  async function act(item: Recommendation, action: string) {
    setBusy(item.id)
    const data = await request('POST', { recommendationId: item.id, action, deferDays: 1 })
    if (data) {
      if (action === 'dismiss' || action === 'complete') setItems(old => old.filter(x => x.id !== item.id))
      else setItems(old => old.map(x => x.id === item.id ? data.recommendation : x))
    }
    setBusy(null)
  }

  async function applyAndOpen(item: Recommendation) {
    setBusy(item.id)
    const data = await request('POST', { recommendationId: item.id, action: 'accept' })
    if (data) window.location.assign(`/quiz?subject=${encodeURIComponent(item.subject)}&topic=${encodeURIComponent(item.topic)}&recommendationId=${item.id}`)
    else setBusy(null)
  }

  if (!items.length) return null
  const item = items[0]
  return (
    <section style={{ marginBottom: '1rem', padding: '16px', borderRadius: '16px', background: '#edf7f2', border: '1px solid #cce5da' }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#386455', textTransform: 'uppercase' }}>Sıradaki en iyi adım</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: '#29483d', marginTop: 5 }}>{item.topic}</div>
      <div style={{ fontSize: 12, color: '#587067', marginTop: 4 }}>{item.reason}</div>
      {item.status === 'deferred' ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#8b6b32' }}>Yarına ertelendi</span>
          <button disabled={busy === item.id} onClick={() => act(item, 'resume')} style={buttonStyle}>Şimdi aç</button>
        </div>
      ) : item.status === 'accepted' ? (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <a href={`/quiz?subject=${encodeURIComponent(item.subject)}&topic=${encodeURIComponent(item.topic)}&recommendationId=${item.id}`} style={primaryStyle}>Çalışmaya devam et</a>
          <button disabled={busy === item.id} onClick={() => act(item, 'complete')} style={buttonStyle}>Tamamladım</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button disabled={busy === item.id} onClick={() => applyAndOpen(item)} style={primaryStyle}>Uygula</button>
          <button disabled={busy === item.id} onClick={() => act(item, 'defer')} style={buttonStyle}>Yarına ertele</button>
          <button disabled={busy === item.id} onClick={() => act(item, 'dismiss')} style={buttonStyle}>İlgilenmiyorum</button>
        </div>
      )}
    </section>
  )
}

const buttonStyle = { border: '1px solid #bfd7cb', background: '#fff', color: '#386455', borderRadius: 10, padding: '8px 11px', fontSize: 11, fontWeight: 700, cursor: 'pointer' } as const
const primaryStyle = { ...buttonStyle, background: '#386455', color: '#fff', textDecoration: 'none' } as const
