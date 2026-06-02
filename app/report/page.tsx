'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

const TYPE_LABELS: Record<string, string> = {
  multiple_choice: 'Çoktan Seçmeli', fill_blank: 'Boşluk Doldurma',
  true_false: 'Doğru/Yanlış', multi_true_false: 'Çoklu D/Y',
  matching: 'Eşleştirme', ordering: 'Sıralama',
  short_answer: 'Kısa Cevap', mixed: 'Karma', table_fill: 'Tablo',
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
      <div style={{ fontSize: '28px', fontWeight: 800, color: color || 'var(--primary)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '11px', color: color || 'var(--accent)', marginTop: '2px', fontWeight: 600 }}>{sub}</div>}
      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    </div>
  )
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width 0.5s' }} />
    </div>
  )
}

export default function StudentReportPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'topics' | 'trend' | 'details'>('overview')
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const res = await fetch('/api/report?type=student', {
        headers: { Authorization: `Bearer ${session.access_token}` }
      })
      if (res.ok) setData(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>
  if (!data) return null

  const { stats, streak, weakTopics } = data
  const pctColor = (p: number) => p >= 80 ? 'var(--green)' : p >= 50 ? '#f59e0b' : 'var(--red)'

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>

        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/dashboard" style={{ fontSize: '13px', color: 'var(--text3)', textDecoration: 'none' }}>← Dashboard</Link>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginTop: '8px' }}>📊 Kişisel Raporum</h1>
          <p style={{ fontSize: '13px', color: 'var(--text3)' }}>Tüm çözümlerin analizi</p>
        </div>

        {/* Streak banner */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.25rem', padding: '12px 16px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(8,36,101,0.06), rgba(30,207,184,0.06))', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '24px' }}>🔥</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>{streak.current_streak} günlük seri</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>En uzun: {streak.longest_streak} gün · Toplam puan: {streak.total_points}</div>
          </div>
        </div>

        {/* Ana istatistikler */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.25rem' }}>
          <StatCard label="Toplam Test" value={stats.totalTests} />
          <StatCard label="Genel Ort." value={`%${stats.avgPct}`} color={pctColor(stats.avgPct)} />
          <StatCard label="Bu Hafta" value={stats.weeklyTests} sub="test" color="var(--accent)" />
          <StatCard label="Mükemmel" value={stats.perfect} sub="%100" color="var(--green)" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
          <StatCard label="Toplam Soru" value={stats.totalQuestions} />
          <StatCard label="Doğru" value={stats.totalCorrect} color="var(--green)" />
          <StatCard label="Başarılı" value={stats.good} sub="≥%80" color="var(--green)" />
          <StatCard label="Zayıf" value={stats.failing} sub="<%50" color="var(--red)" />
        </div>

        {/* Başarı dağılımı */}
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Başarı Dağılımı</div>
          {[
            { label: 'Mükemmel (%100)', count: stats.perfect, color: '#10b981' },
            { label: 'İyi (%80-99)', count: stats.good, color: '#34d399' },
            { label: 'Orta (%50-79)', count: stats.passing, color: '#f59e0b' },
            { label: 'Zayıf (<%50)', count: stats.failing, color: '#ef4444' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '130px', fontSize: '12px', color: 'var(--text2)', flexShrink: 0 }}>{row.label}</div>
              <MiniBar pct={stats.totalTests ? (row.count / stats.totalTests) * 100 : 0} color={row.color} />
              <div style={{ width: '28px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: row.color, flexShrink: 0 }}>{row.count}</div>
            </div>
          ))}
        </div>

        {/* Soru tipi dağılımı */}
        {Object.keys(stats.typeCounts).length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Soru Tipi Dağılımı</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(stats.typeCounts).map(([type, count]: any) => (
                <div key={type} style={{ padding: '5px 12px', borderRadius: '99px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px' }}>
                  {TYPE_LABELS[type] || type}: <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trend — son 10 test */}
        {stats.trend.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Son {stats.trend.length} Test Trendi</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '70px' }}>
              {stats.trend.map((t: any, i: number) => (
                <div key={i} title={`${t.topic}: %${t.pct}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <div style={{ width: '100%', borderRadius: '4px 4px 0 0', height: `${Math.max(t.pct * 0.7, 4)}px`, background: pctColor(t.pct), opacity: 0.85 }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '12px', marginTop: '8px', fontSize: '11px' }}>
              <span style={{ color: 'var(--green)' }}>■ ≥%80</span>
              <span style={{ color: '#f59e0b' }}>■ %50-79</span>
              <span style={{ color: 'var(--red)' }}>■ &lt;%50</span>
            </div>
          </div>
        )}

        {/* En çok çözülen konular */}
        {stats.topTopics.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>En Çok Çözülen Konular</div>
            {stats.topTopics.map((t: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text3)', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{t.topic}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{t.count} test</div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: pctColor(t.avgPct) }}>%{t.avgPct}</span>
              </div>
            ))}
          </div>
        )}

        {/* Zayıf konular */}
        {weakTopics.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--red)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>⚠️ Zayıf Konular</div>
            {weakTopics.map((w: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div style={{ flex: 1, fontSize: '13px' }}>{w.topic}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{w.wrong_count} yanlış</div>
                <Link href={`/quiz?topic=${encodeURIComponent(w.topic)}&source=weak_topic`}
                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                  ⚡ Çalış
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
