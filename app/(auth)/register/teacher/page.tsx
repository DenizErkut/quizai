'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function RegisterTeacherContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient() as any

  useEffect(() => {
    // OAuth redirect sonrası session kontrol et
    async function checkSession() {
      const stepParam = searchParams.get('step')
      if (stepParam === 'info') {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          // Profil adını otomatik doldur
          setName(user.user_metadata?.name || user.user_metadata?.full_name || '')
          setStep('info')
        }
      }
    }
    checkSession()
  }, [])

  // Hesap bilgileri
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [oauthLoading, setOauthLoading] = useState(false)

  // Öğretmen bilgileri
  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [subject, setSubject] = useState('')
  const [phone, setPhone] = useState('')
  const [doc, setDoc] = useState<File | null>(null)

  const [step, setStep] = useState<'account' | 'info' | 'done'>('account')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState('')

  async function handleOAuth() {
    setOauthLoading(true)
    // OAuth sonrası teacher info adımına yönlendir
    localStorage.setItem('pending_teacher_apply', '1')
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/register/teacher?step=info` },
    })
  }

  async function handleCreateAccount() {
    if (!email.trim()) { setError('E-posta zorunlu.'); return }
    if (pass.length < 6) { setError('Sifre en az 6 karakter olmali.'); return }
    setError(''); setLoading(true)

    const { data, error: err } = await supabase.auth.signUp({ email, password: pass })
    if (err) { setError(err.message); setLoading(false); return }

    setUserId(data.user?.id || '')
    setLoading(false)
    setStep('info')
  }

  async function handleApply() {
    if (!name.trim()) { setError('Ad soyad zorunlu.'); return }
    if (!school.trim()) { setError('Okul/Kurum zorunlu.'); return }
    setError(''); setLoading(true)

    // userId state'inden, yoksa session'dan, yoksa getUser'dan al
    let uid = userId
    let userEmail = email
    if (!uid) {
      const { data: sessionData } = await supabase.auth.getSession()
      uid = sessionData?.session?.user?.id || ''
      userEmail = sessionData?.session?.user?.email || email
    }
    if (!uid) {
      const { data: { user } } = await supabase.auth.getUser()
      uid = user?.id || ''
      userEmail = user?.email || email
    }
    if (!uid) { setError('Oturum bulunamadi. Lutfen once hesap olusturun.'); setLoading(false); return }

    let docUrl = ''
    if (doc) {
      const ext = doc.name.split('.').pop()
      const path = `teacher-docs/${uid}-${Date.now()}.${ext}`
      const { data: uploadData } = await supabase.storage.from('teacher-documents').upload(path, doc, { upsert: true })
      if (uploadData) {
        const { data: urlData } = supabase.storage.from('teacher-documents').getPublicUrl(path)
        docUrl = urlData.publicUrl
      }
    }

    // Kimlik (ad-soyad, telefon) TR-PG'ye yazılır — yoksa oluşturulur.
    // teachers tablosuna kimlik alanı (name/email/phone) yazılmaz.
    const { data: { session } } = await supabase.auth.getSession()
    const idRes = await fetch('/api/profile/update-identity', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName: name.trim(), phone: phone.trim() || null, role: 'teacher' }),
    })
    if (!idRes.ok) { setError('Kimlik bilgileri kaydedilemedi. Lütfen tekrar deneyin.'); setLoading(false); return }

    const { error: insertErr } = await supabase.from('teachers').insert({
      user_id: uid,
      school: school.trim(),
      subject: subject.trim(),
      document_url: docUrl || null,
      approved: false,
    })

    if (insertErr) { setError(insertErr.message); setLoading(false); return }

    setLoading(false)
    setStep('done')
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }} className="anim-up">
          <Link href="/login" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none', display: 'block', marginBottom: '12px' }}>← Girise don</Link>
          <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎓</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>Ogretmen Basvurusu</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>
            Admin onayindan sonra panele erisebilirsiniz
          </p>
        </div>

        {/* Adım göstergesi */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
          {['Hesap', 'Bilgiler', 'Tamamlandi'].map((label, i) => {
            const stepIdx = step === 'account' ? 0 : step === 'info' ? 1 : 2
            return (
              <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ height: 4, borderRadius: '999px', background: i <= stepIdx ? '#7c3aed' : 'var(--border)', marginBottom: '4px', transition: 'background 0.3s' }} />
                <div style={{ fontSize: '10px', color: i <= stepIdx ? '#7c3aed' : 'var(--text4)', fontWeight: i <= stepIdx ? 700 : 400 }}>{label}</div>
              </div>
            )
          })}
        </div>

        {/* Adım 1: Hesap */}
        {step === 'account' && (
          <div className="card anim-up-1">
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>1. Hesap Olustur</div>

            <button className="btn" onClick={handleOAuth} disabled={oauthLoading}
              style={{ width: '100%', justifyContent: 'center', gap: '10px', fontWeight: 500, marginBottom: '0.5rem' }}>
              {oauthLoading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Google ile devam et
            </button>

            <div className="divider">veya e-posta ile</div>

            <label className="field-label">E-posta</label>
            <input className="input" type="email" placeholder="ornek@mail.com"
              value={email} onChange={e => setEmail(e.target.value)} />

            <label className="field-label">Sifre</label>
            <input className="input" type="password" placeholder="En az 6 karakter"
              value={pass} onChange={e => setPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateAccount()} />

            {error && <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}

            <button className="btn btn-primary" onClick={handleCreateAccount} disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Devam Et →'}
            </button>

            <div style={{ marginTop: '0.75rem', textAlign: 'center', fontSize: '12px', color: 'var(--text3)' }}>
              Hesabiniz var mi?{' '}
              <Link href="/login/teacher" style={{ color: '#7c3aed', fontWeight: 600 }}>Giris yapin</Link>
            </div>
          </div>
        )}

        {/* Adım 2: Öğretmen bilgileri */}
        {step === 'info' && (
          <div className="card anim-up-1">
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>2. Ogretmen Bilgileri</div>

            <label className="field-label">Ad Soyad *</label>
            <input className="input" placeholder="Ahmet Yilmaz"
              value={name} onChange={e => setName(e.target.value)} />

            <label className="field-label">Okul / Kurum *</label>
            <input className="input" placeholder="Ankara Anadolu Lisesi"
              value={school} onChange={e => setSchool(e.target.value)} />

            <label className="field-label">Bransi</label>
            <input className="input" placeholder="Matematik, Fizik..."
              value={subject} onChange={e => setSubject(e.target.value)} />

            <label className="field-label">Telefon (Opsiyonel)</label>
            <input className="input" type="tel" placeholder="05xx xxx xx xx"
              value={phone} onChange={e => setPhone(e.target.value)} />

            <label className="field-label">Belge Yukle (Opsiyonel)</label>
            <div style={{ marginBottom: '0.75rem' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', fontSize: '13px', cursor: 'pointer', color: 'var(--text2)', fontFamily: 'var(--font-sans)' }}>
                📎 {doc ? doc.name : 'Belge sec (PDF, JPG)'}
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display: 'none' }}
                  onChange={e => setDoc(e.target.files?.[0] || null)} />
              </label>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>Ogretmenlik belgesi, diploma vb. (admin inceleyecek)</div>
            </div>

            {error && <div style={{ marginTop: '8px', padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>{error}</div>}

            <button className="btn btn-primary" onClick={handleApply} disabled={loading}
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
              {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Basvuruyu Gonder →'}
            </button>
          </div>
        )}

        {/* Adım 3: Tamamlandı */}
        {step === 'done' && (
          <div className="card anim-up-1" style={{ textAlign: 'center', padding: '2.5rem 2rem' }}>
            <div style={{ fontSize: '56px', marginBottom: '1rem' }}>✅</div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '8px' }}>
              Basvurunuz Alindi!
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text2)', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Ekibimiz basvurunuzu inceleyecek ve e-posta ile bildirim gonderecek.
              Onay sureci genellikle 1-2 is gunu surmektedir.
            </p>
            <Link href="/" className="btn btn-primary" style={{ justifyContent: 'center', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
              Ana Sayfaya Don
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}

export default function RegisterTeacherPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}>
      <RegisterTeacherContent />
    </Suspense>
  )
}
