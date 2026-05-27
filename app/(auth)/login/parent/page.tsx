'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function ParentLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [children, setChildren] = useState<any[]>([])
  const [loggedIn, setLoggedIn] = useState(false)
  const supabase = createClient() as any

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

    // Profilleri çek
    const childIds = links.map((l: any) => l.child_id)
    const profileMap: Record<string, any> = {}
    await Promise.all(childIds.map(async (id: string) => {
      const { data: p } = await supabase.from('profiles').select('id, name, grade, avatar_url').eq('id', id).maybeSingle()
      if (p) profileMap[id] = p
    }))

    const childrenData = links.map((l: any) => ({
      child_id: l.child_id,
      nickname: l.nickname || profileMap[l.child_id]?.name || 'Cocuk',
      name: profileMap[l.child_id]?.name || 'Isimsiz',
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
