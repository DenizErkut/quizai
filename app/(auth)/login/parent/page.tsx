'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveIdentities } from '@/lib/identity/resolve-client'

export default function ParentLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [children, setChildren] = useState<any[]>([])
  const [loggedIn, setLoggedIn] = useState(false)
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

    // Bağlı çocukları çek
    const { data: links } = await supabase
      .from('parent_children')
      .select('child_id, nickname')
      .eq('parent_id', data.user.id)

    if (!links?.length) {
      // Çocuk bağlı değil — veli paneline git
      router.push('/parent')
      return
    }

    // Profilleri çek (grade/avatar Supabase'den, isim TR-PG'den)
    const childIds = links.map((l: any) => l.child_id)
    const profileMap: Record<string, any> = {}
    const [identities] = await Promise.all([
      resolveIdentities(supabase, childIds),
      Promise.all(childIds.map(async (id: string) => {
        const { data: p } = await supabase.from('profiles').select('id, grade, avatar_url').eq('id', id).maybeSingle()
        if (p) profileMap[id] = p
      })),
    ])

    const childrenData = links.map((l: any) => ({
      child_id: l.child_id,
      nickname: l.nickname || identities[l.child_id]?.full_name || 'Cocuk',
      name: identities[l.child_id]?.full_name || 'Isimsiz',
      grade: profileMap[l.child_id]?.grade || '',
      avatar_url: profileMap[l.child_id]?.avatar_url || null,
    }))

    setChildren(childrenData)
    setLoggedIn(true)
    setLoading(false)
  }

  async function selectChild(childId: string) {
    // Parent session ile parent sayfasına yönlendir
    router.push(`/parent?child=${childId}`)
  }

  if (loggedIn && children.length > 0) {
    return (
      <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
            <div style={{ fontSize: '40px', marginBottom: '8px' }}>👨‍👩‍👧</div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>Hangi cocugu takip etmek istersiniz?</h1>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }} className="anim-up-1">
            {children.map(c => (
              <button key={c.child_id} onClick={() => selectChild(c.child_id)}
                style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s', textAlign: 'left' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-bg)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg)' }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '16px', flexShrink: 0, overflow: 'hidden' }}>
                  {c.avatar_url ? <img src={c.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : c.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{c.nickname}</div>
                  {c.grade && <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{c.grade}</div>}
                </div>
                <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: '20px' }}>›</span>
              </button>
            ))}
            <button onClick={() => router.push('/parent')}
              style={{ padding: '12px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '13px', color: 'var(--text3)', fontWeight: 500 }}>
              Tum cocuklari goster →
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
          <Link href="/login" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none', display: 'block', marginBottom: '12px' }}>← Geri</Link>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>👨‍👩‍👧</div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>Veli Girisi</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Cocugunuzun durumunu takip edin</p>
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
            <div style={{ marginTop: '10px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleLogin} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem', background: 'linear-gradient(135deg, #1ECFB8, #0a9e90)' }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Giris Yap →'}
          </button>

          <div style={{ marginTop: '1rem', fontSize: '12px', color: 'var(--text3)', textAlign: 'center' }}>
            Hesabiniz yok mu?{' '}
            <Link href="/register" style={{ color: 'var(--accent)', fontWeight: 600 }}>Kayit ol</Link>
          </div>
        </div>
      </div>
    </main>
  )
}
