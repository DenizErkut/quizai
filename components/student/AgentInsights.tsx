'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type PlanItem = { topic?: string; subject?: string; reason?: string; estimated_minutes?: number; misconception?: string }
type Data = { study: PlanItem[]; review: PlanItem[]; progress: { completed_tests: number; average_pct: number | null; latest_topic: string | null; lowest_mastery_topics: { topic: string; mastery: number; retention: number | null }[] } | null }

export default function AgentInsights() {
  const [data, setData] = useState<Data | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      const headers = { Authorization: `Bearer ${session.access_token}` }
      const [study, review, progress] = await Promise.all([
        fetch('/api/agents/study-plan', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ timeBudgetMinutes: 20 }) }),
        fetch('/api/agents/review-plan', { headers }),
        fetch('/api/agents/progress-summary', { headers }),
      ])
      const [studyJson, reviewJson, progressJson] = await Promise.all([study.json(), review.json(), progress.json()])
      if (!cancelled) setData({ study: study.ok ? studyJson.plan ?? [] : [], review: review.ok ? reviewJson.plan ?? [] : [], progress: progress.ok ? progressJson.summary ?? null : null })
    }
    void load()
    return () => { cancelled = true }
  }, [])

  if (!data || (!data.study.length && !data.review.length && !data.progress)) return null
  const focus = data.study[0] ?? data.review[0]
  return <section style={{ marginBottom: '1rem', padding: '16px', borderRadius: '16px', background: '#f4f5ff', border: '1px solid #dfe2ff' }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: '#4b4fa3', textTransform: 'uppercase' }}>Prati’nin çalışma rehberi</div>
    {focus && <div style={{ marginTop: 6, fontSize: 13, color: '#30345f' }}><strong>Bugün için:</strong> {focus.topic}{focus.estimated_minutes ? ` · yaklaşık ${focus.estimated_minutes} dk` : ''}</div>}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <span style={badge}>🗓️ {data.study.length} çalışma adımı</span>
      <span style={badge}>🔁 {data.review.length} onaylı tekrar</span>
      {data.progress && <span style={badge}>📊 Son 30 gün: {data.progress.completed_tests} test · %{data.progress.average_pct ?? '—'}</span>}
    </div>
    {data.review[0]?.misconception && <div style={{ marginTop: 9, fontSize: 11, color: '#5a5d88' }}>Tekrar odağı: {data.review[0].misconception}</div>}
  </section>
}

const badge = { padding: '4px 8px', borderRadius: 99, background: '#e9eaff', color: '#4b4fa3', fontSize: 10, fontWeight: 700 } as const
