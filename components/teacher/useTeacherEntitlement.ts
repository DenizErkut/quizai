'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type TeacherEntitlementView = {
  tier: 'full' | 'limited'
  source: string
  qualifyingStudents: number
  inviteTarget: number
  expiresAt: string | null
  usage: { aiTotal: number; liveThisMonth: number }
  limits: { aiGenerations: number; liveQuizzesPerMonth: number; dashboardStudents: number }
}

export const LOCKED_MESSAGE = '🔒 PDF/basılı çıktı ve kâğıt içe aktarma Altın üyelikte açıktır. 10 öğrencin yıllık Altın üyelik alırsa 1 yıl ücretsiz Altın olursun.'

export function useTeacherEntitlement() {
  const [entitlement, setEntitlement] = useState<TeacherEntitlementView | null>(null)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.access_token) return
        const res = await fetch('/api/teacher/entitlement', { headers: { Authorization: `Bearer ${session.access_token}` } })
        const data = await res.json().catch(() => null)
        if (!cancelled && res.ok && data?.entitlement) setEntitlement(data.entitlement)
      } catch { /* banner is optional; server routes enforce the policy */ }
    })()
    return () => { cancelled = true }
  }, [])
  return { entitlement, limited: entitlement?.tier === 'limited' }
}
