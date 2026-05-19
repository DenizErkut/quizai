'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Session {
  id: string; topic: string; grade: string; score: number; pct: number;
  question_count: number; created_at: string;
}
interface Profile { name: string; grade: string; language: string }

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DashboardPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: p }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('name,grade,language').eq('id', user.id).single(),
        supabase.from('quiz_sessions').select('id,topic,grade,score,pct,question_count,created_at')
          .eq('user_id', user.id).eq('completed', true).order('created_at', { ascending: false }).limit(20),
      ])
      setProfile(p)
      setSessions(s || [])
      setLoading(false)
    }
    load()
  }, [])

  const avgPct = sessions.length > 0 ? Math.round(sessions.reduce((s, x) => s + x.pct, 0) / sessions.length) : 0
  const totalQ = sessions.reduce((s, x) => s + x.question_count, 0)
  const totalCorrect = sessions.reduce((s, x) => s + x.score, 0)
  const bestPct = sessions.length > 0 ? Math.max(...sessions.map(x => x.pct)) : 0

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem' }}>
      <div className="glow-blob" style={{ top: '-100px', left: '-100px' }} />
      <div style={{ maxWidth: '720px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2rem' }}>
          <span className="serif" style={{ fontSize: '20px' }}>Quiz<span style={{ color: 'var(--accent)' }}>AI</span></span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Link href="/quiz" className="btn btn-primary btn-sm">Yeni test ⚡</Link>
            <button className="btn btn-ghost btn-sm" onClick={async () => { await createClient().auth.signOut(); router.push('/') }}>Çıkış</button>
          </div>
        </nav>

        {/* Header */}
        <div className="anim-up" style={{ marginBottom: '1.75rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Dashboard</div>
          <h1 className="serif" style={{ fontSize: '30px' }}>
            Merhaba, {profile?.name.split(' ')[0]} 👋
          </h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '4px' }}>
            {profile?.grade} · {profile?.language}
          </p>
        </div>

        {/* Stats */}
        <div className="anim-up-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
          {[
            { label: 'Test sayısı', value: sessions.length, suffix: '' },
            { label: 'Ortalama', value: avgPct, suffix: '%' },
            { label: 'En yüksek', value: bestPct, suffix: '%' },
            { label: 'Toplam soru', value: totalQ, suffix: '' },
          ].map((s, i) => (
            <div key={i} className="card-sm" style={{ textAlign: 'center' }}>
              <div className="serif" style={{ fontSize: '28px', lineHeight: 1.1 }}>{s.value}<span style={{ fontSize: '14px', color: 'var(--text2)' }}>{s.suffix}</span></div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Mini bar chart */}
        {sessions.length > 0 && (
          <div className="card anim-up-2" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
              Son {Math.min(sessions.length, 10)} test
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '60px' }}>
              {sessions.slice(0, 10).reverse().map((s, i) => (
                <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                  <div style={{
                    width: '100%', borderRadius: '4px 4px 0 0',
                    height: `${Math.max(s.pct * 0.6, 4)}px`,
                    background: s.pct >= 80 ? 'var(--green)' : s.pct >= 50 ? 'var(--accent)' : 'var(--red)',
                    opacity: 0.8, transition: 'height 0.4s',
                  }} title={`${s.topic}: %${s.pct}`} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '11px', color: 'var(--text3)' }}>
              <span style={{ color: 'var(--green)' }}>■ ≥80%</span>
              <span style={{ color: 'var(--accent)' }}>■ 50-79%</span>
              <span style={{ color: 'var(--red)' }}>■ &lt;50%</span>
            </div>
          </div>
        )}

        {/* Sessions list */}
        <div className="card anim-up-3">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Geçmiş testler
          </div>
          {sessions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text3)' }}>
              <div style={{ fontSize: '32px', marginBottom: '0.75rem' }}>📝</div>
              <div>Henüz test çözmedin.</div>
              <Link href="/quiz" className="btn btn-primary btn-sm" style={{ marginTop: '1rem', display: 'inline-flex' }}>
                İlk testini çöz ⚡
              </Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              {sessions.map((s, i) => (
                <div key={s.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                      {formatDate(s.created_at)} · {s.question_count} soru
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, marginLeft: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text2)' }}>{s.score}/{s.question_count}</span>
                    <span className={`badge ${s.pct >= 80 ? 'badge-green' : s.pct >= 50 ? 'badge-purple' : 'badge-red'}`}>
                      %{s.pct}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats summary */}
        {sessions.length > 0 && (
          <div className="card-sm anim-up-4" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text2)' }}>
              Toplam {totalCorrect} doğru / {totalQ} soru
            </span>
            <Link href="/quiz" className="btn btn-primary btn-sm">Yeni test ⚡</Link>
          </div>
        )}
      </div>
    </main>
  )
}
