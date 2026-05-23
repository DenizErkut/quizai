'use client'

import { useState } from 'react'
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
}

const GRADE_LABELS: Record<string, string> = {
  '5': '5. Sınıf', '6': '6. Sınıf', '7': '7. Sınıf',
  '8': '8. Sınıf', '9': '9. Sınıf', '10': '10. Sınıf',
  '11': '11. Sınıf', '12': '12. Sınıf',
}

function pctColor(pct: number) {
  if (pct >= 80) return 'text-green-600 bg-green-50 dark:bg-green-900/20'
  if (pct >= 50) return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
  return 'text-red-500 bg-red-50 dark:bg-red-900/20'
}

export default function ArchiveClient({ sessions }: { sessions: Session[] }) {
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'date' | 'pct'>('date')

  const grades = [...new Set(sessions.map(s => s.grade))].sort()

  const filtered = sessions
    .filter(s => {
      const matchSearch = s.topic.toLowerCase().includes(search.toLowerCase())
      const matchGrade = gradeFilter === 'all' || s.grade === gradeFilter
      return matchSearch && matchGrade
    })
    .sort((a, b) => {
      if (sortBy === 'pct') return b.pct - a.pct
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })

  const avgPct = sessions.length
    ? Math.round(sessions.reduce((acc, s) => acc + s.pct, 0) / sessions.length)
    : 0

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1">Soru Arşivi</h1>
        <p className="text-gray-500 text-sm">
          {sessions.length} tamamlanmış test · Ortalama{' '}
          <span className={`font-semibold ${avgPct >= 70 ? 'text-green-600' : 'text-yellow-600'}`}>
            %{avgPct}
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <input
          type="text"
          placeholder="Konuya göre ara..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <select
          value={gradeFilter}
          onChange={e => setGradeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none"
        >
          <option value="all">Tüm sınıflar</option>
          {grades.map(g => (
            <option key={g} value={g}>{GRADE_LABELS[g] ?? g}</option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as 'date' | 'pct')}
          className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm focus:outline-none"
        >
          <option value="date">En yeni</option>
          <option value="pct">En yüksek puan</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm">Eşleşen test bulunamadı.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <Link
              key={s.id}
              href={`/archive/${s.id}`}
              className="flex items-center gap-4 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-indigo-400 hover:shadow-sm transition-all group"
            >
              <div className={`w-14 h-14 rounded-xl flex flex-col items-center justify-center font-bold text-lg shrink-0 ${pctColor(s.pct)}`}>
                <span>%{s.pct}</span>
                <span className="text-[10px] font-normal opacity-70">{s.score}/{s.question_count}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate group-hover:text-indigo-600 transition-colors">
                  {s.topic}
                </p>
                <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                  <span>{GRADE_LABELS[s.grade] ?? s.grade}</span>
                  <span>·</span>
                  <span>{s.question_count} soru</span>
                  <span>·</span>
                  <span>{s.language === 'tr' ? '🇹🇷' : '🇬🇧'}</span>
                </div>
              </div>
              <div className="text-xs text-gray-400 shrink-0">
                {new Date(s.created_at).toLocaleDateString('tr-TR', {
                  day: 'numeric', month: 'short', year: 'numeric'
                })}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
