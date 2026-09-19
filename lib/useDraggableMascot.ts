'use client'
// lib/useDraggableMascot.ts — CoachMascot.tsx (Profesör Prati) ve
// AIChatBot.tsx (Pratium Asistan) için paylaşılan "taşınabilir + geçici
// kapatılabilir maskot" hook'u.
//
// 19 Eylül 2026 — Deniz'in isteği: "her iki maskotta kapatılabilir ve
// taşınabilir olsun. yani kullanıcı istediğinde maskotların yerini
// değiştirebilsin veya kapatsın geçici olarak."
//
// - Konum (sürükle-bırak ile taşıma): localStorage'da saklanır — kalıcı bir
//   tercih, bu tarayıcı/cihaz için. `${key}_pos`.
// - Kapatma: sessionStorage'da saklanır — GEÇİCİ, sekme/tarayıcı kapanınca
//   sıfırlanır ve maskot bir sonraki oturumda tekrar görünür. `${key}_hidden`.
// - Kullanıcı bir kez konumunu değiştirdiyse, o andan sonra ilk-tanıtım
//   baloncuğu (intro bubble) bir daha gösterilmiyor — zaten maskotla
//   etkileşime girmiş demektir (bkz. tüketen bileşenlerdeki `!pos` şartı).
import { useCallback, useEffect, useRef, useState } from 'react'

export interface DragPos { x: number; y: number }
export interface FabRect { top: number; left: number; width: number; height: number }

export function useDraggableMascot(key: string, size: number) {
  const [pos, setPos] = useState<DragPos | null>(null)
  const [hidden, setHidden] = useState(false)
  const [fabRect, setFabRect] = useState<FabRect | null>(null)

  const elRef = useRef<any>(null)
  const posRef = useRef<DragPos | null>(null)
  const draggingRef = useRef(false)
  const movedRef = useRef(false)
  const startRef = useRef({ pointerX: 0, pointerY: 0, baseX: 0, baseY: 0 })

  const clamp = useCallback((p: DragPos): DragPos => {
    if (typeof window === 'undefined') return p
    const maxX = Math.max(8, window.innerWidth - size - 8)
    const maxY = Math.max(8, window.innerHeight - size - 8)
    return { x: Math.min(Math.max(p.x, 8), maxX), y: Math.min(Math.max(p.y, 8), maxY) }
  }, [size])

  const measure = useCallback(() => {
    if (elRef.current) {
      const r = elRef.current.getBoundingClientRect()
      setFabRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
  }, [])

  // İlk yükleme: kayıtlı konum ve "geçici kapatıldı mı" durumunu oku.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${key}_pos`)
      if (raw) {
        const p = clamp(JSON.parse(raw))
        posRef.current = p
        setPos(p)
      }
    } catch {}
    try {
      if (sessionStorage.getItem(`${key}_hidden`) === '1') setHidden(true)
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure, pos, hidden])

  function onPointerDown(e: React.PointerEvent) {
    const el = e.currentTarget as HTMLElement
    try { el.setPointerCapture(e.pointerId) } catch {}
    draggingRef.current = true
    movedRef.current = false
    const rect = el.getBoundingClientRect()
    startRef.current = { pointerX: e.clientX, pointerY: e.clientY, baseX: rect.left, baseY: rect.top }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!draggingRef.current) return
    const dx = e.clientX - startRef.current.pointerX
    const dy = e.clientY - startRef.current.pointerY
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) movedRef.current = true
    if (!movedRef.current) return
    const next = clamp({ x: startRef.current.baseX + dx, y: startRef.current.baseY + dy })
    posRef.current = next
    setPos(next)
  }

  function onPointerUp() {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (movedRef.current && posRef.current) {
      try { localStorage.setItem(`${key}_pos`, JSON.stringify(posRef.current)) } catch {}
      requestAnimationFrame(measure)
    }
  }

  function wasDragged() {
    return movedRef.current
  }

  function hide() {
    setHidden(true)
    try { sessionStorage.setItem(`${key}_hidden`, '1') } catch {}
  }

  function show() {
    setHidden(false)
    try { sessionStorage.removeItem(`${key}_hidden`) } catch {}
  }

  const style: React.CSSProperties = pos
    ? { position: 'fixed', left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : {}

  return {
    pos, style, hidden, hide, show, fabRect, elRef, measure, wasDragged,
    dragHandlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}
