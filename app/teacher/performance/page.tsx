'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

export default function TeacherPerformancePage() {
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string | null>(null)
  const [studentStats, setStudentStats] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [selectedStudent, setSelectedStudent] = useState<string | null>(null)
  const [studentDetail, setStudentDetail] = useState<any>(null)
  const [view, setView] = useState<'overview' | 'assignments' | 'student' | 'ranking'>('overview')
  const [loading, setLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(false)
  // AI analiz state
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, string>>({}) // key: `${student_id}_${assignment_id}`
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  // Öğretmen notu state
  const [teacherNotes, setTeacherNotes] = useState<Record<string, string>>({}) // key: student_id
  const [editingNote, setEditingNote] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  // Seçili ödev detayı (assignment view'da expand)
  const [expandedAssignment, setExpandedAssignment] = useState<string | null>(null)
  const [rankTab, setRankTab] = useState<'general' | 'assignments' | 'streak'>('general')
  const [pdfLoading, setPdfLoading] = useState(false)
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null) // assignment içinde öğrenci detayı
  const [chartView, setChartView] = useState<'list' | 'charts'>('list')
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: t } = await supabase.from('teachers').select('*').eq('user_id', user.id).single()
    if (!t?.approved) { router.push('/teacher'); return }
    setTeacher(t)
    const { data: cls } = await supabase.from('classrooms').select('*').eq('teacher_id', t.id).order('created_at', { ascending: false })
    setClassrooms(cls ?? [])
    if (cls?.length) { setSelectedClass(cls[0].id); await loadData(t.id, cls[0].id) }
    setLoading(false)
  }

  async function loadData(teacherId: string, classroomId: string) {
    setStatsLoading(true)

    const { data: students } = await supabase
      .from('classroom_students')
      .select('student_id, joined_at')
      .eq('classroom_id', classroomId)

    if (!students?.length) { setStudentStats([]); setAssignments([]); setStatsLoading(false); return }

    const studentIds = students.map((s: any) => s.student_id)

    const profileMap: Record<string, any> = {}
    await Promise.all(
      studentIds.map(async (id: string) => {
        const { data: p } = await supabase
          .from('profiles')
          .select('id, name, grade, monthly_test_count')
          .eq('id', id)
          .maybeSingle()
        if (p) profileMap[id] = p
      })
    )

    const { data: sessions } = await supabase
      .from('quiz_sessions')
      .select('user_id, score, pct, question_count, topic, created_at')
      .in('user_id', studentIds)
      .eq('completed', true)
      .order('created_at', { ascending: false })

    const { data: asgns } = await supabase
      .from('assignments')
      .select('id, title, topic, question_count, difficulty, due_date, created_at')
      .eq('classroom_id', classroomId)
      .order('created_at', { ascending: false })

    const asgIds = (asgns || []).map((a: any) => a.id)
    const { data: completions } = asgIds.length
      ? await supabase
          .from('assignment_completions')
          .select('*') // answers dahil
          .in('assignment_id', asgIds)
      : { data: [] }

    // Öğretmen notları
    const { data: notes } = await supabase
      .from('teacher_notes')
      .select('student_id, note')
      .eq('teacher_id', teacherId)
      .in('student_id', studentIds)

    const notesMap: Record<string, string> = {}
    ;(notes ?? []).forEach((n: any) => { notesMap[n.student_id] = n.note })
    setTeacherNotes(notesMap)

    const statsMap = students.map((s: any) => {
      const profile = profileMap[s.student_id] || {}
      const userSessions = (sessions ?? []).filter((sess: any) => sess.user_id === s.student_id)
      const userCompletions = (completions ?? []).filter((c: any) => c.student_id === s.student_id)
      const avgPct = userSessions.length
        ? Math.round(userSessions.reduce((acc: number, sess: any) => acc + sess.pct, 0) / userSessions.length) : null
      const assignmentAvg = userCompletions.length
        ? Math.round(userCompletions.reduce((acc: number, c: any) => acc + c.pct, 0) / userCompletions.length) : null
      return {
        student_id: s.student_id,
        name: profile.name || 'İsimsiz',
        grade: profile.grade,
        totalTests: userSessions.length,
        avgPct,
        assignmentsDone: userCompletions.length,
        assignmentAvg,
        lastTopic: userSessions[0]?.topic,
        lastActive: userSessions[0]?.created_at,
        sessions: userSessions,
        completions: userCompletions,
      }
    })

    const asgSummary = (asgns || []).map((a: any) => {
      const asgComps = (completions ?? []).filter((c: any) => c.assignment_id === a.id)
      const avgScore = asgComps.length
        ? Math.round(asgComps.reduce((acc: number, c: any) => acc + c.pct, 0) / asgComps.length) : null
      const studentResults = asgComps.map((c: any) => ({
        ...c,
        name: profileMap[c.student_id]?.name || 'İsimsiz',
      }))
      return { ...a, completedCount: asgComps.length, totalStudents: students.length, avgScore, studentResults }
    })

    setStudentStats(statsMap)
    setAssignments(asgSummary)
    setStatsLoading(false)
  }

  async function exportPDF() {
    if (!selectedClass || studentStats.length === 0) return
    setPdfLoading(true)
    try {
      const { jsPDF } = await import('jspdf')
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = 210
      const margin = 15
      const contentW = pageW - margin * 2
      let y = 20

      const classroom = classrooms.find(c => c.id === selectedClass)
      const now = new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })

      // Başlık
      doc.setFillColor(8, 36, 101)
      doc.rect(0, 0, pageW, 32, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(18)
      doc.setFont('helvetica', 'bold')
      doc.text('Pratium - Sinif Performans Raporu', margin, 14)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text(`${classroom?.name || 'Sinif'} | ${now}`, margin, 24)
      y = 42

      // Özet istatistikler
      doc.setTextColor(8, 36, 101)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Genel Ozet', margin, y)
      y += 8

      const totalStudents = studentStats.length
      const activeStudents = studentStats.filter(s => s.totalTests > 0).length
      const avgPctAll = studentStats.filter(s => s.avgPct !== null).length > 0
        ? Math.round(studentStats.filter(s => s.avgPct !== null).reduce((a, s) => a + (s.avgPct || 0), 0) / studentStats.filter(s => s.avgPct !== null).length)
        : 0

      const summaryData = [
        ['Toplam Ogrenci', String(totalStudents)],
        ['Aktif Ogrenci (test cozdu)', String(activeStudents)],
        ['Sinif Ortalamasi', avgPctAll ? `%${avgPctAll}` : '-'],
        ['Toplam Odev', String(assignments.length)],
      ]

      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(50, 50, 50)
      summaryData.forEach(([label, value]) => {
        doc.setFillColor(248, 250, 252)
        doc.rect(margin, y - 4, contentW, 8, 'F')
        doc.setTextColor(80, 80, 80)
        doc.text(label, margin + 3, y + 1)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(8, 36, 101)
        doc.text(value, margin + contentW - 3, y + 1, { align: 'right' })
        doc.setFont('helvetica', 'normal')
        y += 9
      })
      y += 8

      // Öğrenci tablosu
      doc.setTextColor(8, 36, 101)
      doc.setFontSize(13)
      doc.setFont('helvetica', 'bold')
      doc.text('Ogrenci Detaylari', margin, y)
      y += 8

      // Tablo başlığı
      doc.setFillColor(8, 36, 101)
      doc.rect(margin, y - 4, contentW, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(9)
      doc.text('Ad', margin + 3, y + 1)
      doc.text('Test', margin + 70, y + 1)
      doc.text('Ortalama', margin + 95, y + 1)
      doc.text('Odev', margin + 125, y + 1)
      doc.text('Odev Ort.', margin + 148, y + 1)
      y += 10

      // Öğrenci satırları
      studentStats
        .sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1))
        .forEach((s, idx) => {
          if (y > 270) {
            doc.addPage()
            y = 20
          }
          const rowBg = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255]
          doc.setFillColor(...(rowBg as [number, number, number]))
          doc.rect(margin, y - 4, contentW, 8, 'F')
          doc.setTextColor(50, 50, 50)
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(9)

          const name = s.name.length > 22 ? s.name.slice(0, 22) + '...' : s.name
          doc.text(name, margin + 3, y + 1)
          doc.text(String(s.totalTests), margin + 70, y + 1)

          // Ortalama rengi
          if (s.avgPct !== null) {
            const pctColor = s.avgPct >= 70 ? [22, 163, 74] : s.avgPct >= 50 ? [245, 158, 11] : [220, 38, 38]
            doc.setTextColor(...(pctColor as [number, number, number]))
            doc.setFont('helvetica', 'bold')
            doc.text(`%${s.avgPct}`, margin + 95, y + 1)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(50, 50, 50)
          } else {
            doc.text('-', margin + 95, y + 1)
          }

          doc.text(String(s.assignmentsDone), margin + 125, y + 1)
          if (s.assignmentAvg !== null) {
            const aColor = s.assignmentAvg >= 70 ? [22, 163, 74] : s.assignmentAvg >= 50 ? [245, 158, 11] : [220, 38, 38]
            doc.setTextColor(...(aColor as [number, number, number]))
            doc.setFont('helvetica', 'bold')
            doc.text(`%${s.assignmentAvg}`, margin + 148, y + 1)
            doc.setFont('helvetica', 'normal')
            doc.setTextColor(50, 50, 50)
          } else {
            doc.text('-', margin + 148, y + 1)
          }
          y += 9
        })

      // Ödev özeti sayfası
      if (assignments.length > 0) {
        doc.addPage()
        y = 20
        doc.setTextColor(8, 36, 101)
        doc.setFontSize(14)
        doc.setFont('helvetica', 'bold')
        doc.text('Odev Ozeti', margin, y)
        y += 10

        assignments.forEach(a => {
          if (y > 260) { doc.addPage(); y = 20 }
          doc.setFillColor(240, 249, 255)
          doc.rect(margin, y - 4, contentW, 10, 'F')
          doc.setTextColor(8, 36, 101)
          doc.setFontSize(10)
          doc.setFont('helvetica', 'bold')
          const title = a.title.length > 35 ? a.title.slice(0, 35) + '...' : a.title
          doc.text(title, margin + 3, y + 2)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(80, 80, 80)
          doc.text(`${a.completedCount}/${a.totalStudents} tamamladi`, margin + contentW - 3, y + 2, { align: 'right' })
          y += 12

          doc.setFontSize(9)
          doc.setTextColor(100, 100, 100)
          doc.text(`Konu: ${a.topic} | Zorluk: ${a.difficulty} | ${a.question_count} soru${a.avgScore !== null ? ` | Sinif ort: %${a.avgScore}` : ''}`, margin + 3, y)
          y += 8
        })
      }

      // Footer
      const pageCount = doc.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFontSize(8)
        doc.setTextColor(150, 150, 150)
        doc.text(`Pratium | pratium.com | Sayfa ${i}/${pageCount}`, pageW / 2, 290, { align: 'center' })
      }

      const fileName = `pratium-rapor-${classroom?.name?.replace(/\s/g, '-') || 'sinif'}-${new Date().toISOString().split('T')[0]}.pdf`
      doc.save(fileName)
    } catch (e) {
      console.error('PDF export error:', e)
      alert('PDF olusturulamadi, lutfen tekrar deneyin.')
    }
    setPdfLoading(false)
  }

  async function selectClass(cls: any) {
    setSelectedClass(cls.id)
    setView('overview')
    setSelectedStudent(null)
    setAiAnalysis({})
    await loadData(teacher.id, cls.id)
  }

  function openStudent(stat: any) {
    setSelectedStudent(stat.student_id)
    setStudentDetail(stat)
    setView('student')
  }

  // AI analiz
  async function generateAiAnalysis(studentId: string, assignmentId: string) {
    const key = `${studentId}_${assignmentId}`
    if (aiLoading) return
    setAiLoading(key)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/teacher/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ student_id: studentId, assignment_id: assignmentId }),
      })
      const json = await res.json()
      if (json.analysis) {
        setAiAnalysis(prev => ({ ...prev, [key]: json.analysis }))
      }
    } catch (e) {
      alert('AI analiz hatası')
    } finally {
      setAiLoading(null)
    }
  }

  // Öğretmen notu kaydet
  async function saveNote(studentId: string) {
    setSavingNote(true)
    await supabase.from('teacher_notes').upsert({
      teacher_id: teacher.id,
      student_id: studentId,
      note: noteText,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'teacher_id,student_id' })
    setTeacherNotes(prev => ({ ...prev, [studentId]: noteText }))
    setSavingNote(false)
    setEditingNote(null)
  }

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct >= 70) return 'var(--green)'
    if (pct >= 50) return 'var(--amber)'
    return 'var(--red)'
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: '13px', textDecoration: 'none' }}>← Panel</Link>
            <h1 style={{ fontSize: '20px', fontWeight: 700 }}>📊 Performans</h1>
          </div>
          <button onClick={exportPDF} disabled={pdfLoading || statsLoading || studentStats.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', background: pdfLoading ? 'var(--bg2)' : '#082465', color: pdfLoading ? 'var(--text3)' : '#fff', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: (pdfLoading || studentStats.length === 0) ? 0.6 : 1, transition: 'all 0.15s' }}>
            {pdfLoading ? '⏳ Hazırlanıyor...' : '📄 PDF Rapor İndir'}
          </button>
        </div>

        {/* Sınıf sekmeleri */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {classrooms.map(c => (
            <button key={c.id} onClick={() => selectClass(c)}
              style={{ padding: '7px 14px', borderRadius: '8px', fontSize: '13px', cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', fontWeight: 500,
                background: selectedClass === c.id ? 'rgba(8,36,101,0.08)' : 'var(--bg2)',
                borderColor: selectedClass === c.id ? 'rgba(8,36,101,0.3)' : 'var(--border)',
                color: selectedClass === c.id ? 'var(--primary)' : 'var(--text)',
              }}>
              {c.name}
            </button>
          ))}
        </div>

        {/* View sekmeleri */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
          {[
            { key: 'overview', label: '👥 Öğrenci Genel Bakış' },
            { key: 'assignments', label: `📝 Ödev Sonuçları (${assignments.length})` },
            { key: 'ranking', label: '🏆 Sınıf Sıralaması' },
          ].map(t => (
            <button key={t.key} onClick={() => { setView(t.key as any); setSelectedStudent(null) }}
              style={{ padding: '8px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                background: view === t.key ? '#082465' : 'var(--bg2)',
                borderColor: view === t.key ? '#082465' : 'var(--border)',
                color: view === t.key ? '#fff' : 'var(--text3)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {statsLoading && <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div>}

        {/* ── OVERVIEW ── */}
        {!statsLoading && view === 'overview' && (
          studentStats.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>👥</div>
              <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Bu sınıfta henüz öğrenci yok.</div>
            </div>
          ) : (
            <>
              {/* Görünüm toggle + özet istatistik */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[
                    { key: 'list', label: '👥 Öğrenci Listesi' },
                    { key: 'charts', label: '📊 Sınıf Grafikleri' },
                  ].map(t => (
                    <button key={t.key} onClick={() => setChartView(t.key as any)}
                      style={{ padding: '6px 14px', borderRadius: '99px', border: `1.5px solid ${chartView === t.key ? 'var(--accent)' : 'var(--border)'}`, background: chartView === t.key ? 'var(--accent)' : 'var(--bg)', color: chartView === t.key ? '#fff' : 'var(--text2)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                      {t.label}
                    </button>
                  ))}
                </div>
                {/* Sınıf özet statsları */}
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {[
                    { label: 'Öğrenci', value: studentStats.length, icon: '👥' },
                    { label: 'Sınıf Ort.', value: `%${Math.round(studentStats.reduce((a,s) => a + (s.avgPct||0), 0) / (studentStats.length||1))}`, icon: '📈' },
                    { label: 'Risk', value: studentStats.filter(s => (s.avgPct||0) < 50).length, icon: '⚠️', color: '#ef4444' },
                    { label: 'Başarılı', value: studentStats.filter(s => (s.avgPct||0) >= 75).length, icon: '🏆', color: '#16a34a' },
                  ].map((st, i) => (
                    <div key={i} style={{ textAlign: 'center', padding: '6px 12px', borderRadius: '10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{st.icon} {st.label}</div>
                      <div style={{ fontWeight: 700, fontSize: '16px', color: st.color || 'var(--primary)' }}>{st.value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* GRAFİK GÖRÜNÜMÜ */}
              {chartView === 'charts' && (() => {
                const COLORS = ['#6366f1','#1ECFB8','#f59e0b','#ef4444','#3b82f6','#10b981','#8b5cf6','#f97316']
                const pctColor = (p: number) => p >= 75 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444'

                // Başarı dağılımı (Pie)
                const distribution = [
                  { name: '🏆 Başarılı (75+)', value: studentStats.filter(s => (s.avgPct||0) >= 75).length, color: '#10b981' },
                  { name: '~ Orta (50-74)', value: studentStats.filter(s => (s.avgPct||0) >= 50 && (s.avgPct||0) < 75).length, color: '#f59e0b' },
                  { name: '⚠️ Risk (<50)', value: studentStats.filter(s => (s.avgPct||0) < 50).length, color: '#ef4444' },
                ].filter(d => d.value > 0)

                // Öğrenci bazlı bar
                const studentBars = [...studentStats]
                  .sort((a, b) => (b.avgPct||0) - (a.avgPct||0))
                  .slice(0, 15)
                  .map(s => ({ name: (s.name||'').split(' ')[0], pct: s.avgPct||0, test: s.totalTests||0 }))

                // Konu bazlı sınıf ortalaması
                const topicMap: Record<string, {total: number, count: number}> = {}
                studentStats.forEach(s => {
                  (s.sessions||[]).forEach((sess: any) => {
                    if (!topicMap[sess.topic]) topicMap[sess.topic] = { total: 0, count: 0 }
                    topicMap[sess.topic].total += sess.pct || 0
                    topicMap[sess.topic].count += 1
                  })
                })
                const topicBars = Object.entries(topicMap)
                  .map(([topic, v]) => ({ topic: topic.length > 18 ? topic.slice(0,18)+'…' : topic, avg: Math.round(v.total/v.count) }))
                  .sort((a,b) => a.avg - b.avg)
                  .slice(0, 10)

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '14px' }}>
                      {/* Başarı Dağılımı Pie */}
                      <div className="card">
                        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '12px' }}>🍩 Başarı Dağılımı</div>
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={distribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3}>
                              {distribution.map((d, i) => <Cell key={i} fill={d.color} />)}
                            </Pie>
                            <Tooltip formatter={(v: any, n: any) => [v + ' öğrenci', n]} />
                            <Legend iconSize={10} wrapperStyle={{ fontSize: '12px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>

                      {/* En Zayıf Konular */}
                      {topicBars.length > 0 && (
                        <div className="card">
                          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '12px' }}>⚠️ Sınıf Zayıf Konular</div>
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={topicBars} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                              <XAxis type="number" domain={[0,100]} tickFormatter={v => `%${v}`} tick={{ fontSize: 10 }} />
                              <YAxis type="category" dataKey="topic" width={130} tick={{ fontSize: 10, fill: 'var(--text2)' }} />
                              <Tooltip formatter={(v: any) => [`%${v}`, 'Sınıf Ort.']} />
                              <Bar dataKey="avg" radius={[0,6,6,0]}>
                                {topicBars.map((d, i) => <Cell key={i} fill={pctColor(d.avg)} />)}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      )}
                    </div>

                    {/* Öğrenci Sıralaması Bar */}
                    <div className="card">
                      <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '12px' }}>👥 Öğrenci Performans Sıralaması</div>
                      <ResponsiveContainer width="100%" height={Math.max(200, studentBars.length * 32)}>
                        <BarChart data={studentBars} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                          <XAxis type="number" domain={[0,100]} tickFormatter={v => `%${v}`} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fill: 'var(--text2)' }} />
                          <Tooltip formatter={(v: any, _: any, p: any) => [`%${v} (${p.payload.test} test)`, 'Ortalama']} />
                          <Bar dataKey="pct" radius={[0,6,6,0]}>
                            {studentBars.map((d, i) => <Cell key={i} fill={pctColor(d.pct)} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Risk altındaki öğrenciler */}
                    {studentStats.filter(s => (s.avgPct||0) < 50).length > 0 && (
                      <div className="card" style={{ border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.03)' }}>
                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#dc2626', marginBottom: '12px' }}>🚨 Risk Altındaki Öğrenciler (Ort. &lt;%50)</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {studentStats.filter(s => (s.avgPct||0) < 50).map((s: any) => (
                            <div key={s.student_id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', cursor: 'pointer' }}
                              onClick={() => { setView('student' as any); openStudent(s) }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '12px', flexShrink: 0 }}>
                                {(s.name||'?').slice(0,2).toUpperCase()}
                              </div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: '13px' }}>{s.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{s.totalTests} test · Son: {s.lastTopic || 'Yok'}</div>
                              </div>
                              <div style={{ fontWeight: 800, fontSize: '18px', color: '#dc2626' }}>%{s.avgPct||0}</div>
                              <button onClick={e => { e.stopPropagation(); /* ödev ata */ }}
                                style={{ padding: '5px 12px', borderRadius: '8px', background: '#dc2626', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                                📝 Ödev At
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* LİSTE GÖRÜNÜMÜ */}
              {chartView === 'list' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {studentStats.map((s: any) => (
                <div key={s.student_id} className="card" style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                  onClick={() => openStudent(s)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(8,36,101,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = '' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                        {(s.name || 'İ').slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{s.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                          {s.grade && `${s.grade} · `}{s.totalTests} test{s.lastTopic && ` · Son: ${s.lastTopic}`}
                        </div>
                        {teacherNotes[s.student_id] && (
                          <div style={{ fontSize: '11px', color: 'var(--accent)', marginTop: '3px' }}>
                            📝 Not: {teacherNotes[s.student_id].slice(0, 60)}{teacherNotes[s.student_id].length > 60 ? '…' : ''}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                      {s.avgPct !== null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '20px', color: pctColor(s.avgPct) }}>%{s.avgPct}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Genel ort.</div>
                        </div>
                      )}
                      {s.assignmentsDone > 0 && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '20px', color: pctColor(s.assignmentAvg) }}>%{s.assignmentAvg}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{s.assignmentsDone} ödev</div>
                        </div>
                      )}
                      <span style={{ color: 'var(--text4)', fontSize: '18px' }}>→</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
              )}
            </>
          )
        )}

        {/* ── ASSIGNMENTS ── */}
        {!statsLoading && view === 'assignments' && (
          assignments.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>📝</div>
              <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Bu sınıfa henüz ödev atanmadı.</div>
              <Link href="/teacher/assign" className="btn btn-primary" style={{ justifyContent: 'center', marginTop: '1rem', display: 'inline-flex' }}>Ödev Ata →</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {assignments.map((a: any) => (
                <div key={a.id} className="card">
                  {/* Ödev başlığı */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)' }}>{a.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                        📚 {a.topic} · ❓ {a.question_count} soru · ⚡ {a.difficulty}
                        {a.due_date && ` · 🕐 ${new Date(a.due_date).toLocaleDateString('tr-TR')}`}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontWeight: 800, fontSize: '18px', color: 'var(--primary)' }}>{a.completedCount}/{a.totalStudents}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Tamamladı</div>
                      </div>
                      {a.avgScore !== null && (
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 800, fontSize: '18px', color: pctColor(a.avgScore) }}>%{a.avgScore}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text3)' }}>Sınıf ort.</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Öğrenci sonuçları */}
                  {a.studentResults.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Öğrenci Sonuçları
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {a.studentResults.sort((x: any, y: any) => y.pct - x.pct).map((r: any) => {
                          const analyzeKey = `${r.student_id}_${a.id}`
                          const isExpanded = expandedStudent === analyzeKey
                          const wrongAnswers: any[] = (r.answers ?? []).filter((ans: any) => !ans.correct)
                          return (
                            <div key={r.student_id} style={{ borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden' }}>
                              {/* Öğrenci satırı */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--bg2)', cursor: 'pointer' }}
                                onClick={() => setExpandedStudent(isExpanded ? null : analyzeKey)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                                    {(r.name || 'İ').slice(0, 2).toUpperCase()}
                                  </div>
                                  <div>
                                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{r.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text3)' }}>
                                      {wrongAnswers.length > 0 ? `${wrongAnswers.length} yanlış` : 'Tüm sorular doğru ✓'}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                  <div style={{ fontWeight: 800, fontSize: '18px', color: pctColor(r.pct) }}>%{r.pct}</div>
                                  <span style={{ color: 'var(--text4)', fontSize: '14px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
                                </div>
                              </div>

                              {/* Genişletilmiş detay */}
                              {isExpanded && (
                                <div style={{ padding: '14px', background: 'var(--bg)', borderTop: '1px solid var(--border)' }}>

                                  {/* Yanlış cevaplar */}
                                  {wrongAnswers.length > 0 && (
                                    <div style={{ marginBottom: '14px' }}>
                                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--red)', marginBottom: '8px' }}>
                                        ❌ Yanlış Cevaplar
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {wrongAnswers.map((ans: any, idx: number) => (
                                          <div key={idx} style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '6px', lineHeight: 1.5 }}>
                                              {idx + 1}. {ans.question ?? 'Soru metni yok'}
                                            </div>
                                            <div style={{ display: 'flex', gap: '12px', fontSize: '12px', flexWrap: 'wrap' }}>
                                              <span style={{ color: 'var(--red)' }}>✗ Öğrenci: {ans.student_answer ?? '—'}</span>
                                              <span style={{ color: 'var(--green)' }}>✓ Doğru: {ans.correct_answer ?? '—'}</span>
                                            </div>
                                            {ans.explanation && (
                                              <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--text3)', fontStyle: 'italic' }}>
                                                💡 {ans.explanation}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* AI Analiz butonu */}
                                  <div style={{ marginBottom: '12px' }}>
                                    {aiAnalysis[analyzeKey] ? (
                                      <div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                          <span>🤖 AI Öğretmen Analizi</span>
                                          <button onClick={() => generateAiAnalysis(r.student_id, a.id)}
                                            style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                                            Yenile
                                          </button>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.8, whiteSpace: 'pre-wrap', background: 'rgba(8,36,101,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(8,36,101,0.08)' }}>
                                          {aiAnalysis[analyzeKey]}
                                        </div>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => generateAiAnalysis(r.student_id, a.id)}
                                        disabled={aiLoading === analyzeKey}
                                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '10px', border: '1.5px solid rgba(8,36,101,0.2)', background: 'rgba(8,36,101,0.04)', color: 'var(--primary)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: aiLoading === analyzeKey ? 0.6 : 1 }}>
                                        {aiLoading === analyzeKey ? (
                                          <>⏳ Analiz hazırlanıyor...</>
                                        ) : (
                                          <>🤖 AI Öğretmen Analizi Üret</>
                                        )}
                                      </button>
                                    )}
                                  </div>

                                  {/* Öğretmen notu */}
                                  <div>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginBottom: '6px' }}>
                                      📝 Öğretmen Notu
                                    </div>
                                    {editingNote === `${r.student_id}_${a.id}` ? (
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <textarea
                                          value={noteText}
                                          onChange={e => setNoteText(e.target.value)}
                                          placeholder="Bu öğrenci hakkında notunuzu yazın..."
                                          rows={3}
                                          autoFocus
                                          style={{ padding: '10px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', resize: 'vertical', outline: 'none' }}
                                        />
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                          <button onClick={() => saveNote(r.student_id)} disabled={savingNote}
                                            style={{ padding: '7px 14px', borderRadius: '8px', background: '#082465', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: savingNote ? 0.6 : 1 }}>
                                            {savingNote ? 'Kaydediliyor...' : 'Kaydet'}
                                          </button>
                                          <button onClick={() => setEditingNote(null)}
                                            style={{ padding: '7px 14px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
                                            İptal
                                          </button>
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                        <div style={{ fontSize: '13px', color: teacherNotes[r.student_id] ? 'var(--text2)' : 'var(--text4)', fontStyle: teacherNotes[r.student_id] ? 'normal' : 'italic', flex: 1, lineHeight: 1.6 }}>
                                          {teacherNotes[r.student_id] || 'Not eklenmemiş.'}
                                        </div>
                                        <button onClick={() => { setEditingNote(`${r.student_id}_${a.id}`); setNoteText(teacherNotes[r.student_id] || '') }}
                                          style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
                                          {teacherNotes[r.student_id] ? 'Düzenle' : '+ Not Ekle'}
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>

                      {/* Tamamlamayanlar */}
                      {(() => {
                        const doneIds = new Set(a.studentResults.map((r: any) => r.student_id))
                        const notDone = studentStats.filter(s => !doneIds.has(s.student_id))
                        if (!notDone.length) return null
                        return (
                          <div style={{ marginTop: '10px', padding: '8px 12px', borderRadius: '8px', background: 'rgba(253,211,29,0.08)', border: '1px solid rgba(253,211,29,0.2)', fontSize: '12px', color: 'var(--text3)' }}>
                            ⏳ Tamamlamadı: {notDone.map((s: any) => s.name).join(', ')}
                          </div>
                        )
                      })()}
                    </div>
                  )}

                  {a.completedCount === 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '10px', fontSize: '13px', color: 'var(--text4)' }}>
                      ⏳ Henüz kimse tamamlamadı.
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        )}

        {/* ── STUDENT DETAIL ── */}
        {/* ── RANKING ── */}
        {!statsLoading && view === 'ranking' && (
          <div>
            {studentStats.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>🏆</div>
                <div style={{ fontSize: '14px', color: 'var(--text3)' }}>Bu sınıfta henüz öğrenci yok.</div>
              </div>
            ) : (
              <div>
                {/* Sekme: Genel / Ödev bazlı */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem' }}>
                  {[
                    { key: 'general', label: '📊 Genel Ortalama' },
                    { key: 'assignments', label: '📝 Ödev Başarısı' },
                    { key: 'streak', label: '🔥 Streak' },
                  ].map(t => (
                    <button key={t.key}
                      onClick={() => setRankTab(t.key as any)}
                      style={{ padding: '6px 14px', borderRadius: '999px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)',
                        background: rankTab === t.key ? '#082465' : 'var(--bg2)',
                        borderColor: rankTab === t.key ? '#082465' : 'var(--border)',
                        color: rankTab === t.key ? '#fff' : 'var(--text3)',
                      }}>
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Sıralama listesi */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...studentStats]
                    .filter(s => {
                      if (rankTab === 'general') return s.avgPct !== null
                      if (rankTab === 'assignments') return s.assignmentsDone > 0
                      return true
                    })
                    .sort((a, b) => {
                      if (rankTab === 'general') return (b.avgPct ?? 0) - (a.avgPct ?? 0)
                      if (rankTab === 'assignments') return (b.assignmentAvg ?? 0) - (a.assignmentAvg ?? 0)
                      return (b.sessions?.[0] ? 1 : 0) - (a.sessions?.[0] ? 1 : 0) // streak yaklaşımı
                    })
                    .map((s, idx) => {
                      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`
                      const value = rankTab === 'general'
                        ? (s.avgPct !== null ? `%${s.avgPct}` : '—')
                        : rankTab === 'assignments'
                        ? (s.assignmentAvg !== null ? `%${s.assignmentAvg}` : '—')
                        : `${s.totalTests} test`
                      const valueColor = rankTab !== 'streak'
                        ? ((s.avgPct ?? 0) >= 70 ? 'var(--green)' : (s.avgPct ?? 0) >= 50 ? 'var(--amber, #f59e0b)' : 'var(--red)')
                        : 'var(--primary)'

                      return (
                        <div key={s.student_id}
                          onClick={() => { setSelectedStudent(s.student_id); setStudentDetail(s); setView('student') }}
                          style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 16px', borderRadius: '12px', border: idx < 3 ? '1.5px solid rgba(253,211,29,0.3)' : '1px solid var(--border)', background: idx < 3 ? 'rgba(253,211,29,0.04)' : 'var(--bg)', cursor: 'pointer', transition: 'all 0.15s' }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(8,36,101,0.3)' }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = idx < 3 ? 'rgba(253,211,29,0.3)' : 'var(--border)' }}>
                          {/* Sıra */}
                          <div style={{ width: '36px', textAlign: 'center', fontSize: idx < 3 ? '22px' : '14px', fontWeight: 700, color: 'var(--text3)', flexShrink: 0 }}>
                            {medal}
                          </div>
                          {/* Avatar */}
                          <div style={{ width: 38, height: 38, borderRadius: '50%', background: idx === 0 ? 'linear-gradient(135deg, #F59E0B, #FDD31D)' : idx === 1 ? 'linear-gradient(135deg, #94A3B8, #CBD5E1)' : idx === 2 ? 'linear-gradient(135deg, #B45309, #D97706)' : 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0 }}>
                            {(s.name || 'İ').slice(0, 2).toUpperCase()}
                          </div>
                          {/* İsim */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{s.name}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                              {s.totalTests} test · {s.assignmentsDone} ödev
                            </div>
                          </div>
                          {/* Değer */}
                          <div style={{ fontWeight: 800, fontSize: '20px', color: valueColor, flexShrink: 0 }}>
                            {value}
                          </div>
                        </div>
                      )
                    })}
                </div>

                {/* Tamamlamamış öğrenciler */}
                {rankTab !== 'streak' && studentStats.filter(s => rankTab === 'general' ? s.avgPct === null : s.assignmentsDone === 0).length > 0 && (
                  <div style={{ marginTop: '12px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(148,163,184,0.08)', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--text3)' }}>
                    📭 Henüz test çözmeyen: {studentStats.filter(s => rankTab === 'general' ? s.avgPct === null : s.assignmentsDone === 0).map(s => s.name).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {view === 'student' && studentDetail && (
          <div>
            <button onClick={() => setView('overview')} className="btn" style={{ marginBottom: '1rem', fontSize: '13px' }}>
              ← Listeye dön
            </button>

            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '18px' }}>
                    {(studentDetail.name || 'İ').slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '18px' }}>{studentDetail.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text3)' }}>{studentDetail.grade}</div>
                  </div>
                </div>
              </div>

              {/* İstatistikler */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '1rem' }}>
                {[
                  { label: 'Toplam Test', value: studentDetail.totalTests },
                  { label: 'Genel Ort.', value: studentDetail.avgPct !== null ? `%${studentDetail.avgPct}` : '—' },
                  { label: 'Tamamlanan Ödev', value: studentDetail.assignmentsDone },
                ].map((stat, i) => (
                  <div key={i} style={{ textAlign: 'center', padding: '12px', background: 'var(--bg2)', borderRadius: '10px' }}>
                    <div style={{ fontWeight: 800, fontSize: '22px', color: 'var(--primary)' }}>{stat.value}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Öğretmen notu */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text2)', marginBottom: '6px' }}>📝 Öğretmen Notu</div>
                {editingNote === studentDetail.student_id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <textarea
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="Bu öğrenci hakkında notunuzu yazın..."
                      rows={3}
                      autoFocus
                      style={{ padding: '10px 12px', borderRadius: '8px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', resize: 'vertical', outline: 'none' }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button onClick={() => saveNote(studentDetail.student_id)} disabled={savingNote}
                        style={{ padding: '7px 14px', borderRadius: '8px', background: '#082465', color: '#fff', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {savingNote ? 'Kaydediliyor...' : 'Kaydet'}
                      </button>
                      <button onClick={() => setEditingNote(null)}
                        style={{ padding: '7px 14px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', color: 'var(--text)' }}>
                        İptal
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div style={{ fontSize: '13px', color: teacherNotes[studentDetail.student_id] ? 'var(--text2)' : 'var(--text4)', fontStyle: teacherNotes[studentDetail.student_id] ? 'normal' : 'italic', flex: 1 }}>
                      {teacherNotes[studentDetail.student_id] || 'Not eklenmemiş.'}
                    </div>
                    <button onClick={() => { setEditingNote(studentDetail.student_id); setNoteText(teacherNotes[studentDetail.student_id] || '') }}
                      style={{ padding: '5px 10px', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text3)', fontSize: '11px', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0 }}>
                      {teacherNotes[studentDetail.student_id] ? 'Düzenle' : '+ Not Ekle'}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Ödev sonuçları — yanlışlarla */}
            {studentDetail.completions.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  📝 Ödev Sonuçları
                </div>
                {studentDetail.completions.map((c: any) => {
                  const asgn = assignments.find((a: any) => a.id === c.assignment_id)
                  const analyzeKey = `${studentDetail.student_id}_${c.assignment_id}`
                  const wrongAnswers: any[] = (c.answers ?? []).filter((a: any) => !a.correct)
                  const isExpanded = expandedAssignment === c.assignment_id
                  return (
                    <div key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', cursor: 'pointer' }}
                        onClick={() => setExpandedAssignment(isExpanded ? null : c.assignment_id)}>
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{asgn?.title || 'Ödev'}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                            {asgn?.topic} · {new Date(c.completed_at).toLocaleDateString('tr-TR')}
                            {wrongAnswers.length > 0 && <span style={{ color: 'var(--red)', marginLeft: '6px' }}>· {wrongAnswers.length} yanlış</span>}
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ fontWeight: 800, fontSize: '18px', color: pctColor(c.pct) }}>%{c.pct}</div>
                          <span style={{ color: 'var(--text4)', fontSize: '14px', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'none' }}>▾</span>
                        </div>
                      </div>

                      {isExpanded && (
                        <div style={{ paddingBottom: '14px' }}>
                          {wrongAnswers.length > 0 && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--red)', marginBottom: '8px' }}>❌ Yanlış Cevaplar</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {wrongAnswers.map((ans: any, idx: number) => (
                                  <div key={idx} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', fontSize: '12px' }}>
                                    <div style={{ fontWeight: 500, marginBottom: '4px' }}>{idx + 1}. {ans.question ?? 'Soru metni yok'}</div>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                      <span style={{ color: 'var(--red)' }}>✗ {ans.student_answer ?? '—'}</span>
                                      <span style={{ color: 'var(--green)' }}>✓ {ans.correct_answer ?? '—'}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* AI Analiz */}
                          {aiAnalysis[analyzeKey] ? (
                            <div style={{ background: 'rgba(8,36,101,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(8,36,101,0.08)' }}>
                              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)', marginBottom: '6px' }}>🤖 AI Analizi</div>
                              <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{aiAnalysis[analyzeKey]}</div>
                            </div>
                          ) : (
                            <button
                              onClick={() => generateAiAnalysis(studentDetail.student_id, c.assignment_id)}
                              disabled={aiLoading === analyzeKey}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', borderRadius: '8px', border: '1.5px solid rgba(8,36,101,0.2)', background: 'rgba(8,36,101,0.04)', color: 'var(--primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                              {aiLoading === analyzeKey ? '⏳ Analiz hazırlanıyor...' : '🤖 AI Analizi Üret'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Son testler */}
            {studentDetail.sessions.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Son Testler
                </div>
                {studentDetail.sessions.slice(0, 10).map((s: any, i: number) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 9 ? '1px solid var(--border)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.topic}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{new Date(s.created_at).toLocaleDateString('tr-TR')}</div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: pctColor(s.pct) }}>%{s.pct}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
