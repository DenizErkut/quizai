'use client'
// components/ThemeToggleFloating.tsx
//
// Navbar zaten kendi tema (ışık/karanlık) düğmesini gösteriyor — ama SADECE
// bir profil (giriş yapılmış kullanıcı) varken (bkz. Navbar.tsx: `if
// (!profile) return null`). Anasayfa, /login, /register gibi herkese açık
// sayfalarda Navbar hiç render edilmiyor, dolayısıyla tema değiştirme
// imkanı da hiç görünmüyordu.
//
// Bu bileşen SADECE profil yokken (Navbar'ın görünmediği durumda) devreye
// girer ve sağ üst köşede sabit bir ampul ikonu gösterir. Aynı localStorage
// anahtarını (`pratium-theme`) ve `data-theme` attribute'unu kullanır,
// böylece Navbar'daki mantıkla tam tutarlıdır — kullanıcı giriş yapıp
// Navbar göründüğünde seçtiği tema aynen korunur.
import { useEffect, useState } from 'react'
import { useUser } from '@/lib/user-context'
import LightbulbIcon from '@/components/LightbulbIcon'

export default function ThemeToggleFloating() {
  const { profile } = useUser()
  const [isDark, setIsDark] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('pratium-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDark(stored === 'dark' || (!stored && prefersDark))
    setMounted(true)
  }, [])

  function toggleDark() {
    const next = !isDark
    setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('pratium-theme', next ? 'dark' : 'light')
  }

  if (!mounted || profile) return null

  return (
    <button
      onClick={toggleDark}
      aria-label={isDark ? 'Aydınlık moda geç' : 'Karanlık moda geç'}
      title={isDark ? 'Aydınlık mod' : 'Karanlık mod'}
      style={{
        position: 'fixed', top: '16px', right: '16px', zIndex: 9997,
        width: 42, height: 42, borderRadius: '50%',
        background: 'var(--bg)', border: '1.5px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', boxShadow: 'var(--shadow)',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.08)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = '' }}
    >
      <LightbulbIcon isDark={isDark} />
    </button>
  )
}
