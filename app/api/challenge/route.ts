import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getIdentityBySupabaseId, getIdentitiesBySupabaseIds } from '@/lib/identity/client'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Challenge oluştur — mevcut quiz session'ından
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { session_id } = await req.json()

  // Kaynak quiz session'ı çek
  const { data: session } = await supabase
    .from('quiz_sessions')
    .select('topic, questions, score, pct, question_count, grade, language, question_type')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .eq('completed', true)
    .single()

  if (!session) return NextResponse.json({ error: 'Tamamlanmış quiz bulunamadı.' }, { status: 404 })

  const shareCode = Math.random().toString(36).substring(2, 10).toUpperCase()
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 gün geçerli

  const { data: challenge } = await supabase.from('challenges').insert({
    creator_id: user.id,
    source_session_id: session_id,
    topic: session.topic,
    questions: session.questions,
    question_count: session.question_count,
    creator_score: session.score,
    creator_pct: session.pct,
    share_code: shareCode,
    expires_at: expiresAt.toISOString(),
  }).select('id,share_code').single()

  const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://pratium.com'}/challenge/${challenge?.share_code}`
  return NextResponse.json({ challengeId: challenge?.id, shareCode: challenge?.share_code, shareUrl })
}

// Challenge bilgisi getir (paylaşılan link için)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  if (!code) return NextResponse.json({ error: 'Kod gerekli.' }, { status: 400 })

  const { data: challenge } = await supabase
    .from('challenges')
    .select('id,topic,question_count,creator_pct,expires_at,creator_id')
    .eq('share_code', code)
    .gte('expires_at', new Date().toISOString())
    .single()

  if (!challenge) return NextResponse.json({ error: 'Challenge bulunamadı veya süresi dolmuş.' }, { status: 404 })

  // Oluşturanın adı TR-PG'den (istemci ile uyumlu profiles.name şekli korunur)
  const creatorIdentity = await getIdentityBySupabaseId(challenge.creator_id)

  // Katılımcı sayısı
  const { count } = await supabase
    .from('challenge_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('challenge_id', challenge.id)

  return NextResponse.json({ ...challenge, profiles: { name: creatorIdentity?.full_name ?? null }, participant_count: count || 0 })
}

// Challenge cevapla — sonuç kaydet
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { challenge_id, score, pct } = await req.json()

  await supabase.from('challenge_attempts').upsert({
    challenge_id,
    user_id: user.id,
    score,
    pct,
    completed_at: new Date().toISOString(),
  }, { onConflict: 'challenge_id,user_id' })

  // Liderboard — tüm katılımcılar (isim TR-PG'den, avatar Supabase'den)
  const { data: attempts } = await supabase
    .from('challenge_attempts')
    .select('user_id, pct, score, profiles(avatar_url)')
    .eq('challenge_id', challenge_id)
    .order('pct', { ascending: false })
    .limit(10)

  const attemptIdentities = await getIdentitiesBySupabaseIds((attempts ?? []).map((a: any) => a.user_id))
  const leaderboard = (attempts ?? []).map((a: any) => ({
    ...a,
    profiles: { name: attemptIdentities[a.user_id]?.full_name ?? null, avatar_url: a.profiles?.avatar_url ?? null },
  }))

  return NextResponse.json({ leaderboard })
}
