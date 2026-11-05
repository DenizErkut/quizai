'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'

type Classroom = { id: string; name: string }
type Scenario = { subject: string; term: number; scenarioNo: number; questionCount: number }
const field: React.CSSProperties = { width: '100%', padding: '9px 10px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }

// "Senaryodan ata": önce ders, sonra dönem/senaryo; senaryonun tüm soruları (şekil ve doldurulabilir tablolarıyla) sınıfa ödev olarak atanır.
export default function ScenarioAssign({ classrooms, onCreated }: { classrooms: Classroom[]; onCreated: (assignments: unknown[]) => void }) {
  const { t } = useT()
  const supabase = createClient()
  const [classroomId, setClassroomId] = useState(classrooms[0]?.id || '')
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [needsGrade, setNeedsGrade] = useState(false)
  const [subject, setSubject] = useState('')
  const [pick, setPick] = useState('')
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const headers = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }

  useEffect(() => {
    setSubject(''); setPick(''); setScenarios([]); setNeedsGrade(false)
    if (!classroomId) return
    ;(async () => {
      const res = await fetch(`/api/teacher/assign-scenario?classroom_id=${classroomId}`, { headers: await headers(), cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      setScenarios(json.scenarios || []); setNeedsGrade(!!json.needsGrade)
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classroomId])

  const subjects = [...new Set(scenarios.map(s => s.subject))]
  const options = scenarios.filter(s => s.subject === subject)
  const chosen = pick ? options.find(s => `${s.term}|${s.scenarioNo}` === pick) : undefined

  async function assign() {
    if (!chosen) { setError(t('Ders ve senaryo seçin.')); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/teacher/assign-scenario', { method: 'POST', headers: await headers(), body: JSON.stringify({ classroom_id: classroomId, subject: chosen.subject, term: chosen.term, scenarioNo: chosen.scenarioNo, title, due_date: due || undefined }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error || t('Ödev kaydedilemedi.')); return }
      onCreated(json.assignments || [])
    } catch { setError(t('Beklenmeyen bir hata oluştu.')) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>{t('Yöneticinin yüklediği senaryo serisi sınıfa atanır: senaryodaki tüm sorular, şekilleri ve doldurulacak tablolarıyla birlikte ödev olur.')}</p>
      {error && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: 4, fontSize: 13, color: 'var(--red)' }}>{error}</div>}
      <select value={classroomId} onChange={e => setClassroomId(e.target.value)} style={field} aria-label={t('Sınıf')}>
        {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      {needsGrade && <div style={{ fontSize: 12, color: 'var(--red)' }}>{t('Bu sınıfın seviyesi (sınıf düzeyi) tanımlı değil.')}</div>}
      <select value={subject} onChange={e => { setSubject(e.target.value); setPick('') }} style={field} aria-label={t('Ders seç')}>
        <option value="">{subjects.length ? t('Ders seç…') : t('Bu seviye için yayınlanmış senaryo yok')}</option>
        {subjects.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      {subject && (
        <select value={pick} onChange={e => setPick(e.target.value)} style={field} aria-label={t('Senaryo')}>
          <option value="">{t('Senaryo seç…')}</option>
          {options.map(s => <option key={`${s.term}|${s.scenarioNo}`} value={`${s.term}|${s.scenarioNo}`}>{t('{term}. Dönem {no}. Senaryo', { term: s.term, no: s.scenarioNo })} · {t('{n} soru', { n: s.questionCount })}</option>)}
        </select>
      )}
      <input placeholder={t('Ödev başlığı (boş bırakırsan ders ve senaryo adı kullanılır)')} value={title} onChange={e => setTitle(e.target.value)} style={field} />
      <input type="date" value={due} onChange={e => setDue(e.target.value)} style={field} aria-label={t('Son tarih')} />
      <button className="btn btn-primary" disabled={busy || !chosen} onClick={() => void assign()} style={{ justifyContent: 'center' }}>{busy ? t('Atanıyor…') : t('Senaryoyu sınıfa ata')}</button>
    </div>
  )
}
