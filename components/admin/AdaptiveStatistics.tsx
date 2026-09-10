'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AdaptiveStatistics() {
  const [report, setReport] = useState<any>(null)
  useEffect(() => { void (async () => { const { data: { session } } = await createClient().auth.getSession(); if (!session) return; const response = await fetch('/api/admin/adaptive-evaluation', { headers: { Authorization: `Bearer ${session.access_token}` } }); if (response.ok) setReport(await response.json()) })() }, [])
  if (!report?.statistics) return null
  const labels: Record<string, string> = { mastery: 'Mastery', retention: 'Retention', test_pct: 'Test başarısı' }
  return <div className="card" style={{ marginTop: '1rem' }}><strong style={{ color: 'var(--primary)' }}>📊 İstatistiksel etki raporu</strong><div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>{report.interpretable ? 'Dengeli ve yeterli örneklem.' : 'Sonuçlar yalnızca ön izlemedir; örneklem henüz yorumlanabilir değil.'}</div><div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{report.statistics.map((row: any) => <div key={row.metric} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 12 }}><strong>{labels[row.metric] || row.metric}</strong><div>Adaptive − Standard: {row.difference} · Etki büyüklüğü: {row.effect_size ?? '—'}</div><div style={{ color: 'var(--text3)' }}>%95 güven aralığı: [{row.confidence_interval_95.join(', ')}] · {row.classification}</div></div>)}</div></div>
}
