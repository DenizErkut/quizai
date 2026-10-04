import type { verifiedLearningMetrics } from '@/lib/verified-learning-metrics'

export default function VerifiedLearningMetrics({ metrics }: { metrics: ReturnType<typeof verifiedLearningMetrics> }) {
  return <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 10 }}>
    <strong>Yardımsız aktarım ve yardım kullanımı</strong>
    <p>Öğretmen incelemeli aktarım başarısı: {metrics.verifiedTransferScorePct === null ? 'Henüz doğrulanmadı' : `%${metrics.verifiedTransferScorePct}`}</p>
    <p>Ürün eşiğine göre kazanım durumu (%80): {metrics.verifiedMastery === null ? 'İnceleme bekliyor' : metrics.verifiedMastery ? 'Doğrulandı' : 'Çalışma gerekiyor'}</p>
    {metrics.support && <p>Rehberli çalışmada {metrics.support.hintCount} ipucu · ilk deneme {metrics.support.firstAttemptCorrect ? 'doğru' : 'yanlış'} · son deneme {metrics.support.retryCorrect ? 'doğru' : 'yanlış'}</p>}
    <p style={{ fontSize: 12, color: 'var(--text3)' }}>{metrics.note}</p>
  </div>
}
