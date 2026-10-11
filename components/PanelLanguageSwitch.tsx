'use client'
// Language picker for the dark panel navbars (teacher, parent, institution), which replace the main Navbar.
// The menu is position:fixed so the navbars' horizontal scroll container cannot clip it.
import { useRef, useState } from 'react'
import { useT } from '@/lib/i18n/I18nProvider'
import { LOCALES } from '@/lib/i18n/core'

export default function PanelLanguageSwitch() {
  const { locale, setLocale } = useT()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const active = LOCALES.find(l => l.code === locale) || LOCALES[0]

  function toggle() {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const rtl = document.documentElement.dir === 'rtl'
      setPos(rtl ? { top: rect.bottom + 6, left: Math.max(8, rect.left) } : { top: rect.bottom + 6, right: Math.max(8, window.innerWidth - rect.right) })
    }
    setOpen(o => !o)
  }

  return (
    <>
      <button ref={buttonRef} type="button" onClick={toggle} aria-label="Language" aria-expanded={open}
        style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
        <span>🌐</span><span>{active.code.toUpperCase()}</span><span style={{ fontSize: '9px', opacity: 0.7 }}>▾</span>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', zIndex: 9999, top: pos.top, left: pos.left, right: pos.right, minWidth: 160, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow)', padding: 4 }}>
            {LOCALES.map(l => (
              <button key={l.code} type="button" onClick={() => { setOpen(false); void setLocale(l.code) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: l.code === locale ? 'rgba(30,207,184,0.12)' : 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', fontWeight: l.code === locale ? 600 : 400, textAlign: 'start' }}>
                {l.code.toUpperCase()} · {l.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  )
}
