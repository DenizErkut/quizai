'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// 21 Eylül 2026 — Deniz'in isteğiyle: bu rapor teknik olarak doğruydu ama
// "3.04", "güven aralığı [3.04, 3.04]" gibi rakamlar okuyucuya SANKİ anlamlı
// bir sonuçmuş gibi görünüyordu; oysa şu an her grupta 0-1 kişi 7 günlük
// ölçümü tamamlamış durumda (gerekli: 30) — yani bu rakamlar tek bir kişinin
// (ya da hiç kimsenin) verisine dayanıyor ve istatistiksel olarak anlamsız.
// API (route.ts) bunu zaten classification:'insufficient_data' ile doğru
// işaretliyor; burada yapılan değişiklik SADECE gösterimi netleştiriyor —
// hesaplamalara dokunulmadı: (a) üstte açık bir "bu rapor ne ölçüyor" cümlesi,
// (b) her grup kartında "7 gün tamamlayan / gerekli eşik" ilerleme olarak,
// (c) veri yetersizken rakamı büyük/kalın göstermek yerine önce sade Türkçe
// açıklama, rakamı ise küçük/soluk "referans" olarak, (d) jargon
// (güven aralığı, etki büyüklüğü) için hover ile okunan kısa açıklama.
export default function AdaptiveStatistics() {
  const [report, setReport] = useState<any>(null)
  useEffect(() => { void (async () => { const { data: { session } } = await createClient().auth.getSession(); if (!session) return; const response = await fetch('/api/admin/adaptive-evaluation', { headers: { Authorization: `Bearer ${session.access_token}` } }); if (response.ok) setReport(await response.json()) })() }, [])
  if (!report?.statistics) return null
  const labels: Record<string, string> = { mastery: 'Mastery değişimi', retention: '7 günlük kalıcılık', test_pct: 'Test başarısı', completion_rate: 'Tamamlama oranı', duration_seconds: 'Ortalama süre (sn)', test_count: 'Tamamlanan test sayısı' }
  const cohortLabel = (name: string) => name === 'adaptive' ? 'Adaptive' : 'Standard'
  const minCompleted = Math.min(...(report.cohorts?.map((c: any) => c.completed_sample) ?? [0]))
  const min = report.minimum_interpretation_sample
  const classificationText = (row: any): string => {
    if (row.classification === 'insufficient_data') return `Henüz güvenilir değil — şu an sadece ${minCompleted} kişilik veriye dayanıyor, en az ${min} gerekiyor.`
    if (row.classification === 'adaptive_positive') return 'Bu ölçütte Adaptive grubu şu ana kadar önde.'
    if (row.classification === 'standard_positive') return 'Bu ölçütte Standard grubu şu ana kadar önde.'
    return 'İki grup arasında fark görünmüyor.'
  }
  return <div className="card" style={{ marginTop: '1rem' }}>
    <strong style={{ color: 'var(--primary)' }}>📊 İstatistiksel etki raporu</strong>
    <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>Bu rapor, Adaptive Learning'in mevcut (Standard) yönteme göre öğrenmeyi GERÇEKTEN iyileştirip iyileştirmediğini ölçer. Rastgele iki-üç kişinin sonucuyla bunu söylemek mümkün değil — bu yüzden her grupta en az {min} kişi 7 günlük ölçümü tamamlayana kadar aşağıdaki tüm sayılar "henüz güvenilir değil" olarak işaretlenir.</div>
    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: report.claim_status === 'supported_by_pilot' ? '#eaf8ef' : '#fff4e5', color: report.claim_status === 'supported_by_pilot' ? '#176b3a' : '#8a5200', fontSize: 12, fontWeight: 700 }}>{report.claim_message}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginTop: 10 }}>{report.cohorts?.map((cohort: any) => <div key={cohort.cohort} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 12 }}>
      <strong>{cohortLabel(cohort.cohort)}</strong>
      <div style={{ marginTop: 4 }}>Atanan kişi: {cohort.assigned_sample} · 24 saat ölçümü alınan: {cohort.day1_sample}</div>
      <div style={{ marginTop: 4, fontWeight: 700, color: cohort.completed_sample >= min ? 'var(--green, #176b3a)' : 'var(--amber, #8a5200)' }}>7 gün tamamlayan: {cohort.completed_sample} / {min} gerekli {cohort.completed_sample < min ? '(yetersiz)' : '(eşik geçildi)'}</div>
      <div style={{ color: 'var(--text3)', marginTop: 3 }}>Bu {cohort.completed_sample} kişide: tamamlama oranı {cohort.completion_rate == null ? '—' : `%${Math.round(cohort.completion_rate * 100)}`} · ortalama süre {cohort.avg_duration_seconds ?? '—'} sn · test sayısı {cohort.avg_test_count ?? '—'}</div>
    </div>)}</div>
    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{report.statistics.map((row: any) => <div key={row.metric} style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 12 }}>
      <strong>{labels[row.metric] || row.metric}</strong>
      <div style={{ marginTop: 2, fontWeight: row.classification === 'insufficient_data' ? 400 : 700, color: row.classification === 'insufficient_data' ? 'var(--text3)' : 'inherit' }}>{classificationText(row)}</div>
      <div style={{ color: 'var(--text3)', marginTop: 3, opacity: row.classification === 'insufficient_data' ? 0.6 : 1 }}>
        Referans rakam — Adaptive − Standard farkı: {row.difference}
        {row.effect_size != null ? <span title="Farkın, gruplar içindeki doğal (kişiden kişiye) farklılığa oranı. 0'a yakınsa fark küçük, 0.8'in üzerinde ise fark büyük kabul edilir."> · etki büyüklüğü: {row.effect_size} (?)</span> : null}
        <span title="Gerçek fark muhtemelen bu aralıkta bir yerde. Aralık sıfırı içine alıyorsa (ör. [-5, 5]) fark istatistiksel olarak anlamlı değildir — henüz 'adaptive daha iyi' ya da 'standard daha iyi' denemez."> · %95 olası aralık: [{row.confidence_interval_95.join(', ')}] (?)</span>
      </div>
    </div>)}</div>
    {report.segments && <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <strong style={{ color: 'var(--primary)' }}>🔍 Öğrenci profiline göre kırılım</strong>
      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>
        "Adaptive herkes için mi işe yarıyor, yoksa belirli bir öğrenci profilinde mi?" sorusu için. Segment bilgisi öğrencinin pilota ATANDIĞI andaki durumundan (canlı profilinden değil) donduruldu. Her alt grup ayrıca en az {min} tamamlanmış kişi gerektirir — bu yüzden çoğu satır şu an "henüz yetersiz" görünecektir, bu beklenen bir durumdur.
        {report.segment_note && <div style={{ marginTop: 4 }}>{report.segment_note}</div>}
      </div>
      {([
        ['baseline_mastery_tier', 'Başlangıç mastery düzeyi', { low: 'Düşük', medium: 'Orta', high: 'Yüksek', unknown: 'Bilinmiyor' }],
        ['baseline_recent_trend', 'Başlangıçtaki eğilim', { improving: 'Yükseliyordu', stable: 'Sabitti', declining: 'Düşüyordu' }],
        ['baseline_learning_pace', 'Öğrenme hızı', { fast: 'Hızlı', medium: 'Orta', deliberate: 'Temkinli', unknown: 'Bilinmiyor' }],
      ] as const).map(([field, title, valueLabels]) => (
        <div key={field} style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700 }}>{title}</div>
          {!report.segments[field]?.length && <div style={{ fontSize: 12, color: 'var(--text3)' }}>Henüz bu boyutta veri yok.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 6, marginTop: 4 }}>
            {report.segments[field]?.map((seg: any) => {
              const minCompletedSeg = Math.min(...(seg.cohorts?.map((c: any) => c.completed_sample) ?? [0]))
              return <div key={seg.segment_value} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 8, fontSize: 12 }}>
                <div style={{ fontWeight: 700 }}>{(valueLabels as any)[seg.segment_value] || seg.segment_value}</div>
                <div style={{ color: 'var(--text3)', marginTop: 2 }}>{seg.cohorts.map((c: any) => `${c.cohort === 'adaptive' ? 'Adaptive' : 'Standard'}: ${c.completed_sample}`).join(' · ')}</div>
                <div style={{ marginTop: 3, color: seg.interpretable ? 'inherit' : 'var(--text3)', fontWeight: seg.interpretable ? 700 : 400 }}>
                  {seg.interpretable ? seg.claim_message : `Henüz güvenilir değil (${minCompletedSeg}/${min}).`}
                </div>
              </div>
            })}
          </div>
        </div>
      ))}
    </div>}
    {report.misconception_outcomes && <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <strong style={{ color: 'var(--primary)' }}>🧩 Kavram yanılgısı çözümü (misconception_review)</strong>
      <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text3)' }}>
        Atama anında öğrencinin doğrulanmış (confirmed) yanılgıları donduruldu. Burada, bunlardan kaçının 7 gün içinde çözüldüğü (resolved) ve öğrencinin bu pencerede en az bir misconception_review-odaklı soru alıp almadığı (intervention_rate) gösteriliyor. Kohort başına en az {report.misconception_outcomes.minimum_sample} öğrenci gerekiyor.
        {report.misconception_outcomes.excluded_row_count > 0 && <div style={{ marginTop: 4 }}>{report.misconception_outcomes.excluded_row_count} kayıt, baseline&apos;da hiç bilinen yanılgısı olmadığı ya da bu alan eklenmeden önce oluşturulduğu için bu kırılıma dahil değil.</div>}
      </div>
      {report.misconception_outcomes.caveat && <div style={{ marginTop: 8, padding: 8, borderRadius: 8, background: '#fff4e5', color: '#8a5200', fontSize: 12, fontWeight: 700 }}>⚠️ {report.misconception_outcomes.caveat}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 8, marginTop: 10 }}>
        {report.misconception_outcomes.cohorts.map((cohort: any) => <div key={cohort.cohort} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, fontSize: 12 }}>
          <strong>{cohortLabel(cohort.cohort)}</strong>
          <div style={{ marginTop: 4 }}>Öğrenci sayısı: {cohort.student_sample} / {report.misconception_outcomes.minimum_sample} {cohort.student_sample < report.misconception_outcomes.minimum_sample ? '(yetersiz)' : '(eşik geçildi)'}</div>
          <div style={{ color: 'var(--text3)', marginTop: 3 }}>Baseline yanılgı toplamı: {cohort.baseline_misconception_total} · çözülen: {cohort.resolved_total}</div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>Çözülme oranı: {cohort.resolution_rate == null ? '—' : `%${cohort.resolution_rate}`}</div>
          <div style={{ color: 'var(--text3)', marginTop: 3 }}>Müdahale gören öğrenci oranı: {cohort.intervention_rate == null ? '—' : `%${cohort.intervention_rate}`}</div>
        </div>)}
      </div>
      {!report.misconception_outcomes.interpretable && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)' }}>Örneklem henüz her iki kohortta da {report.misconception_outcomes.minimum_sample} öğrenciye ulaşmadığı için bu kırılım &quot;henüz güvenilir değil&quot; olarak işaretleniyor.</div>}
    </div>}
  </div>
}
