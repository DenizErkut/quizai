// Öğretmen: Test/Quiz ödevi için onaylı soru bankasından (question_bank) soru seçer. Yapay zekâ ve kota kullanılmaz.
//   POST {grade, topic, count, questionType?} → { questions, available }
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { questionBankKey, hasRealVisualAsset } from '@/lib/question-bank'
import { bankVisualTarget } from '@/lib/visual-quota-policy'

export const runtime = 'nodejs'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 401 })
  const { data: teacher } = await db.from('teachers').select('id, approved').eq('user_id', user.id).maybeSingle()
  if (!teacher?.approved) return NextResponse.json({ error: 'Onaylı öğretmen hesabı gerekir.' }, { status: 403 })

  const body = await req.json().catch(() => null) as { grade?: string; topic?: string; count?: number; questionType?: string; difficulty?: string } | null
  const gradeNo = String(body?.grade || '').match(/\d{1,2}/)?.[0]
  const topic = String(body?.topic || '').trim()
  const count = Math.min(30, Math.max(1, Math.trunc(Number(body?.count) || 10)))
  if (!gradeNo || !topic) return NextResponse.json({ error: 'Sınıf seviyesi ve konu zorunlu.' }, { status: 400 })

  const tokens = questionBankKey(topic).split(' ').filter(word => word.length >= 4).map(word => word.slice(0, Math.max(4, word.length - 2)))
  if (!tokens.length) return NextResponse.json({ error: 'Konu en az 4 harfli bir sözcük içermeli.' }, { status: 400 })

  let request = db.from('question_bank').select('id, question, topic_key, subject_key, difficulty')
    .eq('review_status', 'approved').eq('report_count', 0)
    .or(`grade_key.ilike.* ${gradeNo} sinif,grade_key.ilike.${gradeNo} sinif,grade_key.ilike.${gradeNo} sınıf,grade_key.ilike.* ${gradeNo} sınıf`)
    .or(tokens.map(word => `topic_key.ilike.*${word.replace(/[*%,()]/g, '')}*`).join(','))
    .limit(400)
  const requestedType = String(body?.questionType || '')
  const requestedDifficulty = String(body?.difficulty || '')
  if (requestedType && requestedType !== 'mixed') request = request.eq('question_type', requestedType)
  const { data, error } = await request
  if (error) return NextResponse.json({ error: 'Havuz okunamadı.' }, { status: 500 })

  const usable = (data || []).filter(row => row.question && typeof row.question === 'object' && (row.question as { q?: unknown }).q)
  const shuffle = <T,>(list: T[]) => list.map(row => [Math.random(), row] as const).sort((a, b) => a[0] - b[0]).map(item => item[1])
  // Zorluk: 'adaptive' → %10 kolay, %60 normal, %20 zor, %10 çok zor (eksik kalan düzeyler yakın düzeylerle tamamlanır); diğerleri → seçilen düzey önce.
  const LEVELS = ['kolay', 'normal', 'zor', 'cok zor']
  const mix: Record<string, number> = requestedDifficulty === 'adaptive'
    ? { kolay: 0.1, normal: 0.6, zor: 0.2, 'cok zor': 0.1 }
    : LEVELS.includes(requestedDifficulty) ? { [requestedDifficulty]: 1 } : {}
  // Görsel kuralı (zorunlu): sayısal derslerde en az %30 (yeni nesil %50), sözel derslerde ~%10 soru gerçek görsel (şekil/grafik/tablo) taşımalı.
  const subjectCounts = new Map<string, number>()
  for (const row of usable) subjectCounts.set(String(row.subject_key || ''), (subjectCounts.get(String(row.subject_key || '')) || 0) + 1)
  const subject = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
  const newGeneration = /yeni nesil|beceri temelli|yorum gerektiren|gercek yasam|gunluk hayat/.test(questionBankKey(topic))
  const visualTarget = Math.min(count, usable.length) > 0 ? bankVisualTarget(subject, Math.min(count, usable.length), newGeneration) : 0
  const visualRows = usable.filter(row => hasRealVisualAsset(row.question as Parameters<typeof hasRealVisualAsset>[0]))
  if (visualRows.length < visualTarget) {
    return NextResponse.json({
      error: `Görsel kuralı: bu konuda en az ${visualTarget} görselli soru gerekiyor ama havuzda onaylı ${visualRows.length} görselli soru var. Ödev oluşturulmadı. "Soruları havuzdan çek" işaretini kaldırıp yapay zekâyla oluşturabilir veya havuzda görselli soruları onaylayabilirsiniz.`,
      visualRequired: visualTarget, visualFound: visualRows.length,
    }, { status: 422 })
  }
  const pickByMix = (rows: typeof usable, n: number) => {
    const byLevel = new Map<string, typeof usable>(LEVELS.map(level => [level, shuffle(rows.filter(row => String(row.difficulty || 'normal') === level))]))
    const out: typeof usable = []
    if (Object.keys(mix).length) for (const level of LEVELS) out.push(...(byLevel.get(level) || []).splice(0, Math.round((mix[level] || 0) * n)))
    const rest = shuffle(LEVELS.flatMap(level => byLevel.get(level) || []))
    return [...out, ...rest].slice(0, n)
  }
  const chosenVisual = pickByMix(visualRows, visualTarget)
  const chosenIds = new Set(chosenVisual.map(row => row.id))
  const others = pickByMix(usable.filter(row => !chosenIds.has(row.id)), count - chosenVisual.length)
  const questions = shuffle([...chosenVisual, ...others]).map(row => row.question)
  if (!questions.length) return NextResponse.json({ error: 'Bu sınıf ve konu için havuzda onaylı soru bulunamadı.', available: 0 }, { status: 404 })
  return NextResponse.json({ questions, available: usable.length, visualCount: questions.filter(q => hasRealVisualAsset(q as Parameters<typeof hasRealVisualAsset>[0])).length })
}
