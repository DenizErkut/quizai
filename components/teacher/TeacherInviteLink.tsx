'use client'
import { useState } from 'react'
import { useTeacherEntitlement } from './useTeacherEntitlement'

type Classroom = { id: string; name: string; invite_code?: string | null; classroom_students?: Array<{ count: number }> | null }

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Clipboard API can be blocked (insecure context / permissions): fall back to a temporary textarea.
    try {
      const area = document.createElement('textarea')
      area.value = text
      area.setAttribute('readonly', '')
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const done = document.execCommand('copy')
      area.remove()
      return done
    } catch { return false }
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'failed'>('idle')
  async function copy() {
    setState((await copyText(text)) ? 'ok' : 'failed')
    setTimeout(() => setState('idle'), 2500)
  }
  return (
    <button type="button" className="btn btn-sm" onClick={() => void copy()} aria-label={label}>
      {state === 'ok' ? '✓ Kopyalandı' : state === 'failed' ? 'Kopyalanamadı' : '📋 Kopyala'}
    </button>
  )
}

/** "Davet kodu" tab: every class with its code and student invite link, each with a copy button. */
export default function TeacherInviteLink({ classrooms }: { classrooms: Classroom[] }) {
  const { entitlement } = useTeacherEntitlement()
  const withCode = classrooms.filter(classroom => classroom.invite_code)
  const field = { flex: '1 1 240px', minWidth: 0, padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontFamily: 'monospace', fontSize: 12.5 } as const

  return (
    <section aria-labelledby="teacher-invite-title">
      <h1 id="teacher-invite-title" style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: 'var(--primary)', margin: 0 }}>🔗 Davet kodları</h1>
      <p style={{ fontSize: 13, color: 'var(--text3)', margin: '6px 0 14px', lineHeight: 1.6 }}>
        Her sınıfın davet kodunu ve linkini öğrencilerinle paylaş. Hesabı olanlar linke tıklayınca doğrudan sınıfına katılır; yeni öğrenciler kayıt olduktan sonra katılır.
      </p>
      {entitlement?.tier === 'limited' && (
        <div className="card" style={{ marginBottom: 14, background: 'var(--amber-bg, #fff4dc)' }}>
          🎁 Sınıflarındaki <strong>{entitlement.inviteTarget} öğrenci yıllık Altın üyelik</strong> alırsa sen de <strong>1 yıl Altın</strong> olursun.
          Şu an: <strong>{entitlement.qualifyingStudents}/{entitlement.inviteTarget}</strong>
        </div>
      )}
      {withCode.length === 0 ? (
        <div className="card" style={{ color: 'var(--text3)', fontSize: 13 }}>
          Henüz sınıfın yok. Önce <strong>Öğrenciler</strong> sekmesinden bir sınıf oluştur; davet kodu otomatik oluşur.
        </div>
      ) : withCode.map(classroom => {
        const link = `https://pratium.com/join?code=${classroom.invite_code}`
        const count = classroom.classroom_students?.[0]?.count
        return (
          <div key={classroom.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <strong style={{ fontSize: 15 }}>{classroom.name}</strong>
              {typeof count === 'number' && <span style={{ fontSize: 12, color: 'var(--text3)' }}>{count} öğrenci</span>}
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>Davet kodu</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input readOnly value={classroom.invite_code ?? ''} aria-label={`${classroom.name} davet kodu`} onFocus={event => event.currentTarget.select()} style={{ ...field, flex: '0 1 180px', letterSpacing: '.18em', fontWeight: 700, fontSize: 15 }} />
              <CopyButton text={classroom.invite_code ?? ''} label={`${classroom.name} davet kodunu kopyala`} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', marginBottom: 4 }}>Davet linki</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input readOnly value={link} aria-label={`${classroom.name} davet linki`} onFocus={event => event.currentTarget.select()} style={field} />
              <CopyButton text={link} label={`${classroom.name} davet linkini kopyala`} />
              <a className="btn btn-sm" href={`https://wa.me/?text=${encodeURIComponent(`${classroom.name} sınıfına katıl: ${link}`)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            </div>
          </div>
        )
      })}
    </section>
  )
}
