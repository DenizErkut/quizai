'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@/lib/user-context'
import { useT } from '@/lib/i18n/I18nProvider'
import PanelLanguageSwitch from '@/components/PanelLanguageSwitch'
import { SIDEBAR_WIDTH } from '@/components/StudentSidebar'

// Öğretmen, veli, kurum ve yönetici panelleri için ortak sol menü. Her panel kendi sekme durumunu verir;
// öğe ya sekme değiştirir (onClick) ya da sayfaya gider (href). Masaüstünde sabit sol sütun, mobilde ☰ ile çekmece.
export type PanelItem = {
  key: string
  label: string                 // başında emoji olabilir: "📊 Dashboard"
  href?: string
  onClick?: () => void
  active?: boolean
  badge?: string
  group?: string                // grup değişince ince ayırıcı çizilir
}

const EMOJI_LEAD = /^((?:\p{Extended_Pictographic}|‍|️)+)\s*/u
function splitLabel(label: string): { icon: string; text: string } {
  const match = label.match(EMOJI_LEAD)
  return match ? { icon: match[1], text: label.slice(match[0].length) } : { icon: '•', text: label }
}

export const PANEL_TOGGLE_EVENT = 'pratium:toggle-panel-sidebar'

export default function PanelSidebar({ title, name, items, onSignOut, extraBottom }: {
  title: string; name?: string; items: PanelItem[]; onSignOut: () => void; extraBottom?: React.ReactNode
}) {
  const { t } = useT()
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const { isApprovedTeacher, isParent, isInstitution } = useUser()
  // Çok rollü hesaplar (ör. öğretmen + veli) için paneller arası geçiş.
  const switchLinks = [
    isApprovedTeacher && !pathname.startsWith('/teacher') ? { href: '/teacher', label: '🎓 Öğretmen paneline geç' } : null,
    isParent && !pathname.startsWith('/parent') ? { href: '/parent', label: '👨‍👩‍👧 Veli paneline geç' } : null,
    isInstitution && !pathname.startsWith('/institution') ? { href: '/institution', label: '🏛️ Kurum paneline geç' } : null,
  ].filter((x): x is { href: string; label: string } => !!x)

  useEffect(() => {
    document.body.classList.add('has-panel-sidebar')
    return () => document.body.classList.remove('has-panel-sidebar')
  }, [])
  useEffect(() => {
    const toggle = () => setOpen(value => !value)
    window.addEventListener(PANEL_TOGGLE_EVENT, toggle)
    return () => window.removeEventListener(PANEL_TOGGLE_EVENT, toggle)
  }, [])

  return (
    <>
      <style>{`
        .pn-root{position:fixed;top:0;left:0;bottom:0;width:${SIDEBAR_WIDTH}px;z-index:1100;display:flex;flex-direction:column;background:#29483d;color:#fff;overflow-y:auto;overscroll-behavior:contain;box-shadow:4px 0 24px rgba(20,40,32,.18);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
        .pn-bar{display:none}
        .pn-scrim{display:none}
        @media (max-width:768px){
          .pn-bar{display:flex;position:fixed;top:0;left:0;right:0;height:56px;z-index:1000;align-items:center;gap:10px;padding:0 12px;background:#29483d;box-shadow:0 2px 12px rgba(8,36,101,.3)}
          .pn-root{top:56px;transform:translateX(-102%);transition:transform .22s ease;width:min(86vw,${SIDEBAR_WIDTH + 24}px)}
          .pn-root.open{transform:none}
          .pn-scrim.open{display:block;position:fixed;inset:56px 0 0 0;z-index:1090;background:rgba(10,20,16,.5)}
          .pn-logo{display:none!important}
          body.has-panel-sidebar .app-content{padding-top:56px}
        }
        .pn-link{display:flex;align-items:center;gap:12px;width:calc(100% - 20px);padding:10px 14px;margin:2px 10px;border-radius:12px;border:0;background:transparent;font:inherit;font-size:14px;font-weight:600;color:rgba(255,255,255,.86);text-decoration:none;white-space:nowrap;cursor:pointer;text-align:left;transition:background .15s}
        .pn-link:hover{background:rgba(255,255,255,.1);color:#fff}
        .pn-link.active{background:#1b3329;color:#fff;box-shadow:inset 4px 0 0 #f2b94b}
        .pn-icon{width:22px;text-align:center;font-size:17px;flex:0 0 auto}
        .pn-sep{height:1px;margin:8px 18px;background:rgba(255,255,255,.12)}
        .pn-badge{margin-left:auto;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:#f2b94b;color:#29483d}
        body.has-panel-sidebar .app-content{margin-left:0}
        @media (min-width:769px){body.has-panel-sidebar .app-content{margin-left:${SIDEBAR_WIDTH}px}}
      `}</style>
      <div className="pn-bar">
        <button aria-label={t('Menüyü aç')} onClick={() => setOpen(value => !value)} style={{ width: 38, height: 38, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
        <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: 28, filter: 'brightness(0) invert(1)' }} />
        <span style={{ color: 'rgba(255,255,255,.75)', fontSize: 13, fontWeight: 600, marginLeft: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</span>
      </div>
      <div className={`pn-scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`pn-root${open ? ' open' : ''}`} aria-label={title}>
        <Link href="/home" className="pn-logo" style={{ display: 'block', padding: '14px 20px 0' }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: 56, width: 'auto', filter: 'brightness(0) invert(1)' }} />
        </Link>
        <div style={{ padding: '14px 20px 10px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase', color: 'rgba(255,255,255,.55)' }}>{title}</div>
          {name && <div style={{ fontWeight: 800, fontSize: 16, marginTop: 4, overflowWrap: 'anywhere' }}>{name}</div>}
        </div>
        <nav style={{ flex: 1, paddingBottom: 10 }}>
          {items.map((item, index) => {
            const { icon, text } = splitLabel(item.label)
            const cls = `pn-link${item.active ? ' active' : ''}`
            const inner = (<><span className="pn-icon">{icon}</span><span>{text}</span>{item.badge && <span className="pn-badge">{item.badge}</span>}</>)
            const separator = index > 0 && item.group !== undefined && item.group !== items[index - 1].group
            return (
              <div key={item.key}>
                {separator && <div className="pn-sep" />}
                {item.href
                  ? <Link href={item.href} className={cls} onClick={() => setOpen(false)}>{inner}</Link>
                  : <button className={cls} aria-current={item.active ? 'page' : undefined} onClick={() => { item.onClick?.(); setOpen(false) }}>{inner}</button>}
              </div>
            )
          })}
          {switchLinks.length > 0 && (<>
            <div className="pn-sep" />
            {switchLinks.map(l => { const { icon, text } = splitLabel(l.label); return (
              <Link key={l.href} href={l.href} className="pn-link" onClick={() => setOpen(false)}><span className="pn-icon">{icon}</span><span>{t(l.label).replace(icon, '').trim() || text}</span></Link>
            ) })}
          </>)}
        </nav>
        <div style={{ padding: '8px 14px 16px', display: 'grid', gap: 8 }}>
          {extraBottom}
          <PanelLanguageSwitch />
          <button className="pn-link" onClick={onSignOut} style={{ margin: 0, width: '100%', background: 'rgba(255,255,255,.07)' }}>
            <span className="pn-icon">⎋</span><span>{t('Çıkış')}</span>
          </button>
        </div>
      </aside>
    </>
  )
}
