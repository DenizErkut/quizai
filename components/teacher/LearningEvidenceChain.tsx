'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'

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
  const { t: tr, locale } = useT()
  const dl = intlLocale(locale)
  const none = tr('Yok')
  const [objectives, setObjectives] = useState<Objective[]>([])
  const [objectiveId, setObjectiveId] = useState('')
  const [detail, setDetail] = useState<Evidence | null>(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!classroomId || !studentId) return
    const timer = window.setTimeout(async () => {
      try {
        const { data: { session } } = await createClient().auth.getSession()
        if (!session) throw new Error(tr('Oturum gerekli.'))
        const response = await fetch(`/api/teacher/learning-evidence?${new URLSearchParams({ classroomId, studentId })}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || tr('Kazanımlar yüklenemedi.'))
        setObjectives(data.objectives || [])
        setObjectiveId(''); setDetail(null); setMessage('')
      } catch (error) { setMessage(error instanceof Error ? error.message : tr('Kazanımlar yüklenemedi.')) }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [classroomId, studentId, tr])

  async function load(id: string) {
    setObjectiveId(id); setDetail(null); setMessage('')
    if (!id) return
    try {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) throw new Error(tr('Oturum gerekli.'))
      const response = await fetch(`/api/teacher/learning-evidence?${new URLSearchParams({ classroomId, studentId, objectiveId: id })}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || tr('Kanıt zinciri alınamadı.'))
      setDetail(data)
    } catch (error) { setMessage(error instanceof Error ? error.message : tr('Kanıt zinciri alınamadı.')) }
  }

  if (!studentId) return null
  const e = detail?.evidence
  return <section style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14, fontSize: 13 }}>
    <strong>{tr('Öğrenci–kazanım kanıt zinciri')}</strong>
    <p style={{ color: 'var(--text3)' }}>{tr('Yalnız kayıtlardaki kanıt gösterilir; boş halkalara sonuç uydurulmaz.')}</p>
    <select aria-label={tr('Kanıt kazanımı')} value={objectiveId} onChange={event => void load(event.target.value)} style={{ padding: 9, borderRadius: 8, background: 'var(--bg2)', maxWidth: '100%' }}>
      <option value="">{tr('Kazanım seçin')}</option>
      {objectives.map(item => <option key={item.id} value={item.id}>{item.objective_code} · {item.title}</option>)}
    </select>
    {!objectives.length && <p style={{ color: 'var(--text3)' }}>{tr('Bu öğrencinin henüz kazanıma bağlı öğrenme olayı yok.')}</p>}
    {message && <p role="alert">{message}</p>}
    {e && <div style={{ display: 'grid', gap: 5, marginTop: 12 }}>
      <div>{tr('Başlangıç kanıtı: {date} · {n} soru olayı', { date: e.firstObservedAt ? new Date(e.firstObservedAt).toLocaleDateString(dl) : none, n: e.answeredItems })}</div>
      <div>{tr('Kazanım tahmini: {value}', { value: e.objectiveMastery ? tr('%{pct} ({n} deneme)', { pct: e.objectiveMastery.mastery_score, n: e.objectiveMastery.attempt_count }) : none })}</div>
      <div>{tr('Konu düzeyinde yanılgı sinyali: {value}', { value: e.topicMisconceptions.length ? tr('{n} kayıt; {confirmed} doğrulanmış', { n: e.topicMisconceptions.length, confirmed: e.topicMisconceptions.filter(item => item.status === 'confirmed').length }) : none })}</div>
      <div>{tr('Konu düzeyinde öneri/müdahale: {recs} öneri · {actions} öğretmen aksiyonu', { recs: e.topicRecommendations.length, actions: e.topicTeacherActions.length })}</div>
      <div>{tr('Yardımsız soru olayı: {n}', { n: e.independentItems })}</div>
      <div>{tr('Gecikmeli kontrol: {done} tamamlandı ({ok} sunucuda doğru puanlandı), {pending} bekliyor', { done: e.transfer.completed, ok: e.transfer.independentSuccess, pending: e.transfer.pending })}</div>
      <div>{tr('İnsan incelemeli önce/sonra çifti: {value}', { value: e.teacherReviewedMeasurements.length ? tr('{n} kayıt', { n: e.teacherReviewedMeasurements.length }) : none })}</div>
      <strong>{tr('Aktarımlı ölçüm: {value}', { value: e.verifiedGain ? tr('ön/son {gain} yüzde puan; aktarım {transfer} yüzde puan', { gain: `${e.verifiedGain.gain_pp >= 0 ? '+' : ''}${e.verifiedGain.gain_pp}`, transfer: e.verifiedGain.transfer_gain_pp ?? '—' }) : tr('Henüz doğrulanmadı') })}</strong>
      <small style={{ color: 'var(--text3)' }}>{detail?.caveats.join(' ')}</small>
    </div>}
  </section>
}
