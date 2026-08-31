// components/PageHeader.tsx
// Okulyo stilinde ortak sayfa başlığı — tüm iç sayfalarda kullanılır
'use client'
import Link from 'next/link'

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: string
  backHref?: string
  backLabel?: string
  color?: string      // gradient rengi (varsayılan: lacivert-teal)
  badge?: string
  badgeColor?: string
  action?: React.ReactNode
  stats?: { label: string; value: string | number }[]
}

export default function PageHeader({
  title, subtitle, icon, backHref, backLabel,
  color, badge, badgeColor, action, stats,
}: PageHeaderProps) {
  const gradFrom = '#29483d'
  const gradTo   = color || '#4c7d6b'

  return (
    <div style={{
      background: `linear-gradient(135deg, ${gradFrom} 0%, ${gradTo} 100%)`,
      padding: '1.75rem 1.5rem 2.5rem',
      position: 'relative', overflow: 'hidden',
      marginBottom: '0',
    }}>
      {/* Dekoratif daireler */}
      <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: -20, left: -20, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.04)', pointerEvents: 'none' }} />

      <div style={{ maxWidth: '1040px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Geri linki */}
        {backHref && (
          <Link href={backHref} style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            fontSize: '12px', color: 'rgba(255,255,255,0.65)',
            marginBottom: '10px', textDecoration: 'none',
            transition: 'color 0.15s',
          }}>
            ← {backLabel || 'Geri'}
          </Link>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              {icon && <span style={{ fontSize: '24px' }}>{icon}</span>}
              <h1 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(22px, 3vw, 30px)', fontWeight: 800, color: '#fff', lineHeight: 1.2,
              }}>{title}</h1>
              {badge && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '99px',
                  background: badgeColor || 'rgba(242,185,75,0.22)',
                  color: badgeColor ? '#fff' : '#ffd77f',
                  border: '1px solid rgba(242,185,75,0.4)',
                }}>
                  {badge}
                </span>
              )}
            </div>
            {subtitle && (
              <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)', marginTop: '2px' }}>{subtitle}</p>
            )}
          </div>
          {action && <div>{action}</div>}
        </div>

        {/* Stat'lar */}
        {stats && stats.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
            {stats.map((s, i) => (
              <div key={i} style={{
                padding: '7px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.12)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.15)',
              }}>
                <span style={{ fontSize: '14px', fontWeight: 800, color: '#fff' }}>{s.value}</span>
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)', marginLeft: '5px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
