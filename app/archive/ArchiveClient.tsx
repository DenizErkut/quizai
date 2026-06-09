'use client'
import { useState, useMemo } from 'react'
import Link from 'next/link'

type Session = {
  id: string
  topic: string
  grade: string
  language: string
  question_count: number
  score: number
  pct: number
  completed: boolean
  created_at: string
  question_type?: string
  questions?: any[]
  answers?: any[]
}

const QUESTION_TYPE_LABELS: Record<string, string> = {
  multiple_choice: '🔤 Çoktan Seçmeli',
  fill_blank: '✏️ Boşluk',
  true_false: '✓✗ D/Y',
  multi_true_false: '📋 Çoklu D/Y',
  matching: '🔗 Eşleştirme',
  ordering: '📋 Sıralama',
  short_answer: '💬 Kısa Cevap',
  mixed: '🎲 Karma',
  table_fill: '🗂️ Tablo',
}

function pctColor(pct: number) {
  if (pct >= 80) return 'var(--green)'
  if (pct >= 55) return 'var(--amber, #f59e0b)'
  return 'var(--red)'
}
function pctBg(pct: number) {
  if (pct >= 80) return 'var(--green-bg)'
  if (pct >= 55) return 'var(--amber-bg)'
  return 'var(--red-bg)'
}
function toLocalDateStr(iso: string): string {
  // Supabase UTC timestamp → yerel tarih string (YYYY-MM-DD)
  const d = new Date(iso)
  return d.toLocaleDateString('sv-SE') // ISO format: YYYY-MM-DD, locale-independent
}

function dateGroup(iso: string): string {
  const sessionDate = toLocalDateStr(iso)
  const now = new Date()
  const todayStr = now.toLocaleDateString('sv-SE')
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1)
  const yesterdayStr = yesterday.toLocaleDateString('sv-SE')
  const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7)
  const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30)

  if (sessionDate === todayStr) return 'Bugün'
  if (sessionDate === yesterdayStr) return 'Dün'
  if (new Date(iso) >= weekAgo) return 'Bu Hafta'
  if (new Date(iso) >= monthAgo) return 'Bu Ay'
  return new Date(iso).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

// ✅ PDF Export fonksiyonu — jsPDF client-side
async function exportQuizPDF(session: Session) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageW = 210
  const margin = 18
  const contentW = pageW - margin * 2
  let y = 20

  // Başlık
  doc.setFillColor(8, 36, 101) // navy
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setTextColor(253, 211, 29) // yellow
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('pratium.com', margin, 12)
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text('AI Destekli Soru Platformu', margin, 20)
  y = 40

  // Test bilgisi
  doc.setTextColor(8, 36, 101)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  const titleLines = doc.splitTextToSize(session.topic, contentW)
  doc.text(titleLines, margin, y)
  y += titleLines.length * 7 + 4

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  const meta = [
    session.grade && `Sınıf: ${session.grade}`,
    `${session.question_count} Soru`,
    session.question_type && (QUESTION_TYPE_LABELS[session.question_type] || session.question_type),
    new Date(session.created_at).toLocaleDateString('tr-TR'),
  ].filter(Boolean).join('  ·  ')
  doc.text(meta, margin, y)
  y += 6

  // Ad-soyad alanı
  doc.setDrawColor(226, 232, 240)
  doc.line(margin, y, pageW - margin, y)
  y += 8
  doc.setFontSize(9)
  doc.setTextColor(100, 116, 139)
  doc.text('Ad Soyad: ________________________________________    Tarih: ___________', margin, y)
  y += 10

  // Sorular
  const questions: any[] = session.questions || []

  questions.forEach((q: any, idx: number) => {
    // Sayfa taşıyorsa yeni sayfa
    if (y > 265) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(15, 23, 42)
    const qText = `${idx + 1}. ${q.q || q.question || ''}`
    const qLines = doc.splitTextToSize(qText, contentW)
    doc.text(qLines, margin, y)
    y += qLines.length * 5.5 + 2

    // Seçenekler
    if (q.opts && Array.isArray(q.opts)) {
      const letters = ['A', 'B', 'C', 'D', 'E']
      q.opts.forEach((opt: string, oi: number) => {
        if (y > 270) { doc.addPage(); y = 20 }
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(51, 65, 85)
        const optText = `${letters[oi]}) ${opt}`
        const optLines = doc.splitTextToSize(optText, contentW - 6)
        doc.text(optLines, margin + 5, y)
        y += optLines.length * 5 + 1
      })
      y += 2
    } else if (q.type === 'true_false') {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(51, 65, 85)
      doc.text('A) Doğru    B) Yanlış', margin + 5, y)
      y += 7
    } else if (q.type === 'fill_blank' || q.type === 'short_answer') {
      doc.setDrawColor(200, 210, 220)
      doc.line(margin + 5, y + 4, margin + contentW - 5, y + 4)
      y += 10
    }

    y += 3
  })

  // Footer
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(148, 163, 184)
    doc.text(`pratium.com  ·  ${i} / ${pageCount}`, pageW / 2, 293, { align: 'center' })
  }

  const fileName = `${session.topic.slice(0, 40).replace(/[^a-zA-Z0-9ğüşıöçĞÜŞİÖÇ\s]/g, '')}_quiz.pdf`
  doc.save(fileName)
}

