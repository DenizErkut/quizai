'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useT } from '@/lib/i18n/I18nProvider'

// Öğrenci yan menüsü: masaüstünde sabit sol sütun, mobilde hamburger ile açılan çekmece.
// Menü bağlantıları eskiden üst çubukta ve avatar açılır menüsünde dağınıktı; burada gruplanmış tek yerde.
export const SIDEBAR_WIDTH = 288
export const SIDEBAR_TOGGLE_EVENT = 'pratium:toggle-sidebar'

type Icon = (props: { size?: number }) => React.ReactElement
const svg = (path: React.ReactNode): Icon => function SvgIcon({ size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
}
const ICONS = {
  home: svg(<><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></>),
  bolt: svg(<path d="M13 2 4 14h7l-1 8 9-12h-7z" />),
  target: svg(<><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" /></>),
  pen: svg(<><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="m13.5 6.5 4 4" /></>),
  doc: svg(<><path d="M7 3h8l4 4v14H7z" /><path d="M15 3v4h4M10 12h6M10 16h6" /></>),
  cal: svg(<><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></>),
  live: svg(<><circle cx="12" cy="12" r="2.2" /><path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9M4.6 4.6a10.5 10.5 0 0 0 0 14.8M19.4 4.6a10.5 10.5 0 0 1 0 14.8" /></>),
  headphones: svg(<><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></>),
  chart: svg(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>),
  plan: svg(<><path d="M9 6h11M9 12h11M9 18h11" /><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2" /></>),
  trophy: svg(<><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H4c0 3 1 4.5 4 5M16 6h4c0 3-1 4.5-4 5M12 13v4M8.5 20h7" /></>),
  classes: svg(<><path d="M3 9l9-5 9 5-9 5z" /><path d="M7 11.5V16c0 1.5 2.2 3 5 3s5-1.500 5-3v-4.500" /></>),
  tasks: svg(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 3h6v3H9zM9 12h6M9 16h4" /></>),
  archive: svg(<><rect x="3" y="4" width="18" height="5" rx="1" /><path d="M5 9v10h14V9M10 13h4" /></>),
  notes: svg(<><path d="M5 4h14v16H5z" /><path d="M9 9h6M9 13h6M9 17h3" /></>),
  tools: svg(<><path d="M14 6a4 4 0 0 0-5 5l-6 6 3 3 6-6a4 4 0 0 0 5-5l-3 3-2-2z" /></>),
  gift: svg(<><rect x="3" y="9" width="18" height="11" rx="1" /><path d="M12 9v11M3 13h18M12 9c-3 0-4-2-3-3.500S12 6 12 9zm0 0c3 0 4-2 3-3.500S12 6 12 9z" /></>),
  diamond: svg(<><path d="M6 4h12l3 5-9 11L3 9z" /><path d="M3 9h18M9 4l-1 5 4 11M15 4l1 5-4 11" /></>),
  user: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4 4.500-6 8-6s7 2 8 6" /></>),
  logout: svg(<><path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" /></>),
  close: svg(<path d="M6 6l12 12M18 6 6 18" />),
}

type Item = { href: string; label: string; icon: keyof typeof ICONS; badge?: string }
type Group = { title?: string; items: Item[] }

const GROUPS: Group[] = [
  { items: [{ href: '/home', label: 'Ana Sayfa', icon: 'home' }] },
  {
    title: 'Çalış',
    items: [
      { href: '/quiz', label: 'Anlık Test', icon: 'bolt' },
      { href: '/daily', label: 'Günlük Test', icon: 'cal' },
      { href: '/yazili', label: 'Yazılıya Hazırlanıyorum', icon: 'doc', badge: 'Yeni' },
      { href: '/acik-uclu', label: 'Açık Uçlu Sorular', icon: 'pen' },
      { href: '/exam', label: 'Sınav Simülasyonu', icon: 'target' },
      { href: '/live', label: 'Canlı Quiz', icon: 'live' },
      { href: '/reading', label: 'Sesli Kitap', icon: 'headphones' },
    ],
  },
  {
    title: 'Gelişimim',
    items: [
      { href: '/analysis', label: 'İstatistiklerim', icon: 'chart' },
      { href: '/plan', label: 'Gelişim Planı', icon: 'plan' },
      { href: '/review', label: 'Tekrar Merkezi', icon: 'bolt' },
      { href: '/leaderboard', label: 'Sıralama', icon: 'trophy' },
    ],
  },
  {
    title: 'Okul',
    items: [
      { href: '/classes', label: 'Sınıflarım', icon: 'classes' },
      { href: '/assignments', label: 'Ödevlerim', icon: 'tasks' },
    ],
  },
  {
    title: 'Araçlar',
    items: [
      { href: '/archive', label: 'Soru Arşivi', icon: 'archive' },
      { href: '/notes', label: 'Notlarım', icon: 'notes' },
      { href: '/pdf-tools', label: 'PDF Araçları', icon: 'tools' },
    ],
  },
  {
    title: 'Hesap',
    items: [
      { href: '/referral', label: 'Davet et & kazan', icon: 'gift' },
      { href: '/pricing', label: 'Planlar', icon: 'diamond' },
      { href: '/profile/edit', label: 'Profilim', icon: 'user' },
    ],
  },
]

export type SidebarProfile = { name: string; avatar_url: string | null; plan: string; grade?: string | null }

export default function StudentSidebar({ profile, streak, testsLeft, onSignOut }: {
  profile: SidebarProfile; streak: number; testsLeft: number | null; onSignOut: () => void
}) {
  const { t } = useT()
  const pathname = usePathname() || ''
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const toggle = () => setOpen(value => !value)
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, toggle)
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, toggle)
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(() => setOpen(false), 0)
    return () => window.clearTimeout(timer)
  }, [pathname])

  const planLabel = profile.plan === 'unlimited' ? t('Platin') : profile.plan === 'premium' ? t('Altın') : profile.plan === 'silver' ? t('Gümüş') : t('Ücretsiz')
  const isActive = (href: string) => href === '/home' ? pathname === '/home' : pathname === href || pathname.startsWith(href + '/')

  return (
    <>
      <style>{`
        .ss-root{position:fixed;top:90px;left:0;bottom:0;width:${SIDEBAR_WIDTH}px;z-index:1100;display:flex;flex-direction:column;background:#29483d;color:#fff;overflow-y:auto;overscroll-behavior:contain;box-shadow:4px 0 24px rgba(20,40,32,.18);scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.25) transparent}
        .ss-scrim{display:none}
        @media (max-width:768px){
          .ss-root{top:58px;transform:translateX(-102%);transition:transform .22s ease;width:min(86vw,${SIDEBAR_WIDTH + 24}px)}
          .ss-root.open{transform:none}
          .ss-scrim.open{display:block;position:fixed;inset:58px 0 0 0;z-index:1090;background:rgba(10,20,16,.5)}
        }
        .ss-link{display:flex;align-items:center;gap:12px;padding:10px 14px;margin:2px 10px;border-radius:12px;font-size:14px;font-weight:600;color:rgba(255,255,255,.86);white-space:nowrap;text-decoration:none;transition:background .15s,color .15s}
        .ss-link:hover{background:rgba(255,255,255,.1);color:#fff}
        .ss-link.active{background:#1b3329;color:#fff;box-shadow:inset 4px 0 0 #f2b94b}
        .ss-sep{height:1px;margin:8px 18px;background:rgba(255,255,255,.12)}
        .ss-badge{margin-left:auto;font-size:10px;font-weight:800;padding:2px 7px;border-radius:999px;background:#f2b94b;color:#29483d}
        .ss-stat{flex:1;text-align:center}
        .ss-stat b{display:block;font-size:17px;font-weight:800}
        .ss-stat span{font-size:10.5px;color:rgba(255,255,255,.62)}
      `}</style>
      <div className={`ss-scrim${open ? ' open' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`ss-root${open ? ' open' : ''}`} aria-label={t('Öğrenci menüsü')}>
        <Link href="/profile/edit" style={{ display: 'block', textDecoration: 'none', color: 'inherit', padding: '14px 18px 10px', textAlign: 'center' }}>
          <div style={{ width: 76, height: 76, borderRadius: '50%', margin: '0 auto 8px', overflow: 'hidden', background: '#f2b94b', color: '#29483d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 26, border: '3px solid rgba(255,255,255,.85)' }}>
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (profile.name || '?').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{profile.name}</div>
          {profile.grade && <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.7)', marginTop: 2 }}>{profile.grade}</div>}
        </Link>
        <div style={{ display: 'flex', margin: '2px 14px 8px', padding: '10px 4px', borderRadius: 14, background: 'rgba(255,255,255,.08)' }}>
          <div className="ss-stat"><b>🔥 {streak}</b><span>{t('Gün serisi')}</span></div>
          <div className="ss-stat"><b>{planLabel}</b><span>{t('Plan')}</span></div>
          <div className="ss-stat"><b>{testsLeft === null ? '∞' : Math.max(0, testsLeft)}</b><span>{t('Test hakkı')}</span></div>
        </div>

        <nav style={{ flex: 1, paddingBottom: 12 }}>
          {GROUPS.map((group, index) => (
            <div key={index}>
              {index > 0 && <div className="ss-sep" />}
              {group.items.map(item => {
                const Icon = ICONS[item.icon]
                const active = isActive(item.href)
                return (
                  <Link key={item.href} href={item.href} className={`ss-link${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined}>
                    <Icon size={20} />
                    <span>{t(item.label)}</span>
                    {item.badge && <span className="ss-badge">{t(item.badge)}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        {profile.plan !== 'premium' && profile.plan !== 'unlimited' && (
          <Link href="/pricing" style={{ display: 'block', margin: '0 10px 10px', padding: '12px 14px', borderRadius: 12, background: '#df5c3f', color: '#fff', textAlign: 'center', fontWeight: 800, fontSize: 13, letterSpacing: .4, textDecoration: 'none' }}>{t('ÜYELİĞİNİ YÜKSELT')}</Link>
        )}
        <button onClick={onSignOut} className="ss-link" style={{ margin: '0 10px 16px', border: 0, background: 'rgba(255,255,255,.07)', cursor: 'pointer', fontFamily: 'inherit', width: 'calc(100% - 20px)' }}>
          <ICONS.logout size={20} /><span>{t('Çıkış yap')}</span>
        </button>
      </aside>
    </>
  )
}
