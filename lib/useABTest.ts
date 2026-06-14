// lib/useABTest.ts
'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Session ID — login olmayan kullanıcılar için
function getSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  let sid = localStorage.getItem('ab_session_id')
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem('ab_session_id', sid)
  }
  return sid
}

interface ABTestResult {
  variant: 'control' | 'treatment' | string
  loading: boolean
  track: (eventType: 'view' | 'click' | 'conversion', metadata?: any) => void
}

export function useABTest(testName: string): ABTestResult {
  const [variant, setVariant] = useState<string>('control')
  const [loading, setLoading] = useState(true)
  const supabase = createClient() as any

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(
        `/api/ab?test=${testName}&session_id=${getSessionId()}`,
        token ? { headers: { Authorization: `Bearer ${token}` } } : {}
      )
      const data = await res.json()
      setVariant(data.variant || 'control')
      setLoading(false)

      // Otomatik view event
      track(data.variant || 'control', 'view')
    }
    load()
  }, [testName])

  async function track(v: string, eventType: string, metadata?: any) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    await fetch('/api/ab', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        test_name: testName,
        variant_id: v,
        event_type: eventType,
        metadata,
      }),
    }).catch(() => {})
  }

  return {
    variant,
    loading,
    track: (eventType, metadata) => track(variant, eventType, metadata),
  }
}
