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

function dateGroup(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return 'Bugün'
  if (diffDays === 1) return 'Dün'
  if (diffDays <= 7) return 'Bu Hafta'
  if (diffDays <= 30) return 'Bu Ay'
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' })
}

export default function ArchiveClient({ sessions }: { sessions: Session[] }) {
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [scoreFilter, setScoreFilter] = useState('all') // all | weak | mid | good
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('all') // all | week | month
  const [sortBy, setSortBy] = useState<'date' | 'pct_asc' | 'pct_desc'>('date')
  const [showFilters, setShowFilters] = useState(false)

  const grades = useMemo(() => [...new Set(sessions.map(s => s.grade))].filter(Boolean).sort(), [sessions])
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
        if (dateFilter === 'week' && now - new Date(s.created_at).getTime() > 7 * 86400000) return false
        if (dateFilter === 'month' && now - new Date(s.created_at).getTime() > 30 * 86400000) return false
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'pct_asc') return a.pct - b.pct
        if (sortBy === 'pct_desc') return b.pct - a.pct
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [sessions, search, gradeFilter, typeFilter, scoreFilter, dateFilter, sortBy])

  // İstatistikler
  const stats = useMemo(() => {
    if (!sessions.length) return null
    const avg = Math.round(sessions.reduce((a, s) => a + s.pct, 0) / sessions.length)
    const best = sessions.reduce((a, s) => s.pct > a.pct ? s : a)
    const worst = sessions.reduce((a, s) => s.pct < a.pct ? s : a)
    const weakCount = sessions.filter(s => s.pct < 55).length
    return { avg, best, worst, weakCount, total: sessions.length }
  }, [sessions])

  // Tarih grupları
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
          {[
            { label: 'Toplam Test', value: stats.total, icon: '📝' },
            { label: 'Genel Ort.', value: `%${stats.avg}`, icon: '📊', color: pctColor(stats.avg) },
            { label: 'En İyi', value: `%${stats.best.pct}`, icon: '🏆', color: 'var(--green)', sub: stats.best.topic.slice(0, 12) + '…' },
            { label: 'Zayıf Test', value: stats.weakCount, icon: '⚠️', color: stats.weakCount > 0 ? 'var(--red)' : 'var(--green)' },
          ].map((s, i) => (
            <div key={i} className="card" style={{ textAlign: 'center', padding: '12px 8px' }}>
              <div style={{ fontSize: '18px', marginBottom: '2px' }}>{s.icon}</div>
              <div style={{ fontWeight: 800, fontSize: '18px', color: (s as any).color || 'var(--primary)' }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
              {(s as any).sub && <div style={{ fontSize: '9px', color: 'var(--text4)', marginTop: '1px' }}>{(s as any).sub}</div>}
            </div>
          ))}
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

        {/* Genişletilmiş filtreler */}
        {showFilters && (
          <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', marginBottom: '8px' }}>
            {/* Sıralama */}
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Sıralama</label>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                style={selectStyle}>
                <option value="date">En yeni</option>
                <option value="pct_desc">En yüksek puan</option>
                <option value="pct_asc">En düşük puan</option>
              </select>
            </div>
            {/* Sınıf */}
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Sınıf</label>
              <select value={gradeFilter} onChange={e => setGradeFilter(e.target.value)}
                style={selectStyle}>
                <option value="all">Tümü</option>
                {grades.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            {/* Skor */}
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Puan Aralığı</label>
              <select value={scoreFilter} onChange={e => setScoreFilter(e.target.value)}
                style={selectStyle}>
                <option value="all">Tümü</option>
                <option value="good">İyi (%80+)</option>
                <option value="mid">Orta (%55-79)</option>
                <option value="weak">Zayıf (-%55)</option>
              </select>
            </div>
            {/* Tarih */}
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Tarih</label>
              <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
                style={selectStyle}>
                <option value="all">Tümü</option>
                <option value="week">Bu hafta</option>
                <option value="month">Bu ay</option>
              </select>
            </div>
            {/* Soru tipi */}
            {types.length > 0 && (
              <div>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>Soru Tipi</label>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
                  style={selectStyle}>
                  <option value="all">Tümü</option>
                  {types.map(t => <option key={t} value={t}>{QUESTION_TYPE_LABELS[t!] || t}</option>)}
                </select>
              </div>
            )}
            {/* Filtreleri temizle */}
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

        {/* Aktif filtre etiketleri */}
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
              {/* Grup başlığı */}
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{group.label}</span>
                <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
                <span>{group.items.length}</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {group.items.map(s => (
                  <Link key={s.id} href={`/archive/${s.id}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg)', textDecoration: 'none', transition: 'all 0.15s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(8,36,101,0.3)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.transform = '' }}>

                    {/* Puan kartı */}
                    <div style={{ width: 52, height: 52, borderRadius: '12px', background: pctBg(s.pct), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: '16px', color: pctColor(s.pct), lineHeight: 1 }}>%{s.pct}</span>
                      <span style={{ fontSize: '10px', color: pctColor(s.pct), opacity: 0.7, marginTop: '2px' }}>{s.score}/{s.question_count}</span>
                    </div>

                    {/* İçerik */}
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

                    {/* Tarih */}
                    <div style={{ fontSize: '11px', color: 'var(--text4)', flexShrink: 0, textAlign: 'right' }}>
                      {new Date(s.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}
                    </div>
                  </Link>
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
