import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { verifiedQuestionInventory } from '@/lib/evidence-readiness'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const jar = await cookies()
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { get: name => jar.get(name)?.value },
  })
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Oturum gerekli.' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Yetkisiz.' }, { status: 403 })

  const [events, mappedEvents, approved, mappedBank, gain, transfers, bankRows] = await Promise.all([
    db.from('learning_events').select('id', { count: 'exact', head: true }),
    db.from('learning_events').select('id', { count: 'exact', head: true }).not('learning_objective_id', 'is', null),
    db.from('question_bank').select('id', { count: 'exact', head: true }).eq('review_status', 'approved'),
    db.from('question_bank').select('id', { count: 'exact', head: true }).eq('review_status', 'approved').not('question->>learningObjectiveId', 'is', null),
    db.from('learning_gain_measurements').select('id', { count: 'exact', head: true }),
    db.from('learning_transfer_checks').select('id', { count: 'exact', head: true }).eq('status', 'completed'),
    db.from('question_bank').select('id,question').eq('review_status', 'approved').eq('report_count', 0).not('question->>learningObjectiveId', 'is', null).limit(1000),
  ])
  if ([events, mappedEvents, approved, mappedBank, gain, transfers, bankRows].some(result => result.error)) {
    return NextResponse.json({ error: 'Kanıt hazırlık durumu alınamadı.' }, { status: 500 })
  }
  return NextResponse.json({
    observedAt: new Date().toISOString(),
    events: { total: events.count ?? 0, objectiveLinked: mappedEvents.count ?? 0 },
    bank: { approved: approved.count ?? 0, objectiveLinked: mappedBank.count ?? 0 },
    completedTransferChecks: transfers.count ?? 0,
    teacherReviewedGainMeasurements: gain.count ?? 0,
    verifiedInventory: verifiedQuestionInventory((bankRows.data || []) as Array<{ id: string; question: Record<string, unknown> }>).slice(0, 20),
    warning: 'Soru sayısı, eşit zorluk dağılımı veya farklı bağlam kanıtı tek başına değildir. Geçmiş kayıtlar tahmini olarak doğrulanmış sayılmaz.',
  })
}
