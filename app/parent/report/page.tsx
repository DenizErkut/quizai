'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

function pctColor(p: number) { return p >= 80 ? 'var(--green)' : p >= 50 ? '#f59e0b' : 'var(--red)' }

function StudentCard({ s, onClick }: { s: any; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ padding: '16px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg)', cursor: 'pointer', transition: 'all 0.15s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(8,36,101,0.3)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{s.nickname || s.name}</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{s.grade}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '22px', fontWeight: 800, color: pctColor(s.avgPct || 0) }}>%{s.avgPct || 0}</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>genel ort.</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
        {[
          { label: 'Test', value: s.totalTests },
          { label: 'Soru', value: s.totalQuestions },
          { label: 'Seri', value: `🔥 ${s.streak}` },
          { label: 'Bu Hafta', value: s.weeklyTests },
        ].map((item, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '6px', borderRadius: '8px', background: 'var(--bg2)' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--primary)' }}>{item.value}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase' }}>{item.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DetailReport({ childId, onBack }: { childId: string; onBack: () => void }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`/api/report?type=parent&userId=${childId}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` }
      })
      if (res.ok) setData(await res.json())
      setLoading(false)
    }
    load()
  }, [childId])

  if (loading) return <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div>
  if (!data) return null

  const { stats, streak, weakTopics, name, grade, nickname } = data
  return (
    <div>
      <button onClick={onBack} style={{ fontSize: '13px', color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '16px', padding: 0 }}>← Geri</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--primary)' }}>{nickname || name}</h2>
          <div style={{ fontSize: '13px', color: 'var(--text3)' }}>{grade} · 🔥 {streak?.current_streak || 0} gün seri</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '32px', fontWeight: 800, color: pctColor(stats.avgPct) }}>%{stats.avgPct}</div>
          <div style={{ fontSize: '11px', color: 'var(--text3)' }}>genel ortalama</div>
        </div>
      </div>

      {/* İstatistik grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '1rem' }}>
        {[
          { label: 'Toplam Test', value: stats.totalTests },
          { label: 'Toplam Soru', value: stats.totalQuestions },
          { label: 'Doğru', value: stats.totalCorrect, color: 'var(--green)' },
          { label: 'Mükemmel', value: stats.perfect, color: 'var(--green)' },
          { label: 'Zayıf Test', value: stats.failing, color: 'var(--red)' },
          { label: 'Bu Hafta', value: stats.weeklyTests, color: 'var(--accent)' },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '12px 8px', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg)' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: s.color || 'var(--primary)' }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', marginTop: '2px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Trend */}
      {stats.trend.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Son Testler Trendi</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '5px', height: '60px' }}>
            {stats.trend.map((t: any, i: number) => (
              <div key={i} title={`${t.topic}: %${t.pct}`} style={{ flex: 1 }}>
                <div style={{ width: '100%', borderRadius: '3px 3px 0 0', height: `${Math.max(t.pct * 0.6, 3)}px`, background: pctColor(t.pct) }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Konular */}
      {stats.topTopics.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Çalışılan Konular</div>
          {stats.topTopics.map((t: any, i: number) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div style={{ flex: 1, fontSize: '13px' }}>{t.topic}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{t.count}x</div>
              <span style={{ fontWeight: 700, fontSize: '13px', color: pctColor(t.avgPct) }}>%{t.avgPct}</span>
            </div>
          ))}
        </div>
      )}

      {/* Zayıf konular */}
      {weakTopics?.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--red)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>⚠️ Çalışması Gereken Konular</div>
          {weakTopics.map((w: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div style={{ flex: 1, fontSize: '13px' }}>{w.topic}</div>
              <div style={{ fontSize: '11px', color: 'var(--red)' }}>{w.wrong_count} yanlış</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ParentReportPage() {
  const [children, setChildren] = useState<any[]>([])
  const [selectedChild, setSelectedChild] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const res = await fetch('/api/report?type=parent', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) { const d = await res.json(); setChildren(d.children || []) }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto' }}>
        {selectedChild ? (
          <DetailReport childId={selectedChild} onBack={() => setSelectedChild(null)} />
        ) : (
          <>
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>👨‍👩‍👧 Çocuklarımın Raporları</h1>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Detaylı rapor için karta tıklayın</p>
            </div>
            {children.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>👶</div>
                <div style={{ fontWeight: 600, color: 'var(--primary)' }}>Henüz çocuk eklenmemiş</div>
                <Link href="/parent" style={{ display: 'inline-block', marginTop: '12px', color: 'var(--accent)', fontSize: '13px' }}>Veli paneline git →</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {children.map((c: any) => <StudentCard key={c.child_id} s={c} onClick={() => setSelectedChild(c.child_id)} />)}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
