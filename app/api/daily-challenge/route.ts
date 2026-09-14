import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { questionBankKey } from '@/lib/question-bank'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) as any

function today() {
  return new Date().toISOString().slice(0, 10)
}

function shuffled<T>(items: T[]) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

async function authenticate(request: NextRequest) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return null
  const { data: { user }, error } = await db.auth.getUser(token)
  return error || !user ? null : user
}

async function getProfile(userId: string) {
  const { data } = await db.from('profiles').select('grade,language').eq('id', userId).maybeSingle()
  return data || { grade: 'Ortaokul 6. sınıf', language: 'Türkçe' }
}

async function selectPersonalizedQuestions(userId: string, profile: any) {
  const gradeKey = questionBankKey(profile.grade || 'Ortaokul 6. sınıf')
  const isSixthGrade = gradeKey.includes('6')
  const subjectKey = isSixthGrade ? 'fen bilimleri' : questionBankKey(profile.subject || 'genel')
  const languageKey = questionBankKey(profile.language || 'Türkçe')

  const [{ data: mastery }, { data: weakTopics }, { data: bank, error }] = await Promise.all([
    db.from('student_mastery').select('topic,mastery_score').eq('student_id', userId).eq('learning_objective_key', '').order('mastery_score', { ascending: true }).limit(8),
    db.from('weak_topics').select('topic,wrong_count,total_count').eq('user_id', userId).order('wrong_count', { ascending: false }).limit(8),
    db.from('question_bank').select('id,question,topic_key,use_count,last_used_at')
      .eq('subject_key', subjectKey).eq('grade_key', gradeKey).eq('language_key', languageKey)
      .eq('review_status', 'approved').eq('report_count', 0)
      .order('use_count', { ascending: true }).order('last_used_at', { ascending: true, nullsFirst: true }).limit(100),
  ])
  if (error) throw error

  const priority = new Set<string>([
    ...(mastery || []).filter((row: any) => Number(row.mastery_score) < 70).map((row: any) => questionBankKey(row.topic)),
    ...(weakTopics || []).map((row: any) => questionBankKey(row.topic)),
  ])
  const ordered = [...(bank || [])].sort((a: any, b: any) => {
    const aPriority = priority.has(a.topic_key) ? 0 : 1
    const bPriority = priority.has(b.topic_key) ? 0 : 1
    return aPriority - bPriority
  })
  const selected = shuffled(ordered.slice(0, Math.min(40, ordered.length))).slice(0, 10)
  if (selected.length < 10) return null
  return selected.map((row: any) => ({ ...row.question, bankQuestionId: row.id, bankTopic: row.topic_key }))
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const profile = await getProfile(user.id)
  const date = today()

  const { data: existing } = await db.from('daily_challenges').select('*').eq('user_id', user.id).eq('date', date).maybeSingle()
  if (existing) return NextResponse.json({ challenge: existing, streak: await getStreak(user.id) })

  const questions = await selectPersonalizedQuestions(user.id, profile)
  if (!questions) return NextResponse.json({ error: 'Günlük görev için yeterli onaylı soru yok.' }, { status: 503 })
  const topics = [...new Set(questions.map((question: any) => question.bankTopic).filter(Boolean))]
  const { data: challenge, error } = await db.from('daily_challenges').insert({
    user_id: user.id, date, topic: 'Fen Bilimleri · Karma', subject: 'Fen Bilimleri', grade_level: questionBankKey(profile.grade || 'Ortaokul 6. sınıf'),
    questions, question_type: 'mixed', completed: false,
  }).select('*').single()
  if (error) {
    const { data: raced } = await db.from('daily_challenges').select('*').eq('user_id', user.id).eq('date', date).maybeSingle()
    if (raced) return NextResponse.json({ challenge: raced, streak: await getStreak(user.id) })
    return NextResponse.json({ error: 'Günlük görev oluşturulamadı.' }, { status: 500 })
  }
  return NextResponse.json({ challenge: { ...challenge, topics }, streak: await getStreak(user.id) })
}

async function getStreak(userId: string) {
  const { data } = await db.from('streaks').select('*').eq('user_id', userId).maybeSingle()
  return data || { current_streak: 0, longest_streak: 0, total_points: 0, last_activity_date: null }
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const challengeId = String(body.challengeId || '')
  const answers = Array.isArray(body.answers) ? body.answers : []
  const { data: challenge } = await db.from('daily_challenges').select('*').eq('id', challengeId).eq('user_id', user.id).maybeSingle()
  if (!challenge) return NextResponse.json({ error: 'Görev bulunamadı.' }, { status: 404 })
  if (challenge.completed) return NextResponse.json({ score: null, alreadyCompleted: true, streak: await getStreak(user.id) })
  const questions = Array.isArray(challenge.questions) ? challenge.questions : []
  const normalized = questions.map((question: any, index: number) => ({
    userAns: Number(answers[index]?.userAns ?? -1),
    correct: Number(answers[index]?.userAns ?? -1) === Number(question.ans),
  }))
  const score = normalized.filter((answer: any) => answer.correct).length
  const pct = questions.length ? Math.round(score / questions.length * 100) : 0
  const date = today()
  await db.from('quiz_sessions').insert({ user_id: user.id, topic: challenge.topic, grade: (await getProfile(user.id)).grade, language: 'Türkçe', question_count: questions.length, questions, answers: normalized, score, pct, completed: true, is_daily: true, question_type: 'mixed' })
  await db.from('daily_challenges').update({ completed: true }).eq('id', challenge.id).eq('user_id', user.id)

  const current = await getStreak(user.id)
  const yesterday = new Date(); yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  const yesterdayKey = yesterday.toISOString().slice(0, 10)
  const nextStreak = current.last_activity_date === date ? current.current_streak : current.last_activity_date === yesterdayKey ? current.current_streak + 1 : 1
  const streakPayload = { current_streak: nextStreak, longest_streak: Math.max(nextStreak, current.longest_streak || 0), total_points: (current.total_points || 0) + 10, last_activity_date: date }
  await db.from('streaks').upsert({ user_id: user.id, ...streakPayload }, { onConflict: 'user_id' })
  return NextResponse.json({ score, pct, streak: { ...current, ...streakPayload } })
}
