// components/LightbulbIcon.tsx
// Tema (ışık/karanlık mod) düğmelerinde kullanılan paylaşılan ampul ikonu.
// isDark=false: ampul yanık (sarı, ışınlı) = "ışık modu açık"
// isDark=true:  ampul sönük (outline) = "karanlık moddasın"
export default function LightbulbIcon({
  isDark, size = 20, onColor = '#f5c800', offColor = '#94a3b8',
}: { isDark: boolean; size?: number; onColor?: string; offColor?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={isDark ? offColor : onColor} strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round">
      {!isDark && (
        <g stroke={onColor}>
          <line x1="12" y1="0.5" x2="12" y2="2.5" />
          <line x1="3.5" y1="4.5" x2="5" y2="6" />
          <line x1="20.5" y1="4.5" x2="19" y2="6" />
        </g>
      )}
      <path d="M9 19.5h6M10 22h4M12 4.5a6.5 6.5 0 0 0-4 11.6c.6.5 1 1.2 1 2v.4a.8.8 0 0 0 .8.8h4.4a.8.8 0 0 0 .8-.8v-.4c0-.8.4-1.5 1-2a6.5 6.5 0 0 0-4-11.6Z" />
    </svg>
  )
}
