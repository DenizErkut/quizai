'use client'
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { safeNextPath } from '@/lib/safe-next'
import QRCode from 'qrcode'

function LoginPageContent() {
  const { t } = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next')
  const isSafeNext = (n: string | null) => safeNextPath(n, { allowLogin: true }) !== null
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<string | null>(null)
  const [tab, setTab] = useState<'email' | 'phone'>('email')
  const [choices, setChoices] = useState<string[] | null>(null)
  const [qrOpen, setQrOpen] = useState(false)
  const [qrImg, setQrImg] = useState('')
  const [qrExpired, setQrExpired] = useState(false)
  const [resetMode, setResetMode] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent, setResetSent] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  const supabase = createClient()

  async function goLanding(token: string) {
    // Rol'e göre otomatik yönlendirme: kurum yöneticisi → /institution, onaylı öğretmen → /teacher, veli → /parent, öğrenci → /home
    if (isSafeNext(next)) { router.push(next!); return }
    try {
      const r = await fetch('/api/auth/landing', { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json()
      if (Array.isArray(j.roles) && j.roles.length > 1) { setLoading(false); setChoices(j.roles); return }
      router.push(typeof j.path === 'string' && j.path.startsWith('/') ? j.path : '/home')
    } catch { router.push('/home') }
  }

  async function handleLogin() {
    if (!email.trim() || !pass) { setError(t('Kimlik ve şifre gerekli.')); return }
    setError(''); setLoading(true)
    try {
      const typed = email.trim()
      if (tab !== 'phone' && typed.includes('@')) {
        // E-posta: doğrudan Supabase'e (kullanıcının kendi IP'siyle; sunucu IP'sine yığılmaz).
        const { data, error: err } = await supabase.auth.signInWithPassword({ email: typed, password: pass })
        if (err || !data.session) { setError(t('Kimlik bilgileri veya şifre hatalı.')); setLoading(false); return }
        await goLanding(data.session.access_token)
        return
      }
      const res = await fetch('/api/auth/login-identifier', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: typed, password: pass, mode: tab === 'phone' ? 'phone' : 'id' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.access_token) { setError(res.status === 429 ? t('Çok fazla deneme. Lütfen daha sonra tekrar deneyin.') : t('Kimlik bilgileri veya şifre hatalı ya da çok fazla deneme yapıldı. Biraz sonra tekrar dene.')); setLoading(false); return }
      const { error: err } = await supabase.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token })
      if (err) { setError(t('Kimlik bilgileri veya şifre hatalı.')); setLoading(false); return }
      await goLanding(j.access_token)
    } catch { setError(t('Bir hata oluştu. Lütfen tekrar deneyin.')); setLoading(false) }
  }

  // QR ile giriş: ekranda QR göster; oturum açık cihaz onaylayınca belirteçle giriş yap.
  useEffect(() => {
    if (!qrOpen) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    ;(async () => {
      setQrExpired(false); setQrImg('')
      const created = await fetch('/api/auth/qr', { method: 'POST' }).then(r => r.json()).catch(() => null)
      if (!created?.id || stop) return
      setQrImg(await QRCode.toDataURL(`${window.location.origin}/auth/qr?id=${created.id}`, { width: 220, margin: 1 }))
      const started = Date.now()
      const poll = async () => {
        if (stop) return
        if (Date.now() - started > 175000) { setQrExpired(true); return }
        const r = await fetch(`/api/auth/qr?id=${created.id}&secret=${created.secret}`, { cache: 'no-store' }).then(x => x.json()).catch(() => null)
        if (r?.status === 'approved' && r.token_hash) {
          const { data, error: err } = await supabase.auth.verifyOtp({ token_hash: r.token_hash, type: 'magiclink' })
          if (!err && data.session) { await goLanding(data.session.access_token); return }
          setQrExpired(true); return
        }
        if (r?.status === 'expired' || r?.status === 'invalid') { setQrExpired(true); return }
        timer = setTimeout(poll, 2000)
      }
      timer = setTimeout(poll, 2000)
    })()
    return () => { stop = true; clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrOpen])

  async function handleOAuth(provider: 'google' | 'apple') {
    setOauthLoading(provider)
    const ref = new URLSearchParams(window.location.search).get('ref') || ''
    const params = new URLSearchParams()
    if (ref) params.set('ref', ref)
    if (isSafeNext(next)) params.set('next', next!)
    const qs = params.toString()
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback${qs ? `?${qs}` : ''}` },
    })
  }

  async function handleReset() {
    if (!resetEmail.trim()) { setError(t('E-posta adresinizi girin.')); return }
    setError(''); setResetLoading(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setResetLoading(false)
    if (err) { setError(t('Bir hata oluştu. Lütfen tekrar deneyin.')); return }
    setResetSent(true)
  }

  if (choices) {
    const labels: Record<string, string> = { teacher: '🎓 Öğretmen Paneli', parent: '👨‍👩‍👧 Veli Paneli', institution: '🏛️ Kurum Paneli' }
    const paths: Record<string, string> = { teacher: '/teacher', parent: '/parent', institution: '/institution' }
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div className="card" style={{ width: '100%', maxWidth: 400, display: 'grid', gap: 10 }}>
          <h1 className="serif" style={{ fontSize: 22 }}>{t('Hangi hesapla devam etmek istersin?')}</h1>
          <p style={{ fontSize: 13, color: 'var(--text2)' }}>{t('Hesabın birden fazla role sahip. İstediğin zaman sol menüden diğer panele geçebilirsin.')}</p>
          {choices.map(r => <Link key={r} href={paths[r]} className="btn btn-primary" style={{ justifyContent: 'center' }}>{t(labels[r])}</Link>)}
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
          <Link href="/" style={{ textDecoration: 'none', display: 'inline-block' }}>
            <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '72px', width: 'auto' }} />
          </Link>
        </div>

        <div className="card anim-up-1">
          {resetMode ? (
            <>
              <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.25rem' }}>
                {resetSent ? t('E-posta gönderildi ✓') : t('Şifremi sıfırla')}
              </h1>
              {resetSent ? (
                <>
                  <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.7 }}>
                    <b>{resetEmail}</b> {t('adresine sıfırlama bağlantısı gönderdik. Gelen kutunuzu ve spam klasörünü kontrol edin.')}
                  </p>
                  <button className="btn btn-primary"
                    onClick={() => { setResetMode(false); setResetSent(false); setResetEmail('') }}
                    style={{ width: '100%', justifyContent: 'center' }}>
                    {t('Giriş sayfasına dön')}
                  </button>
                </>
              ) : (
                <>
                  <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '1.5rem' }}>
                    {t('Kayıtlı e-posta adresinizi girin, sıfırlama bağlantısı gönderelim.')}
                  </p>
                  <label className="field-label">{t('E-posta')}</label>
                  <input className="input" type="email" placeholder="ornek@mail.com"
                    value={resetEmail} onChange={e => setResetEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleReset()} autoFocus />
                  {error && (
                    <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>
                      {error}
                    </div>
                  )}
                  <button className="btn btn-primary" onClick={handleReset} disabled={resetLoading}
                    style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
                    {resetLoading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : t('Sıfırlama bağlantısı gönder →')}
                  </button>
                  <button onClick={() => { setResetMode(false); setError('') }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--text2)', marginTop: '0.75rem', fontFamily: 'var(--font-sans)', display: 'block', width: '100%', textAlign: 'center' }}>
                    {t('← Geri dön')}
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <h1 className="serif" style={{ fontSize: '26px', marginBottom: '0.25rem' }}>{t('Tekrar hoş geldin')}</h1>
              <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '1.5rem' }}>{t('Öğrenci, veli, öğretmen ve kurum girişi')}</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '0.5rem' }}>
                <button className="btn" onClick={() => handleOAuth('google')} disabled={!!oauthLoading}
                  style={{ width: '100%', justifyContent: 'center', gap: '10px', fontWeight: 500 }}>
                  {oauthLoading === 'google' ? <span className="spinner" style={{ width: 18, height: 18 }} /> : (
                    <svg width="18" height="18" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                  )}
                  Google ile giriş yap
                </button>
                <button className="btn" onClick={() => handleOAuth('apple')} disabled={!!oauthLoading}
                  style={{ width: '100%', justifyContent: 'center', gap: '10px', fontWeight: 500 }}>
                  {oauthLoading === 'apple' ? <span className="spinner" style={{ width: 18, height: 18 }} /> : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                    </svg>
                  )}
                  {t('Apple ile giriş yap')}
                </button>
              </div>

              <div className="divider">{t('VEYA')}</div>

              <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                {(['email', 'phone'] as const).map(k => (
                  <button key={k} type="button" onClick={() => { setTab(k); setEmail(''); setError('') }}
                    style={{ flex: 1, padding: '10px 8px', borderRadius: 10, border: '1.5px solid var(--border)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 700,
                      background: tab === k ? 'var(--accent-bg)' : 'var(--bg)', color: tab === k ? 'var(--accent)' : 'var(--text2)' }}>
                    {k === 'email' ? t('E-Posta ile Giriş') : t('Telefon ile Giriş')}
                  </button>
                ))}
              </div>

              <label className="field-label">{tab === 'phone' ? t('Telefon numarası') : t('E-posta, T.C. Kimlik No, Vergi No veya Kullanıcı Kodu')}</label>
              <input className="input" type={tab === 'phone' ? 'tel' : 'text'} autoComplete={tab === 'phone' ? 'tel' : 'username'} placeholder={tab === 'phone' ? '05xx xxx xx xx' : 'ornek@mail.com'}
                value={email} onChange={e => setEmail(e.target.value)} />

              <label className="field-label">{t('Şifre')}</label>
              <input className="input" type="password" placeholder="••••••••"
                value={pass} onChange={e => setPass(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()} />

              {error && (
                <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>
                  {error}
                </div>
              )}

              <button className="btn btn-primary" onClick={handleLogin} disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
                {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : t('Giriş yap →')}
              </button>

              <button onClick={() => { setResetMode(true); setError('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--accent)', marginTop: '0.75rem', fontFamily: 'var(--font-sans)', display: 'block', width: '100%', textAlign: 'center' }}>
                {t('Şifremi unuttum')}
              </button>

              <button className="btn" onClick={() => setQrOpen(o => !o)} style={{ width: '100%', justifyContent: 'center', marginTop: '0.75rem' }}>
                ▦ {t('QR Kod ile Giriş Yap')}
              </button>
              {qrOpen && (
                <div style={{ textAlign: 'center', marginTop: 12 }}>
                  {qrExpired ? (
                    <button className="btn" onClick={() => { setQrOpen(false); setTimeout(() => setQrOpen(true), 0) }}>{t('QR kodun süresi doldu — yenile')}</button>
                  ) : qrImg ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrImg} alt="QR" width={200} height={200} style={{ background: '#fff', padding: 8, borderRadius: 12 }} />
                      <p style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8, lineHeight: 1.6 }}>{t('Telefonunda Pratium’a giriş yapmışken kamerayla bu kodu okut ve onayla.')}</p>
                    </>
                  ) : <span className="spinner" />}
                </div>
              )}

              <p style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text3)', marginTop: '1.25rem' }}>
                {t('Hesabın yok mu?')}{' '}
                <Link href={isSafeNext(next) ? `/register?next=${encodeURIComponent(next!)}` : '/register'} style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  {t('Ücretsiz Üye Ol')}
                </Link>
              </p>
              <p style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text3)', marginTop: '0.5rem' }}>
                {t('Öğrenci, veli, öğretmen ve kurum hesapları aynı ekrandan girer; rolüne göre ilgili ekrana yönlendirilirsin.')}
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  )
}
