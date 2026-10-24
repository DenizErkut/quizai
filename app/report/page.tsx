'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useT } from '@/lib/i18n/I18nProvider'
import SubjectPerformanceChart from '@/components/SubjectPerformanceChart'
import PageHeader from '@/components/PageHeader'
import { AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

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
  const { t: tr } = useT()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'graphs' | 'topics'>('overview')
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
  const trendData = (stats.trend || []).map((t, i: number) => ({ ...t, label: tr('{n}. test', { n: i + 1 }) }))
  const distributionData = [
    { name: tr('Mükemmel'), value: stats.perfect, color: '#3f725f' },
    { name: tr('İyi'), value: stats.good, color: '#76a38f' },
    { name: tr('Orta'), value: stats.passing, color: '#f2b94b' },
    { name: tr('Geliştirilmeli'), value: stats.failing, color: '#df5c3f' },
  ].filter(item => item.value > 0)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: '5rem' }}>
      <PageHeader title={tr('Kişisel Raporum')} subtitle={tr('Gelişimini, güçlü yönlerini ve sıradaki adımını gör')} icon="📊" backHref="/dashboard" backLabel={tr('Panele dön')} stats={[{label:tr('Test'),value:stats.totalTests},{label:tr('Ortalama'),value:`%${stats.avgPct}`},{label:tr('Seri'),value:tr('{n} gün',{n:streak.current_streak})}]} />
      <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '1.5rem' }}>

        {/* Streak banner */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.25rem', padding: '12px 16px', borderRadius: '14px', background: 'linear-gradient(135deg, rgba(8,36,101,0.06), rgba(30,207,184,0.06))', border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '24px' }}>🔥</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: '14px' }}>{tr('{n} günlük seri',{n:streak.current_streak})}</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{tr('En uzun: {longest} gün · Toplam puan: {points}',{longest:streak.longest_streak,points:streak.total_points})}</div>
          </div>
        </div>

        {/* Ana istatistikler */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.25rem' }}>
          <StatCard label={tr('Toplam Test')} value={stats.totalTests} />
          <StatCard label={tr('Genel Ort.')} value={`%${stats.avgPct}`} color={pctColor(stats.avgPct)} />
          <StatCard label={tr('Bu Hafta')} value={stats.weeklyTests} sub={tr('test')} color="var(--accent)" />
          <StatCard label={tr('Mükemmel')} value={stats.perfect} sub="%100" color="var(--green)" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '1.5rem' }}>
          <StatCard label={tr('Toplam Soru')} value={stats.totalQuestions} />
          <StatCard label={tr('Doğru')} value={stats.totalCorrect} color="var(--green)" />
          <StatCard label={tr('Başarılı')} value={stats.good} sub="≥%80" color="var(--green)" />
          <StatCard label={tr('Zayıf')} value={stats.failing} sub="&lt;%50" color="var(--red)" />
        </div>

        <div className="report-view-tabs" role="tablist" aria-label={tr('Rapor görünümü')}>
          {[
            { key: 'overview', label: tr('Genel Bakış'), icon: '✨' },
            { key: 'graphs', label: tr('Grafikler'), icon: '📈' },
            { key: 'topics', label: tr('Konu Detayı'), icon: '🎯' },
          ].map(item => <button key={item.key} onClick={() => setTab(item.key as any)} aria-selected={tab === item.key}>{item.icon} {item.label}</button>)}
        </div>

        {(tab === 'overview' || tab === 'graphs') && (
          <div className="report-visual-grid">
            <div className="card report-chart-card">
              <div className="report-card-heading"><div><span>{tr('Gelişim çizgisi')}</span><h2>{tr('Son testlerdeki performansın')}</h2></div><b>📈</b></div>
              {trendData.length > 0 ? <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={trendData} margin={{ top: 12, right: 12, left: -18, bottom: 0 }}>
                  <defs><linearGradient id="warmTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#df5c3f" stopOpacity={.3}/><stop offset="95%" stopColor="#df5c3f" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid strokeDasharray="4 5" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
                  <YAxis domain={[0,100]} tickFormatter={v=>`%${v}`} tick={{fontSize:11,fill:'var(--text3)'}} axisLine={false} tickLine={false}/>
                  <Tooltip formatter={(v:any, _n:any, p:any)=>[`%${v}`,p.payload.topic]} contentStyle={{borderRadius:14,border:'1px solid var(--border)',background:'var(--bg)'}} />
                  <Area type="monotone" dataKey="pct" stroke="#df5c3f" strokeWidth={3} fill="url(#warmTrend)" dot={{r:4,fill:'#fffaf4',stroke:'#df5c3f',strokeWidth:2}} activeDot={{r:6}} />
                </AreaChart>
              </ResponsiveContainer> : <div className="report-empty-chart">{tr('Grafik için birkaç test daha çöz.')}</div>}
            </div>
            <div className="card report-chart-card">
              <div className="report-card-heading"><div><span>{tr('Başarı dengesi')}</span><h2>{tr('Testlerinin dağılımı')}</h2></div><b>◎</b></div>
              {distributionData.length > 0 ? <><ResponsiveContainer width="100%" height={205}>
                <PieChart><Pie data={distributionData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={4} stroke="none">{distributionData.map(item=><Cell key={item.name} fill={item.color}/>)}</Pie><Tooltip formatter={(v:any)=>[tr('{n} test',{n:v})]} contentStyle={{borderRadius:14,border:'1px solid var(--border)',background:'var(--bg)'}} /></PieChart>
              </ResponsiveContainer><div className="report-legend">{distributionData.map(item=><span key={item.name}><i style={{background:item.color}}/>{item.name} <b>{item.value}</b></span>)}</div></> : <div className="report-empty-chart">{tr('Dağılım için henüz veri yok.')}</div>}
            </div>
          </div>
        )}

        {/* Ders bazlı performans */}
        {(tab === 'overview' || tab === 'graphs') && stats.subjectBreakdown?.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>{tr('Ders Bazlı Performans')}</div>
            <SubjectPerformanceChart data={stats.subjectBreakdown} />
          </div>
        )}

        {/* Başarı dağılımı */}
        {tab === 'overview' && <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>{tr('Başarı Dağılımı')}</div>
          {[
            { label: tr('Mükemmel (%100)'), count: stats.perfect, color: '#10b981' },
            { label: tr('İyi (%80-99)'), count: stats.good, color: '#34d399' },
            { label: tr('Orta (%50-79)'), count: stats.passing, color: '#f59e0b' },
            { label: tr('Zayıf (<%50)'), count: stats.failing, color: '#ef4444' },
          ].map((row, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <div style={{ width: '130px', fontSize: '12px', color: 'var(--text2)', flexShrink: 0 }}>{row.label}</div>
              <MiniBar pct={stats.totalTests ? (row.count / stats.totalTests) * 100 : 0} color={row.color} />
              <div style={{ width: '28px', textAlign: 'right', fontSize: '12px', fontWeight: 700, color: row.color, flexShrink: 0 }}>{row.count}</div>
            </div>
          ))}
        </div>}

        {/* Soru tipi dağılımı */}
        {tab === 'overview' && Object.keys(stats.typeCounts).length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>{tr('Soru Tipi Dağılımı')}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(stats.typeCounts).map(([type, count]: any) => (
                <div key={type} style={{ padding: '5px 12px', borderRadius: '99px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px' }}>
                  {TYPE_LABELS[type] ? tr(TYPE_LABELS[type]) : type}: <strong>{count}</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trend — son 10 test */}
        {false && stats.trend.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Son {stats.trend.length} Test Trendi</div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '70px' }}>
              {stats.trend.map((t, i: number) => (
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
        {(tab === 'overview' || tab === 'topics') && stats.topTopics.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>{tr('En Çok Çözülen Konular')}</div>
            {stats.topTopics.map((t, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, color: 'var(--text3)', flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, fontSize: '13px', fontWeight: 500 }}>{tr(t.topic)}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{tr('{n} test',{n:t.count})}</div>
                <span style={{ fontSize: '12px', fontWeight: 700, color: pctColor(t.avgPct) }}>%{t.avgPct}</span>
              </div>
            ))}
          </div>
        )}

        {/* Zayıf konular */}
        {(tab === 'overview' || tab === 'topics') && weakTopics.length > 0 && (
          <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--red)' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>{tr('⚠️ Zayıf Konular')}</div>
            {weakTopics.map((w, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div style={{ flex: 1, fontSize: '13px' }}>{tr(w.topic)}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{tr('{n} yanlış',{n:w.wrong_count})}</div>
                <Link href={`/quiz?topic=${encodeURIComponent(w.topic)}&source=weak_topic`}
                  style={{ fontSize: '11px', padding: '4px 8px', borderRadius: '6px', background: 'var(--accent)', color: '#fff', textDecoration: 'none', fontWeight: 600 }}>
                  {tr('⚡ Çalış')}
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
