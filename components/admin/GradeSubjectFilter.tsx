'use client'

export type GradeSubjectOption = { grade: string; subjects: string[] }
export type GradeSubjectValue = { grade: string; subject: string }

/** Sınıf (numara) ve ders seçimi; ders listesi seçili sınıfa göre daralır. */
export default function GradeSubjectFilter({ options, value, onChange, count, disabled }: {
  options: GradeSubjectOption[]
  value: GradeSubjectValue
  onChange: (next: GradeSubjectValue) => void
  /** İsteğe bağlı sonuç sayacı metni (ör. "42 / 3833 kazanım"). */
  count?: string
  disabled?: boolean
}) {
  const subjects = value.grade
    ? options.find(option => option.grade === value.grade)?.subjects ?? []
    : [...new Set(options.flatMap(option => option.subjects))].sort((a, b) => a.localeCompare(b, 'tr'))
  const active = Boolean(value.grade || value.subject)
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', margin: '10px 0' }}>
    <select className="input" aria-label="Sınıf filtresi" disabled={disabled} value={value.grade} style={{ width: 'auto', minWidth: 130 }}
      onChange={event => {
        const grade = event.target.value
        const allowed = grade ? options.find(option => option.grade === grade)?.subjects ?? [] : null
        onChange({ grade, subject: allowed && value.subject && !allowed.includes(value.subject) ? '' : value.subject })
      }}>
      <option value="">Tüm sınıflar</option>
      {options.map(option => <option key={option.grade} value={option.grade}>{option.grade}. sınıf</option>)}
    </select>
    <select className="input" aria-label="Ders filtresi" disabled={disabled} value={value.subject} style={{ width: 'auto', minWidth: 170 }}
      onChange={event => onChange({ grade: value.grade, subject: event.target.value })}>
      <option value="">Tüm dersler</option>
      {subjects.map(subject => <option key={subject} value={subject}>{subject}</option>)}
    </select>
    {active && <button type="button" className="btn btn-sm" disabled={disabled} onClick={() => onChange({ grade: '', subject: '' })}>Filtreyi temizle</button>}
    {count && <span style={{ fontSize: 12, color: 'var(--text2)' }}>{count}</span>}
  </div>
}
