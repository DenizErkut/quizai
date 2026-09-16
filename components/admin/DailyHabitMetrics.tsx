'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function DailyHabitMetrics() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  useEffect(() => { (async () => {
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch('/api/admin/daily-habits', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const payload = await res.json()
    if (res.ok) setData(payload); else setError(payload.error || 'Rapor alınamadı.')
  })() }, [])
  if (error) return <div className="card" style={{ color: 'var(--red)' }}>{error}</div>
  if (!data) return <div className="card">Günün 10 Dakikası raporu yükleniyor…</div>
  const pct = (value: number | null) => value == null ? '—' : `%${Math.round(value * 100)}`
  const metrics = [
    ['Atanan görev', data.assigned], ['Tamamlanan', data.completed], ['Öğrenci', data.students],
    ['Tamamlama', pct(data.completion_rate)], ['Ertesi gün dönüş', pct(data.d1_return_rate)], ['7 gün içinde dönüş', pct(data.d7_return_rate)],
    ['Ort. seri', Number(data.avg_current_streak).toFixed(1)], ['Havuz sorusu/görev', Number(data.avg_bank_questions).toFixed(1)], ['AI sorusu/görev', Number(data.avg_generated_questions).toFixed(1)],
  ]
  return <div className="card" style={{ marginTop: '1.5rem' }}>
    <div style={{ fontWeight: 700, marginBottom: 4 }}>Günün 10 Dakikası — son {data.window_days} gün</div>
    <div style={{ color: 'var(--text3)', fontSize: 12, marginBottom: 14 }}>Alışkanlık, geri dönüş ve havuz kullanımı</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
      {metrics.map(([label, value]) => <div key={label} className="card-sm" style={{ textAlign: 'center' }}><div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{label}</div></div>)}
    </div>
  </div>
}
