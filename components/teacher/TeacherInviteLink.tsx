'use client'
import { useMemo, useState } from 'react'

type Classroom = { id: string; name: string; invite_code?: string | null }

/** Student invite link of a classroom (opens /join with the class code) plus a copy button. */
export default function TeacherInviteLink({ classrooms }: { classrooms: Classroom[] }) {
  const withCode = useMemo(() => classrooms.filter(classroom => classroom.invite_code), [classrooms])
  const [selectedId, setSelectedId] = useState('')
  const [copied, setCopied] = useState<'idle' | 'ok' | 'failed'>('idle')
  const selected = withCode.find(classroom => classroom.id === selectedId) ?? withCode[0]
  if (!selected) return null

  const link = `https://pratium.com/join?code=${selected.invite_code}`
  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied('ok')
    } catch {
      // Clipboard API can be blocked (insecure context / permissions): fall back to a temporary textarea.
      try {
        const area = document.createElement('textarea')
        area.value = link
        area.setAttribute('readonly', '')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.appendChild(area)
        area.select()
        const done = document.execCommand('copy')
        area.remove()
        setCopied(done ? 'ok' : 'failed')
      } catch { setCopied('failed') }
    }
    setTimeout(() => setCopied('idle'), 2500)
  }

  return (
    <section className="card" aria-labelledby="teacher-invite-title" style={{ marginBottom: '1.25rem' }}>
      <h2 id="teacher-invite-title" style={{ fontSize: 16, fontWeight: 800, color: 'var(--primary)', margin: 0 }}>🔗 Öğrenci davet linkin</h2>
      <p style={{ fontSize: 12, color: 'var(--text3)', margin: '5px 0 12px', lineHeight: 1.6 }}>
        Bu linki öğrencilerinle paylaş: hesabı olanlar doğrudan sınıfına katılır, yeni öğrenciler kayıt olduktan sonra katılır.
        Sınıfındaki 10 öğrenci yıllık Altın üyelik alırsa sen de 1 yıl Altın olursun.
      </p>
      {withCode.length > 1 && (
        <select value={selected.id} onChange={event => setSelectedId(event.target.value)} aria-label="Sınıf seç" style={{ width: '100%', marginBottom: 8, padding: '9px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)' }}>
          {withCode.map(classroom => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input readOnly value={link} aria-label="Davet linki" onFocus={event => event.currentTarget.select()}
          style={{ flex: '1 1 260px', minWidth: 0, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'monospace', fontSize: 12.5 }} />
        <button type="button" className="btn btn-primary" onClick={() => void copy()}>
          {copied === 'ok' ? '✓ Kopyalandı' : copied === 'failed' ? 'Kopyalanamadı — elle seç' : '📋 Kopyala'}
        </button>
        <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(`${selected.name} sınıfına katıl: ${link}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 7 }}>Sınıf kodu: <strong style={{ letterSpacing: '.12em' }}>{selected.invite_code}</strong></div>
    </section>
  )
}
