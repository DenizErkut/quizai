'use client'
import { useState } from 'react'
import { subjectOptionsForGrade } from '@/lib/subject-options'

const field: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 13 }

// Sınıfa göre ders açılır listesi (tamamı kaydırılabilir); listede olmayan ders için "Diğer" ile elle yazılır.
export default function SubjectSelect({ gradeNumber, value, onChange }: { gradeNumber: number; value: string; onChange: (value: string) => void }) {
  const options = subjectOptionsForGrade(gradeNumber)
  const [other, setOther] = useState(false)
  const custom = other || (value !== '' && !options.includes(value))
  return (
    <>
      <select style={field} value={custom ? '__other' : value} onChange={e => {
        if (e.target.value === '__other') { setOther(true); onChange('') } else { setOther(false); onChange(e.target.value) }
      }}>
        <option value="">Ders seçin…</option>
        {options.map(name => <option key={name} value={name}>{name}</option>)}
        <option value="__other">Diğer (elle yaz)</option>
      </select>
      {custom && <input style={{ ...field, marginTop: 6 }} value={value} onChange={e => onChange(e.target.value)} placeholder="Ders adı" />}
    </>
  )
}
