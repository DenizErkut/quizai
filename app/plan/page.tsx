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

interface ProgressEntry {
  week_number: number
  topic: string
  completed: boolean
  completed_at?: string
}

export default function PlanPage() {
  const router = useRouter()
  const [plan, setPlan] = useState<StudyPlan | null>(null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [planDate, setPlanDate] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [showReport, setShowReport] = useState(false)
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
        try {
          setPlan(existingPlan.plan)
          setPlanId(existingPlan.id)
          setPlanDate(existingPlan.generated_at)
        } catch { }

        // Mevcut planın progress kayıtlarını yükle
        const { data: prog } = await supabase
          .from('plan_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('plan_id', existingPlan.id)

        if (prog) setProgress(prog)
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
      setProgress([])

      const { data: { user } } = await supabase.auth.getUser()
      const { data: inserted } = await supabase.from('study_plans').insert({
        user_id: user.id,
        plan: data.plan,
        valid_until: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
      }).select().single()

      if (inserted) {
        setPlanId(inserted.id)
        setPlanDate(inserted.generated_at)
      }
    }
    setGenerating(false)
  }

  // Konu tamamlama toggle
  async function toggleTopic(weekNum: number, topic: string) {
    if (!planId) return
    const { data: { user } } = await supabase.auth.getUser()
    const existing = progress.find(p => p.week_number === weekNum && p.topic === topic)

    if (existing) {
      // Toggle completed
      const newCompleted = !existing.completed
      await supabase
        .from('plan_progress')
        .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
        .eq('user_id', user.id)
        .eq('plan_id', planId)
        .eq('week_number', weekNum)
        .eq('topic', topic)

      setProgress(prev => prev.map(p =>
        p.week_number === weekNum && p.topic === topic
          ? { ...p, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : undefined }
          : p
      ))
    } else {
      // Yeni kayıt oluştur
      const { data: inserted } = await supabase
        .from('plan_progress')
        .insert({ user_id: user.id, plan_id: planId, week_number: weekNum, topic, completed: true, completed_at: new Date().toISOString() })
        .select().single()

      if (inserted) setProgress(prev => [...prev, inserted])
    }
  }

  function isCompleted(weekNum: number, topic: string) {
    return progress.find(p => p.week_number === weekNum && p.topic === topic)?.completed || false
  }

  // Aylık rapor hesapla
  function calcReport() {
    if (!plan) return null
    const allTopics: { week: number, topic: string }[] = []
    plan.weeks?.forEach(w => w.topics?.forEach(t => allTopics.push({ week: w.week, topic: t })))

    const total = allTopics.length
    const completed = allTopics.filter(({ week, topic }) => isCompleted(week, topic)).length
    const pct = total ? Math.round((completed / total) * 100) : 0

    const byWeek = plan.weeks?.map(w => {
      const weekTopics = w.topics || []
      const weekDone = weekTopics.filter(t => isCompleted(w.week, t)).length
      return { week: w.week, goal: w.goal, total: weekTopics.length, done: weekDone, pct: weekTopics.length ? Math.round((weekDone / weekTopics.length) * 100) : 0 }
    })

    const daysElapsed = planDate
      ? Math.min(28, Math.ceil((Date.now() - new Date(planDate).getTime()) / (1000 * 60 * 60 * 24)))
      : 0

    return { total, completed, pct, byWeek, daysElapsed }
  }

  const avgPct = stats?.sessions?.length
    ? Math.round(stats.sessions.reduce((s: number, x: any) => s + x.pct, 0) / stats.sessions.length)
    : 0

  async function exportPDF() {
    if (!plan || !profile) return
    const { default: jsPDF } = await import('jspdf')
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    doc.setFont('helvetica')

    const margin = 20
    const pageW = 210
    const contentW = pageW - margin * 2
    let y = margin

    function clean(text: string): string {
      return text
        .replace(/ğ/g,'g').replace(/Ğ/g,'G').replace(/ü/g,'u').replace(/Ü/g,'U')
        .replace(/ş/g,'s').replace(/Ş/g,'S').replace(/ı/g,'i').replace(/İ/g,'I')
        .replace(/ö/g,'o').replace(/Ö/g,'O').replace(/ç/g,'c').replace(/Ç/g,'C')
    }

    function addText(text: string, size: number, bold = false, color: [number,number,number] = [0,0,0], indent = 0) {
      doc.setFontSize(size); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(...color)
      const lines = doc.splitTextToSize(clean(text), contentW - indent)
      const lh = size * 0.4
      if (y + lines.length * lh > 280) { doc.addPage(); y = margin }
      doc.text(lines, margin + indent, y)
      y += lines.length * lh + 2
    }

    // Header
    doc.setFillColor(91, 76, 245)
    doc.rect(0, 0, pageW, 36, 'F')
    const logoB64 = await fetch('/pratium-logo.png').then(r => r.blob()).then(b => new Promise<string>(res => { const fr = new FileReader(); fr.onload = () => res((fr.result as string).split(',')[1]); fr.readAsDataURL(b) }))
    doc.addImage('data:image/png;base64,' + logoB64, 'PNG', margin, 4, 30, 30)
    doc.setFontSize(11); doc.setFont('helvetica','normal'); doc.setTextColor(255,255,255)
    doc.text(clean(`${profile.name} - Gelisim Plani`), margin + 34, 16)
    doc.text(new Date().toLocaleDateString('tr-TR'), pageW - margin, 16, { align: 'right' })
    doc.text(clean(`${profile.grade} | Ort. %${avgPct}`), margin + 34, 24)
    y = 46

    // İlerleme özeti
    const report = calcReport()
    if (report && report.completed > 0) {
      doc.setFillColor(237, 233, 255)
      doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F')
      doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(91, 76, 245)
      doc.text(clean(`Tamamlama: %${report.pct} (${report.completed}/${report.total} konu)`), margin + 4, y + 6)
      doc.setFont('helvetica','normal'); doc.setTextColor(80, 80, 80)
      doc.text(clean(`Plan baslangici: ${planDate ? new Date(planDate).toLocaleDateString('tr-TR') : '-'} | ${report.daysElapsed}. gun`), margin + 4, y + 11)
      y += 18
    }

    // Özet
    addText('Genel Degerlendirme', 12, true, [91, 76, 245])
    addText(plan.summary, 10, false, [40,40,40])
    y += 4

    // Haftalar
    plan.weeks?.forEach((week) => {
      if (y > 240) { doc.addPage(); y = margin }
      doc.setFillColor(91, 76, 245)
      doc.roundedRect(margin, y, contentW, 8, 2, 2, 'F')
      doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(255,255,255)
      doc.text(clean(`Hafta ${week.week}: ${week.goal}`), margin + 4, y + 5.5)
      doc.text(`${week.daily_minutes} dk/gun`, pageW - margin - 2, y + 5.5, { align: 'right' })
      y += 12

      // Konular + tamamlanma
      week.topics?.forEach(topic => {
        const done = isCompleted(week.week, topic)
        doc.setFontSize(9)
        doc.setTextColor(done ? 22 : 120, done ? 163 : 120, done ? 74 : 120)
        doc.text(clean(`${done ? '✓' : '○'} ${topic}`), margin + 4, y)
        y += 5.5
      })
      y += 2

      doc.setFontSize(9); doc.setTextColor(80,80,80)
      const focusLines = doc.splitTextToSize(clean('• ' + week.focus), contentW - 4)
      doc.text(focusLines, margin + 2, y)
      y += focusLines.length * 4 + 6

      doc.setDrawColor(220, 220, 220)
      doc.line(margin, y, pageW - margin, y)
      y += 4
    })

    if (plan.motivation) {
      y += 4
      doc.setFillColor(245, 244, 255)
      doc.roundedRect(margin, y, contentW, 12, 2, 2, 'F')
      doc.setFontSize(10); doc.setFont('helvetica','italic'); doc.setTextColor(91, 76, 245)
      const motLines = doc.splitTextToSize(clean('"' + plan.motivation + '"'), contentW - 8)
      doc.text(motLines, margin + 4, y + 5)
      y += 16
    }

    doc.save(clean(`Pratium_Gelisim_Plani_${profile.name}_${new Date().toISOString().split('T')[0]}.pdf`))
  }

  const report = calcReport()

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

        {/* Aylık İlerleme Özeti - plan varsa göster */}
        {plan && report && (
          <div className="card anim-up-1" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--accent)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Aylık İlerleme
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                {planDate ? `${report.daysElapsed}. gün` : ''}
              </div>
            </div>

            {/* Genel progress bar */}
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text)' }}>{report.completed}/{report.total} konu tamamlandı</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: report.pct >= 70 ? 'var(--green)' : report.pct >= 40 ? 'var(--amber)' : 'var(--red)' }}>%{report.pct}</span>
              </div>
              <div style={{ height: '8px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '99px', background: report.pct >= 70 ? 'var(--green)' : report.pct >= 40 ? 'var(--amber)' : 'var(--accent)', width: `${report.pct}%`, transition: 'width 0.5s ease' }} />
              </div>
            </div>

            {/* Hafta bazlı mini özet */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '6px', marginBottom: '0.75rem' }}>
              {report.byWeek?.map(w => (
                <div key={w.week} style={{ textAlign: 'center', padding: '8px 4px', borderRadius: '8px', background: w.pct === 100 ? 'var(--green-bg, #dcfce7)' : 'var(--bg2)', border: `1px solid ${w.pct === 100 ? 'rgba(22,163,74,0.2)' : 'var(--border)'}` }}>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: w.pct === 100 ? 'var(--green)' : 'var(--accent)' }}>{w.pct}%</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Hafta {w.week}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{w.done}/{w.total}</div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowReport(v => !v)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: 'var(--accent)', padding: '4px 0', fontFamily: 'var(--font-sans)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              {showReport ? '▲ Raporu kapat' : '▼ Ay sonu raporunu gör'}
            </button>

            {showReport && (
              <div style={{ marginTop: '1rem', padding: '1rem', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '0.75rem' }}>📊 Ay Sonu Raporu</div>
                {report.byWeek?.map(w => (
                  <div key={w.week} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text)' }}>Hafta {w.week}: {w.goal}</span>
                      <span style={{ fontSize: '12px', color: w.pct === 100 ? 'var(--green)' : w.pct >= 50 ? 'var(--amber)' : 'var(--red)', fontWeight: 600 }}>
                        {w.done}/{w.total} · %{w.pct}
                      </span>
                    </div>
                    <div style={{ height: '5px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: '99px', background: w.pct === 100 ? 'var(--green)' : w.pct >= 50 ? 'var(--amber)' : 'var(--red)', width: `${w.pct}%` }} />
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
                  {report.pct >= 80 ? '🌟 Harika bir ay geçirdin! Çok disiplinlisin.' :
                   report.pct >= 50 ? '👍 İyi gidiyorsun, biraz daha odaklan.' :
                   report.pct > 0 ? '💪 Başlangıç iyi, tutarlılık önemli.' :
                   '🎯 Konuları tamamladıkça burası dolacak.'}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Plan oluştur butonu */}
        {!plan ? (
          <div className="card anim-up-2" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '1rem' }}>📋</div>
            <h3 className="serif" style={{ fontSize: '20px', marginBottom: '0.75rem' }}>
              {stats?.sessions?.length < 3 ? 'Daha fazla test çöz' : 'Planını oluştur'}
            </h3>
            <p style={{ color: 'var(--text2)', fontSize: '13px', marginBottom: '1.5rem', lineHeight: 1.7 }}>
              {stats?.sessions?.length < 3
                ? 'Kişisel plan için en az 10 test çözmen gerekiyor. Şu an: ' + stats.sessions.length
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

            {/* Haftalık planlar — konu takibi ile */}
            {plan.weeks?.map((week, i) => {
              const weekReport = report?.byWeek?.find(w => w.week === week.week)
              return (
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

                  {/* İlerleme mini bar */}
                  {weekReport && weekReport.total > 0 && (
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text3)' }}>{weekReport.done}/{weekReport.total} konu</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: weekReport.pct === 100 ? 'var(--green)' : 'var(--accent)' }}>%{weekReport.pct}</span>
                      </div>
                      <div style={{ height: '4px', borderRadius: '99px', background: 'var(--border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '99px', background: weekReport.pct === 100 ? 'var(--green)' : 'var(--accent)', width: `${weekReport.pct}%`, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )}

                  {/* Konular — tıklanabilir checkbox'lar */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                    {week.topics?.map((t, ti) => {
                      const done = isCompleted(week.week, t)
                      return (
                        <button
                          key={ti}
                          onClick={() => toggleTopic(week.week, t)}
                          style={{
                            fontSize: '12px', padding: '4px 10px', borderRadius: '99px', cursor: 'pointer',
                            background: done ? 'var(--green-bg, #dcfce7)' : 'var(--accent-bg)',
                            color: done ? 'var(--green)' : 'var(--accent)',
                            border: `1px solid ${done ? 'rgba(22,163,74,0.3)' : 'rgba(91,76,245,0.2)'}`,
                            textDecoration: done ? 'line-through' : 'none',
                            opacity: done ? 0.8 : 1,
                            fontFamily: 'var(--font-sans)',
                            transition: 'all 0.2s',
                          }}>
                          {done ? '✓ ' : ''}{t}
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ fontSize: '13px', color: 'var(--text2)', padding: '10px 12px', borderRadius: '8px', background: 'var(--bg2)', lineHeight: 1.6 }}>
                    💡 {week.focus}
                  </div>
                </div>
              )
            })}

            {/* Motivasyon */}
            {plan.motivation && (
              <div className="card" style={{ textAlign: 'center', background: 'var(--accent-bg)', border: '1px solid rgba(91,76,245,0.2)' }}>
                <div style={{ fontSize: '24px', marginBottom: '8px' }}>⭐</div>
                <p style={{ fontSize: '14px', color: 'var(--accent)', fontStyle: 'italic', lineHeight: 1.7 }}>
                  "{plan.motivation}"
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
              <button className="btn btn-sm" onClick={generatePlan} disabled={generating}
                style={{ flex: 1, justifyContent: 'center' }}>
                {generating ? 'Yenileniyor...' : '↺ Planı yenile'}
              </button>
              <button className="btn btn-sm" onClick={exportPDF} disabled={generating}
                style={{ flex: 1, justifyContent: 'center', color: 'var(--accent)', borderColor: 'rgba(91,76,245,0.3)' }}>
                📄 PDF indir
              </button>
              <button className="btn btn-sm" onClick={() => window.print()}
                style={{ justifyContent: 'center', color: 'var(--text2)' }}>
                🖨️
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
