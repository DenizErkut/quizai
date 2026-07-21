'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import StudentReportTable from '@/components/StudentReportTable'
import SectionalReportTable from '@/components/SectionalReportTable'

type ReportKey =
  | 'grades' | 'sectional' | 'progress' | 'weak-topics' | 'assignments'
  | 'live-quiz' | 'inactivity' | 'reading' | 'comparison' | 'classroom-compare'

const ALL_TABS: { key: ReportKey; label: string }[] = [
  { key: 'grades',            label: '📋 Öğrenci Raporları' },
  { key: 'sectional',         label: '📚 Ders Bazlı' },
  { key: 'progress',          label: '📈 İlerleme' },
  { key: 'weak-topics',       label: '🎯 Zayıf Konular' },
  { key: 'assignments',       label: '📝 Ödev Karnesi' },
  { key: 'live-quiz',         label: '🎮 Canlı Quiz' },
  { key: 'inactivity',        label: '😴 Devamsızlık' },
  { key: 'reading',           label: '📖 Sesli Okuma' },
  { key: 'comparison',        label: '⚖️ Not Karşılaştırma' },
  { key: 'classroom-compare', label: '🏫 Sınıf Karşılaştırma' },
]

// Veli kapsamında sınıf/ödev/canlı-quiz yönetimiyle ilgili raporların anlamı
// yok (o kurum/öğretmen işi) — bilerek gizleniyor.
const PARENT_EXCLUDED: ReportKey[] = ['assignments', 'live-quiz', 'classroom-compare']

