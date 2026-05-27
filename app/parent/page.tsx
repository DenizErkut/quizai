'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface ChildData {
  child_id: string
  nickname: string
  name: string
  grade: string
  plan: string
  streak: number
  totalTests: number
  avgPct: number | null
  weeklyTests: number
  recentTopics: string[]
  assignmentsDone: number
  weakTopics: string[]
  lastActive: string | null
}

export default function ParentPage() {
  const [children, setChildren] = useState<ChildData[]>([])
  const [loading, setLoading] = useState(true)
  const [addCode, setAddCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [selectedChild, setSelectedChild] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: links } = await supabase
      .from('parent_children')
      .select('child_id, nickname')
      .eq('parent_id', user.id)

    if (!links?.length) { setLoading(false); return }

    const childIds = links.map((l: any) => l.child_id)
    const nicknameMap: Record<string, string> = {}
    links.forEach((l: any) => { nicknameMap[l.child_id] = l.nickname || '' })

    // Paralel olarak tüm çocukların verilerini çek
    const childData = await Promise.all(childIds.map(async (cid: string) => {
      const [profileRes, streakRes, sessionsRes, completionsRes, weakRes] = await Promise.all([
        supabase.from('profiles').select('name, grade, plan').eq('id', cid).maybeSingle(),
        supabase.from('streaks').select('current_streak').eq('user_id', cid).maybeSingle(),
        supabase.from('quiz_sessions').select('pct, topic, created_at').eq('user_id', cid).eq('completed', true).order('created_at', { ascending: false }).limit(50),
        supabase.from('assignment_completions').select('id').eq('student_id', cid),
        supabase.from('weak_topics').select('topic').eq('user_id', cid).order('wrong_count', { ascending: false }).limit(3),
      ])

      const profile = profileRes.data
      const streak = streakRes.data
      const sessions = sessionsRes.data ?? []
      const completions = completionsRes.data ?? []
      const weakTopics = weakRes.data?.map((w: any) => w.topic) ?? []

      // Son 7 günlük test sayısı
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)
      const weeklyTests = sessions.filter((s: any) => new Date(s.created_at) > weekAgo).length

      const avgPct = sessions.length
        ? Math.round(sessions.reduce((acc: number, s: any) => acc + s.pct, 0) / sessions.length)
        : null

      const recentTopics = [...new Set(sessions.slice(0, 5).map((s: any) => s.topic))].slice(0, 3) as string[]

      return {
        child_id: cid,
        nickname: nicknameMap[cid],
        name: profile?.name ?? 'İsimsiz',
        grade: profile?.grade ?? '',
        plan: profile?.plan ?? 'free',
        streak: streak?.current_streak ?? 0,
        totalTests: sessions.length,
        avgPct,
        weeklyTests,
        recentTopics,
        assignmentsDone: completions.length,
        weakTopics,
        lastActive: sessions[0]?.created_at ?? null,
      }
    }))

    setChildren(childData)
    if (childData.length > 0) setSelectedChild(childData[0].child_id)
    setLoading(false)
  }

  async function addChild() {
    if (!addCode.trim()) return
    setAdding(true)
    setAddError('')
    setAddSuccess('')

    const { data: { user } } = await supabase.auth.getUser()

    // Kodu olan profili bul
    const { data: childProfile } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('parent_code', addCode.trim().toLowerCase())
      .maybeSingle()

    if (!childProfile) {
      setAddError('Kod bulunamadı. Çocuğunuzdan doğru kodu aldığınızdan emin olun.')
      setAdding(false)
      return
    }

    if (childProfile.id === user.id) {
      setAddError('Kendi hesabınızı ekleyemezsiniz.')
      setAdding(false)
      return
    }

    // Zaten ekli mi?
    const { data: existing } = await supabase
      .from('parent_children')
      .select('id')
      .eq('parent_id', user.id)
      .eq('child_id', childProfile.id)
      .maybeSingle()

    if (existing) {
      setAddError('Bu çocuk zaten listenizde.')
      setAdding(false)
      return
    }

    await supabase.from('parent_children').insert({
      parent_id: user.id,
      child_id: childProfile.id,
      nickname: childProfile.name,
    })

    setAddSuccess(`${childProfile.name} başarıyla eklendi!`)
    setAddCode('')
    await load()
    setAdding(false)
  }

  async function removeChild(childId: string) {
    if (!confirm('Bu çocuğu listeden kaldırmak istediğinize emin misiniz?')) return
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('parent_children').delete().eq('parent_id', user.id).eq('child_id', childId)
    setChildren(prev => prev.filter(c => c.child_id !== childId))
    if (selectedChild === childId) setSelectedChild(children[0]?.child_id ?? null)
  }

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct >= 70) return 'var(--green)'
    if (pct >= 50) return 'var(--amber, #f59e0b)'
    return 'var(--red)'
  }

  function timeAgo(iso: string | null) {
    if (!iso) return 'Henüz test çözmedi'
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return 'Bugün'
    if (days === 1) return 'Dün'
    return `${days} gün önce`
  }

  const selected = children.find(c => c.child_id === selectedChild)

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>
              👨‍👩‍👧 Veli Paneli
            </h1>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px' }}>Çocuklarınızın Pratium performansını takip edin</p>
          </div>
          <Link href="/dashboard" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none' }}>← Dashboard</Link>
        </div>

        {/* Çocuk ekle */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>
            ➕ Çocuk Ekle
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px', lineHeight: 1.6 }}>
            Çocuğunuzdan Pratium profilindeki <strong>Veli Kodu</strong>nu alın ve buraya girin.
            (Profil → Veli Bağlantısı bölümünden bulabilirler)
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              value={addCode}
              onChange={e => setAddCode(e.target.value)}
              placeholder="8 haneli kod (örn: a3f7b2c1)"
              style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none' }}
              onKeyDown={e => e.key === 'Enter' && addChild()}
            />
            <button onClick={addChild} disabled={adding || !addCode.trim()}
              style={{ padding: '10px 18px', borderRadius: '10px', background: '#082465', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: adding ? 0.6 : 1 }}>
              {adding ? '...' : 'Ekle'}
            </button>
          </div>
          {addError && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)' }}>⚠️ {addError}</div>}
          {addSuccess && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--green)' }}>✅ {addSuccess}</div>}
        </div>

        {children.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>👶</div>
            <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: '6px' }}>Henüz çocuk eklenmedi</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Yukarıdaki kutuya çocuğunuzun veli kodunu girin.</div>
          </div>
        ) : (
          <>
            {/* Çocuk sekmeleri */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
              {children.map(c => (
                <button key={c.child_id} onClick={() => setSelectedChild(c.child_id)}
                  style={{ padding: '8px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                    background: selectedChild === c.child_id ? '#082465' : 'var(--bg2)',
                    borderColor: selectedChild === c.child_id ? '#082465' : 'var(--border)',
                    color: selectedChild === c.child_id ? '#fff' : 'var(--text3)',
                  }}>
                  {c.nickname || c.name}
                </button>
              ))}
            </div>

            {selected && (
              <div>
                {/* Özet kartlar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
                  {[
                    { icon: '🔥', label: 'Günlük Seri', value: `${selected.streak} gün`, color: selected.streak >= 7 ? 'var(--green)' : 'var(--text)' },
                    { icon: '📊', label: 'Genel Ortalama', value: selected.avgPct !== null ? `%${selected.avgPct}` : '—', color: pctColor(selected.avgPct) },
                    { icon: '📅', label: 'Bu Hafta', value: `${selected.weeklyTests} test`, color: 'var(--text)' },
                    { icon: '📝', label: 'Ödev', value: `${selected.assignmentsDone} tamamlandı`, color: 'var(--text)' },
                  ].map((stat, i) => (
                    <div key={i} className="card" style={{ textAlign: 'center', padding: '16px 12px' }}>
                      <div style={{ fontSize: '24px', marginBottom: '4px' }}>{stat.icon}</div>
                      <div style={{ fontWeight: 800, fontSize: '18px', color: stat.color }}>{stat.value}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Detay kartlar */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
                  {/* Son çalışılan konular */}
                  <div className="card">
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Son Çalışılan Konular</div>
                    {selected.recentTopics.length > 0 ? (
                      selected.recentTopics.map((topic, i) => (
                        <div key={i} style={{ fontSize: '13px', padding: '6px 0', borderBottom: i < selected.recentTopics.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--text2)' }}>
                          📚 {topic}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text4)' }}>Henüz test çözülmedi</div>
                    )}
                  </div>

                  {/* Zayıf konular */}
                  <div className="card">
                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Gelişim Alanları</div>
                    {selected.weakTopics.length > 0 ? (
                      selected.weakTopics.map((topic, i) => (
                        <div key={i} style={{ fontSize: '13px', padding: '6px 0', borderBottom: i < selected.weakTopics.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--red)' }}>
                          ⚠️ {topic}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--green)' }}>✓ Zayıf konu yok</div>
                    )}
                  </div>
                </div>

                {/* Son aktivite + kaldır */}
                <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text3)' }}>
                    Son aktivite: <strong style={{ color: 'var(--text)' }}>{timeAgo(selected.lastActive)}</strong>
                    {selected.grade && <span style={{ marginLeft: '12px' }}>· {selected.grade}. sınıf</span>}
                  </div>
                  <button onClick={() => removeChild(selected.child_id)}
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.25)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                    Kaldır
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
