export type EvidenceAttempt = { stage: string; status: string; quiz_session_id: string | null; score_pct: number | null; completed_at: string | null }
export type EvidenceReview = { pre_session_id: string; post_session_id: string; transfer_session_id: string | null; reviewed_at: string | null; transfer_reviewed_at: string | null; transfer_score_pct: number | string | null }
export type SupportPractice = { status: string; hint_count: number; first_choice: number | null; retry_choice: number | null; question: Record<string, unknown> }

/** A score is an observation. Mastery is an operational threshold, never a calibrated probability. */
export function verifiedLearningMetrics(attempts: EvidenceAttempt[], reviews: EvidenceReview[], practice?: SupportPractice | null) {
  const complete = (stage: string) => attempts.find(a => a.stage === stage && a.status === 'completed' && a.quiz_session_id && a.completed_at)
  const baseline = complete('baseline'), post = complete('post'), transfer = complete('transfer')
  const review = baseline && post && transfer ? reviews.find(r => r.pre_session_id === baseline.quiz_session_id
    && r.post_session_id === post.quiz_session_id && r.transfer_session_id === transfer.quiz_session_id
    && r.reviewed_at && r.transfer_reviewed_at) : undefined
  const delayHours = post && transfer ? (Date.parse(transfer.completed_at!) - Date.parse(post.completed_at!)) / 3600000 : null
  const reviewedScore = review?.transfer_score_pct == null ? null : Number(review.transfer_score_pct)
  const verified = Boolean(review && delayHours !== null && delayHours >= 24 && Number.isFinite(reviewedScore)
    && reviewedScore === transfer?.score_pct && reviewedScore! >= 0 && reviewedScore! <= 100)
  const assisted = practice?.status === 'completed' ? practice : null
  return {
    policyVersion: 'verified-learning-metrics-v1',
    baselineScorePct: baseline?.score_pct ?? null,
    postScorePct: post?.score_pct ?? null,
    transferScorePct: transfer?.score_pct ?? null,
    verifiedTransferScorePct: verified ? reviewedScore : null,
    verifiedMastery: verified ? reviewedScore! >= 80 : null,
    masteryThresholdPct: 80,
    transferDelayHours: delayHours == null || !Number.isFinite(delayHours) ? null : Math.round(delayHours * 10) / 10,
    support: assisted ? { hintCount: assisted.hint_count, firstAttemptCorrect: assisted.first_choice === assisted.question.ans,
      retryCorrect: assisted.retry_choice === assisted.question.ans, hintUsed: assisted.hint_count > 0 } : null,
    note: 'Doğrulanmış aktarım puanı yalnız öğretmen incelemesi tamamlanan, en az 24 saat gecikmeli yardımsız testten gelir. %80 eşiği ürün ölçütüdür; kalibre edilmiş beceri olasılığı değildir. İpucu kullanımı gözlemdir, psikolojik bağımlılık skoru değildir.',
  }
}
