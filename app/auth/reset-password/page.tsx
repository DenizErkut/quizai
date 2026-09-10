'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [pass, setPass] = useState('')
  const [passConfirm, setPassConfirm] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [showPassConfirm, setShowPassConfirm] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)
  const supabase = createClient() as any

  useEffect(() => {
    let active = true
    // Listener bazı tarayıcılarda hash işlendikten sonra bağlanabiliyor; mevcut
    // oturumu da kontrol ederek geçerli linkte formun takılı kalmasını önle.
    const queryError = new URLSearchParams(window.location.search).get('error_code')
    if (queryError === 'otp_expired') setError('Bu sıfırlama bağlantısının süresi dolmuş. Giriş sayfasından yeni bağlantı isteyin.')
    supabase.auth.getSession().then(({ data: { session } }: any) => { if (active && session) setReady(true) })
    const { data: listener } = supabase.auth.onAuthStateChange((event: string) => { if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true) })
    return () => { active = false; listener?.subscription?.unsubscribe() }
  }, [])

  async function handleReset() {
    if (pass.length < 6) { setError('Şifre en az 6 karakter olmalıdır.'); return }
    if (pass !== passConfirm) { setError('Şifreler eşleşmiyor.'); return }
    setError(''); setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password: pass })
    setLoading(false)
    if (err) {
      const message = /same|different|password/i.test(err.message) ? 'Yeni şifreniz önceki şifrenizden farklı olmalıdır.' : /expired|session/i.test(err.message) ? 'Bağlantının süresi dolmuş. Yeni bir sıfırlama bağlantısı isteyin.' : 'Şifre güncellenemedi. Lütfen bağlantıyı yenileyip tekrar deneyin.'
      setError(message); return
    }
    setDone(true)
    setTimeout(() => router.push('/quiz'), 2000)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '64px' }} />
        </div>

        <div className="card anim-up">
          {done ? (
            <>
              <div style={{ textAlign: 'center', fontSize: '48px', marginBottom: '1rem' }}>✅</div>
              <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.5rem', textAlign: 'center' }}>Şifren güncellendi!</h1>
              <p style={{ color: 'var(--text2)', fontSize: '14px', textAlign: 'center' }}>Yönlendiriliyorsun...</p>
            </>
          ) : !ready ? (
            <>
              <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.75rem' }}>{error ? 'Bağlantı geçersiz' : 'Bağlantı doğrulanıyor...'}</h1>
              <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.7 }}>
                {error || 'E-postanızdaki sıfırlama bağlantısına tıklayarak bu sayfaya gelmelisiniz.'}
              </p>
              <button className="btn" onClick={() => router.push('/login')} style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
                Giriş sayfasına dön
              </button>
            </>
          ) : (
            <>
              <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.25rem' }}>Yeni şifre belirle</h1>
              <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '1.5rem' }}>En az 6 karakter olmalıdır.</p>

              <label className="field-label">Yeni şifre</label>
              <div style={{ position: 'relative' }}><input className="input" type={showPass ? 'text' : 'password'} placeholder="••••••••" value={pass}
                onChange={e => setPass(e.target.value)} autoFocus style={{ paddingRight: '46px' }} /><button type="button" aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'} onClick={() => setShowPass(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 18 }}>{showPass ? '🙈' : '👁️'}</button></div>

              <label className="field-label" style={{ marginTop: '8px' }}>Şifre tekrar</label>
              <div style={{ position: 'relative' }}><input className="input" type={showPassConfirm ? 'text' : 'password'} placeholder="••••••••" value={passConfirm}
                onChange={e => setPassConfirm(e.target.value)} style={{ paddingRight: '46px' }}
                onKeyDown={e => e.key === 'Enter' && handleReset()} />
                <button type="button" aria-label={showPassConfirm ? 'Şifreyi gizle' : 'Şifreyi göster'} onClick={() => setShowPassConfirm(v => !v)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', border: 0, background: 'transparent', cursor: 'pointer', fontSize: 18 }}>{showPassConfirm ? '🙈' : '👁️'}</button></div>

              {error && (
                <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>
                  {error}
                </div>
              )}

              <button className="btn btn-primary" onClick={handleReset} disabled={loading}
                style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
                {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Şifremi güncelle →'}
              </button>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
