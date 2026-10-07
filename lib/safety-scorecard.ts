// A dimension is only scored when there is a measurement with a numerator and
// a denominator. Everything else is reported as "not measured" with the reason;
// an unmeasured area never contributes a number to the overall score.
export type AuditRow = { policy_version: string | null; decision_summary: unknown; agent_name: string; created_at: string }
export type ApprovalRow = { status: string; created_at: string }
export type TransferRow = { status: string; created_at: string }

export type Dimension = {
  key: string; label: string; status: 'measured' | 'not_measured'; score: number | null
  numerator: number | null; denominator: number | null; lastEvidenceAt: string | null
  evidence: string[]; reason?: string
}

const latest = (rows: Array<{ created_at: string }>) => rows.reduce<string | null>((max, row) => max === null || row.created_at > max ? row.created_at : max, null)
const summary = (row: AuditRow) => (row.decision_summary ?? {}) as Record<string, unknown>

function measured(key: string, label: string, numerator: number, denominator: number, rows: Array<{ created_at: string }>, evidence: string[]): Dimension {
  return { key, label, status: 'measured', score: Math.round(100 * numerator / denominator), numerator, denominator, lastEvidenceAt: latest(rows), evidence }
}
function notMeasured(key: string, label: string, reason: string, rows: Array<{ created_at: string }>, evidence: string[]): Dimension {
  return { key, label, status: 'not_measured', score: null, numerator: null, denominator: null, lastEvidenceAt: latest(rows), evidence, reason }
}

export function buildScorecard(input: { audits: AuditRow[]; approvals: ApprovalRow[]; transfers: TransferRow[]; periodDays: number; now?: Date }) {
  const { audits, approvals, transfers } = input
  const blocked = audits.filter(r => Boolean(summary(r).blocked || summary(r).output_blocked)).length
  const reviewRequired = audits.filter(r => Boolean(summary(r).requires_teacher_review)).length
  const versioned = audits.filter(r => Boolean(r.policy_version)).length
  const decided = approvals.filter(r => r.status === 'approved' || r.status === 'rejected').length
  const pending = approvals.filter(r => r.status === 'pending').length
  const verifierDecisions = audits.filter(r => r.agent_name === 'question-verifier-v1').length
  const completed = transfers.filter(r => r.status === 'completed').length

  const dimensions: Dimension[] = [
    audits.length
      ? measured('governance', 'Yönetişim ve izlenebilirlik — politika sürümlü karar oranı', versioned, audits.length, audits, [`${versioned}/${audits.length} denetim kaydı politika sürümlü`])
      : notMeasured('governance', 'Yönetişim ve izlenebilirlik', 'Dönemde ajan denetim kaydı yok.', audits, []),
    approvals.length
      ? measured('human_oversight', 'İnsan gözetimi — sonuçlanan onay oranı', decided, approvals.length, approvals,
        [`${decided}/${approvals.length} onay sonuçlandı`, `${pending} bekleyen karar`, `${reviewRequired} öğretmen incelemesi gerektiren çıktı`])
      : notMeasured('human_oversight', 'İnsan gözetimi', 'Dönemde insan onayı gerektiren kayıt yok; bu gözetimin çalıştığını göstermez.', approvals, [`${reviewRequired} öğretmen incelemesi gerektiren çıktı`]),
    notMeasured('content_safety', 'İçerik güvenliği', 'Bağımsız güvenlik/red-team testi sonucu yok. Engellenen çıktı sayısı güvenlik kanıtı değildir.', audits,
      [`${blocked} engellenen girdi/çıktı (bilgi amaçlı)`, `${verifierDecisions} bağımsız soru doğrulama kararı`]),
    transfers.length
      ? measured('learning_integrity', 'Öğrenme bütünlüğü — transfer kontrolü tamamlanma oranı', completed, transfers.length, transfers, [`${completed}/${transfers.length} planlı kontrol tamamlandı`])
      : notMeasured('learning_integrity', 'Öğrenme bütünlüğü', 'Dönemde planlanmış transfer kontrolü yok.', transfers, []),
    notMeasured('privacy_access', 'Gizlilik ve erişim', 'Otomatik erişim/RLS test sonucu bu ekrana bağlı değil; sabit puan kaldırıldı.', [], []),
  ]
  const scored = dimensions.filter(d => d.score !== null)
  const overall = scored.length ? Math.round(scored.reduce((sum, d) => sum + (d.score as number), 0) / scored.length) : null
  const status = overall === null || scored.length < 3 ? 'insufficient_evidence' : overall >= 85 ? 'strong' : overall >= 70 ? 'watch' : 'action_required'
  const notMeasuredLabels = dimensions.filter(d => d.status === 'not_measured').map(d => d.label)
  const alerts = [
    ...(pending > 20 ? [{ severity: 'warning', message: `${pending} insan onayı bekliyor.` }] : []),
    ...(audits.length === 0 ? [{ severity: 'critical', message: `Son ${input.periodDays} günde ajan denetim kaydı bulunamadı.` }] : []),
    ...(verifierDecisions === 0 ? [{ severity: 'warning', message: 'Soru doğrulayıcı için denetim kanıtı bulunamadı.' }] : []),
    ...(notMeasuredLabels.length ? [{ severity: 'warning', message: `${notMeasuredLabels.length}/${dimensions.length} alan ölçülmedi: ${notMeasuredLabels.join(', ')}.` }] : []),
  ]
  return {
    periodDays: input.periodDays, generatedAt: (input.now ?? new Date()).toISOString(), overall, status,
    coverage: { measured: scored.length, total: dimensions.length }, dimensions, alerts,
  }
}
