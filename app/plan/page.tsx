'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface PlanWeek {
  week: number
  goal: string
  topics: string[]
  daily_minutes: number
  focus: string
}

interface StudyPlan {
  summary: string
  weeks: PlanWeek[]
  motivation: string
}

export default function PlanPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: p }, { data: existingPlan }, { data: wt }, { data: s }] = await Promise.all([
        supabase.from('profiles').select('name,grade,language,plan').eq('id', user.id).single(),
        supabase.from('study_plans').select('*').eq('user_id', user.id).order('generated_at', { ascending: false }).limit(1).single(),
        supabase.from('weak_topics').select('topic,wrong_count,total_count').eq('user_id', user.id).order('wrong_count', { ascending: false }).limit(5),
        supabase.from('quiz_sessions').select('score,pct,question_count').eq('user_id', user.id).eq('completed', true),
      ])

      setProfile(p)
      setStats({ weakTopics: wt || [], sessions: s || [] })

      if (existingPlan?.plan) {
        try { setPlan(existingPlan.plan) } catch { }
      }
      setLoading(false)
    }
    load()
  }, [])

  async function generatePlan() {
    setGenerating(true)
    const { data: { session } } = await supabase.auth.getSession()

    const avgPct = stats.sessions.length
      ? Math.round(stats.sessions.reduce((s: number, x: any) => s + x.pct, 0) / stats.sessions.length)
      : 0

    const weakList = stats.weakTopics.map((w: any) => w.topic).join(', ')

    const res = await fetch('/api/study-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ weakTopics: weakList, avgPct, totalTests: stats.sessions.length }),
    })
    const data = await res.json()
    if (data.plan) {
      setPlan(data.plan)
      // Supabase'e kaydet
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('study_plans').insert({
        user_id: user.id,
        plan: data.plan,
        valid_until: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
      })
    }
    setGenerating(false)
  }

  const avgPct = stats?.sessions?.length
    ? Math.round(stats.sessions.reduce((s: number, x: any) => s + x.pct, 0) / stats.sessions.length)
    : 0

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div className="anim-up" style={{ marginBottom: '2rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Kişisel Plan</div>
          <h1 className="serif" style={{ fontSize: '28px' }}>Gelişim planın</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '4px' }}>
            AI, test geçmişine göre 4 haftalık kişisel plan oluşturur.
          </p>
        </div>

        {/* Mevcut durum özeti */}
        <div className="card anim-up-1" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Mevcut durumun
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '10px', marginBottom: '1rem' }}>
            {[
              { label: 'Toplam test', value: stats?.sessions?.length || 0, color: 'var(--accent)' },
              { label: 'Ortalama', value: `%${avgPct}`, color: avgPct >= 70 ? 'var(--green)' : 'var(--red)' },
              { label: 'Zayıf konu', value: stats?.weakTopics?.length || 0, color: 'var(--amber)' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center', padding: '12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '22px', fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{s.label}</div>
              </div>
            ))}
          </div>

          {stats?.weakTopics?.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '6px' }}>Odaklanılacak konular:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {stats.weakTopics.slice(0, 5).map((w: any, i: number) => (
                  <span key={i} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '99px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.15)' }}>
                    {w.topic}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Plan oluştur butonu */}
        {!plan ? (
          <div className="card anim-up-2" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📋</div>
            <h3 className="serif" style={{ fontSize: '20px', marginBottom: '0.75rem' }}>
              {stats?.sessions?.length < 3 ? 'Daha fazla test çöz' : 'Planını oluştur'}
            </h3>
            <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '1.5rem', lineHeight: 1.7 }}>
              {stats?.sessions?.length < 3
                ? 'Kişisel plan için en az 3 test çözmen gerekiyor. Şu an: ' + stats.sessions.length
                : 'AI, test geçmişini analiz ederek 4 haftalık özel plan hazırlayacak.'}
            </p>
            <button className="btn btn-primary btn-lg" onClick={generatePlan}
              disabled={generating || stats?.sessions?.length < 3}
              style={{ justifyContent: 'center' }}>
              {generating
                ? <><span className="spinner" style={{ width: 18, height: 18 }} /> Plan oluşturuluyor...</>
                : '🤖 4 haftalık plan oluştur'}
            </button>
          </div>
        ) : (
          <div className="anim-up-2">
            {/* Plan özeti */}
            <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--accent)' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Genel değerlendirme
              </div>
              <p style={{ fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>{plan.summary}</p>
            </div>

            {/* Haftalık planlar */}
            {plan.weeks?.map((week, i) => (
              <div key={i} className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '2px' }}>Hafta {week.week}</div>
                    <div style={{ fontWeight: 600, fontSize: '16px' }}>{week.goal}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent)' }}>{week.daily_minutes}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>dk/gün</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {week.topics?.map((t, ti) => (
                    <span key={ti} style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '99px', background: 'var(--accent-bg)', color: 'var(--accent)', border: '1px solid rgba(91,76,245,0.2)' }}>
                      {t}
                    </span>
                  ))}
                </div>

                <div style={{ fontSize: '13px', color: 'var(--text2)', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg2)', lineHeight: 1.6 }}>
                  💡 {week.focus}
                </div>
              </div>
            ))}

            {/* Motivasyon */}
            {plan.motivation && (
              <div className="card" style={{ textAlign: 'center', background: 'var(--accent-bg)', border: '1px solid rgba(91,76,245,0.2)' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⭐</div>
                <p style={{ fontSize: '14px', color: 'var(--accent)', fontStyle: 'italic', lineHeight: 1.7 }}>
                  "{plan.motivation}"
                </p>
              </div>
            )}

            <button className="btn btn-sm" onClick={generatePlan} disabled={generating}
              style={{ marginTop: '1rem', width: '100%', justifyContent: 'center' }}>
              {generating ? 'Yenileniyor...' : '↺ Planı yenile'}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
