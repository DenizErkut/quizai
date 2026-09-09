'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Data = { students: number; recommendationCount: number; topics: { subject: string; topic: string; mastery: number; retention: number }[] }
export default function LearningInsights() {
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => { (async () => { const { data: { session } } = await createClient().auth.getSession(); if (!session) return; const r = await fetch('/api/teacher/learning-insights', { headers: { Authorization: `Bearer ${session.access_token}` } }); if (r.ok) setData(await r.json()) })() }, [])
  if (!data || !data.topics.length) return null
  return <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid #7c3aed' }}><div style={{ fontSize: 13, fontWeight: 700, color: '#6d28d9' }}>🧭 Sınıf öğrenme içgörüsü</div><div style={{ fontSize: 11, color: 'var(--text3)', margin: '4px 0 10px' }}>{data.students} öğrenci · {data.recommendationCount} aktif öneri · ortalama mastery en düşük konular</div><div style={{ display: 'grid', gap: 7 }}>{data.topics.map(t => <div key={`${t.subject}-${t.topic}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 7 }}><span><strong>{t.topic}</strong><br/><span style={{ color: 'var(--text3)' }}>{t.subject} · kalıcılık %{t.retention}</span></span><strong style={{ color: t.mastery < 50 ? 'var(--red)' : '#d97706' }}>mastery %{t.mastery}</strong></div>)}</div><div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)' }}>Öneri: en düşük iki konuyu kısa tekrar veya ödevle hedefleyin.</div></div>
}
