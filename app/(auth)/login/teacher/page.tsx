'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function TeacherLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState(false)
  const supabase = createClient() as any

  async function handleOAuth() {
    setOauthLoading(true)
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/auth/callback` } })
  }

  async function handleLogin() {
    if (!email.trim() || !pass) { setError('E-posta ve sifre gerekli.'); return }
    setError(''); setLoading(true)

    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password: pass })
    if (err) { setError('E-posta veya sifre hatali.'); setLoading(false); return }

    // Öğretmen mi kontrol et
    const { data: teacher } = await supabase
      .from('teachers')
      .select('id, approved')
      .eq('user_id', data.user.id)
      .maybeSingle()

    setLoading(false)

    if (!teacher) {
      await supabase.auth.signOut()
      setError('Bu hesap ogretmen paneline kayitli degil. Ogretmen basvurusu icin kayit sayfasini kullanin.')
      return
    }

    if (!teacher.approved) {
      await supabase.auth.signOut()
      setError('Ogretmen basvurunuz henuz onaylanmamis. Onay emaili bekleniyor.')
      return
    }

    router.push('/teacher')
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
          <Link href="/login" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none', display: 'block', marginBottom: '12px' }}>← Geri</Link>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎓</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>Ogretmen Girisi</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Onaylanmis ogretmen hesabi gereklidir</p>
        </div>

        <div className="card anim-up-1">
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
            Google ile giris yap
          </button>
          <div className="divider">veya e-posta ile</div>

          <label className="field-label">E-posta</label>
          <input className="input" type="email" placeholder="ornek@mail.com"
            value={email} onChange={e => setEmail(e.target.value)} />

          <label className="field-label">Sifre</label>
          <input className="input" type="password" placeholder="••••••••"
            value={pass} onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />

          {error && (
            <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)', lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleLogin} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', background: 'linear-gradient(135deg, #7c3aed, #5b21b6)' }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Ogretmen Paneline Gir →'}
          </button>

          <div style={{ marginTop: '1rem', padding: '10px 12px', background: 'rgba(124,58,237,0.06)', borderRadius: '10px', fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6 }}>
            💡 Ogretmen basvurusu yapmak icin{' '}
            <Link href="/register/teacher" style={{ color: '#7c3aed', fontWeight: 600 }}>buraya tiklayin</Link>.
            Admin onayinden sonra panele erisebilirsiniz.
          </div>
        </div>
      </div>
    </main>
  )
}
