import { verifiedLearningMetrics, type EvidenceAttempt, type EvidenceReview, type SupportPractice } from './verified-learning-metrics'
import type { NextObjectivePlan } from './next-objective'

export const MASTERY_NEXT_STEP_POLICY = 'mastery-next-step-v1'
const DAY = 86400000
export type LearningStep = {
  policyVersion: string; objectiveId: string; objectiveCode: string; subject: string; topic: string;
  cycleId: string; action: 'baseline'|'guided_practice'|'post'|'transfer'|'wait'|'teacher_review'|'replan'|'verified';
  label: string; reason: string; href: string; actionable: boolean; dueAt: string|null;
  mastery: { estimate: number|null; confidence: number|null; verified: boolean|null };
  misconception: { id: string; status: 'suspected' }|null;
  intervention?:{policyVersion:string;mode:string;label:string;reason:string;teacherReviewRecommended:boolean}|null;
  nextObjective?: NextObjectivePlan|null;
}

/** Decisions use exact student/objective/cycle evidence, never a topic percentage as verification. */
export function masteryNextStep(input: {
  cycleId: string; objectiveId: string; objectiveCode: string; subject: string; topic: string;
  attempts: EvidenceAttempt[]; reviews: EvidenceReview[]; practice: SupportPractice|null;
  estimate?: number|null; confidence?: number|null; misconceptionId?: string|null; now?: number;
  nextObjective?: NextObjectivePlan|null;
}): LearningStep {
  const now = input.now ?? Date.now()
  const metrics = verifiedLearningMetrics(input.attempts, input.reviews, input.practice)
  const base = {
    policyVersion: MASTERY_NEXT_STEP_POLICY, objectiveId: input.objectiveId, objectiveCode: input.objectiveCode,
    subject: input.subject, topic: input.topic, cycleId: input.cycleId,
    mastery: { estimate: input.estimate ?? null, confidence: input.confidence ?? null, verified: metrics.verifiedMastery },
    // A projection's latest error label is a signal, not a diagnosis.
    misconception: input.misconceptionId ? { id: input.misconceptionId, status: 'suspected' as const } : null,
  }
  const step = (action: LearningStep['action'], label: string, reason: string, actionable=true, dueAt: string|null=null): LearningStep => ({
    ...base, action, label, reason, actionable, dueAt,
    href: action === 'guided_practice' ? `/koc/pratik?cycleId=${encodeURIComponent(input.cycleId)}` : `/verified-learning#cycle-${encodeURIComponent(input.cycleId)}`,
  })
  const complete = (stage: string) => input.attempts.find(a=>a.stage===stage && a.status==='completed' && a.quiz_session_id && a.completed_at)
  const baseline = complete('baseline'), post = complete('post'), transfer = complete('transfer')
  const validTimeline = [baseline,post,transfer].every(a=>!a || (Number.isFinite(Date.parse(a.completed_at!)) && Date.parse(a.completed_at!)<=now))
    && (!post || Boolean(baseline && Date.parse(post.completed_at!)-Date.parse(baseline.completed_at!)>=DAY))
    && (!transfer || Boolean(post && Date.parse(transfer.completed_at!)-Date.parse(post.completed_at!)>=DAY))
  if (!validTimeline || (post && input.practice?.status!=='completed')) {
    base.mastery.verified = null
    return step('teacher_review','Ölçüm zincirini incelet','Ölçüm sırası, zaman aralığı veya rehberli çalışma kaydı geçerli değil; öğrenme doğrulanmadı.',false)
  }
  const waitAfter = (date: string): LearningStep|null => {
    const timestamp = Date.parse(date)
    if (!Number.isFinite(timestamp)) return step('teacher_review','Ölçüm kaydını incelet','Ölçüm zamanı geçersiz; öğrenme sonucu çıkarılmadı.',false)
    if (timestamp > now) return step('teacher_review','Ölçüm kaydını incelet','Ölçüm zamanı gelecekte; kayıt kontrol edilmeli.',false)
    if (now < timestamp + DAY) return step('wait','Gecikmeli ölçümü bekle','Yardımsız ölçüm için en az 24 saatlik bekleme henüz dolmadı.',false,new Date(timestamp+DAY).toISOString())
    return null
  }
  if (!baseline) return step('baseline','Yardımsız ön testi tamamla','Önce bu kazanımda başlangıç düzeyini ölçmeliyiz; tahmini başarı öğrenme kanıtı değildir.')
  if (!Number.isFinite(Date.parse(baseline.completed_at!)) || Date.parse(baseline.completed_at!)>now || now-Date.parse(baseline.completed_at!)>90*DAY)
    return step('replan','Ölçüm döngüsünü yenilet','Ön testin ölçüm süresi geçersiz veya 90 günü aştı; öğretmenin yeni döngü hazırlamalı.',false)
  if (!post) {
    if (input.practice?.status !== 'completed') return step('guided_practice','Prof. Prati ile rehberli çalış','Ön test tamamlandı. Yanıtını, düşünme ipucunu ve gerekçeni kullanarak çalış; bu çalışma yardımsız ölçüm yerine geçmez.')
    return waitAfter(baseline.completed_at!) || step('post','Farklı sorularla son testi çöz','Rehberli çalışma tamamlandı; şimdi ipucusuz, farklı sorularla yeniden ölçüm zamanı.')
  }
  const pairedReview = input.reviews.some(r=>r.pre_session_id===baseline.quiz_session_id && r.post_session_id===post.quiz_session_id && r.reviewed_at)
  if (!pairedReview) return step('teacher_review','Öğretmen incelemesini bekle','Ön ve son test çiftinin aynı kazanımda geçerli olduğunun öğretmen tarafından incelenmesi gerekiyor.',false)
  if (!transfer) return waitAfter(post.completed_at!) || step('transfer','Yeni durumdaki aktarım testini çöz','Son testten en az 24 saat sonra farklı sorularla yardımsız aktarımı kontrol ediyoruz; son test başarısı tek başına öğrenme kanıtı değildir.')
  if (metrics.verifiedMastery === null) return step('teacher_review','Aktarım kanıtını incelet','Aktarım testi tamamlandı ancak gecikme, sunucu puanı ve öğretmen incelemesi birlikte doğrulanmadı.',false)
  if (!metrics.verifiedMastery) return step('replan','Müdahaleyi yeniden planla','Öğretmen incelemeli aktarım puanı %80 ürün eşiğinin altında. Aynı müdahaleyi otomatik tekrarlamak yerine hata nedeni ve yeni çalışma planı incelenmeli.',false)
  const next = input.nextObjective ?? null
  if (next?.status === 'baseline_required' && next.candidate)
    return {...step('verified','Yeni kazanım için başlangıç ölçümü bekleniyor',next.reason,false), nextObjective: next}
  if (next?.status === 'teacher_review')
    return {...step('verified','Sonraki kazanımı öğretmen seçmeli',next.reason,false), nextObjective: next}
  return {...step('verified','Sonraki kazanım için öğretmen planı bekleniyor','Bu döngüde öğretmen incelemeli gecikmeli aktarım %80 eşiğini karşıladı. Yeni kazanım seçimi ön koşul ve güncel başlangıç kanıtıyla yapılmalı; bu sonuç kalıcı öğrenme garantisi değildir.',false), nextObjective: next}
}
