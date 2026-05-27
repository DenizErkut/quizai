'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const GRADES = [
  { value: 'ilkokul 1. sinif', label: 'İlkokul 1. Sınıf' },
  { value: 'ilkokul 2. sinif', label: 'İlkokul 2. Sınıf' },
  { value: 'ilkokul 3. sinif', label: 'İlkokul 3. Sınıf' },
  { value: 'ilkokul 4. sinif', label: 'İlkokul 4. Sınıf' },
  { value: 'ortaokul 5. sinif', label: 'Ortaokul 5. Sınıf' },
  { value: 'ortaokul 6. sinif', label: 'Ortaokul 6. Sınıf' },
  { value: 'ortaokul 7. sinif', label: 'Ortaokul 7. Sınıf' },
  { value: 'ortaokul 8. sinif', label: 'Ortaokul 8. Sınıf' },
  { value: 'lise 9. sinif', label: 'Lise 9. Sınıf' },
  { value: 'lise 10. sinif', label: 'Lise 10. Sınıf' },
  { value: 'lise 11. sinif', label: 'Lise 11. Sınıf' },
  { value: 'lise 12. sinif', label: 'Lise 12. Sınıf' },
  { value: 'universite 1. sinif', label: 'Üniversite 1. Sınıf' },
  { value: 'universite 2. sinif', label: 'Üniversite 2. Sınıf' },
  { value: 'universite 3. sinif', label: 'Üniversite 3. Sınıf' },
  { value: 'universite 4. sinif', label: 'Üniversite 4. Sınıf' },
]

function RegisterContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref') || ''

  // Zorunlu
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [age, setAge] = useState('')
  const [grade, setGrade] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')

  // Opsiyonel
  const [phone, setPhone] = useState('')
  const [instagram, setInstagram] = useState('')
  const [tiktok, setTiktok] = useState('')
  const [showOptional, setShowOptional] = useState(false)
  const [institutionCode, setInstitutionCode] = useState('')
  const [institutionName, setInstitutionName] = useState('')
  const [kvkk, setKvkk] = useState(false)

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [referrerName, setReferrerName] = useState('')

  const supabase = createClient() as any

  useEffect(() => {
    if (!ref) return
    supabase.from('profiles').select('name').eq('referral_code', ref.toUpperCase()).single()
      .then(({ data }: any) => { if (data) setReferrerName(data.name.split(' ')[0]) })
  }, [ref])

  async function handleRegister() {
    if (!name.trim()) { setError('Ad zorunludur.'); return }
    if (!surname.trim()) { setError('Soyad zorunludur.'); return }
    if (!age || parseInt(age) < 5 || parseInt(age) > 35) { setError('Geçerli bir yaş girin (5-35).'); return }
    if (!grade) { setError('Sınıf / eğitim seviyesi zorunludur.'); return }
    if (!email.trim()) { setError('E-posta zorunludur.'); return }
    if (pass.length < 6) { setError('Şifre en az 6 karakter olmalıdır.'); return }
    if (!kvkk) { setError('Devam etmek için Gizlilik Politikası ve KVKK metnini kabul etmelisiniz.'); return }

    setError(''); setLoading(true)
    const fullName = `${name.trim()} ${surname.trim()}`

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password: pass,
      options: { data: { name: fullName } },
    })

    if (err) { setError(err.message); setLoading(false); return }

    if (data.user) {
      // Profili güncelle
      await supabase.from('profiles').upsert({
        id: data.user.id,
        name: fullName,
        age: parseInt(age),
        grade,
        language: 'Türkçe',
        phone: phone || null,
        instagram: instagram || null,
        tiktok: tiktok || null,
      })

      // Kurum kodu işle
      if (institutionCode.trim()) {
        const { data: inst } = await supabase
          .from('institutions')
          .select('id, name')
          .eq('code', institutionCode.trim().toUpperCase())
          .eq('active', true)
          .maybeSingle()
        if (inst) {
          await supabase.from('institution_users').insert({
            institution_id: inst.id,
            user_id: data.user.id,
            role: 'student',
          })
        }
      }

      // Referral işle
      if (ref) {
        const { data: referrer } = await supabase
          .from('profiles').select('id').eq('referral_code', ref.toUpperCase()).single()
        if (referrer && referrer.id !== data.user.id) {
          await new Promise(r => setTimeout(r, 800))
          await supabase.from('referrals').insert({ referrer_id: referrer.id, referred_id: data.user.id })
        }
      }
    }

    setLoading(false)
    router.push('/quiz')
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setOauthLoading(provider)
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback${ref ? `?ref=${ref}` : ''}` },
    })
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '440px' }}>

        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }} className="anim-up">
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '64px', width: 'auto' }} />
          </Link>
        </div>

        {ref && (
          <div className="anim-up" style={{ marginBottom: '1rem', padding: '12px 16px', borderRadius: '12px', background: 'var(--green-bg)', border: '1px solid rgba(22,163,74,0.25)', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '4px' }}>🎁</div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--green)' }}>
              {referrerName ? `${referrerName} seni davet etti!` : 'Davet linki ile kayıt oluyorsun'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '2px' }}>Kayıt olunca arkadaşın ödül kazanır.</div>
          </div>
        )}

        <div className="card anim-up-1">
          <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.25rem' }}>Hesap oluştur</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '1.25rem' }}>Sana özel testler seni bekliyor.</p>

          {/* Google OAuth */}
          <button className="btn" onClick={() => handleOAuth('google')} disabled={!!oauthLoading}
            style={{ width: '100%', justifyContent: 'center', gap: '10px', fontWeight: 500, marginBottom: '12px' }}>
            {oauthLoading === 'google'
              ? <span className="spinner" style={{ width: 18, height: 18 }} />
              : <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>}
            Google ile hızlı kayıt
          </button>

          <div className="divider">veya bilgileri doldur</div>

          {/* Zorunlu alanlar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <label className="field-label">Ad <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="input" placeholder="Deniz" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Soyad <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="input" placeholder="Yılmaz" value={surname} onChange={e => setSurname(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
            <div>
              <label className="field-label">Yaş <span style={{ color: 'var(--red)' }}>*</span></label>
              <input className="input" type="number" placeholder="16" min={5} max={35} value={age} onChange={e => setAge(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Sınıf <span style={{ color: 'var(--red)' }}>*</span></label>
              <select className="input" value={grade} onChange={e => setGrade(e.target.value)}>
                <option value="">Seç</option>
                {GRADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
          </div>

          <label className="field-label" style={{ marginTop: '4px' }}>E-posta <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="input" type="email" placeholder="ornek@mail.com" value={email} onChange={e => setEmail(e.target.value)} />

          <label className="field-label">Şifre <span style={{ color: 'var(--red)' }}>*</span></label>
          <input className="input" type="password" placeholder="En az 6 karakter" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleRegister()} />

          {/* Kurum kodu (opsiyonel) */}
          <div style={{ marginBottom: '1rem', padding: '12px 14px', borderRadius: '12px', background: 'rgba(217,119,6,0.04)', border: '1.5px solid rgba(217,119,6,0.15)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#d97706', marginBottom: '6px' }}>🏛️ Kurum Kodu (Opsiyonel)</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', lineHeight: 1.5 }}>
              Okulunuz veya kurumunuz Pratium ile anlasmali ise size verilen kodu girin.
            </div>
            <input className="input" placeholder="8 haneli kurum kodu (ornek: ABC12345)"
              value={institutionCode}
              onChange={async e => {
                const val = e.target.value.toUpperCase()
                setInstitutionCode(val)
                if (val.length === 8) {
                  const { data: inst } = await supabase.from('institutions').select('name').eq('code', val).eq('active', true).maybeSingle()
                  setInstitutionName(inst?.name || '')
                } else {
                  setInstitutionName('')
                }
              }}
              style={{ marginBottom: institutionName ? '6px' : 0 }}
            />
            {institutionName && (
              <div style={{ fontSize: '12px', color: 'var(--green)', fontWeight: 600 }}>
                ✓ {institutionName} kurumuna baglanacaksiniz
              </div>
            )}
          </div>

          {/* Opsiyonel alanlar */}
          <button onClick={() => setShowOptional(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text2)', marginTop: '10px', padding: '4px 0', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '11px' }}>{showOptional ? '▲' : '▼'}</span>
            Opsiyonel bilgiler (telefon, sosyal medya)
          </button>

          {showOptional && (
            <div style={{ marginTop: '8px', padding: '12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
              <label className="field-label">Telefon</label>
              <input className="input" type="tel" placeholder="+90 555 000 00 00" value={phone} onChange={e => setPhone(e.target.value)} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '4px' }}>
                <div>
                  <label className="field-label">Instagram</label>
                  <input className="input" placeholder="@kullanici" value={instagram} onChange={e => setInstagram(e.target.value)} />
                </div>
                <div>
                  <label className="field-label">TikTok</label>
                  <input className="input" placeholder="@kullanici" value={tiktok} onChange={e => setTiktok(e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {error && (
            <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          {/* KVKK Onay */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '1rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={kvkk}
              onChange={e => setKvkk(e.target.checked)}
              style={{ marginTop: '2px', accentColor: 'var(--accent)', width: '16px', height: '16px', flexShrink: 0, cursor: 'pointer' }}
            />
            <span style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6 }}>
              <a href="/privacy" target="_blank" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Gizlilik Politikası</a>'nı ve{' '}
              <a href="/privacy" target="_blank" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>KVKK Aydınlatma Metni</a>'ni okudum, kişisel verilerimin işlenmesine açık rıza veriyorum.
            </span>
          </label>

          <button className="btn btn-primary" onClick={handleRegister} disabled={loading || !kvkk}
            style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem', opacity: kvkk ? 1 : 0.6 }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Hesap oluştur →'}
          </button>

          <div className="divider">veya</div>
          <Link href={`/login${ref ? `?ref=${ref}` : ''}`} className="btn" style={{ width: '100%', justifyContent: 'center' }}>
            Zaten hesabım var
          </Link>
        </div>


      </div>
    </main>
  )
}

export default function RegisterPage() {
  return <Suspense fallback={<div />}><RegisterContent /></Suspense>
}
