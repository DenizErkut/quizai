'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Option = { id: string; objective_code: string; title: string; availableItems: number; ready: boolean }
type Cycle = { id: string; status: string; objective?: { objective_code: string; title: string }; attempts: { stage: string; status: string; score_pct: number | null }[] }

export default function VerifiedLearningPlans({ classroomId, studentId }: { classroomId: string; studentId: string }) {
  const [options, setOptions] = useState<Option[]>([])
  const [cycles, setCycles] = useState<Cycle[]>([])
  const [objectiveId, setObjectiveId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!classroomId || !studentId) return
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error('Oturum gerekli.')
      const response = await fetch(`/api/teacher/verified-learning?${new URLSearchParams({ classroomId, studentId })}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Pilot durumu alınamadı.')
      setOptions(data.options || []); setCycles(data.cycles || []); setMessage('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Pilot durumu alınamadı.') }
  }, [classroomId, studentId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function create() {
    if (!objectiveId) return
    setBusy(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error('Oturum gerekli.')
      const response = await fetch('/api/teacher/verified-learning', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ classroomId, studentId, objectiveId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Pilot başlatılamadı.')
      await load()
      setMessage('Ölçüm döngüsü öğrenciye atandı. Öğrenci panelindeki “Doğrulanmış Öğrenme Pilotu” bağlantısından başlayabilir.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Pilot başlatılamadı.') }
    finally { setBusy(false) }
  }

  if (!studentId) return null
  return <section style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14, fontSize: 13 }}>
    <strong>Ölçüm döngüsü ata</strong>
    <p style={{ color: 'var(--text3)' }}>Üç ölçüm aşaması için 15, ayrı rehberli çalışma için en az 1 farklı soru gerekir. Ölçüm setlerinin zorluk dağılımı aynı olmalı.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <select aria-label="Pilot kazanımı" value={objectiveId} onChange={event => setObjectiveId(event.target.value)} style={{ padding: 9, borderRadius: 8, maxWidth: '100%' }}>
        <option value="">Kazanım seçin</option>
        {options.map(item => <option key={item.id} value={item.id}>{item.objective_code} · {item.availableItems}/16 doğrulanmış soru {item.ready ? '✓ hazır' : '· eksik'}</option>)}
      </select>
      <button className="btn btn-primary" disabled={busy || !options.find(item => item.id === objectiveId)?.ready} onClick={() => void create()}>Öğrenciye ata</button>
    </div>
    {!options.some(item => item.ready) && <p style={{ color: 'var(--text3)' }}>Bu sınıfta henüz dengeli 15 soruluk hazır kazanım yok. Yönetici panelinde kazanım ve soru kalitesi incelemesi tamamlandıkça burada açılacak.</p>}
    {message && <p role="status">{message}</p>}
    {cycles.length > 0 && <div style={{ marginTop: 12 }}>{cycles.map(cycle => <div key={cycle.id} style={{ padding: '7px 0', borderTop: '1px solid var(--border)' }}>
      {cycle.objective?.objective_code || 'Kazanım'} · {cycle.status === 'active' ? 'Sürüyor' : 'Aşamalar tamamlandı'} · {cycle.attempts.map(attempt => `${attempt.stage}: ${attempt.status === 'completed' ? `%${attempt.score_pct}` : attempt.status}`).join(' · ') || 'Ön test bekliyor'}
    </div>)}</div>}
  </section>
}