export default function ReportsHub({
  scope, gradesEndpoint, sectionalEndpoint, hubEndpoint,
}: {
  scope: 'institution' | 'teacher' | 'parent'
  gradesEndpoint: string
  sectionalEndpoint: string
  hubEndpoint: string
}) {
  const tabs = scope === 'parent' ? ALL_TABS.filter(t => !PARENT_EXCLUDED.includes(t.key)) : ALL_TABS
  const [active, setActive] = useState<ReportKey>('grades')

  return (
    <div>
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActive(t.key)}
            style={{
              padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600,
              cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap',
              background: active === t.key ? 'var(--accent)' : 'var(--bg2)',
              color: active === t.key ? '#fff' : 'var(--text2)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {active === 'grades' && <StudentReportTable fetchEndpoint={gradesEndpoint} />}
      {active === 'sectional' && <SectionalReportTable fetchEndpoint={sectionalEndpoint} />}
      {active !== 'grades' && active !== 'sectional' && (
        <GenericReportPanel scope={scope} hubEndpoint={hubEndpoint} report={active} />
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────
// Diğer 8 rapor türü için tek, veri şekline göre dallanan render bileşeni
// ────────────────────────────────────────────────────────────────────────
function GenericReportPanel({ scope, hubEndpoint, report }: { scope: string; hubEndpoint: string; report: ReportKey }) {
  const supabase = createClient() as any
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [classroomId, setClassroomId] = useState('')

  const load = useCallback(async (cid?: string) => {
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const params = new URLSearchParams({ report })
      if (cid) params.set('classroomId', cid)
      const res = await fetch(`${hubEndpoint}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Rapor yüklenemedi.'); setLoading(false); return }
      setData(json)
    } catch (e: any) {
      setError(e?.message || 'Rapor yüklenemedi.')
    }
    setLoading(false)
  }, [hubEndpoint, report])

  useEffect(() => { load(classroomId || undefined) }, [report])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
  if (error) return <div style={{ padding: '1rem', color: 'var(--red)', fontSize: '13px' }}>{error}</div>
  if (!data) return null

  const classroomSelector = scope === 'teacher' && data.classrooms?.length > 1 && (
    <select className="input" style={{ maxWidth: '200px', marginBottom: '1rem' }} value={classroomId}
      onChange={e => { setClassroomId(e.target.value); load(e.target.value || undefined) }}>
      <option value="">Tüm sınıflarım</option>
      {data.classrooms.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  )

  return (
    <div>
      {classroomSelector}
      {report === 'progress' && <ProgressPanel data={data} />}
      {report === 'weak-topics' && <WeakTopicsPanel data={data} />}
      {report === 'assignments' && <AssignmentsPanel data={data} />}
      {report === 'live-quiz' && <LiveQuizPanel data={data} />}
      {report === 'inactivity' && <InactivityPanel data={data} />}
      {report === 'reading' && <ReadingPanel data={data} />}
      {report === 'comparison' && <ComparisonPanel data={data} />}
      {report === 'classroom-compare' && <ClassroomComparePanel data={data} />}
    </div>
  )
}

const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', fontWeight: 700, whiteSpace: 'nowrap' }
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--text2)', whiteSpace: 'nowrap' }
const empty = <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '2rem 0' }}>Gösterilecek veri bulunamadı.</p>

function ProgressPanel({ data }: { data: any }) {
  const { weeklyTrend, students } = data
  if (!weeklyTrend?.length) return empty
  const maxPct = 100
  return (
    <div>
      <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>Son 8 haftanın haftalık ortalama başarı yüzdesi.</p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', height: '140px', marginBottom: '1.5rem', padding: '0 10px' }}>
        {weeklyTrend.map((w: any) => (
          <div key={w.week} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
            <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '4px' }}>{w.avgPct != null ? `%${w.avgPct}` : '—'}</div>
            <div style={{ width: '100%', maxWidth: '32px', height: `${w.avgPct != null ? (w.avgPct / maxPct) * 100 : 2}px`, background: 'var(--accent)', borderRadius: '4px 4px 0 0' }} />
            <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px' }}>{new Date(w.week).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>Son 4 hafta vs önceki 4 hafta (en çok düşenler önce):</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead><tr><th style={th}>İsim</th><th style={th}>Önceki %</th><th style={th}>Son 4 Hafta %</th><th style={th}>Değişim</th></tr></thead>
        <tbody>
          {students.map((s: any) => (
            <tr key={s.id}>
              <td style={{ ...td, fontWeight: 600 }}>{s.fullName}</td>
              <td style={td}>{s.before != null ? `%${s.before}` : '—'}</td>
              <td style={td}>{s.after != null ? `%${s.after}` : '—'}</td>
              <td style={{ ...td, fontWeight: 700, color: s.delta == null ? 'var(--text3)' : s.delta < 0 ? 'var(--red)' : 'var(--green)' }}>
                {s.delta != null ? `${s.delta > 0 ? '+' : ''}${s.delta}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WeakTopicsPanel({ data }: { data: any }) {
  if (!data.topics?.length) return empty
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead><tr><th style={th}>Konu</th><th style={th}>Ders</th><th style={th}>Yanlış</th><th style={th}>Hata Oranı</th><th style={th}>Kaç Öğrenci</th></tr></thead>
      <tbody>
        {data.topics.map((t: any, i: number) => (
          <tr key={i}>
            <td style={{ ...td, fontWeight: 600 }}>{t.topic}</td>
            <td style={td}>{t.subject}</td>
            <td style={td}>{t.wrongCount}/{t.totalCount}</td>
            <td style={{ ...td, color: t.errorRate >= 50 ? 'var(--red)' : 'var(--text2)', fontWeight: 700 }}>%{t.errorRate}</td>
            <td style={td}>{t.studentCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function AssignmentsPanel({ data }: { data: any }) {
  if (!data.assignments?.length) return empty
  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '1.5rem' }}>
        <thead><tr><th style={th}>Ödev</th><th style={th}>Konu</th><th style={th}>Son Tarih</th><th style={th}>Tamamlayan</th><th style={th}>Ort. %</th></tr></thead>
        <tbody>
          {data.assignments.map((a: any) => (
            <tr key={a.id}>
              <td style={{ ...td, fontWeight: 600 }}>{a.title}</td>
              <td style={td}>{a.topic}</td>
              <td style={td}>{a.dueDate ? new Date(a.dueDate).toLocaleDateString('tr-TR') : '—'}</td>
              <td style={td}>{a.completedCount}</td>
              <td style={td}>{a.avgPct != null ? `%${a.avgPct}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '8px' }}>Öğrenci bazında tamamlama oranı (en düşük önce):</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead><tr><th style={th}>İsim</th><th style={th}>Tamamlanan / Atanan</th></tr></thead>
        <tbody>
          {data.students.map((s: any) => (
            <tr key={s.id}>
              <td style={{ ...td, fontWeight: 600 }}>{s.fullName}</td>
              <td style={{ ...td, color: s.completedCount < s.assignedCount ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{s.completedCount} / {s.assignedCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function LiveQuizPanel({ data }: { data: any }) {
  if (!data.quizzes?.length) return empty
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead><tr><th style={th}>Konu</th><th style={th}>Tarih</th><th style={th}>Durum</th><th style={th}>Katılımcı</th><th style={th}>Doğruluk</th></tr></thead>
      <tbody>
        {data.quizzes.map((q: any) => (
          <tr key={q.id}>
            <td style={{ ...td, fontWeight: 600 }}>{q.topic}</td>
            <td style={td}>{new Date(q.date).toLocaleDateString('tr-TR')}</td>
            <td style={td}>{q.status}</td>
            <td style={td}>{q.participantCount}</td>
            <td style={td}>{q.accuracyPct != null ? `%${q.accuracyPct}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function InactivityPanel({ data }: { data: any }) {
  if (!data.students?.length) return <p style={{ textAlign: 'center', color: 'var(--green)', fontSize: '13px', padding: '2rem 0' }}>🎉 Herkes aktif — 7+ gündür pasif öğrenci yok.</p>
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead><tr><th style={th}>İsim</th><th style={th}>Son Aktivite</th><th style={th}>Kaç Gün Pasif</th><th style={th}>🔥 Streak</th></tr></thead>
      <tbody>
        {data.students.map((s: any) => (
          <tr key={s.id}>
            <td style={{ ...td, fontWeight: 600 }}>{s.fullName}</td>
            <td style={td}>{s.lastActive ? new Date(s.lastActive).toLocaleDateString('tr-TR') : 'Hiç aktivite yok'}</td>
            <td style={{ ...td, color: 'var(--red)', fontWeight: 700 }}>{s.daysInactive != null ? `${s.daysInactive} gün` : '—'}</td>
            <td style={td}>{s.currentStreak}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ReadingPanel({ data }: { data: any }) {
  if (!data.students?.length) return empty
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead><tr><th style={th}>İsim</th><th style={th}>Tamamlanan Materyal</th><th style={th}>Dikkat Sorusu Doğruluk</th></tr></thead>
      <tbody>
        {data.students.map((s: any) => (
          <tr key={s.id}>
            <td style={{ ...td, fontWeight: 600 }}>{s.fullName}</td>
            <td style={td}>{s.materialsCompleted}</td>
            <td style={td}>{s.attentionAccuracyPct != null ? `%${s.attentionAccuracyPct} (${s.attentionChecksAnswered} soru)` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function ComparisonPanel({ data }: { data: any }) {
  if (!data.students?.length) return <p style={{ textAlign: 'center', color: 'var(--text3)', fontSize: '13px', padding: '2rem 0' }}>Karşılaştırma için ne kendi girilen not (Notlarım) ne içe aktarılan kurum notu bulunamadı.</p>
  return (
    <div>
      {data.students.map((s: any) => (
        <div key={s.id} className="card-sm" style={{ marginBottom: '10px', padding: '10px 14px' }}>
          <div style={{ fontWeight: 700, marginBottom: '6px' }}>{s.fullName}</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead><tr><th style={th}>Ders</th><th style={th}>Kendi Beyanı</th><th style={th}>Kurum Kaydı</th><th style={th}>Fark</th></tr></thead>
            <tbody>
              {s.subjects.map((r: any, i: number) => (
                <tr key={i}>
                  <td style={td}>{r.subject}</td>
                  <td style={td}>{r.selfReported ?? '—'}</td>
                  <td style={td}>{r.institutionRecord ?? '—'}</td>
                  <td style={{ ...td, color: r.diff != null && Math.abs(r.diff) >= 10 ? 'var(--red)' : 'var(--text2)', fontWeight: 700 }}>{r.diff ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

function ClassroomComparePanel({ data }: { data: any }) {
  if (!data.groups?.length) return empty
  const max = Math.max(...data.groups.map((g: any) => g.avgPct ?? 0), 1)
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
      <thead><tr><th style={th}>Grup</th><th style={th}>Öğrenci</th><th style={th}>Test Sayısı</th><th style={th}>Ortalama %</th><th style={th}></th></tr></thead>
      <tbody>
        {data.groups.map((g: any) => (
          <tr key={g.name}>
            <td style={{ ...td, fontWeight: 600 }}>{g.name}</td>
            <td style={td}>{g.studentCount}</td>
            <td style={td}>{g.testCount}</td>
            <td style={td}>{g.avgPct != null ? `%${g.avgPct}` : '—'}</td>
            <td style={{ ...td, width: '160px' }}>
              <div style={{ background: 'var(--border)', borderRadius: '4px', height: '10px', width: '140px' }}>
                <div style={{ background: 'var(--accent)', height: '10px', borderRadius: '4px', width: `${((g.avgPct ?? 0) / max) * 140}px` }} />
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
