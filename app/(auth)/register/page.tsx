'use client'
import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function RegisterContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ref = searchParams.get('ref') || ''

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [referrerName, setReferrerName] = useState('')

  const supabase = createClient() as any

  // Referral kodu varsa davet eden kişiyi göster
  useEffect(() => {
    if (!ref) return
    async function fetchReferrer() {
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .eq('referral_code', ref.toUpperCase())
        .single()
      if (data) setReferrerName(data.name.split(' ')[0])
    }
    fetchReferrer()
  }, [ref])

  async function handleRegister() {
    if (!name.trim() || !email.trim() || pass.length < 6) {
      setError('Tüm alanları doldurun (şifre en az 6 karakter).')
      return
    }
    setError(''); setLoading(true)

    const { data, error: err } = await supabase.auth.signUp({
      email,
      password: pass,
      options: { data: { name } },
    })

    if (err) { setError(err.message); setLoading(false); return }

    // Email/şifre ile kayıtta referral'ı manuel işle
    if (ref && data.user) {
      try {
        // Referral kodu sahibini bul
        const { data: referrer } = await supabase
          .from('profiles').select('id').eq('referral_code', ref.toUpperCase()).single()

        if (referrer && referrer.id !== data.user.id) {
          // Kısa bekle — profil trigger'ı çalışsın
          await new Promise(r => setTimeout(r, 1000))
          await supabase.from('referrals').insert({
            referrer_id: referrer.id,
            referred_id: data.user.id,
          })
        }
      } catch (e) {
        console.error('Referral error:', e)
      }
    }

    setLoading(false)
    router.push('/profile')
  }

  async function handleOAuth(provider: 'google' | 'apple') {
    setOauthLoading(provider)
    const callbackUrl = `${window.location.origin}/auth/callback${ref ? `?ref=${ref}` : ''}`
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl },
    })
  }

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>

        <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
            <img src="/pratium-logo.png" alt="Pratium" style={{ height: '72px', width: 'auto' }} />
          </Link>
        </div>

        {/* Davet banner */}
        {ref && (
          <div className="anim-up" style={{
            marginBottom: '1rem', padding: '12px 16px', borderRadius: '12px',
            background: 'var(--green-bg)', border: '1px solid rgba(22,163,74,0.25)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: '20px', marginBottom: '4px' }}>🎁</div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--green)' }}>
              {referrerName ? `${referrerName} seni davet etti!` : 'Davet linki ile kayıt oluyorsun'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>
              Kayıt olunca arkadaşın premium hediye kazanır.
            </div>
          </div>
        )}

        <div className="card anim-up-1">
          <h1 className="serif" style={{ fontSize: '26px', marginBottom: '0.25rem' }}>Hesap oluştur</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '1.5rem' }}>
            Sana özel testler seni bekliyor.
          </p>

          {/* OAuth */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '0.5rem' }}>
            <button className="btn" onClick={() => handleOAuth('google')} disabled={!!oauthLoading}
              style={{ width: '100%', justifyContent: 'center', gap: '10px', fontWeight: 500 }}>
              {oauthLoading === 'google'
                ? <span className="spinner" style={{ width: 18, height: 18 }} />
                : <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
              }
              Google ile kayıt ol
            </button>
          </div>

          <div className="divider">veya e-posta ile</div>

          <label className="field-label">Ad soyad</label>
          <input className="input" placeholder="Deniz Yılmaz"
            value={name} onChange={e => setName(e.target.value)} />

          <label className="field-label">E-posta</label>
          <input className="input" type="email" placeholder="ornek@mail.com"
            value={email} onChange={e => setEmail(e.target.value)} />

          <label className="field-label">Şifre</label>
          <input className="input" type="password" placeholder="En az 6 karakter"
            value={pass} onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRegister()} />

          {error && (
            <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleRegister} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Devam et →'}
          </button>

          <div className="divider">veya</div>
          <Link href={`/login${ref ? `?ref=${ref}` : ''}`} className="btn"
            style={{ width: '100%', justifyContent: 'center' }}>
            Zaten hesabım var
          </Link>
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text3)', marginTop: '1rem' }}>
          Kayıt olarak Kullanım Şartları'nı kabul etmiş olursun.
        </p>
      </div>
    </main>
  )
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div />}>
      <RegisterContent />
    </Suspense>
  )
}
