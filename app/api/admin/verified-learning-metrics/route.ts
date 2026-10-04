import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, supabaseAdmin as db } from '@/lib/auth-middleware'
import { loadCyclesMetrics } from '@/lib/load-verified-learning-metrics'

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req)
  if (auth.error) return auth.error
  const { data: cycles, error, count } = await db.from('verified_learning_cycles')
    .select('id,student_id,learning_objective_id,teacher_id,classroom_id,created_at', { count:'exact' })
    .in('status',['active','completed']).order('created_at',{ascending:false}).order('id').limit(100)
  if (error) return NextResponse.json({ error:'Öğrenme döngüleri alınamadı.' },{status:503})
  // Latest student/objective cycle within the declared sample; repeats never inflate mastery.
  const seen = new Set<string>()
  const latest = (cycles || []).filter(c => {
    const key = c.student_id + ':' + c.learning_objective_id
    if (seen.has(key)) return false
    seen.add(key); return true
  })
  try {
    const metrics = await loadCyclesMetrics(db, latest)
    const reviewed = metrics.filter(m=>m.verifiedMastery !== null)
    const supported = metrics.filter(m=>m.support !== null)
    return NextResponse.json({
      policyVersion:'verified-learning-metrics-v1', totalCycles:count,
      sampledCycles:(cycles || []).length, sampleTruncated:(count || 0)>100, studentObjectivePairs:latest.length,
      reviewedPairs:reviewed.length, pendingPairs:latest.length-reviewed.length,
      verifiedMasteryCount:reviewed.filter(m=>m.verifiedMastery).length,
      verifiedMasteryRate:reviewed.length ? reviewed.filter(m=>m.verifiedMastery).length/reviewed.length : null,
      averageReviewedTransferPct:reviewed.length ? reviewed.reduce((sum,m)=>sum+m.verifiedTransferScorePct!,0)/reviewed.length : null,
      supportSessions:supported.length, sessionsUsingHints:supported.filter(m=>m.support!.hintUsed).length,
      hintUseRate:supported.length ? supported.filter(m=>m.support!.hintUsed).length/supported.length : null,
      totalHints:supported.reduce((sum,m)=>sum+m.support!.hintCount,0),
      note:'Son 100 etkin/tamamlanmış döngü; öğrenci–kazanım başına en yeni kayıt. Kazanım oranının paydası yalnız öğretmen incelemeli gecikmeli aktarım çiftleridir; bekleyenler ayrıca gösterilir. %80 ürün eşiğidir. İpucu kullanım oranı psikolojik bağımlılık veya nedensel etki ölçümü değildir.',
    })
  } catch {
    return NextResponse.json({error:'Öğrenme kanıtı eksik veya alınamadı.'},{status:503})
  }
}
