'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type InstitutionTeacher = {
  id: string
  name: string
  joinedAt: string | null
  isActive: boolean
  deactivatedAt: string | null
}

export default function InstitutionTeachers() {
  const [teachers, setTeachers] = useState<InstitutionTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [busyTeacherId, setBusyTeacherId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const supabase = useMemo(() => createClient(), [])

  const loadTeachers = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Oturumun süresi dolmuş. Lütfen yeniden giriş yapın.')
        return
      }

      const response = await fetch('/api/institution/teachers', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Öğretmen listesi alınamadı.')
      setTeachers(result?.teachers ?? [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Öğretmen listesi alınamadı.')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadTeachers() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadTeachers, refreshKey])

  function refreshTeachers() {
    setLoading(true)
    setError('')
    setActionError('')
    setRefreshKey(key => key + 1)
  }

  async function setTeacherStatus(teacher: InstitutionTeacher, isActive: boolean) {
    const action = isActive ? 'yeniden etkinleştir' : 'pasif et'
    if (!isActive && !window.confirm(`${teacher.name} öğretmenini bu kurumda pasif etmek istiyor musunuz? Öğretmenin kurum bağlantısı saklanır; kurum raporlarında aktif öğretmen olarak görünmez.`)) return
    setBusyTeacherId(teacher.id)
    setActionError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Oturumun süresi dolmuş. Lütfen yeniden giriş yapın.')
      const response = await fetch('/api/institution/teachers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: teacher.id, is_active: isActive }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || `Öğretmen ${action} işlemi tamamlanamadı.`)
      setTeachers(current => current.map(item => item.id === teacher.id
        ? { ...item, isActive, deactivatedAt: isActive ? null : new Date().toISOString() }
        : item))
    } catch (actionError) {
      setActionError(actionError instanceof Error ? actionError.message : `Öğretmen ${action} işlemi tamamlanamadı.`)
    } finally {
      setBusyTeacherId(null)
    }
  }

  async function removeTeacher(teacher: InstitutionTeacher) {
    if (!window.confirm(`${teacher.name} öğretmeninin bu kurumdaki bağlantısını tamamen kaldırmak istiyor musunuz? Öğretmen hesabı ve diğer kurum bağlantıları etkilenmez.`)) return
    setBusyTeacherId(teacher.id)
    setActionError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Oturumun süresi dolmuş. Lütfen yeniden giriş yapın.')
      const response = await fetch('/api/institution/teachers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ user_id: teacher.id }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'Öğretmen bağlantısı kaldırılamadı.')
      setTeachers(current => current.filter(item => item.id !== teacher.id))
    } catch (actionError) {
      setActionError(actionError instanceof Error ? actionError.message : 'Öğretmen bağlantısı kaldırılamadı.')
    } finally {
      setBusyTeacherId(null)
    }
  }

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', margin: 0 }}>
            👩‍🏫 Öğretmenlerimiz
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', margin: '5px 0 0' }}>
            Kurumunuza öğretmen olarak bağlanan kişiler.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshTeachers}
          disabled={loading}
          style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: '9px', background: 'var(--surface)', color: 'var(--primary)', cursor: loading ? 'wait' : 'pointer', font: 'inherit', fontSize: '12px' }}
        >
          Yenile
        </button>
      </div>

      {loading ? (
        <div className="card" role="status" style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text3)' }}>
          Öğretmenler yükleniyor…
        </div>
      ) : error ? (
        <div className="card" role="alert" style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
          <p style={{ color: '#dc2626', margin: '0 0 12px' }}>{error}</p>
          <button type="button" onClick={refreshTeachers} className="btn-primary">Tekrar dene</button>
        </div>
      ) : teachers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
          <div style={{ fontSize: '42px', marginBottom: '12px' }}>👩‍🏫</div>
          <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--primary)' }}>Henüz bağlı öğretmen yok</div>
          <p style={{ fontSize: '13px', color: 'var(--text3)', margin: '8px 0 0' }}>
            Öğretmenler, kendi panellerindeki “Kurumlarım” bölümünden kurum kodunuzu kullanarak bağlanabilir.
          </p>
        </div>
      ) : (
        <div className="card" style={{ padding: '0.5rem 1rem' }}>
          <div style={{ padding: '10px 4px', fontSize: '12px', color: 'var(--text3)' }}>
            {teachers.filter(teacher => teacher.isActive).length} aktif · {teachers.length} toplam öğretmen
          </div>
          {actionError && <div role="alert" style={{ padding: '8px 4px', color: '#dc2626', fontSize: '13px' }}>{actionError}</div>}
          {teachers.map(teacher => (
            <div key={teacher.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '13px 4px', borderTop: '1px solid var(--border)', opacity: teacher.isActive ? 1 : 0.72 }}>
              <div aria-hidden="true" style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #155e75, #14b8a6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '13px', fontWeight: 700, flexShrink: 0 }}>
                {teacher.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('tr-TR') || 'Ö'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>{teacher.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>
                  {teacher.joinedAt ? `Bağlantı tarihi: ${new Date(teacher.joinedAt).toLocaleDateString('tr-TR')}` : 'Kurum öğretmeni'}
                </div>
              </div>
              <span style={{ fontSize: '12px', color: teacher.isActive ? '#16a34a' : 'var(--text3)', whiteSpace: 'nowrap' }}>
                {teacher.isActive ? 'Aktif' : 'Pasif'}
              </span>
              <button type="button" onClick={() => void setTeacherStatus(teacher, !teacher.isActive)} disabled={busyTeacherId === teacher.id}
                style={{ padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--surface)', color: 'var(--primary)', cursor: busyTeacherId === teacher.id ? 'wait' : 'pointer', font: 'inherit', fontSize: '12px', whiteSpace: 'nowrap' }}>
                {busyTeacherId === teacher.id ? 'İşleniyor…' : teacher.isActive ? 'Pasif et' : 'Etkinleştir'}
              </button>
              <button type="button" onClick={() => void removeTeacher(teacher)} disabled={busyTeacherId === teacher.id}
                style={{ padding: '7px 10px', border: '1px solid #fecaca', borderRadius: '8px', background: '#fff7f7', color: '#b91c1c', cursor: busyTeacherId === teacher.id ? 'wait' : 'pointer', font: 'inherit', fontSize: '12px', whiteSpace: 'nowrap' }}>
                Çıkart
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
