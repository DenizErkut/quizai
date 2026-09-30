'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Subject = { id: string | null; subject: string; topics: string[]; isActive: boolean; customized: boolean }
type Level = 'İlkokul' | 'Ortaokul' | 'Lise' | 'Üniversite'
const GRADES: Record<Level, string[]> = {
  İlkokul: ['1', '2', '3', '4'], Ortaokul: ['5', '6', '7', '8'],
  Lise: ['9', '10', '11', '12'], Üniversite: ['universite'],
}

export default function OpenEndedCatalogManager() {
  const [level, setLevel] = useState<Level>('Ortaokul')
  const [grade, setGrade] = useState('6')
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [selected, setSelected] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const current = subjects.find(item => item.subject === selected)

  const authHeader = async () => {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) throw new Error('Yönetici oturumu gerekli.')
    return { Authorization: `Bearer ${session.access_token}` }
  }

  const load = useCallback(async () => {
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/open-ended-catalog?grade=${encodeURIComponent(grade)}`, {
        headers: await authHeader(), cache: 'no-store',
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Katalog yüklenemedi.')
      setSubjects(data.subjects)
      setSelected(old => data.subjects.some((item: Subject) => item.subject === old) ? old : data.subjects[0]?.subject ?? '')
      setMessage('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Katalog yüklenemedi.') }
    finally { setBusy(false) }
  }, [grade])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  async function save(subject: string, topics: string[], isActive: boolean) {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/open-ended-catalog', {
        method: 'PUT',
        headers: { ...(await authHeader()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, subject, topics, isActive }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Kayıt başarısız.')
      setSubjects(data.subjects)
      setSelected(subject)
      setMessage('Değişiklik kaydedildi.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Kayıt başarısız.') }
    finally { setBusy(false) }
  }

  return <section className="card" style={{ marginBottom: '1rem' }}>
    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--primary)' }}>✍️ Açık Uçlu Sorular — Ders ve Konu Yönetimi</div>
    <p style={{ fontSize: 12, color: 'var(--text3)' }}>Serbest Pratik’te öğrencinin göreceği sınıf, ders ve konu listesini yönetin. Mevcut konular başlangıç listesi olarak korunur.</p>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
      {(Object.keys(GRADES) as Level[]).map(item => <button key={item} type="button" className="btn btn-sm"
        style={{ background: level === item ? 'var(--accent)' : undefined, color: level === item ? '#fff' : undefined }}
        onClick={() => { setLevel(item); setGrade(GRADES[item][0]); setSelected('') }}>{item}</button>)}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {GRADES[level].map(item => <button key={item} type="button" className="btn btn-sm"
        style={{ borderColor: grade === item ? 'var(--accent)' : undefined, fontWeight: grade === item ? 700 : undefined }}
        onClick={() => { setGrade(item); setSelected('') }}>{item === 'universite' ? 'Üniversite' : `${item}. sınıf`}</button>)}
      <button type="button" className="btn btn-sm" onClick={() => void load()} disabled={busy}>↻ Yenile</button>
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      {subjects.map(item => <button key={item.subject} type="button" className="btn btn-sm"
        style={{ borderColor: selected === item.subject ? 'var(--accent)' : undefined, opacity: item.isActive ? 1 : 0.5 }}
        onClick={() => setSelected(item.subject)}>{item.subject} · {item.topics.length} konu{item.isActive ? '' : ' (gizli)'}</button>)}
    </div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
      <input className="input" value={newSubject} onChange={event => setNewSubject(event.target.value)} maxLength={120}
        placeholder="Yeni ders adı (örn: Matematik)" style={{ flex: 1, minWidth: 180 }} />
      <button type="button" className="btn btn-primary" disabled={busy || !newSubject.trim() || subjects.some(item => item.subject.toLocaleLowerCase('tr') === newSubject.trim().toLocaleLowerCase('tr'))}
        onClick={() => { void save(newSubject.trim(), [], true); setNewSubject('') }}>+ Ders ekle</button>
    </div>
    {current && <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <strong>{grade === 'universite' ? 'Üniversite' : `${grade}. sınıf`} / {current.subject}</strong>
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => void save(current.subject, current.topics, !current.isActive)}>
          {current.isActive ? '👁️ Öğrenciden gizle' : '👁️ Öğrenciye göster'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {current.topics.map((topic, index) => <span key={`${topic}-${index}`} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '5px 9px', background: 'var(--bg2)' }}>
          {topic} <button type="button" disabled={busy} title={`${topic} konusunu kaldır`} aria-label={`${topic} konusunu kaldır`}
            style={{ border: 0, background: 'none', cursor: 'pointer', color: '#dc2626' }}
            onClick={() => void save(current.subject, current.topics.filter((_, i) => i !== index), current.isActive)}>×</button>
        </span>)}
        {!current.topics.length && <span style={{ color: 'var(--text3)', fontSize: 12 }}>Henüz konu yok; öğrenci ekranında görünmez.</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        <input className="input" value={newTopic} onChange={event => setNewTopic(event.target.value)} maxLength={160}
          placeholder="Alt konu (örn: Tam sayılar)" style={{ flex: 1, minWidth: 180 }} />
        <button type="button" className="btn btn-primary" disabled={busy || !newTopic.trim() || current.topics.some(item => item.toLocaleLowerCase('tr') === newTopic.trim().toLocaleLowerCase('tr'))}
          onClick={() => { void save(current.subject, [...current.topics, newTopic.trim()], current.isActive); setNewTopic('') }}>+ Konu ekle</button>
      </div>
    </div>}
    {message && <p role="status" style={{ color: message === 'Değişiklik kaydedildi.' ? '#16803c' : '#dc2626', fontSize: 12 }}>{message}</p>}
  </section>
}
