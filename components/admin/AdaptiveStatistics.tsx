'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function AdaptiveStatistics() {
  const [report, setReport] = useState<any>(null)
  useEffect(() => { void (async () => { const { data: { session } } = await createClient().auth.getSession(); if (!session) return; const response = await fetch('/api/admin/adaptive-evaluation', { headers: { Authorization: `Bearer ${session.access_token}` } }); if (response.ok) setReport(await response.json()) })() }, [])
  if (!report?.statistics) return null
  const labels: Record<string, string> = { mastery: 'Mastery değişimi', retention: '7 günlük kalıcılık', test_pct: 'Test başarısı', completion_rate: 'Tamamlama oranı', duration_seconds: 'Ortalama süre (sn)', test_count: 'Tamamlanan test sayısı' }
  const cohortLabel = (name: string) => name === 'adaptive' ? 'Adaptive' : 'Standard'
  return <div className="card" style={{ marginTop: '1rem' }}>
    <strong style={{ color: 'var(--primary)' }}>📊 İstatistiksel etki raporu</strong>
    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: report.claim_status === 'supported_by_pilot' ? '#eaf8ef' : '#fff4e5', color: report.claim_status === 'supported_by_pilot' ? '#176b3a' : '#8a5200', fontSize: 12, fontWeight: 700 }}>{report.claim_message}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginTop: 10 }}>{report.cohorts?.map((cohort: any) => <div key={cohort.cohort} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 12 }}><strong>{cohortLabel(cohort.cohort)}</strong><div>Atanan: {cohort.assigned_sample} · 24 saat: {cohort.day1_sample} · 7 gün: {cohort.completed_sample}</div><div style={{ color: 'var(--text3)', marginTop: 3 }}>Tamamlama: {cohort.completion_rate == null ? '—' : `%${Math.round(cohort.completion_rate * 100)}`} · Ortalama süre: {cohort.avg_duration_seconds ?? '—'} sn · Test: {cohort.avg_test_count ?? '—'}</div></div>)}</div>
    <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)' }}>Yorum eşiği: her grupta en az {report.minimum_interpretation_sample} tamamlanmış 7 günlük ölçüm ve gruplar arasında en fazla %25 örneklem farkı.</div>
    <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>{report.statistics.map((row: any) => <div key={row.metric} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 12 }}><strong>{labels[row.metric] || row.metric}</strong><div>Adaptive − Standard: {row.difference}{row.effect_size != null ? ` · Etki büyüklüğü: ${row.effect_size}` : ''}</div><div style={{ color: 'var(--text3)' }}>%95 güven aralığı: [{row.confidence_interval_95.join(', ')}] · {row.classification === 'insufficient_data' ? 'veri yetersiz' : row.classification}</div></div>)}</div>
  </div>
}
