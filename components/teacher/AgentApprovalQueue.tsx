'use client'
import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'
import { evidenceFacts, type ActionProposal, type ActionFollowup } from '@/lib/teacher-action-workbench'
import VerifiedLearningMetrics from '@/components/VerifiedLearningMetrics'
import VerifiedLearningPlans from './VerifiedLearningPlans'
import LearningEvidenceChain from './LearningEvidenceChain'

type Item = ActionProposal & { objectiveId: string | null; followup: ActionFollowup | null }
type Props = { students?: { id: string; name: string }[]; classrooms?: { id: string; name: string }[]; selectedClass?: string }
async function request(path: string, init?: RequestInit) {
  const { data: { session } } = await createClient().auth.getSession()
  if (!session) throw new Error('Oturum gerekli.')
  const response = await fetch(path, { ...init, cache: 'no-store', headers: { ...init?.headers, Authorization: `Bearer ${session.access_token}` } })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'İşlem tamamlanamadı.')
  return data
}

export default function AgentApprovalQueue({ students = [], classrooms = [], selectedClass = 'all' }: Props) {
  const { t, locale } = useT()
  const [items, setItems] = useState<Item[]>([])
  const [filter, setFilter] = useState('pending')
  const [notice, setNotice] = useState(''), [error, setError] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [hasMore, setHasMore] = useState(false)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [opened, setOpened] = useState('')
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(''); setItems([])
    try {
      const data = await request(`/api/teacher/agent-approvals?status=${filter}`, { signal })
      if (!signal?.aborted) { setItems(data.items || []); setHasMore(data.hasMore === true) }
    } catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.') }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [filter])
  useEffect(() => {
    const controller = new AbortController()
    const timer = window.setTimeout(() => { void load(controller.signal) }, 0)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [load])
  async function decide(item: Item, status: 'approved' | 'rejected') {
    setBusy(true); setNotice(''); setError('')
    try {
      await request('/api/teacher/agent-approvals', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, status, note: notes[item.id] || '' }) })
      setNotes(old => { const next = { ...old }; delete next[item.id]; return next })
      await load()
      setNotice(status === 'approved' ? 'Öneri onay kararı kaydedildi. Bu işlem öğrenciye uygulanmadı.' : 'Öneri reddedildi; öğrenciye herhangi bir işlem uygulanmadı.')
    } catch (e) { setError(e instanceof Error ? e.message : 'İşlem tamamlanamadı.') }
    finally { setBusy(false) }
  }
  async function linkCycle(item: Item, cycleId: string) {
    await request('/api/teacher/agent-approvals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, cycleId }) })
    // Keep the plan editor mounted: a refresh must not hide a successful assignment or retry control.
    const data = await request(`/api/teacher/agent-approvals?status=${filter}`)
    setItems(data.items || []); setNotice('Döngü önerinin takibine bağlandı.')
  }
  const factLabels = { answeredItems: 'Soru olayı', independentItems: 'Yardımsız soru olayı', evidenceCount: 'Kanıt kaydı', questionCount: 'Farklı soru', sessionCount: 'Oturum' }
  const statusLabels = { pending: 'Karar bekliyor', approved: 'Onaylandı · atama ayrı işlem', rejected: 'Reddedildi', cancelled: 'İptal edildi' }
  const followupLabels = { assigned: 'Atandı · öğrenci henüz başlamadı', started: 'Ön test kaydedildi · takip sürüyor', measured: 'Aktarım ölçüldü · öğretmen incelemesi bekliyor', reviewed: 'Öğretmen incelemeli aktarım mevcut' }
  const actionLabels = { assign_practice: 'Çalışma önerisi', adjust_plan: 'Plan değişikliği önerisi', send_message: 'Mesaj önerisi' }
  const visible = items.filter(item => selectedClass === 'all' || item.classroom_id === selectedClass)
  return <section className="card" aria-label={t('Bulgudan eyleme')} style={{ marginBottom: '1.5rem', borderTop: '3px solid var(--primary)' }}>
    <h2 style={{ fontSize: 18, margin: '0 0 6px' }}>{t('Bulgudan eyleme')}</h2>
    <p style={{ fontSize: 12, color: 'var(--text3)', margin: '0 0 14px' }}>{t('Kanıtı inceleyin, belirsizliği görün, karar verin ve ayrı bir atamayla sonucu takip edin.')}</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      <label>{t('Öneri durumu')}{' '}<select value={filter} disabled={busy} onChange={e => { setFilter(e.target.value); setOpened(''); setNotice('') }}>
        <option value="pending">{t('Bekleyenler')}</option><option value="approved">{t('Onaylananlar')}</option>
        <option value="rejected">{t('Reddedilenler')}</option><option value="all">{t('Tümü')}</option>
      </select></label>
      <button className="btn btn-sm" disabled={loading || busy} onClick={() => void load()}>{t('Yenile')}</button>
      <span style={{ fontSize: 12 }}>{t('Gösterilen öneri: {n}', { n: visible.length })}</span>
    </div>
    {hasMore && <p>{t('Son 100 kayıt gösteriliyor; liste tüm geçmişi kapsamaz.')}</p>}
    {notice && <p role="status">{t(notice)}</p>}
    {error && <p role="alert" style={{ color: 'var(--red)' }}>{t(error)}</p>}
    {loading && <p role="status">{t('Yükleniyor…')}</p>}
    {!loading && !error && !visible.length && <p style={{ color: 'var(--text3)' }}>{t('Bu görünümde öneri yok. Öğrenci öğrenme ölçümü bölümünden mevcut kanıt ve planları inceleyebilirsiniz.')}</p>}
    {visible.map(item => <article key={item.id} style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 16, marginTop: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }}>
        <strong>{students.find(s => s.id === item.student_id)?.name || t('Öğrenci')} · {classrooms.find(c => c.id === item.classroom_id)?.name || t('Sınıf')}</strong>
        <span style={{ fontSize: 12 }}>{t(statusLabels[item.status] || 'Karar bekliyor')}</span>
      </div>
      <h3 style={{ fontSize: 16, marginBottom: 6 }}>{item.title}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 12 }}>
        <div><h4>{t('Bulgu ve gerekçe')}</h4><p>{item.rationale}</p></div>
        <div><h4>{t('Kanıt ve belirsizlik')}</h4>
          {evidenceFacts(item.evidence).length ? <ul>{evidenceFacts(item.evidence).map(f => <li key={f.key}>{t(factLabels[f.key])}: {f.value}</li>)}</ul>
            : <p>{t('Öneride sayısal kanıt özeti yok; güven düzeyi hesaplanmadı.')}</p>}
          <p style={{ fontSize: 12, color: 'var(--text3)' }}>{t('Öneri kesin teşhis değildir. Konu düzeyindeki sinyal, tek bir kazanımın doğrulanmış kanıtı sayılmaz.')}</p>
          <small>{t('Öneri tarihi')}: {new Date(item.created_at).toLocaleString(intlLocale(locale))} · {item.agent_name} · {item.policy_version}</small>
        </div>
        <div><h4>{t('Önerilen adım')}</h4><p>{t(actionLabels[item.proposed_action] || 'Öğretmen incelemesi')}</p>
          <p>{t('Onay, atama değildir. Mesajlar otomatik gönderilmez; puanlar değiştirilmez.')}</p>
        </div>
      </div>
      {item.review_note && <p><strong>{t('Öğretmen kararı / plan notu')}: </strong>{item.review_note}{item.reviewed_at && <> · {new Date(item.reviewed_at).toLocaleString(intlLocale(locale))}</>}</p>}
      {item.status === 'pending' && <div>
        <label htmlFor={`action-note-${item.id}`}>{t('Karar gerekçesi / öğretmen planı (10–500 karakter)')}</label>
        <textarea id={`action-note-${item.id}`} value={notes[item.id] || ''} rows={3} maxLength={500}
          onChange={e => setNotes(old => ({ ...old, [item.id]: e.target.value }))} style={{ width: '100%', display: 'block', margin: '8px 0' }} />
        <small>{t('Plan notu saklanır; atanacak testin içeriğini otomatik değiştirmez.')}</small>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <button className="btn btn-primary" disabled={busy || (notes[item.id] || '').trim().length < 10} onClick={() => void decide(item, 'approved')}>{t('Öneriyi onayla')}</button>
          <button className="btn" disabled={busy || (notes[item.id] || '').trim().length < 10} onClick={() => void decide(item, 'rejected')}>{t('Reddet')}</button>
        </div>
      </div>}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 14 }}>
        <strong>{t('Uygulama ve sonuç takibi')}</strong>
        <p>{item.followup ? t(followupLabels[item.followup.status]) : t('Bağlı uygulama kaydı yok; bu öneri uygulanmış sayılmıyor.')}</p>
        {item.followup && <><VerifiedLearningMetrics metrics={item.followup.metrics} /><small>{t('Ön/son farkı tek başına müdahalenin nedensel etkisini kanıtlamaz.')}</small></>}
        <button className="btn btn-sm" disabled={busy} aria-expanded={opened === item.id} onClick={() => setOpened(opened === item.id ? '' : item.id)}>{t('Kanıtı ve çalışma planını aç')}</button>
        {opened === item.id && item.classroom_id && <div>
          <LearningEvidenceChain key={`evidence:${item.id}`} classroomId={item.classroom_id} studentId={item.student_id} initialObjectiveId={item.objectiveId || undefined} />
          {item.status === 'approved' && ['assign_practice', 'adjust_plan'].includes(item.proposed_action) && item.objectiveId && item.reviewed_at
            ? <VerifiedLearningPlans key={`plans:${item.id}`} classroomId={item.classroom_id} studentId={item.student_id}
                proposalScope={{ objectiveId: item.objectiveId, reviewedAt: item.reviewed_at }} onLinkCycle={cycleId => linkCycle(item, cycleId)} />
            : <p>{t('Atama için önce öğretmen onayı ve geçerli kazanım kimliği gerekir. Eksik kanıtla otomatik atama yapılmaz.')}</p>}
        </div>}
      </div>
    </article>)}
  </section>
}
