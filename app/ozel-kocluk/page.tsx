'use client'
import { useState } from 'react'
import Link from 'next/link'
import Tr from '@/components/Tr'
import { useT } from '@/lib/i18n/I18nProvider'
import SiteFooter from '@/components/SiteFooter'

export default function OzelKoclukPage() {
  const { t: tr } = useT()
  const [leadType, setLeadType] = useState<'kurum' | 'bireysel'>('bireysel')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [institutionName, setInstitutionName] = useState('')
  const [studentGrade, setStudentGrade] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/coaching-leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadType, name, email, phone, institutionName, studentGrade, message }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || tr('Bir şeyler ters gitti.')); setSaving(false); return }
      setDone(true)
    } catch {
      setError(tr('Bağlantı hatası, lütfen tekrar dene.'))
    }
    setSaving(false)
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '2rem 1.5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'inline-block', marginBottom: '1.5rem' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '52px' }} />
        </Link>

        <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}><Tr text="Yeni" /></div>
        <h1 className="serif" style={{ fontSize: '28px', marginBottom: '0.5rem' }}><Tr text="Özel Koçluk Programı" /></h1>
        <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.7 }}><Tr text="Deneyimli bir eğitim koçunun birebir desteğini, Pratium'un yapay zeka destekli takip sistemiyle birleştiriyoruz. Koç, her görüşmeye öğrencinin çözdüğü testlerden gelen güncel verilerle girer. Kurumlar ve bireysel öğrenci/veliler için ayrı paketler sunuyoruz — aşağıdaki formu doldur, seninle 1 iş günü içinde iletişime geçelim." /></p>

        {done ? (
          <div className="card" style={{ textAlign: 'center', padding: '2.5rem 1.5rem' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px' }}>✅</div>
            <p style={{ fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}><Tr text="Talebin alındı!" /></p>
            <p style={{ fontSize: '13px', color: 'var(--text2)' }}><Tr text="En kısa sürede seninle iletişime geçeceğiz." /></p>
          </div>
        ) : (
          <form onSubmit={submit} className="card" style={{ padding: '1.5rem' }}>
            {error && (
              <div style={{ marginBottom: '1rem', padding: '10px 14px', borderRadius: '10px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '13px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
              <button type="button" onClick={() => setLeadType('bireysel')}
                className="btn" style={{ flex: 1, justifyContent: 'center', ...(leadType === 'bireysel' ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}) }}><Tr text="👨‍👩‍👧 Bireysel (Veli/Öğrenci)" /></button>
              <button type="button" onClick={() => setLeadType('kurum')}
                className="btn" style={{ flex: 1, justifyContent: 'center', ...(leadType === 'kurum' ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' } : {}) }}><Tr text="🏫 Kurum (Okul/Dershane)" /></button>
            </div>

            <label style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600 }}>
              {leadType === 'kurum' ? tr('Yetkili Adı Soyadı *') : tr('Veli/Öğrenci Adı Soyadı *')}
            </label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} required
              style={{ marginTop: '4px', marginBottom: '1rem' }} />

            {leadType === 'kurum' && (
              <>
                <label style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600 }}><Tr text="Kurum Adı *" /></label>
                <input className="input" value={institutionName} onChange={e => setInstitutionName(e.target.value)} required
                  style={{ marginTop: '4px', marginBottom: '1rem' }} />
              </>
            )}
            {leadType === 'bireysel' && (
              <>
                <label style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600 }}><Tr text="Öğrencinin Sınıfı" /></label>
                <input className="input" placeholder={tr('Örn: Ortaokul 8. Sınıf')} value={studentGrade} onChange={e => setStudentGrade(e.target.value)}
                  style={{ marginTop: '4px', marginBottom: '1rem' }} />
              </>
            )}

            <label style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600 }}><Tr text="E-posta *" /></label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required
              style={{ marginTop: '4px', marginBottom: '1rem' }} />

            <label style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600 }}><Tr text="Telefon" /></label>
            <input className="input" value={phone} onChange={e => setPhone(e.target.value)}
              style={{ marginTop: '4px', marginBottom: '1rem' }} />

            <label style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 600 }}><Tr text="Mesaj (opsiyonel)" /></label>
            <textarea className="input" value={message} onChange={e => setMessage(e.target.value)} rows={3}
              style={{ marginTop: '4px', marginBottom: '1.25rem', resize: 'vertical' }} />

            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
              {saving ? tr('Gönderiliyor…') : tr('Talep Gönder')}
            </button>
          </form>
        )}
      </div>
      <SiteFooter />
    </main>
  )
}
