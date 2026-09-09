'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Summary = {
  mastery: { subject: string; topic: string; mastery_score: number; retention_score: number; trend: string }[]
  misconceptions: { subject: string; topic: string; status: string }[]
  recommendationHistory: { new_status: string; created_at: string }[]
}

export default function LearningSummary() {
  const [data, setData] = useState<Summary | null>(null)
  useEffect(() => {
    async function load() {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      const response = await fetch('/api/student/learning-summary', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (response.ok) setData(await response.json())
    }
    void load()
  }, [])
  if (!data || (!data.mastery.length && !data.misconceptions.length && !data.recommendationHistory.length)) return null
  const focus = data.mastery[0]
  return <section style={{ marginBottom: '1rem', padding: '16px', borderRadius: '16px', background: '#fffaf4', border: '1px solid #eaded1' }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: '#386455', textTransform: 'uppercase' }}>Öğrenme durumun</div>
    {focus && <div style={{ marginTop: 7, fontSize: 13, color: '#29483d' }}><strong>Şimdi odaklan:</strong> {focus.topic} · mastery %{Math.round(focus.mastery_score)} · kalıcılık %{Math.round(focus.retention_score)}</div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <span style={badge}>📈 {data.mastery.length} konu izleniyor</span>
      <span style={badge}>🧩 {data.misconceptions.length} doğrulanmış yanılgı</span>
      <span style={badge}>🔄 {data.recommendationHistory.length} öneri hareketi</span>
    </div>
    {data.misconceptions[0] && <div style={{ marginTop: 9, fontSize: 11, color: '#7c5d45' }}>Neden: {data.misconceptions[0].topic} konusunda kavramı pekiştiren kısa bir tekrar öneriliyor.</div>}
  </section>
}

const badge = { padding: '4px 8px', borderRadius: 99, background: '#f4eee6', color: '#6f6256', fontSize: 10, fontWeight: 700 } as const
