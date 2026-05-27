'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function InstitutionPage() {
  const [institution, setInstitution] = useState<any>(null)
  const [students, setStudents] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login/institution'); return }

    // Kurum admin mi?
    const { data: instUser } = await supabase
      .from('institution_users')
      .select('institution_id, institutions(id, name, code)')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()

    if (!instUser) { router.push('/login/institution'); return }

    const inst = instUser.institutions
    setInstitution(inst)

    // Kurum öğrencileri
    const { data: members } = await supabase
      .from('institution_users')
      .select('user_id, joined_at')
      .eq('institution_id', inst.id)
      .eq('role', 'student')

    if (!members?.length) { setLoading(false); return }

    const userIds = members.map((m: any) => m.user_id)
    const joinedMap: Record<string, string> = {}
    members.forEach((m: any) => { joinedMap[m.user_id] = m.joined_at })

    // Profil + streak + test verileri
    const studentData = await Promise.all(userIds.map(async (uid: string) => {
      const [profileRes, streakRes, sessionsRes] = await Promise.all([
        supabase.from('profiles').select('name, grade, avatar_url').eq('id', uid).maybeSingle(),
        supabase.from('streaks').select('current_streak, total_points').eq('user_id', uid).maybeSingle(),
        supabase.from('quiz_sessions').select('pct, created_at').eq('user_id', uid).eq('completed', true).order('created_at', { ascending: false }).limit(20),
      ])
      const sessions = sessionsRes.data ?? []
      const avgPct = sessions.length ? Math.round(sessions.reduce((a: number, s: any) => a + s.pct, 0) / sessions.length) : null
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
      const weeklyTests = sessions.filter((s: any) => new Date(s.created_at) > weekAgo).length
      return {
        id: uid,
        name: profileRes.data?.name ?? 'Isimsiz',
        grade: profileRes.data?.grade ?? '',
        avatar_url: profileRes.data?.avatar_url ?? null,
        streak: streakRes.data?.current_streak ?? 0,
        points: streakRes.data?.total_points ?? 0,
        totalTests: sessions.length,
        avgPct,
        weeklyTests,
        joinedAt: joinedMap[uid],
        lastActive: sessions[0]?.created_at ?? null,
      }
    }))

    setStudents(studentData)

    // Genel istatistikler
    const active = studentData.filter(s => s.totalTests > 0)
    const overallAvg = active.length ? Math.round(active.reduce((a, s) => a + (s.avgPct ?? 0), 0) / active.length) : 0
    setStats({
      total: studentData.length,
      active: active.length,
      overallAvg,
      topStreaker: studentData.sort((a, b) => b.streak - a.streak)[0],
      topScorer: [...studentData].sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))[0],
    })

    setLoading(false)
  }

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct >= 70) return 'var(--green)'
    if (pct >= 50) return 'var(--amber, #f59e0b)'
    return 'var(--red)'
  }

  const filtered = students
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.grade?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1))

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>🏛️ Kurum Paneli</div>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: 800, color: 'var(--primary)' }}>
                {institution?.name}
              </h1>
              <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                Kurum Kodu: <strong style={{ fontFamily: 'monospace', letterSpacing: '0.08em' }}>{institution?.code}</strong>
              </div>
            </div>
            <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
              style={{ padding: '8px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              Cikis Yap
            </button>
          </div>
        </div>

        {/* Özet kartlar */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
            {[
              { icon: '👥', label: 'Kayitli Ogrenci', value: stats.total, color: 'var(--primary)' },
              { icon: '⚡', label: 'Aktif Ogrenci', value: stats.active, color: 'var(--accent)' },
              { icon: '📊', label: 'Genel Ortalama', value: stats.overallAvg ? `%${stats.overallAvg}` : '—', color: pctColor(stats.overallAvg) },
              { icon: '🔥', label: 'En Uzun Seri', value: stats.topStreaker?.streak ? `${stats.topStreaker.streak} gun` : '—', sub: stats.topStreaker?.name, color: '#f97316' },
            ].map((s, i) => (
              <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
                <div style={{ fontSize: '22px', marginBottom: '4px' }}>{s.icon}</div>
                <div style={{ fontWeight: 800, fontSize: '20px', color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '1px' }}>{s.sub}</div>}
              </div>
            ))}
          </div>
        )}

        {/* Arama */}
        <div style={{ marginBottom: '1rem' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Ogrenci ara..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Öğrenci listesi */}
        {filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
            <div style={{ fontSize: '14px', color: 'var(--text3)' }}>
              {students.length === 0 ? `Henuz kayitli ogrenci yok. Ogrencilerinize kurum kodunuzu (${institution?.code}) paylasin.` : 'Sonuc bulunamadi.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Leaderboard başlığı */}
            <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px 70px 70px', gap: '8px', padding: '6px 16px', fontSize: '10px', fontWeight: 700, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>#</span>
              <span>Ogrenci</span>
              <span style={{ textAlign: 'center' }}>Ort.</span>
              <span style={{ textAlign: 'center' }}>Haftalik</span>
              <span style={{ textAlign: 'center' }}>Seri</span>
              <span style={{ textAlign: 'center' }}>Toplam</span>
            </div>
            {filtered.map((s, idx) => (
              <div key={s.id} className="card" style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px 70px 70px', gap: '8px', alignItems: 'center', padding: '12px 16px', borderLeft: idx < 3 ? '3px solid' : undefined, borderLeftColor: idx === 0 ? '#F59E0B' : idx === 1 ? '#94A3B8' : '#B45309' }}>
                <div style={{ fontWeight: 700, fontSize: '14px', color: idx < 3 ? (idx === 0 ? '#F59E0B' : idx === 1 ? '#94A3B8' : '#B45309') : 'var(--text4)', textAlign: 'center' }}>
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '12px', flexShrink: 0, overflow: 'hidden' }}>
                    {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</div>
                    {s.grade && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{s.grade}</div>}
                  </div>
                </div>
                <div style={{ textAlign: 'center', fontWeight: 800, fontSize: '16px', color: pctColor(s.avgPct) }}>{s.avgPct !== null ? `%${s.avgPct}` : '—'}</div>
                <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text2)' }}>{s.weeklyTests} test</div>
                <div style={{ textAlign: 'center', fontSize: '13px', color: s.streak > 0 ? '#f97316' : 'var(--text4)' }}>{s.streak > 0 ? `🔥${s.streak}` : '—'}</div>
                <div style={{ textAlign: 'center', fontSize: '13px', color: 'var(--text3)' }}>{s.totalTests}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
