'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    if (!name.trim() || !email.trim() || pass.length < 6) {
      setError('Tüm alanları doldurun (şifre en az 6 karakter).')
      return
    }
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error: err } = await supabase.auth.signUp({
      email,
      password: pass,
      options: { data: { name } },
    })
    setLoading(false)
    if (err) { setError(err.message); return }
    router.push('/profile')
  }

  return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div className="glow-blob" style={{ top: '-200px', left: '50%', transform: 'translateX(-50%)' }} />
      <div style={{ width: '100%', maxWidth: '400px', position: 'relative', zIndex: 1 }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }} className="anim-up">
          <Link href="/" className="serif" style={{ fontSize: '24px', textDecoration: 'none', color: 'var(--text)' }}>
            Quiz<span style={{ color: 'var(--accent)' }}>AI</span>
          </Link>
        </div>

        <div className="card anim-up-1">
          <h1 className="serif" style={{ fontSize: '26px', marginBottom: '0.25rem' }}>Hesap oluştur</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginBottom: '1.5rem' }}>
            Sana özel testler seni bekliyor.
          </p>

          <label className="field-label">Ad soyad</label>
          <input className="input" placeholder="Deniz Yılmaz" value={name} onChange={e => setName(e.target.value)} />

          <label className="field-label">E-posta</label>
          <input className="input" type="email" placeholder="ornek@mail.com" value={email} onChange={e => setEmail(e.target.value)} />

          <label className="field-label">Şifre</label>
          <input className="input" type="password" placeholder="En az 6 karakter" value={pass} onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleRegister()} />

          {error && (
            <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--red-bg)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleRegister} disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: '1.25rem' }}>
            {loading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : 'Devam et →'}
          </button>

          <div className="divider">veya</div>

          <Link href="/login" className="btn" style={{ width: '100%', justifyContent: 'center' }}>
            Zaten hesabım var
          </Link>
        </div>
      </div>
    </main>
  )
}
