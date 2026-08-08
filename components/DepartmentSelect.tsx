'use client'
// components/DepartmentSelect.tsx
// Üniversite öğrencisi için bölüm seçimi — fakülteye göre gruplu dropdown +
// "Diğer" seçilirse serbest metin. Kayıt/profil formlarının 4 ayrı yerinde
// (register, complete-profile, profile OAuth sihirbazı, profile/edit)
// tekrar tekrar aynı listeyi yazmamak için tek, paylaşılan bileşen.
import { UNIVERSITY_DEPARTMENTS, OTHER_DEPARTMENT_VALUE } from '@/lib/university-departments'

interface DepartmentSelectProps {
  value: string
  onChange: (value: string) => void
  otherValue: string
  onOtherChange: (value: string) => void
  required?: boolean
}

export default function DepartmentSelect({ value, onChange, otherValue, onOtherChange, required = true }: DepartmentSelectProps) {
  return (
    <div>
      <label className="field-label">
        Bölüm {required && <span style={{ color: 'var(--red)' }}>*</span>}
      </label>
      <select className="input" value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Seç...</option>
        {UNIVERSITY_DEPARTMENTS.map(g => (
          <optgroup key={g.group} label={g.group}>
            {g.options.map(o => <option key={o} value={o}>{o}</option>)}
          </optgroup>
        ))}
      </select>
      {value === OTHER_DEPARTMENT_VALUE && (
        <input
          className="input"
          style={{ marginTop: '8px' }}
          placeholder="Bölümünü yaz"
          value={otherValue}
          onChange={e => onOtherChange(e.target.value)}
        />
      )}
    </div>
  )
}

// Seçilen değer + (varsa) "Diğer" serbest metnini tek bir kaydedilecek
// string'e indirger. Formların hepsinde aynı mantık tekrarlanmasın diye.
export function resolveDepartmentValue(selected: string, otherText: string): string {
  if (selected === OTHER_DEPARTMENT_VALUE) return otherText.trim()
  return selected
}
