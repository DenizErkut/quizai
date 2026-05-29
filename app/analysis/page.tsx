'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface WeakTopic {
  id: string; topic: string; subject: string
  wrong_count: number; total_count: number; last_seen_at: string
}
interface Session {
  id: string; topic: string; score: number; pct: number
  question_count: number; created_at: string; questions: any[]; answers: any[]
}

export default function AnalysisPage() {
  const router = useRouter()
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [aiPlan, setAiPlan] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedSession, setExpandedSession] = useState<string | null>(null)
  const [youtubeLinks, setYoutubeLinks] = useState<Record<string, string>>({})
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const [{ data: wt }, { data: s }] = await Promise.all([
        supabase.from('weak_topics').select('*').eq('user_id', user.id).order('wrong_count', { ascending: false }).limit(10),
        supabase.from('quiz_sessions').select('*').eq('user_id', user.id).eq('completed', true).order('created_at', { ascending: false }).limit(10),
      ])

      setWeakTopics(wt || [])
      setSessions(s || [])

      const links: Record<string, string> = {}
      for (const topic of (wt || []).slice(0, 5)) {
        links[topic.topic] = `https://www.youtube.com/results?search_query=${encodeURIComponent(topic.topic + ' konu anlatımı #shorts')}`
      }
      setYoutubeLinks(links)
      setLoading(false)
    }
    load()
  }, [])

  async function generateAiAnalysis() {
    setLoadingAi(true)
    const { data: { session } } = await supabase.auth.getSession()
    const weakList = weakTopics.slice(0, 5).map(w => `${w.topic} (${w.wrong_count}/${w.total_count} yanlış)`).join(', ')

    const res = await fetch('/api/ai-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ weakTopics: weakList }),
    })
    const data = await res.json()
    setAiPlan(data.analysis || '')
    setLoadingAi(false)
  }

  // ✅ YENİ: Zayıf konudan quiz oluştur
  function startQuizFromTopic(topic: string) {
    const params = new URLSearchParams({ topic, source: 'weak_topic' })
    router.push(`/quiz?${params.toString()}`)
  }

  function accuracy(wrong: number, total: number) {
    return Math.round((1 - wrong / total) * 100)
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>

        <div className="anim-up" style={{ marginBottom: '2rem' }}>
          <div className="badge badge-purple" style={{ marginBottom: '0.75rem' }}>Analiz</div>
          <h1 className="serif" style={{ fontSize: '28px' }}>Zayıf konu analizi</h1>
          <p style={{ color: 'var(--text2)', fontSize: '14px', marginTop: '4px' }}>
            Yanlış yanıtladığın sorulara göre kişisel analiz.
          </p>
        </div>

        {/* Zayıf konular */}
        <div className="card anim-up-1" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Zayıf konular
          </div>

          {weakTopics.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text2)', fontSize: '14px' }}>
              Henüz yeterli veri yok. Daha fazla test çöz!
            </div>
          ) : (
            weakTopics.map((w, i) => {
              const acc = accuracy(w.wrong_count, w.total_count)
              const ytLink = youtubeLinks[w.topic]
              return (
                <div key={w.id} style={{ padding: '12px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '14px' }}>{w.topic}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                        {w.wrong_count} yanlış / {w.total_count} soru
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span style={{
                        fontSize: '12px', padding: '3px 8px', borderRadius: '99px', fontWeight: 600,
                        background: acc < 50 ? 'var(--red-bg)' : acc < 70 ? 'rgba(217,119,6,0.1)' : 'var(--green-bg)',
                        color: acc < 50 ? 'var(--red)' : acc < 70 ? '#d97706' : 'var(--green)',
                      }}>%{acc}</span>

                      {/* ✅ YENİ: Quiz oluştur butonu */}
                      <button
                        onClick={() => startQuizFromTopic(w.topic)}
                        style={{
                          fontSize: '11px', padding: '4px 8px', borderRadius: '6px',
                          background: 'var(--accent)', color: '#fff',
                          border: 'none', cursor: 'pointer', fontWeight: 600,
                          fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '3px',
                        }}>
                        ⚡ Quiz yap
                      </button>

                      {ytLink && (
                        <a href={ytLink} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: '#ff0000', color: '#fff', textDecoration: 'none', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          ▶ YouTube
                        </a>
                      )}
                    </div>
                  </div>
                  {/* Accuracy bar */}
                  <div style={{ height: '4px', borderRadius: '99px', background: 'var(--bg2)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${acc}%`, borderRadius: '99px', background: acc < 50 ? 'var(--red)' : acc < 70 ? '#d97706' : 'var(--green)', transition: 'width 0.5s' }} />
                  </div>
                </div>
              )
            })
          )}

          {weakTopics.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button className="btn btn-primary" onClick={generateAiAnalysis} disabled={loadingAi}
                style={{ flex: 1, justifyContent: 'center' }}>
                {loadingAi
                  ? <><span className="spinner" style={{ width: 16, height: 16 }} /> AI analiz yapıyor...</>
                  : '🤖 Detaylı analiz al'}
              </button>
              <button className="btn" onClick={() => router.push('/plan')}
                style={{ flex: 1, justifyContent: 'center', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
                📋 4 Haftalık Plan
              </button>
            </div>
          )}
        </div>

        {/* AI Analizi */}
        {aiPlan && (
          <div className="card anim-up-2" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--accent)' }}>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
              🤖 AI Analizi
            </div>
            <div style={{ fontSize: '14px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
              {aiPlan}
            </div>
          </div>
        )}

        {/* Son testlerdeki yanlış sorular */}
        <div className="card anim-up-3">
          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
            Son testlerdeki yanlışlar
          </div>

          {sessions.map((s, i) => {
            const wrongAnswers: any[] = []
            ;(s.answers || []).forEach((a: any, qi: number) => {
              const q = s.questions?.[qi]
              if (!q) return
              if (q.type === 'multi_true_false' && q.statements?.length) {
                q.statements.forEach((stmt: any, si: number) => {
                  const userAns = a.mTFAnswers?.[si]
                  const isCorrect = userAns === stmt.correct
                  if (!isCorrect) {
                    wrongAnswers.push({
                      correct: false,
                      q: {
                        q: `[Çoklu D/Y] ${stmt.text}`,
                        exp: q.exp || '',
                        opts: ['Doğru', 'Yanlış'],
                        ans: stmt.correct ? 0 : 1,
                        type: 'multi_true_false_item',
                      },
                    })
                  }
                })
              } else if (!a.correct && q) {
                wrongAnswers.push({ ...a, q })
              }
            })

            if (wrongAnswers.length === 0) return null
            const isExpanded = expandedSession === s.id

            return (
              <div key={s.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, paddingTop: i > 0 ? '12px' : 0, marginTop: i > 0 ? '12px' : 0 }}>
                <button onClick={() => setExpandedSession(isExpanded ? null : s.id)}
                  style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>{s.topic}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {new Date(s.created_at).toLocaleDateString('tr-TR')} · {wrongAnswers.length} yanlış
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: s.pct >= 60 ? 'var(--green)' : 'var(--red)' }}>%{s.pct}</span>
                      <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {wrongAnswers.map((a: any, wi: number) => {
                      const ytLink = a.q?.q ? `https://www.youtube.com/results?search_query=${encodeURIComponent(s.topic + ' ' + a.q.q.slice(0, 30) + ' #shorts')}` : null
                      return (
                        <div key={wi} style={{ padding: '10px 12px', borderRadius: '10px', background: 'var(--red-bg)', border: '1px solid rgba(220,38,38,0.15)' }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>✗ {a.q?.q}</div>
                          <div style={{ fontSize: '12px', color: 'var(--green)', marginBottom: '4px' }}>
                            Doğru: {a.q?.opts?.[a.q?.ans]}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.6, marginBottom: '6px' }}>
                            💡 {a.q?.exp}
                          </div>
                          {ytLink && (
                            <a href={ytLink} target="_blank" rel="noopener noreferrer"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: '#ff0000', color: '#fff', textDecoration: 'none', fontWeight: 500 }}>
                              ▶ YouTube'da ara
                            </a>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}

          {sessions.every(s => (s.answers || []).filter((a: any) => !a.correct).length === 0) && (
            <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: '14px', padding: '1.5rem' }}>
              Tüm sorular doğru! 🎉
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
