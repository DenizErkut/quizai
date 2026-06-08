'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import PageHeader from '@/components/PageHeader'
import { createClient } from '@/lib/supabase/client'

export default function ReviewPage() {
  const router = useRouter()
  const supabase = createClient() as any
  const [cards, setCards] = useState<any[]>([])
  const [current, setCurrent] = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [stats, setStats] = useState({ correct: 0, hard: 0, wrong: 0 })
  const [totalDue, setTotalDue] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/spaced-repetition', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const data = await res.json()
      setCards(data.cards || [])
      setTotalDue(data.totalDue || 0)
      setLoading(false)
    }
    load()
  }, [])

  async function rateCard(quality: number) {
    // 0=yanlış, 3=doğru, 5=kolay
    const card = cards[current]
    const { data: { session } } = await supabase.auth.getSession()
    await fetch('/api/spaced-repetition', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ card_id: card.id, quality }),
    })

    setStats(prev => ({
      correct: prev.correct + (quality >= 3 ? 1 : 0),
      hard: prev.hard + (quality === 3 ? 1 : 0),
      wrong: prev.wrong + (quality < 3 ? 1 : 0),
    }))

    setShowAnswer(false)
    if (current + 1 >= cards.length) { setDone(true); return }
    setCurrent(c => c + 1)
  }

  const card = cards[current]

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  if (cards.length === 0) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageHeader title="Tekrar Zamanı" subtitle="Spaced repetition" icon="🧠" color="#8b5cf6" backHref="/quiz" backLabel="Teste dön" />
      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '2rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🎉</div>
        <div style={{ fontWeight: 700, fontSize: '18px', color: 'var(--primary)', marginBottom: '8px' }}>Bugünlük hepsi tamam!</div>
        <div style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '2rem' }}>Bugün tekrar edilecek kart yok. Yarın kontrol et.</div>
        <button onClick={() => router.push('/quiz')} style={{ padding: '12px 24px', borderRadius: '12px', background: '#8b5cf6', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '14px' }}>
          Yeni Test Çöz
        </button>
      </div>
    </main>
  )

  if (done) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <PageHeader title="Oturum Tamamlandı" subtitle="Harika iş!" icon="✅" color="#8b5cf6" backHref="/quiz" backLabel="Teste dön" />
      <div style={{ maxWidth: '400px', margin: '0 auto', padding: '2rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>🧠</div>
        <div style={{ fontWeight: 800, fontSize: '22px', color: 'var(--primary)', marginBottom: '1.5rem' }}>{cards.length} kart tamamlandı!</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px', marginBottom: '2rem' }}>
          <div className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#16a34a' }}>{stats.correct}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Doğru</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#d97706' }}>{stats.hard}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Zor</div>
          </div>
          <div className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#dc2626' }}>{stats.wrong}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>Yanlış</div>
          </div>
        </div>
        <button onClick={() => router.push('/quiz')} style={{ width: '100%', padding: '13px', borderRadius: '12px', background: '#8b5cf6', color: '#fff', border: 'none', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', fontSize: '15px' }}>
          Teste Dön
        </button>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '80px' }}>
      <PageHeader title="Tekrar Zamanı" subtitle={`${current + 1}/${cards.length} kart · ${totalDue} bekliyor`} icon="🧠" color="#8b5cf6" backHref="/quiz" backLabel="Teste dön" />

      <div style={{ maxWidth: '560px', margin: '0 auto', padding: '0 1rem' }}>
        {/* İlerleme */}
        <div style={{ height: 4, borderRadius: '99px', background: 'var(--bg2)', overflow: 'hidden', marginBottom: '1.25rem' }}>
          <div style={{ height: '100%', background: '#8b5cf6', width: `${(current / cards.length) * 100}%`, transition: 'width 0.3s', borderRadius: '99px' }} />
        </div>

        {/* Kart */}
        <div className="card" style={{ marginBottom: '1rem', minHeight: '200px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>
            🧠 {card.topic}
          </div>
          <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--primary)', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            {card.question}
          </div>

          {/* Şıklar */}
          {card.options && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1rem' }}>
              {card.options.map((opt: string, i: number) => {
                const isCorrect = i === card.correct_answer
                let bg = 'var(--bg2)', border = 'var(--border)', color = 'var(--primary)'
                if (showAnswer && isCorrect) { bg = 'rgba(22,163,74,0.1)'; border = '#16a34a'; color = '#15803d' }
                return (
                  <div key={i} style={{ padding: '10px 14px', borderRadius: '10px', border: `1.5px solid ${border}`, background: bg, color, fontSize: '14px', display: 'flex', gap: '8px' }}>
                    <span style={{ fontWeight: 700, color: showAnswer && isCorrect ? '#16a34a' : '#8b5cf6' }}>{['A','B','C','D'][i]}</span>
                    {opt}
                    {showAnswer && isCorrect && <span style={{ marginLeft: 'auto' }}>✓</span>}
                  </div>
                )
              })}
            </div>
          )}

          {showAnswer && card.explanation && (
            <div style={{ padding: '10px 12px', borderRadius: '10px', background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', fontSize: '13px', color: 'var(--text)', lineHeight: 1.6 }}>
              💡 {card.explanation}
            </div>
          )}
        </div>

        {!showAnswer ? (
          <button onClick={() => setShowAnswer(true)} style={{ width: '100%', padding: '13px', borderRadius: '12px', border: 'none', background: '#8b5cf6', color: '#fff', fontWeight: 700, fontSize: '15px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
            Cevabı Gör
          </button>
        ) : (
          <div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', textAlign: 'center', marginBottom: '10px' }}>Ne kadar kolaydı?</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '8px' }}>
              <button onClick={() => rateCard(1)} style={{ padding: '12px 8px', borderRadius: '12px', border: '2px solid #dc2626', background: 'rgba(220,38,38,0.08)', color: '#dc2626', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                😓 Yanlış<br /><span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.8 }}>yarın tekrar</span>
              </button>
              <button onClick={() => rateCard(3)} style={{ padding: '12px 8px', borderRadius: '12px', border: '2px solid #d97706', background: 'rgba(217,119,6,0.08)', color: '#d97706', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                🤔 Zordu<br /><span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.8 }}>kısa süre</span>
              </button>
              <button onClick={() => rateCard(5)} style={{ padding: '12px 8px', borderRadius: '12px', border: '2px solid #16a34a', background: 'rgba(22,163,74,0.08)', color: '#16a34a', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                😎 Kolaydı<br /><span style={{ fontSize: '10px', fontWeight: 400, opacity: 0.8 }}>uzun süre</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
