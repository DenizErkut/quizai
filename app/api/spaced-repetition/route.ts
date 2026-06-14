import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// SM-2 Spaced Repetition algoritması
// quality: 0-5 (0-1=yanlış, 2=zor doğru, 3=doğru, 4=kolay, 5=çok kolay)
function sm2(easeFactor: number, interval: number, repetitions: number, quality: number) {
  if (quality < 3) {
    // Yanlış cevap — başa dön
    return { interval: 1, repetitions: 0, easeFactor: Math.max(1.3, easeFactor - 0.2) }
  }
  let newInterval: number
  if (repetitions === 0) newInterval = 1
  else if (repetitions === 1) newInterval = 6
  else newInterval = Math.round(interval * easeFactor)

  const newEF = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  return { interval: newInterval, repetitions: repetitions + 1, easeFactor: newEF }
}

// Bugünün tekrar edilecek kartlarını getir
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const today = new Date().toISOString().split('T')[0]

  const { data: dueCards } = await supabase
    .from('spaced_repetition_cards')
    .select('*')
    .eq('user_id', user.id)
    .lte('next_review_date', today)
    .order('next_review_date', { ascending: true })
    .limit(20)

  const { count } = await supabase
    .from('spaced_repetition_cards')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .lte('next_review_date', today)

  return NextResponse.json({ cards: dueCards || [], totalDue: count || 0 })
}

// Yanlış cevaplanan soruları kart olarak ekle
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { questions, topic } = await req.json()
  // questions: [{q, opts, ans, exp, type}] — yanlış cevaplananlar

  const today_date = new Date().toISOString().split('T')[0]
  const nextReview = today_date  // Yeni kartlar bugün gösterilsin

  const cards = (questions || []).map((q: any) => ({
    user_id: user.id,
    topic,
    question: q.q,
    options: q.opts,
    correct_answer: q.ans,
    explanation: q.exp,
    question_type: q.type || 'multiple_choice',
    ease_factor: 2.5,
    interval: 1,
    repetitions: 0,
    next_review_date: nextReview,
    created_at: new Date().toISOString(),
  }))

  // Duplicate'leri atla (aynı soru zaten varsa)
  const { data: inserted } = await supabase
    .from('spaced_repetition_cards')
    .upsert(cards, { onConflict: 'user_id,question', ignoreDuplicates: true })
    .select('id')

  return NextResponse.json({ added: inserted?.length || 0 })
}

// Kart cevaplandı — SM-2 ile güncelle
export async function PATCH(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const token = authHeader.slice(7)
  const { data: { user } } = await supabase.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })

  const { card_id, quality } = await req.json()
  // quality: 0-5

  const { data: card } = await supabase
    .from('spaced_repetition_cards')
    .select('ease_factor, interval, repetitions')
    .eq('id', card_id)
    .eq('user_id', user.id)
    .single()

  if (!card) return NextResponse.json({ error: 'Kart bulunamadı.' }, { status: 404 })

  const result = sm2(card.ease_factor, card.interval, card.repetitions, quality)

  const nextReview = new Date()
  nextReview.setDate(nextReview.getDate() + result.interval)

  await supabase.from('spaced_repetition_cards').update({
    ease_factor: result.easeFactor,
    interval: result.interval,
    repetitions: result.repetitions,
    next_review_date: nextReview.toISOString().split('T')[0],
    last_reviewed_at: new Date().toISOString(),
  }).eq('id', card_id).eq('user_id', user.id)

  return NextResponse.json({ ...result, nextReview: nextReview.toISOString().split('T')[0] })
}
