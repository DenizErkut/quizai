'use client'

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'

type InstitutionMembership = {
  id: string
  name: string
  active: boolean
  joined_at: string | null
}

export default function TeacherInstitutionMemberships() {
  const { t: tr } = useT()
  const [institutions, setInstitutions] = useState<InstitutionMembership[]>([])
  const [institutionCode, setInstitutionCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [leaving, setLeaving] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const supabase = useMemo(() => createClient(), [])

  const loadInstitutions = useCallback(async (accessToken?: string) => {
    const token = accessToken ?? (await supabase.auth.getSession()).data.session?.access_token
    if (!token) throw new Error(tr('Oturum bulunamadı. Lütfen yeniden giriş yapın.'))
    const response = await fetch('/api/teacher/institutions', {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload.error || tr('Kurum bağlantıları alınamadı.'))
    setInstitutions(payload.institutions ?? [])
  }, [supabase, tr])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await loadInstitutions()
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : tr('Kurum bağlantıları alınamadı.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [loadInstitutions, tr])

  async function leaveInstitution(institution: InstitutionMembership) {
    if (!window.confirm(`${tr('{name} kurumundan ayrılmak istiyor musunuz?', { name: institution.name })}\n\n${tr('Sınıflarınız ve öğrencileriniz sizde kalır. Kurum bağlantısı kalktığı için kurumdan gelen tam erişim sona erer; tekrar bağlanmak için kurum kodunu girmeniz gerekir.')}`)) return
    setError('')
    setNotice('')
    setLeaving(institution.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(tr('Oturum bulunamadı. Lütfen yeniden giriş yapın.'))
      const response = await fetch('/api/teacher/institutions', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ institution_id: institution.id }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload.error || tr('Kurumdan ayrılma işlemi tamamlanamadı.'))
      setNotice(tr('{name} kurumundan ayrıldınız.', { name: institution.name }))
      await loadInstitutions(session.access_token)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr('Kurumdan ayrılma işlemi tamamlanamadı.'))
    } finally {
      setLeaving('')
    }
  }

  async function joinInstitution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')
    const code = institutionCode.trim().toUpperCase()
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      setError(tr('Kurum kodu 8 harf veya rakamdan oluşmalı.'))
      return
    }

    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error(tr('Oturum bulunamadı. Lütfen yeniden giriş yapın.'))
      const response = await fetch('/api/teacher/institutions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ institution_code: code }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || tr('Kurum bağlantısı kurulamadı.'))
      setInstitutionCode('')
      setNotice(payload.already_member
        ? tr('{name} kurumuna zaten öğretmen olarak bağlısınız.', { name: payload.institution_name })
        : tr('{name} kurumuna öğretmen olarak bağlandınız.', { name: payload.institution_name }))
      await loadInstitutions(session.access_token)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : tr('Kurum bağlantısı kurulamadı.'))
    } finally {
      setSaving(false)
    }
  }

  return <section className="card" aria-labelledby="teacher-institutions-title" style={{ marginBottom: '1.25rem' }}>
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div>
        <h2 id="teacher-institutions-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)', margin: 0 }}>
          {tr('🏢 Kurumlarım')}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text3)', margin: '5px 0 0', lineHeight: 1.6 }}>
          {tr('Kurum yöneticinizden aldığınız kodla öğretmen olarak bağlanın. Birden fazla kuruma katılabilirsiniz.')}
        </p>
      </div>
    </div>

    <form onSubmit={joinInstitution} style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
      <label htmlFor="teacher-institution-code" style={{ flex: '1 0 100%', fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: -3 }}>
        {tr('Kurum Kodu')}
      </label>
      <input
        id="teacher-institution-code"
        value={institutionCode}
        onChange={event => setInstitutionCode(event.target.value.toUpperCase().replace(/\s/g, '').slice(0, 8))}
        placeholder={tr('Kurum Kodu')}
        autoComplete="off"
        spellCheck={false}
        maxLength={8}
        aria-describedby="teacher-institution-code-help"
        style={{ flex: '1 1 210px', minWidth: 0, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 9, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'monospace', letterSpacing: '.12em', textTransform: 'uppercase' }}
      />
      <button className="btn btn-primary" type="submit" disabled={saving || institutionCode.length !== 8}>
        {saving ? tr('Bağlanıyor…') : tr('Öğretmen olarak bağlan')}
      </button>
    </form>
    <div id="teacher-institution-code-help" style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
      {tr('Kod 8 karakterlidir. Kurum bağlantısı öğrenci üyeliği oluşturmaz ve mevcut rolünüzü değiştirmez.')}
    </div>
    {error && <div role="alert" style={{ marginTop: 9, color: 'var(--red)', fontSize: 12 }}>{error}</div>}
    {notice && <div role="status" style={{ marginTop: 9, color: 'var(--green)', fontSize: 12 }}>{notice}</div>}

    <div style={{ borderTop: '1px solid var(--border)', marginTop: 14, paddingTop: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', marginBottom: 7 }}>{tr('Bağlı olduğunuz kurumlar')}</div>
      {loading ? <div style={{ color: 'var(--text3)', fontSize: 12 }}>{tr('Kurumlar yükleniyor…')}</div>
        : institutions.length === 0
          ? <div style={{ color: 'var(--text3)', fontSize: 12 }}>{tr('Henüz bir kuruma öğretmen olarak bağlanmadınız.')}</div>
          : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {institutions.map(institution => <li key={institution.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12, padding: '8px 10px', borderRadius: 8, background: 'var(--bg2)' }}>
              <span style={{ fontWeight: 650 }}>{institution.name}</span>
              <span style={{ color: institution.active ? 'var(--green)' : 'var(--text3)', whiteSpace: 'nowrap' }}>
                {institution.active ? tr('Öğretmen bağlantısı aktif') : tr('Kurum pasif')}
              </span>
              <button type="button" className="btn btn-sm" disabled={leaving === institution.id} onClick={() => void leaveInstitution(institution)}>
                {leaving === institution.id ? tr('Ayrılıyor…') : tr('Kurumdan ayrıl')}
              </button>
            </li>)}
          </ul>}
    </div>
  </section>
}
