'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Suspense } from 'react'

interface ChildData {
  child_id: string
  nickname: string
  name: string
  grade: string
  streak: number
  totalTests: number
  avgPct: number | null
  weeklyTests: number
  recentTopics: string[]
  assignmentsDone: number
  weakTopics: string[]
  lastActive: string | null
  sessions: any[]
  leaderRank: number | null
  leaderTotal: number | null
}

function ParentContent() {
  const [children, setChildren] = useState<ChildData[]>([])
  const [selectedChild, setSelectedChild] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'archive' | 'leaderboard' | 'add'>('dashboard')
  const [addCode, setAddCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login/parent'); return }

    const childParam = searchParams.get('child')

    const { data: links } = await supabase
      .from('parent_children')
      .select('child_id, nickname')
      .eq('parent_id', user.id)

    if (!links?.length) { setLoading(false); return }

    const childIds = links.map((l: any) => l.child_id)
    const nicknameMap: Record<string, string> = {}
    links.forEach((l: any) => { nicknameMap[l.child_id] = l.nickname || '' })

    const childData = await Promise.all(childIds.map(async (cid: string) => {
      const [profileRes, streakRes, sessionsRes, completionsRes, weakRes] = await Promise.all([
        supabase.from('profiles').select('name, grade').eq('id', cid).maybeSingle(),
        supabase.from('streaks').select('current_streak').eq('user_id', cid).maybeSingle(),
        supabase.from('quiz_sessions').select('id, pct, topic, question_count, score, created_at, question_type').eq('user_id', cid).eq('completed', true).order('created_at', { ascending: false }).limit(50),
        supabase.from('assignment_completions').select('id').eq('student_id', cid),
        supabase.from('weak_topics').select('topic').eq('user_id', cid).order('wrong_count', { ascending: false }).limit(3),
      ])
      const sessions = sessionsRes.data ?? []
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
      const weeklyTests = sessions.filter((s: any) => new Date(s.created_at) > weekAgo).length
      const avgPct = sessions.length ? Math.round(sessions.reduce((a: number, s: any) => a + s.pct, 0) / sessions.length) : null
      const recentTopics = [...new Set(sessions.slice(0, 5).map((s: any) => s.topic))].slice(0, 3) as string[]
      return {
        child_id: cid,
        nickname: nicknameMap[cid] || profileRes.data?.name || 'Çocuğum',
        name: profileRes.data?.name ?? 'İsimsiz',
        grade: profileRes.data?.grade ?? '',
        streak: streakRes.data?.current_streak ?? 0,
        totalTests: sessions.length,
        avgPct,
        weeklyTests,
        recentTopics,
        assignmentsDone: completionsRes.data?.length ?? 0,
        weakTopics: weakRes.data?.map((w: any) => w.topic) ?? [],
        lastActive: sessions[0]?.created_at ?? null,
        sessions,
        leaderRank: null,
        leaderTotal: null,
      }
    }))

    // Leaderboard
    const { data: lbData } = await supabase
      .from('profiles')
      .select('id, name, grade')
      .limit(100)

    if (lbData?.length) {
      const lbWithStats = await Promise.all(lbData.map(async (p: any) => {
        const { data: s } = await supabase.from('quiz_sessions').select('pct').eq('user_id', p.id).eq('completed', true)
        const avg = s?.length ? Math.round(s.reduce((a: number, x: any) => a + x.pct, 0) / s.length) : 0
        return { ...p, avgPct: avg, totalTests: s?.length ?? 0 }
      }))
      const sorted = lbWithStats.filter(p => p.totalTests > 0).sort((a, b) => b.avgPct - a.avgPct)
      setLeaderboard(sorted.slice(0, 20))

      // Çocukların rank'larını belirle
      childData.forEach(c => {
        const rank = sorted.findIndex(p => p.id === c.child_id)
        c.leaderRank = rank >= 0 ? rank + 1 : null
        c.leaderTotal = sorted.length
      })
    }

    setChildren(childData)
    const initChild = childParam && childData.find(c => c.child_id === childParam)
      ? childParam
      : childData[0]?.child_id ?? null
    setSelectedChild(initChild)
    setLoading(false)
  }

  async function addChild() {
    if (!addCode.trim()) return
    setAdding(true); setAddError(''); setAddSuccess('')
    const { data: { user } } = await supabase.auth.getUser()
    const { data: childProfile } = await supabase.from('profiles').select('id, name').eq('parent_code', addCode.trim().toLowerCase()).maybeSingle()
    if (!childProfile) { setAddError('Kod bulunamadı. Çocuğunuzdan doğru kodu aldığınızdan emin olun.'); setAdding(false); return }
    if (childProfile.id === user.id) { setAddError('Kendi hesabınızı ekleyemezsiniz.'); setAdding(false); return }
    const { data: existing } = await supabase.from('parent_children').select('id').eq('parent_id', user.id).eq('child_id', childProfile.id).maybeSingle()
    if (existing) { setAddError('Bu çocuk zaten listenizde.'); setAdding(false); return }
    await supabase.from('parent_children').insert({ parent_id: user.id, child_id: childProfile.id, nickname: childProfile.name })
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
    setSelectedChild(children.filter(c => c.child_id !== childId)[0]?.child_id ?? null)
  }

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct >= 70) return 'var(--green)'
    if (pct >= 50) return '#f59e0b'
    return 'var(--red)'
  }

  function timeAgo(iso: string | null) {
    if (!iso) return 'Henüz aktif değil'
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
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Veli Navbar */}
      <nav style={{ background: '#082465', padding: '0 1.5rem', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '32px', filter: 'brightness(0) invert(1)' }} />
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500 }}>👨‍👩‍👧 Veli Paneli</span>
        </div>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {[
            { key: 'dashboard', label: '📊 Durum' },
            { key: 'archive', label: '📦 Arşiv' },
            { key: 'leaderboard', label: '🏆 Sıralama' },
            { key: 'add', label: '➕ Çocuk Ekle' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                background: activeTab === t.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: activeTab === t.key ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>
              {t.label}
            </button>
          ))}
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 4px' }} />
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            Çıkış
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem', paddingBottom: '5rem' }}>

        {/* Çocuk seçici — tüm sekmelerde görünür */}
        {children.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {children.map(c => (
              <button key={c.child_id} onClick={() => setSelectedChild(c.child_id)}
                style={{ padding: '7px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                  background: selectedChild === c.child_id ? '#082465' : 'var(--bg2)',
                  borderColor: selectedChild === c.child_id ? '#082465' : 'var(--border)',
                  color: selectedChild === c.child_id ? '#fff' : 'var(--text3)',
                }}>
                {c.nickname}
              </button>
            ))}
          </div>
        )}

        {/* Çocuk yok */}
        {children.length === 0 && activeTab !== 'add' && (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>👶</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)', marginBottom: '8px' }}>Henüz çocuk eklenmedi</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>Çocuğunuzdan Pratium profilindeki veli kodunu alın.</div>
            <button onClick={() => setActiveTab('add')} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              + Çocuk Ekle
            </button>
          </div>
        )}

        {/* DURUM / DASHBOARD */}
        {activeTab === 'dashboard' && selected && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>
                {selected.name}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {selected.grade && <span>📚 {selected.grade}</span>}
                <span>Son aktivite: {timeAgo(selected.lastActive)}</span>
              </div>
            </div>

            {/* Özet kartlar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                { icon: '🔥', label: 'Günlük Seri', value: `${selected.streak} gün`, color: selected.streak >= 7 ? 'var(--green)' : 'var(--text)' },
                { icon: '📊', label: 'Genel Ortalama', value: selected.avgPct !== null ? `%${selected.avgPct}` : '—', color: pctColor(selected.avgPct) },
                { icon: '📅', label: 'Bu Hafta', value: `${selected.weeklyTests} test`, color: 'var(--text)' },
                { icon: '✅', label: 'Ödev', value: `${selected.assignmentsDone} tamamlandı`, color: 'var(--text)' },
                { icon: '🏆', label: 'Genel Sıra', value: selected.leaderRank ? `#${selected.leaderRank}` : '—', color: selected.leaderRank && selected.leaderRank <= 10 ? 'var(--green)' : 'var(--text)' },
              ].map((s, i) => (
                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
                  <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: '18px', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Son çalışılan konular + Zayıf konular */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
              <div className="card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Son Çalışılan</div>
                {selected.recentTopics.length > 0 ? selected.recentTopics.map((t, i) => (
                  <div key={i} style={{ fontSize: '13px', padding: '6px 0', borderBottom: i < selected.recentTopics.length - 1 ? '1px solid var(--border)' : 'none' }}>📚 {t}</div>
                )) : <div style={{ fontSize: '13px', color: 'var(--text4)' }}>Henüz test çözülmedi</div>}
              </div>
              <div className="card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Gelişim Alanları</div>
                {selected.weakTopics.length > 0 ? selected.weakTopics.map((t, i) => (
                  <div key={i} style={{ fontSize: '13px', padding: '6px 0', borderBottom: i < selected.weakTopics.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--red)' }}>⚠️ {t}</div>
                )) : <div style={{ fontSize: '13px', color: 'var(--green)' }}>✓ Zayıf konu yok</div>}
              </div>
            </div>

            {/* Son testler */}
            {selected.sessions.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>📝 Son Çözülen Testler</div>
                {selected.sessions.slice(0, 5).map((s: any) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.topic}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {s.score}/{s.question_count} doğru · {new Date(s.created_at).toLocaleDateString('tr-TR')}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '18px', color: pctColor(s.pct) }}>%{s.pct}</div>
                  </div>
                ))}
                <button onClick={() => setActiveTab('archive')} style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                  Tüm arşivi gör →
                </button>
              </div>
            )}

            {/* Çocuğu kaldır */}
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button onClick={() => removeChild(selected.child_id)} style={{ fontSize: '12px', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Listeden kaldır
              </button>
            </div>
          </div>
        )}

        {/* ARŞİV */}
        {activeTab === 'archive' && selected && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
              📦 {selected.name} — Test Arşivi
            </h2>
            {selected.sessions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Henüz test çözülmemiş.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selected.sessions.map((s: any) => (
                  <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '12px', background: s.pct >= 70 ? 'var(--green-bg)' : s.pct >= 50 ? 'rgba(245,158,11,0.08)' : 'var(--red-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: '16px', color: pctColor(s.pct), lineHeight: 1 }}>%{s.pct}</span>
                      <span style={{ fontSize: '10px', color: pctColor(s.pct), opacity: 0.7, marginTop: '2px' }}>{s.score}/{s.question_count}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {new Date(s.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>🏆 Genel Sıralama</h2>

            {/* Çocuğun sırası */}
            {selected && selected.leaderRank && (
              <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--accent)', background: 'var(--accent-bg)' }}>
                <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>
                  {selected.name} — #{selected.leaderRank} sırada ({selected.leaderTotal} öğrenci arasında)
                </div>
              </div>
            )}

            {leaderboard.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Sıralama yükleniyor...</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {leaderboard.map((p: any, idx: number) => {
                  const isChild = children.some(c => c.child_id === p.id)
                  return (
                    <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', borderLeft: isChild ? '3px solid var(--accent)' : idx < 3 ? '3px solid' : undefined, borderLeftColor: isChild ? 'var(--accent)' : idx === 0 ? '#F59E0B' : idx === 1 ? '#94A3B8' : '#B45309', background: isChild ? 'var(--accent-bg)' : undefined }}>
                      <div style={{ width: 32, textAlign: 'center', fontSize: idx < 3 ? '20px' : '13px', fontWeight: 700, color: 'var(--text4)', flexShrink: 0 }}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: isChild ? 'var(--accent)' : 'var(--primary)' }}>
                          {p.name} {isChild && '⭐'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                          {p.totalTests} test · {p.grade}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '20px', color: pctColor(p.avgPct), flexShrink: 0 }}>
                        %{p.avgPct}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ÇOCUK EKLE */}
        {activeTab === 'add' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>➕ Çocuk Ekle</h2>
            <div className="card">
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '14px', lineHeight: 1.6 }}>
                Çocuğunuzdan Pratium profilindeki <strong>Veli Kodunu</strong> alın ve buraya girin.
                (Profil Düzenle → Veli Bağlantısı bölümünden bulabilirler)
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={addCode} onChange={e => setAddCode(e.target.value)}
                  placeholder="8 haneli veli kodu"
                  onKeyDown={e => e.key === 'Enter' && addChild()}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none' }} />
                <button onClick={addChild} disabled={adding || !addCode.trim()}
                  style={{ padding: '10px 18px', borderRadius: '10px', background: '#082465', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: adding ? 0.6 : 1 }}>
                  {adding ? '...' : 'Ekle'}
                </button>
              </div>
              {addError && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)' }}>⚠️ {addError}</div>}
              {addSuccess && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--green)' }}>✅ {addSuccess}</div>}
            </div>

            {/* Mevcut çocuklar */}
            {children.length > 0 && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>Bağlı Çocuklar</div>
                {children.map(c => (
                  <div key={c.child_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{c.nickname}</div>
                      {c.grade && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{c.grade}</div>}
                    </div>
                    <button onClick={() => removeChild(c.child_id)} style={{ fontSize: '11px', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                      Kaldır
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default function ParentPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}>
      <ParentContent />
    </Suspense>
  )
}
