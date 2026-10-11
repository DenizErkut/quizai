'use client'
// Language picker for visitors without a session (the Navbar, which has its own picker, only renders
// for signed-in users). Sits left of the floating theme toggle.
import { useState } from 'react'
import { useUser } from '@/lib/user-context'
import { useT } from '@/lib/i18n/I18nProvider'
import { LOCALES } from '@/lib/i18n/core'

export default function LanguageFloating() {
  const { profile, loading } = useUser()
  const { locale, setLocale } = useT()
  const [open, setOpen] = useState(false)
  if (profile || loading) return null
  const active = LOCALES.find(l => l.code === locale) || LOCALES[0]
  return (
    <div style={{ position: 'fixed', top: '16px', right: '66px', zIndex: 9997 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Language"
        aria-expanded={open}
        style={{ height: 42, padding: '0 12px', borderRadius: 21, background: 'var(--bg)', border: '1.5px solid var(--border)', boxShadow: 'var(--shadow)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text)', fontFamily: 'inherit' }}
      >
        <span>{active.flag}</span><span style={{ fontSize: 10, opacity: 0.6 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 150, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 4 }}>
            {LOCALES.map(l => (
              <button key={l.code} onClick={() => { setOpen(false); void setLocale(l.code) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: l.code === locale ? 'rgba(30,207,184,0.12)' : 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: l.code === locale ? 600 : 400, textAlign: 'start' }}>
                {l.flag} {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
