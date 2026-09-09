import type { TopicMastery } from './mastery'

export type DiagnosticRole = 'foundation_probe' | 'application_probe' | 'misconception_probe'

export interface DiagnosticQuestionStrategy {
  active: boolean
  version: 'diagnostic-v1'
  reasonCode: 'LOW_MASTERY_CONFIDENCE' | 'NO_MASTERY_EVIDENCE' | 'SUFFICIENT_EVIDENCE' | 'CONTINUATION_CHUNK'
  confidenceBefore: TopicMastery['confidence'] | 'none'
  evidenceCountBefore: number
  roles: DiagnosticRole[]
  promptContext: string
}

function diagnosticRoles(questionCount: number): DiagnosticRole[] {
  const safeCount = Number.isFinite(questionCount) ? Math.max(0, Math.floor(questionCount)) : 0
  if (safeCount <= 0) return []
  if (safeCount === 1) return ['foundation_probe']
  if (safeCount === 2) return ['foundation_probe', 'application_probe']

  const misconceptionCount = Math.max(1, Math.round(safeCount * 0.2))
  const foundationCount = Math.max(1, Math.round(safeCount * 0.4))
  const applicationCount = Math.max(1, safeCount - foundationCount - misconceptionCount)
  const roles: DiagnosticRole[] = [
    ...Array(foundationCount).fill('foundation_probe'),
    ...Array(applicationCount).fill('application_probe'),
    ...Array(misconceptionCount).fill('misconception_probe'),
  ]
  return roles.slice(0, safeCount)
}

export function resolveDiagnosticQuestionStrategy(
  mastery: TopicMastery | null,
  questionCount: number,
  isContinuation: boolean,
): DiagnosticQuestionStrategy {
  const confidenceBefore = mastery?.confidence ?? 'none'
  const evidenceCountBefore = mastery?.totalCount ?? 0
  const version = 'diagnostic-v1' as const

  if (isContinuation) return {
    active: false, version, reasonCode: 'CONTINUATION_CHUNK', confidenceBefore,
    evidenceCountBefore, roles: [], promptContext: '',
  }
  if (mastery && mastery.confidence !== 'düşük') return {
    active: false, version, reasonCode: 'SUFFICIENT_EVIDENCE', confidenceBefore,
    evidenceCountBefore, roles: [], promptContext: '',
  }

  const roles = diagnosticRoles(questionCount)
  const foundationCount = roles.filter(role => role === 'foundation_probe').length
  const applicationCount = roles.filter(role => role === 'application_probe').length
  const misconceptionCount = roles.filter(role => role === 'misconception_probe').length
  return {
    active: true,
    version,
    reasonCode: mastery ? 'LOW_MASTERY_CONFIDENCE' : 'NO_MASTERY_EVIDENCE',
    confidenceBefore,
    evidenceCountBefore,
    roles,
    promptContext: `\n\nTANILAYICI SORU STRATEJİSİ (ZORUNLU): Bu öğrenci için yeterli güvenilir geçmiş kanıt yok. Soruları tam şu sırayla üret: ilk ${foundationCount} soru temel kavramı doğrudan yoklasın; sonraki ${applicationCount} soru aynı kavramı yeni ve kısa bir durumda uygulatsın; son ${misconceptionCount} soru yaygın bir yanlış düşünce ile doğru düşünceyi ayırt ettirsin. Sorular birbirinin cevabını vermesin, bilmece/trick kullanmasın ve zorluk artışı yumuşak olsun.`,
  }
}
