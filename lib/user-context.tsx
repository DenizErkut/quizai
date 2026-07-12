'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

interface UserData {
  user: any | null
  profile: {
    name: string
    plan: string
    monthly_test_count: number
    language: string
    referral_code: string | null
    avatar_url: string | null
    role: string | null
  } | null
  streak: number
  unreadCount: number
  isTeacher: boolean
  isApprovedTeacher: boolean
  isParent: boolean
  isInstitution: boolean
  loading: boolean
}

interface UserContextValue extends UserData {
  refresh: () => Promise<void>
  updateLanguage: (lang: string) => Promise<void>
  setUnreadCount: (n: number) => void
}

const UserContext = createContext<UserContextValue | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<UserData>({
    user: null,
    profile: null,
    streak: 0,
    unreadCount: 0,
    isTeacher: false,
    isApprovedTeacher: false,
    isParent: false,
    isInstitution: false,
    loading: true,
  })

  const supabase = createClient() as any

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) {
        setData(d => ({ ...d, user: null, profile: null, loading: false }))
        return
      }

      // Tek Promise.all — Supabase (davranış verisi) + TR-PG (kimlik) paralel
      // İsim artık profiles'ta değil; TR-PG'den /api/identity/resolve ile gelir.
      const [
        { data: profile },
        { data: streak },
        { data: teacher },
        { count: parentCount },
        { count: unread },
        identityRes,
      ] = await Promise.all([
        supabase.from('profiles').select('plan,monthly_test_count,language,referral_code,avatar_url,role').eq('id', user.id).maybeSingle(),
        supabase.from('streaks').select('current_streak').eq('user_id', user.id).maybeSingle(),
        supabase.from('teachers').select('approved').eq('user_id', user.id).maybeSingle(),
        supabase.from('parent_children').select('id', { count: 'exact', head: true }).eq('parent_id', user.id),
        supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
        fetch('/api/identity/resolve', {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [user.id] }),
        }).then(r => r.ok ? r.json() : { identities: {} }).catch(() => ({ identities: {} })),
      ])

      const fullName = identityRes?.identities?.[user.id]?.full_name || ''
      const role = profile?.role || 'student'
      setData({
        user,
        profile: profile ? { ...profile, name: fullName } : (fullName ? { name: fullName } as any : null),
        streak: streak?.current_streak || 0,
        unreadCount: unread || 0,
        isTeacher: !!teacher,
        isApprovedTeacher: teacher?.approved === true,
        isParent: (parentCount || 0) > 0,
        isInstitution: role === 'institution',
        loading: false,
      })
    } catch {
      setData(d => ({ ...d, loading: false }))
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auth değişikliklerini dinle
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') load()
    })
    return () => subscription.unsubscribe()
  }, [load])

  const updateLanguage = async (lang: string) => {
    setData(d => ({ ...d, profile: d.profile ? { ...d.profile, language: lang } : null }))
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('profiles').update({ language: lang }).eq('id', user.id)
  }

  const setUnreadCount = (n: number) => setData(d => ({ ...d, unreadCount: n }))

  return (
    <UserContext.Provider value={{ ...data, refresh: load, updateLanguage, setUnreadCount }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
