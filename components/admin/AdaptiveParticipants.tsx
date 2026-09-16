'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Participant = { id: string; student_id: string; name: string; email: string; cohort: string; observation_days: number; pilot_tests: number; completed: boolean; day1_done: boolean; day7_done: boolean; day1_ready: boolean; day7_ready: boolean }

export default function AdaptiveParticipants() {
  const [items, setItems] = useState<Participant[]>([])
  async function request(url: string, options?: RequestInit) { const { data: { session } } = await createClient().auth.getSession(); if (!session) return null; const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${session.access_token}`, ...(options?.headers || {}) } }); return response.ok ? response.json() : null }
  async function load() { const data = await request('/api/admin/adaptive-evaluation/participants'); setItems(data?.participants || []) }
  useEffect(() => { void load() }, [])
  async function followUp(studentId: string) { const data = await request('/api/admin/adaptive-evaluation/follow-up', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId }) }); if (data) load() }
  return <div className="card"><strong style={{ color: 'var(--primary)' }}>📋 Pilot katılımcıları</strong><div style={{ marginTop: 8, display: 'grid', gap: 7 }}>{items.map(item => <div key={item.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 7, display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}><span><strong>{item.name}</strong> · {item.cohort}<br/><span style={{ color: 'var(--text3)' }}>{item.email} · {item.observation_days} gün · {item.pilot_tests} test · 24s: {item.day1_done ? '✓' : '—'} · 7g: {item.day7_done ? '✓' : '—'}</span></span>{item.completed ? <strong style={{ color: 'var(--green)' }}>✓ 7 gün tamamlandı</strong> : item.day7_ready ? <button className="btn btn-sm" onClick={() => followUp(item.student_id)}>7 gün ölç</button> : item.day1_ready ? <button className="btn btn-sm" onClick={() => followUp(item.student_id)}>24 saat ölç</button> : <span style={{ color: 'var(--text3)' }}>Bekliyor</span>}</div>)}{items.length === 0 && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Henüz pilot katılımcısı yok.</div>}</div></div>
}
