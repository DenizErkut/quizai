'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const router = useRouter()
  const [pass, setPass] = useState('')
  const [passConfirm, setPassConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [ready, setReady] = useState(false)
  const supabase = createClient() as any

  useEffect(() => {
    // Supabase token'ı URL hash'ten alır
    supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
  }, [])

  async function handleReset() {
    if (pass.length < 6) { setError('Şifre en az 6 karakter olmalıdır.'); return }
    if (pass !== passConfirm) { setError('Şifreler eşleşmiyor.'); return }
    setError(''); setLoading(true)
    const { error: err } = await supabase.auth.updateUser({ password: pass })
    setLoading(false)
    if (err) { setError('Bir hata oluştu. Lütfen tekrar deneyin.'); return }
    setDone(true)
    setTimeout(() => router.push('/quiz'), 2000)
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <img src="/pratium-logo.png" alt="Pratium" style={{ height: '64px' }} />
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
              <h1 className="serif" style={{ fontSize: '22px', marginBottom: '0.75rem' }}>Bağlantı doğrulanıyor...</h1>
              <p style={{ color: 'var(--text2)', fontSize: '14px', lineHeight: 1.7 }}>
                E-postanızdaki sıfırlama bağlantısına tıklayarak bu sayfaya gelmelisiniz. Bağlantı geçersizse lütfen tekrar deneyin.
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
              <input className="input" type="password" placeholder="••••••••" value={pass}
                onChange={e => setPass(e.target.value)} autoFocus />

              <label className="field-label" style={{ marginTop: '8px' }}>Şifre tekrar</label>
              <input className="input" type="password" placeholder="••••••••" value={passConfirm}
                onChange={e => setPassConfirm(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleReset()} />

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
