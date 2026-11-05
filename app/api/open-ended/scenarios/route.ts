// Öğrencinin sınıfı için yayınlanmış açık uçlu senaryo kartları: ders + dönem + senaryo numarası.
// Her kart yöneticinin yüklediği örneklere dayanır; öğrenci başlatınca yapay zeka benzer yeni bir senaryo üretir.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { getAuthedUser } from '@/lib/report-context'
import { gradeNumberOf } from '@/lib/written-exam'
import { DEFAULT_COUNTRY } from '@/lib/location/resource-scope'
import { scenarioLabel } from '@/lib/open-ended-scenarios'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const user = await getAuthedUser(req)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('grade,country').eq('id', user.id).maybeSingle()
  const gradeNumber = gradeNumberOf(profile?.grade)
  if (!gradeNumber) return NextResponse.json({ cards: [], needsGrade: true })
  const country = (profile?.country || DEFAULT_COUNTRY).toUpperCase()
  const { data: rows } = await db.from('open_ended_scenario_examples').select('subject,term,scenario_no')
    .eq('status', 'published').eq('grade_number', gradeNumber).eq('country', country).limit(2000)
  const cards = new Map<string, { subject: string; term: number; scenarioNo: number; exampleCount: number }>()
  for (const row of rows || []) {
    const key = `${row.subject.toLocaleLowerCase('tr')}|${row.term}|${row.scenario_no}`
    const card = cards.get(key)
    if (card) card.exampleCount++
    else cards.set(key, { subject: row.subject, term: row.term, scenarioNo: row.scenario_no, exampleCount: 1 })
  }
  const list = [...cards.values()].sort((a, b) => a.subject.localeCompare(b.subject, 'tr') || a.term - b.term || a.scenarioNo - b.scenarioNo)
  // Öğrencinin bu kartlardaki geçmişi: çözülen deneme sayısı ve en yüksek puan.
  const { data: sessions } = list.length
    ? await db.from('open_ended_sessions').select('subject,topic,total_earned,total_possible,question_index').eq('user_id', user.id).not('graded_at', 'is', null).in('topic', [...new Set(list.map(card => scenarioLabel(card.term, card.scenarioNo)))])
    : { data: [] as Array<{ subject: string; topic: string; total_earned: number | null; total_possible: number | null; question_index: number | null }> }
  return NextResponse.json({
    cards: list.map(card => {
      const mine = (sessions || []).filter(s => s.topic === scenarioLabel(card.term, card.scenarioNo) && s.subject.toLocaleLowerCase('tr') === card.subject.toLocaleLowerCase('tr'))
      const best = mine.reduce((max, s) => Math.max(max, Number(s.total_earned) || 0), 0)
      // Çözülen soru sayısı: bu senaryonun farklı soru sıralarından en az biri puanlanmış olanlar.
      const solved = new Set(mine.map(s => s.question_index).filter((n): n is number => typeof n === 'number'))
      let nextIndex = 0
      while (solved.has(nextIndex) && nextIndex < card.exampleCount) nextIndex++
      return { ...card, questionCount: card.exampleCount, solvedQuestions: Math.min(solved.size, card.exampleCount), nextIndex: nextIndex >= card.exampleCount ? 0 : nextIndex, label: scenarioLabel(card.term, card.scenarioNo), attempts: mine.length, bestScore: mine.length ? best : null, total: mine[0]?.total_possible ?? 100 }
    }),
  })
}
