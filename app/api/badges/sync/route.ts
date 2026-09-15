import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const TEST_MILESTONES = [
  { count: 1, key: 'first_test' },
  { count: 10, key: 'tests_10' },
  { count: 50, key: 'tests_50' },
  { count: 100, key: 'tests_100' },
] as const

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Oturum geçersiz.' }, { status: 401 })

  const [{ count: completedTests, error: countError }, { count: perfectTests, error: perfectError }] = await Promise.all([
    db.from('quiz_sessions').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('completed', true),
    db.from('quiz_sessions').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('completed', true).eq('pct', 100),
  ])

  if (countError || perfectError) {
    console.error('[badges/sync] session count failed', countError || perfectError)
    return NextResponse.json({ error: 'Test geçmişi okunamadı.' }, { status: 500 })
  }

  const earnedByHistory: string[] = TEST_MILESTONES
    .filter(milestone => (completedTests || 0) >= milestone.count)
    .map(milestone => milestone.key)
  if ((perfectTests || 0) > 0) earnedByHistory.push('perfect_score')

  const { data: existing, error: badgeReadError } = await db
    .from('badges')
    .select('badge_key, earned_at')
    .eq('user_id', user.id)

  if (badgeReadError) {
    console.error('[badges/sync] badge read failed', badgeReadError)
    return NextResponse.json({ error: 'Rozetler okunamadı.' }, { status: 500 })
  }

  const existingKeys = new Set((existing || []).map(row => row.badge_key))
  const missing = earnedByHistory.filter(key => !existingKeys.has(key))
  if (missing.length) {
    const { error: insertError } = await db.from('badges').insert(
      missing.map(badge_key => ({ user_id: user.id, badge_key }))
    )
    if (insertError) {
      console.error('[badges/sync] badge insert failed', insertError)
      return NextResponse.json({ error: 'Eksik rozetler kaydedilemedi.' }, { status: 500 })
    }
  }

  const { data: badges, error: finalReadError } = await db
    .from('badges')
    .select('badge_key, earned_at')
    .eq('user_id', user.id)
    .order('earned_at', { ascending: true })

  if (finalReadError) return NextResponse.json({ error: 'Rozetler yenilenemedi.' }, { status: 500 })

  return NextResponse.json({ completedTests: completedTests || 0, badges: badges || [], added: missing })
}