export default function ArchiveClient({ sessions }: { sessions: Session[] }) {
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [scoreFilter, setScoreFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'date' | 'pct_asc' | 'pct_desc'>('date')
  const [showFilters, setShowFilters] = useState(false)
  const [activeStatFilter, setActiveStatFilter] = useState<'all' | 'weak' | 'good' | 'best'>('all')
  const [exportingId, setExportingId] = useState<string | null>(null) // ✅ YENİ

  const grades = useMemo(() => [...new Set(sessions.map(s => s.grade))].filter(Boolean).sort(), [sessions])

  // En iyi testin ID'si — sessions'dan doğrudan hesapla (stats'tan bağımsız)
  const bestSessionId = useMemo(() => {
    if (!sessions.length) return null
    return sessions.reduce((a, s) => s.pct > a.pct ? s : a).id
  }, [sessions])
  const types = useMemo(() => [...new Set(sessions.map(s => s.question_type).filter(Boolean))], [sessions])

  const filtered = useMemo(() => {
    const now = Date.now()
    return sessions
      .filter(s => {
        if (search && !s.topic.toLowerCase().includes(search.toLowerCase())) return false
        if (gradeFilter !== 'all' && s.grade !== gradeFilter) return false
        if (typeFilter !== 'all' && s.question_type !== typeFilter) return false
        if (scoreFilter === 'weak' && s.pct >= 55) return false
        if (scoreFilter === 'mid' && (s.pct < 55 || s.pct >= 80)) return false
        if (scoreFilter === 'good' && s.pct < 80) return false
        // Stat kartı filtreleri
        if (activeStatFilter === 'weak' && s.pct >= 55) return false
        if (activeStatFilter === 'good' && s.pct < 80) return false
        if (activeStatFilter === 'best' && bestSessionId && s.id !== bestSessionId) return false
        if (dateFilter === 'week' && now - new Date(s.created_at).getTime() > 7 * 86400000) return false
        if (dateFilter === 'month' && now - new Date(s.created_at).getTime() > 30 * 86400000) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'pct_asc') return a.pct - b.pct
        if (sortBy === 'pct_desc') return b.pct - a.pct
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [sessions, search, gradeFilter, typeFilter, scoreFilter, dateFilter, sortBy, activeStatFilter, bestSessionId])

  const stats = useMemo(() => {
    if (!sessions.length) return null
    const avg = Math.round(sessions.reduce((a, s) => a + s.pct, 0) / sessions.length)
    const best = sessions.reduce((a, s) => s.pct > a.pct ? s : a)
    const worst = sessions.reduce((a, s) => s.pct < a.pct ? s : a)
    const weakCount = sessions.filter(s => s.pct < 55).length
    return { avg, best, worst, weakCount, total: sessions.length }
  }, [sessions])

  const grouped = useMemo(() => {
    const groups: { label: string; items: Session[] }[] = []
    let currentLabel = ''
    filtered.forEach(s => {
      const label = dateGroup(s.created_at)
      if (label !== currentLabel) {
        currentLabel = label
        groups.push({ label, items: [] })
      }
      groups[groups.length - 1].items.push(s)
    })
    return groups
  }, [filtered])

  const activeFilters = [gradeFilter, typeFilter, scoreFilter, dateFilter].filter(f => f !== 'all').length

  // ✅ YENİ: PDF export handler
  async function handleExport(e: React.MouseEvent, session: Session) {
    e.preventDefault()
    e.stopPropagation()
    setExportingId(session.id)
    try {
      await exportQuizPDF(session)
    } catch (err) {
      console.error('PDF export error:', err)
      alert('PDF oluşturulurken hata oluştu.')
    } finally {
      setExportingId(null)
    }
  }

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: '1.5rem', paddingBottom: '5rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>
          📦 Soru Arşivi
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text3)' }}>
          {sessions.length} test · {filtered.length !== sessions.length ? `${filtered.length} sonuç gösteriliyor` : 'Tümü'}
        </p>
      </div>

      {/* İstatistik kartları */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
          {([
            { label: 'Toplam Test', value: stats.total, icon: '📝', filter: 'all' as const, desc: 'Tüm testleri göster' },
            { label: 'Genel Ort.', value: `%${stats.avg}`, icon: '📊', color: pctColor(stats.avg), filter: 'good' as const, desc: '%80+ testleri filtrele' },
            { label: 'En İyi', value: `%${stats.best.pct}`, icon: '🏆', color: 'var(--green)', sub: stats.best.topic.slice(0, 12) + '…', filter: 'best' as const, desc: 'En iyi teste git' },
            { label: 'Zayıf Test', value: stats.weakCount, icon: '⚠️', color: stats.weakCount > 0 ? 'var(--red)' : 'var(--green)', filter: 'weak' as const, desc: 'Zayıf testleri filtrele' },
          ] as {label:string;value:any;icon:string;color?:string;sub?:string;filter:'all'|'good'|'best'|'weak';desc:string}[]).map((s, i) => {
            const isActive = activeStatFilter === s.filter
            return (
            <button key={i} onClick={() => setActiveStatFilter(prev => prev === s.filter ? 'all' : s.filter)}
              title={s.desc}
              style={{
                textAlign: 'center', padding: '12px 8px',
                borderRadius: '14px', border: `2px solid ${isActive ? (s.color || 'var(--accent)') : 'var(--border)'}`,
                background: isActive ? (s.color ? s.color.replace('var(--green)', 'rgba(22,163,74,0.08)').replace('var(--red)', 'rgba(220,38,38,0.08)') : 'var(--accent-bg)') : 'var(--bg)',
                cursor: 'pointer', fontFamily: 'var(--font-sans)',
                transition: 'all 0.15s',
                boxShadow: isActive ? `0 4px 16px ${s.color ? s.color.replace('var(--green)', 'rgba(22,163,74,0.2)').replace('var(--red)', 'rgba(220,38,38,0.2)') : 'rgba(30,207,184,0.2)'}` : '0 1px 4px rgba(0,0,0,0.05)',
                transform: isActive ? 'translateY(-2px)' : '',
              }}>
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
              <div style={{ fontWeight: 800, fontSize: '18px', color: s.color || 'var(--primary)' }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: isActive ? (s.color || 'var(--accent)') : 'var(--text3)', marginTop: '2px', fontWeight: isActive ? 600 : 400 }}>{s.label}</div>
              {s.sub && <div style={{ fontSize: '9px', color: 'var(--text3)', marginTop: '1px' }}>{s.sub}</div>}
              {isActive && <div style={{ fontSize: '9px', color: s.color || 'var(--accent)', marginTop: '4px', fontWeight: 600 }}>✓ Filtre aktif</div>}
            </button>
          )})}
        </div>
      )}

      {/* Arama + filtre */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="🔍 Konuya göre ara..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none' }}
          />
          <button onClick={() => setShowFilters(v => !v)}
            style={{ padding: '10px 14px', borderRadius: '10px', border: `1.5px solid ${activeFilters > 0 ? 'var(--accent)' : 'var(--border)'}`, background: activeFilters > 0 ? 'var(--accent-bg)' : 'var(--bg2)', color: activeFilters > 0 ? 'var(--accent)' : 'var(--text3)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
            🎛️ Filtreler {activeFilters > 0 && <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '999px', fontSize: '10px', padding: '1px 6px', fontWeight: 700 }}>{activeFilters}</span>}
          </button>
        </div>

        {showFilters && (
          <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Sıralama</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={selectStyle}>
                <option value="date">En yeni</option>
                <option value="pct_desc">En yüksek puan</option>
                <option value="pct_asc">En düşük puan</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Sınıf</label>
              <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)} style={selectStyle}>
                <option value="all">Tümü</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Puan Aralığı</label>
              <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)} style={selectStyle}>
                <option value="all">Tümü</option>
                <option value="good">İyi (%80+)</option>
                <option value="mid">Orta (%55-79)</option>
                <option value="weak">Zayıf (-%55)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Tarih</label>
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={selectStyle}>
                <option value="all">Tümü</option>
                <option value="week">Bu hafta</option>
                <option value="month">Bu ay</option>
              </select>
            </div>
            {types.length > 0 && (
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Soru Tipi</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={selectStyle}>
                  <option value="all">Tümü</option>
                  {types.map(t => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t!] || t}</option>)}
                </select>
              </div>
            )}
            {activeFilters > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button onClick={() => { setGradeFilter('all'); setScoreFilter('all'); setTypeFilter('all'); setDateFilter('all'); setSortBy('date') }}
                  style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(220,38,38,0.3)', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600, width: '100%' }}>
                  Filtreleri Temizle
                </button>
              </div>
            )}
          </div>
        )}

        {/* Stat filtresi aktif göstergesi */}
      {activeStatFilter !== 'all' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', padding: '8px 12px', borderRadius: '10px', background: 'var(--accent-bg)', border: '1px solid var(--accent)' }}>
          <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
            {activeStatFilter === 'weak' ? '⚠️ Zayıf testler filtreleniyor' : activeStatFilter === 'good' ? '📊 İyi testler filtreleniyor' : '🏆 En iyi test gösteriliyor'}
          </span>
          <button onClick={() => setActiveStatFilter('all')} style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            × Temizle
          </button>
        </div>
      )}
      {activeFilters > 0 && !showFilters && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {gradeFilter !== 'all' && <FilterTag label={`Sınıf: ${gradeFilter}`} onRemove={() => setGradeFilter('all')} />}
            {scoreFilter !== 'all' && <FilterTag label={scoreFilter === 'good' ? 'İyi testler' : scoreFilter === 'mid' ? 'Orta testler' : 'Zayıf testler'} onRemove={() => setScoreFilter('all')} />}
            {typeFilter !== 'all' && <FilterTag label={QUESTION_TYPE_LABELS[typeFilter] || typeFilter} onRemove={() => setTypeFilter('all')} />}
            {dateFilter !== 'all' && <FilterTag label={dateFilter === 'week' ? 'Bu hafta' : 'Bu ay'} onRemove={() => setDateFilter('all')} />}
          </div>
        )}
      </div>

      {/* Sonuçlar */}
      {filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <div style={{ fontSize: '48px', marginBottom: '12px' }}>📭</div>
          <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--primary)', marginBottom: '6px' }}>Sonuç bulunamadı</div>
          <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1rem' }}>Filtrelerini değiştirmeyi dene.</div>
          <button onClick={() => { setSearch(''); setGradeFilter('all'); setScoreFilter('all'); setTypeFilter('all'); setDateFilter('all') }}
            className="btn" style={{ justifyContent: 'center', fontSize: '13px' }}>Tümünü Göster</button>
        </div>
      ) : (
        <div>
          {grouped.map(group => (
            <div key={group.label} style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{group.label}</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                <span>{group.items.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.items.map(s => (
                  <div key={s.id} style={{ position: 'relative' }}>
                    <Link href={`/archive/${s.id}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', paddingRight: s.questions?.length ? '52px' : '16px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg)', textDecoration: 'none', transition: 'all 0.15s' }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(8,36,101,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = '' }}>

                      <div style={{ width: 52, height: 52, borderRadius: '12px', background: pctBg(s.pct), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontWeight: 800, fontSize: '16px', color: pctColor(s.pct), lineHeight: 1 }}>%{s.pct}</span>
                        <span style={{ fontSize: '10px', color: pctColor(s.pct), opacity: 0.7, marginTop: '2px' }}>{s.score}/{s.question_count}</span>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.topic}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '11px', color: 'var(--text3)' }}>
                          {s.grade && <span>📚 {s.grade}</span>}
                          <span>❓ {s.question_count} soru</span>
                          {s.question_type && s.question_type !== 'multiple_choice' && (
                            <span>{QUESTION_TYPE_LABELS[s.question_type] || s.question_type}</span>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: '11px', color: 'var(--text4)', flexShrink: 0, textAlign: 'right' }}>
                        {new Date(s.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' })}
                      </div>
                    </Link>

                    {/* ✅ YENİ: PDF export butonu — sadece sorular varsa göster */}
                    {s.questions && s.questions.length > 0 && (
                      <button
                        onClick={(e) => handleExport(e, s)}
                        disabled={exportingId === s.id}
                        title="PDF olarak indir"
                        style={{
                          position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                          width: 32, height: 32, borderRadius: '8px',
                          background: exportingId === s.id ? 'var(--bg2)' : 'rgba(8,36,101,0.06)',
                          border: '1px solid var(--border)',
                          color: 'var(--text3)', cursor: exportingId === s.id ? 'not-allowed' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '14px', transition: 'all 0.15s',
                        }}
                        onMouseEnter={e => { if (exportingId !== s.id) { e.currentTarget.style.background = 'rgba(8,36,101,0.12)'; e.currentTarget.style.color = 'var(--primary)' } }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(8,36,101,0.06)'; e.currentTarget.style.color = 'var(--text3)' }}
                      >
                        {exportingId === s.id ? '⏳' : '⬇️'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 10px', borderRadius: '999px', background: 'var(--accent-bg)', border: '1px solid rgba(30,207,184,0.3)', fontSize: '11px', fontWeight: 600, color: 'var(--accent)' }}>
      {label}
      <button onClick={onRemove} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center' }}>×</button>
    </div>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: '8px',
  border: '1.5px solid var(--border)', background: 'var(--bg2)',
  color: 'var(--text)', fontSize: '12px', fontFamily: 'var(--font-sans)', outline: 'none',
}
