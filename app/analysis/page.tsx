'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Area, AreaChart
} from 'recharts'

interface Session {
  id: string; topic: string; score: number; pct: number
  question_count: number; created_at: string; questions: any[]; answers: any[]
}
interface WeakTopic {
  id: string; topic: string; subject: string
  wrong_count: number; total_count: number; last_seen_at: string
}

const COLORS = ['#6366f1', '#1ECFB8', '#f59e0b', '#ef4444', '#3b82f6', '#10b981', '#8b5cf6', '#f97316']

const SUBJECT_COLORS: Record<string, string> = {
  'Matematik': '#6366f1',
  'Türkçe': '#10b981',
  'Fen Bilimleri': '#3b82f6',
  'Sosyal Bilgiler': '#f59e0b',
  'İngilizce': '#8b5cf6',
  'default': '#94a3b8'
}

function pctColor(pct: number) {
  if (pct >= 80) return '#10b981'
  if (pct >= 55) return '#f59e0b'
  return '#ef4444'
}

export default function AnalysisPage() {
  const router = useRouter()
  const [sessions, setSessions] = useState<Session[]>([])
  const [weakTopics, setWeakTopics] = useState<WeakTopic[]>([])
  const [aiPlan, setAiPlan] = useState('')
  const [loadingAi, setLoadingAi] = useState(false)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'subjects' | 'trend' | 'weakpoints'>('overview')
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const [{ data: s }, { data: wt }] = await Promise.all([
        supabase.from('quiz_sessions').select('id,topic,score,pct,question_count,created_at,questions,answers')
          .eq('user_id', user.id).eq('completed', true)
          .order('created_at', { ascending: false }).limit(50),
        supabase.from('weak_topics').select('*').eq('user_id', user.id)
          .order('wrong_count', { ascending: false }).limit(15),
      ])
      setSessions(s || [])
      setWeakTopics(wt || [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Veri hesaplamaları ──────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!sessions.length) return null
    const avg = Math.round(sessions.reduce((a, s) => a + s.pct, 0) / sessions.length)
    const best = sessions.reduce((a, s) => s.pct > a.pct ? s : a)
    const worst = sessions.reduce((a, s) => s.pct < a.pct ? s : a)
    const totalQ = sessions.reduce((a, s) => a + s.question_count, 0)
    const totalCorrect = sessions.reduce((a, s) => a + s.score, 0)
    return { avg, best, worst, totalQ, totalCorrect, count: sessions.length }
  }, [sessions])

  // Haftalık trend (son 8 hafta)
  const trendData = useMemo(() => {
    const weeks: Record<string, { week: string; avg: number; count: number; total: number }> = {}
    sessions.forEach(s => {
      const d = new Date(s.created_at)
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - d.getDay())
      const key = weekStart.toISOString().split('T')[0]
      const label = `${weekStart.getDate()}/${weekStart.getMonth() + 1}`
      if (!weeks[key]) weeks[key] = { week: label, avg: 0, count: 0, total: 0 }
      weeks[key].total += s.pct
      weeks[key].count += 1
    })
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-8)
      .map(([, v]) => ({ ...v, avg: Math.round(v.total / v.count) }))
  }, [sessions])

  // Ders bazlı performans (donut + bar)
  const subjectData = useMemo(() => {
    const map: Record<string, { subject: string; total: number; count: number; wrong: number }> = {}
    sessions.forEach(s => {
      const subj = s.topic.split(' ').slice(0, 2).join(' ') || 'Diğer'
      if (!map[subj]) map[subj] = { subject: subj, total: 0, count: 0, wrong: 0 }
      map[subj].total += s.pct
      map[subj].count += 1
      map[subj].wrong += (s.question_count - s.score)
    })
    return Object.values(map)
      .map(v => ({ ...v, avg: Math.round(v.total / v.count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
  }, [sessions])

  // Soru tipi başarısı
  const typeData = useMemo(() => {
    const map: Record<string, { type: string; correct: number; total: number }> = {}
    sessions.forEach(s => {
      const questions = s.questions || []
      const answers = s.answers || []
      questions.forEach((q: any, i: number) => {
        const t = q.type || 'multiple_choice'
        const label = ({
          'multiple_choice': 'Çoktan Seçmeli',
          'true_false': 'Doğru/Yanlış',
          'fill_blank': 'Boşluk Doldurma',
          'short_answer': 'Kısa Cevap',
          'matching': 'Eşleştirme',
          'ordering': 'Sıralama',
          'multi_true_false': 'Çoklu D/Y',
          'table_fill': 'Tablo',
        } as any)[t] || t
        if (!map[label]) map[label] = { type: label, correct: 0, total: 0 }
        map[label].total += 1
        if (answers[i]?.correct) map[label].correct += 1
      })
    })
    return Object.values(map)
      .map(v => ({ ...v, pct: v.total ? Math.round(v.correct / v.total * 100) : 0 }))
      .filter(v => v.total >= 3)
      .sort((a, b) => b.pct - a.pct)
  }, [sessions])

  // Radar chart — ders bazlı güçlü/zayıf
  const radarData = useMemo(() => subjectData.slice(0, 6).map(s => ({
    subject: s.subject.length > 10 ? s.subject.slice(0, 10) + '…' : s.subject,
    puan: s.avg
  })), [subjectData])

  async function generateAiAnalysis() {
    setLoadingAi(true)
    const { data: { session } } = await supabase.auth.getSession()
    const weakList = weakTopics.slice(0, 5).map(w => `${w.topic} (${w.wrong_count}/${w.total_count} yanlış)`).join(', ')
    const res = await fetch('/api/ai-analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ weakTopics: weakList, sessions: sessions.slice(0, 10).map(s => ({ topic: s.topic, pct: s.pct })) }),
    })
    const data = await res.json()
    setAiPlan(data.plan || '')
    setLoadingAi(false)
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" />
    </main>
  )

  if (!sessions.length) return (
    <main style={{ minHeight: '100vh', padding: '2rem' }}>
      <div style={{ maxWidth: '480px', margin: '4rem auto', textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '1rem' }}>📊</div>
        <h2 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Henüz analiz verisi yok</h2>
        <p style={{ color: 'var(--text3)', marginBottom: '1.5rem' }}>Birkaç test çözdükten sonra detaylı analizin burada belirecek.</p>
        <Link href="/quiz" className="btn btn-primary" style={{ justifyContent: 'center' }}>⚡ İlk Testi Başlat</Link>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', padding: '1.5rem 1rem', paddingBottom: '6rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Başlık */}
        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>📊 Performans Analizi</h1>
          <p style={{ color: 'var(--text3)', fontSize: '13px' }}>{stats?.count} test · {stats?.totalQ} soru çözüldü</p>
        </div>

        {/* Özet stat kartları */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
          {[
            { label: 'Genel Ortalama', value: `%${stats?.avg}`, icon: '📈', color: pctColor(stats?.avg || 0) },
            { label: 'Toplam Test', value: stats?.count, icon: '📝', color: 'var(--primary)' },
            { label: 'Çözülen Soru', value: stats?.totalQ, icon: '❓', color: '#6366f1' },
            { label: 'En İyi Test', value: `%${stats?.best.pct}`, icon: '🏆', color: '#10b981' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 10px' }}>
              <div style={{ fontSize: '22px', marginBottom: '4px' }}>{s.icon}</div>
              <div style={{ fontWeight: 800, fontSize: '20px', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tab menüsü */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {[
            { key: 'overview', label: '🗺️ Genel Bakış' },
            { key: 'subjects', label: '📚 Dersler' },
            { key: 'trend', label: '📈 Trend' },
            { key: 'weakpoints', label: '⚠️ Zayıf Noktalar' },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: '7px 14px', borderRadius: '99px', border: `1.5px solid ${activeTab === t.key ? 'var(--accent)' : 'var(--border)'}`, background: activeTab === t.key ? 'var(--accent)' : 'var(--bg)', color: activeTab === t.key ? '#fff' : 'var(--text2)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── GENEL BAKIŞ ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>

              {/* Radar Chart */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>🕸️ Ders Radar</div>
                <ResponsiveContainer width="100%" height={220}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                    <Radar name="Puan" dataKey="puan" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} />
                    <Tooltip formatter={(v: any) => [`%${v}`, 'Başarı']} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Ders Dağılımı Pie */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>🍩 Test Dağılımı</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={subjectData} dataKey="count" nameKey="subject" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                      {subjectData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, name: any) => [v + ' test', name]} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: '11px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Soru Tipi Bar */}
            {typeData.length > 0 && (
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>🎯 Soru Tipi Başarısı</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={typeData} layout="vertical" margin={{ left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `%${v}`} />
                    <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: 'var(--text2)' }} width={130} />
                    <Tooltip formatter={(v: any) => [`%${v}`, 'Başarı']} />
                    <Bar dataKey="pct" radius={[0, 6, 6, 0]}>
                      {typeData.map((d, i) => <Cell key={i} fill={pctColor(d.pct)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* ── DERSLER ── */}
        {activeTab === 'subjects' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>📚 Ders Bazlı Başarı</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={subjectData} margin={{ bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="subject" tick={{ fontSize: 11, fill: 'var(--text2)' }} angle={-25} textAnchor="end" interval={0} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={v => `%${v}`} />
                  <Tooltip formatter={(v: any) => [`%${v}`, 'Ortalama']} />
                  <Bar dataKey="avg" radius={[6, 6, 0, 0]} name="Ortalama">
                    {subjectData.map((d, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Ders detay tablosu */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>📋 Ders Detayları</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Konu', 'Test', 'Ort. Başarı', 'Yanlış', 'Durum'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text3)', fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {subjectData.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.subject}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text3)' }}>{s.count}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ color: pctColor(s.avg), fontWeight: 700 }}>%{s.avg}</span>
                          <div style={{ height: '4px', background: 'var(--border)', borderRadius: '2px', marginTop: '4px', width: '80px' }}>
                            <div style={{ height: '4px', background: pctColor(s.avg), borderRadius: '2px', width: `${s.avg}%` }} />
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#ef4444' }}>{s.wrong}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '99px', background: s.avg >= 80 ? 'rgba(16,185,129,0.1)' : s.avg >= 55 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)', color: pctColor(s.avg), fontWeight: 600 }}>
                            {s.avg >= 80 ? '✓ İyi' : s.avg >= 55 ? '~ Orta' : '✗ Zayıf'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── TREND ── */}
        {activeTab === 'trend' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>📈 Haftalık Gelişim</div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={trendData}>
                  <defs>
                    <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `%${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`%${v}`, 'Ortalama']} />
                  <Area type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorAvg)" dot={{ fill: '#6366f1', r: 4 }} activeDot={{ r: 6 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Son 10 test */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>🕐 Son Testler</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={sessions.slice(0, 10).reverse().map((s, i) => ({ name: `#${i + 1}`, pct: s.pct, topic: s.topic }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tickFormatter={v => `%${v}`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any, _: any, p: any) => [`%${v} — ${p.payload.topic}`, 'Başarı']} />
                  <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                    {sessions.slice(0, 10).map((s, i) => <Cell key={i} fill={pctColor(s.pct)} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── ZAYIF NOKTALAR ── */}
        {activeTab === 'weakpoints' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

            {/* Zayıf konu bar chart */}
            {weakTopics.length > 0 && (
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>⚠️ En Zayıf Konular</div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={weakTopics.slice(0, 8).map(w => ({ topic: w.topic.length > 18 ? w.topic.slice(0, 18) + '…' : w.topic, oran: Math.round(w.wrong_count / w.total_count * 100), yanlış: w.wrong_count, toplam: w.total_count }))} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={v => `%${v}`} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="topic" width={140} tick={{ fontSize: 11, fill: 'var(--text2)' }} />
                    <Tooltip formatter={(v: any, _: any, p: any) => [`%${v} hata oranı (${p.payload.yanlış}/${p.payload.toplam})`, 'Yanlış']} />
                    <Bar dataKey="oran" radius={[0, 6, 6, 0]} fill="#ef4444" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Zayıf konular listesi + YouTube */}
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '12px', color: 'var(--primary)' }}>📚 Çalışma Önerileri</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {weakTopics.slice(0, 8).map((w, i) => {
                  const errorRate = Math.round(w.wrong_count / w.total_count * 100)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                      <div style={{ width: 32, height: 32, borderRadius: '8px', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>⚠️</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '3px' }}>{w.topic}</div>
                        <div style={{ height: '5px', background: 'var(--border)', borderRadius: '3px' }}>
                          <div style={{ height: '5px', background: '#ef4444', borderRadius: '3px', width: `${errorRate}%` }} />
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '3px' }}>{w.wrong_count}/{w.total_count} yanlış · %{errorRate} hata</div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <Link href={`/quiz?topic=${encodeURIComponent(w.topic)}`}
                          style={{ padding: '5px 10px', borderRadius: '8px', background: 'var(--accent)', color: '#fff', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>
                          Çöz
                        </Link>
                        <a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(w.topic + ' konu anlatımı')}`}
                          target="_blank" rel="noopener"
                          style={{ padding: '5px 10px', borderRadius: '8px', background: 'rgba(255,0,0,0.1)', color: '#ef4444', fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>
                          YT
                        </a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* AI Analiz */}
            <div className="card" style={{ background: 'linear-gradient(135deg, rgba(8,36,101,0.04), rgba(30,207,184,0.04))', border: '1px solid rgba(99,102,241,0.2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                <span style={{ fontSize: '24px' }}>🤖</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>AI Çalışma Planı</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Kişiselleştirilmiş öneriler</div>
                </div>
                {!aiPlan && (
                  <button onClick={generateAiAnalysis} disabled={loadingAi}
                    className="btn btn-primary" style={{ marginLeft: 'auto', padding: '8px 14px', fontSize: '13px' }}>
                    {loadingAi ? '⏳ Hazırlanıyor...' : '✨ Plan Oluştur'}
                  </button>
                )}
              </div>
              {aiPlan ? (
                <div style={{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-line' }}>{aiPlan}</div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic' }}>
                  Zayıf konularını analiz edip sana özel bir çalışma planı oluşturalım.
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </main>
  )
}
