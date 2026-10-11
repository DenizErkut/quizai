'use client'
import type { verifiedLearningMetrics } from '@/lib/verified-learning-metrics'
import { useT } from '@/lib/i18n/I18nProvider'

export default function VerifiedLearningMetrics({ metrics }: { metrics: ReturnType<typeof verifiedLearningMetrics> }) {
  const { t: tr } = useT()
  return <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
    <strong>{tr('Yardımsız aktarım ve yardım kullanımı')}</strong>
    <p>{tr('Öğretmen incelemeli aktarım başarısı: {value}', { value: metrics.verifiedTransferScorePct === null ? tr('Henüz doğrulanmadı') : `%${metrics.verifiedTransferScorePct}` })}</p>
    <p>{tr('Ürün eşiğine göre kazanım durumu (%80): {value}', { value: metrics.verifiedMastery === null ? tr('İnceleme bekliyor') : metrics.verifiedMastery ? tr('Doğrulandı') : tr('Çalışma gerekiyor') })}</p>
    {metrics.support && <p>{tr('Rehberli çalışmada {hints} ipucu · ilk deneme {first} · son deneme {last}', { hints: metrics.support.hintCount, first: metrics.support.firstAttemptCorrect ? tr('doğru') : tr('yanlış'), last: metrics.support.retryCorrect ? tr('doğru') : tr('yanlış') })}</p>}
    <p style={{ fontSize: 12, color: 'var(--text3)' }}>{metrics.note}</p>
  </div>
}
