'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Objective = { id: string; objective_code: string; title: string }
type Evidence = {
  objective: Objective;
  evidence: {
    answeredItems: number; independentItems: number; firstObservedAt: string | null;
    objectiveMastery: { mastery_score: number; confidence_score: number; attempt_count: number } | null;
    topicMisconceptions: { status: string }[]; topicRecommendations: { status: string }[];
    topicTeacherActions: { status: string }[];
    transfer: { pending: number; completed: number; independentSuccess: number };
    teacherReviewedMeasurements: { gain_pp: number; transfer_gain_pp: number | null }[];
    verifiedGain: { gain_pp: number; transfer_gain_pp: number | null } | null;
  };
  caveats: string[]
}

export default function LearningEvidenceChain({ classroomId, studentId }: { classroomId: string; studentId: string }) {
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [objectiveId, setObjectiveId] = useState('')
  const [detail, setDetail] = useState<Evidence | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!classroomId || !studentId) return
    const timer = window.setTimeout(async () => {
      try {
        const { data: { session } } = await createClient().auth.getSession()
        if (!session) throw new Error('Oturum gerekli.')
        const response = await fetch(`/api/teacher/learning-evidence?${new URLSearchParams({ classroomId, studentId })}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Kazanımlar yüklenemedi.')
        setObjectives(data.objectives || [])
        setObjectiveId(''); setDetail(null); setMessage('')
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Kazanımlar yüklenemedi.') }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [classroomId, studentId])

  async function load(id: string) {
    setObjectiveId(id); setDetail(null); setMessage('')
    if (!id) return
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error('Oturum gerekli.')
      const response = await fetch(`/api/teacher/learning-evidence?${new URLSearchParams({ classroomId, studentId, objectiveId: id })}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kanıt zinciri alınamadı.')
      setDetail(data)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kanıt zinciri alınamadı.') }
  }

  if (!studentId) return null
  const e = detail?.evidence
  return <section style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14, fontSize: 13 }}>
    <strong>Öğrenci–kazanım kanıt zinciri</strong>
    <p style={{ color: 'var(--text3)' }}>Yalnız kayıtlardaki kanıt gösterilir; boş halkalara sonuç uydurulmaz.</p>
    <select aria-label="Kanıt kazanımı" value={objectiveId} onChange={event => void load(event.target.value)} style={{ padding: 9, borderRadius: 8, background: 'var(--bg2)', maxWidth: '100%' }}>
      <option value="">Kazanım seçin</option>
      {objectives.map(item => <option key={item.id} value={item.id}>{item.objective_code} · {item.title}</option>)}
    </select>
    {!objectives.length && <p style={{ color: 'var(--text3)' }}>Bu öğrencinin henüz kazanıma bağlı öğrenme olayı yok.</p>}
    {message && <p role="alert">{message}</p>}
    {e && <div style={{ display: 'grid', gap: 5, marginTop: 12 }}>
      <div>Başlangıç kanıtı: {e.firstObservedAt ? new Date(e.firstObservedAt).toLocaleDateString('tr-TR') : 'Yok'} · {e.answeredItems} soru olayı</div>
      <div>Kazanım tahmini: {e.objectiveMastery ? `%${e.objectiveMastery.mastery_score} (${e.objectiveMastery.attempt_count} deneme)` : 'Yok'}</div>
      <div>Konu düzeyinde yanılgı sinyali: {e.topicMisconceptions.length ? `${e.topicMisconceptions.length} kayıt; ${e.topicMisconceptions.filter(item => item.status === 'confirmed').length} doğrulanmış` : 'Yok'}</div>
      <div>Konu düzeyinde öneri/müdahale: {e.topicRecommendations.length} öneri · {e.topicTeacherActions.length} öğretmen aksiyonu</div>
      <div>Yardımsız soru olayı: {e.independentItems}</div>
      <div>Gecikmeli kontrol: {e.transfer.completed} tamamlandı ({e.transfer.independentSuccess} sunucuda doğru puanlandı), {e.transfer.pending} bekliyor</div>
      <div>İnsan incelemeli önce/sonra çifti: {e.teacherReviewedMeasurements.length ? `${e.teacherReviewedMeasurements.length} kayıt` : 'Yok'}</div>
      <strong>Aktarımlı ölçüm: {e.verifiedGain ? `ön/son ${e.verifiedGain.gain_pp >= 0 ? '+' : ''}${e.verifiedGain.gain_pp} yüzde puan; aktarım ${e.verifiedGain.transfer_gain_pp ?? '—'} yüzde puan` : 'Henüz doğrulanmadı'}</strong>
      <small style={{ color: 'var(--text3)' }}>{detail?.caveats.join(' ')}</small>
    </div>}
  </section>
}
