-- 23 Eylül 2026 — Pratium AI-ekonomisi/veri-mimarisi uyum raporu, Tema 2
-- (öğrenme-etkileşim verisi / "hangi müdahale hangi öğrenci profilinde işe
-- yarıyor" sorusu) ve claude/pratium-yapilacaklar-listesi-23-eylul-2026.md
-- madde 4.
--
-- adaptive_learning_evaluations şimdiye kadar SADECE ikili (adaptive vs
-- standard) kohort karşılaştırması yapıyordu. Bu üç kolon, öğrencinin
-- PİLOTA ATANDIĞI ANDAKİ (baseline) öğrenme profilini donduruyor —
-- student_learning_profiles'ın CANLI/güncel halini değil. Bu kasıtlı:
-- student_learning_profiles pilotun kendisi yüzünden 7 gün içinde
-- değişiyor (learning_pace, recent_trend güncelleniyor); segmentasyonu
-- canlı profil üzerinden yapmak "tedavi sonrası bir değişkene göre
-- bölümleme" hatasına (post-treatment bias) düşer. Bu yüzden segment
-- bilgisi, tıpkı baseline_mastery/baseline_retention/baseline_pct gibi,
-- YALNIZCA atama anında bir kez yazılır ve bir daha güncellenmez.
alter table public.adaptive_learning_evaluations
  add column if not exists baseline_learning_pace text
    check (baseline_learning_pace in ('unknown','fast','medium','deliberate')),
  add column if not exists baseline_recent_trend text
    check (baseline_recent_trend in ('improving','stable','declining')),
  add column if not exists baseline_mastery_tier text
    check (baseline_mastery_tier in ('low','medium','high','unknown'));

comment on column public.adaptive_learning_evaluations.baseline_mastery_tier is
  'baseline_mastery''den atama anında türetilmiş kaba katman: low <50, medium 50-74, high >=75 (student_learning_profiles''daki weak/strong eşikleriyle aynı). Segmentli kohort karşılaştırması için.';
comment on column public.adaptive_learning_evaluations.baseline_learning_pace is
  'Atama anında student_learning_profiles.learning_pace''den okunmuş anlık görüntü — pilotun kendisi bu alanı sonradan değiştirebileceği için CANLI değere değil, bu donmuş kopyaya göre segmentlenir.';
comment on column public.adaptive_learning_evaluations.baseline_recent_trend is
  'Atama anında student_learning_profiles.recent_trend''den okunmuş anlık görüntü — aynı gerekçe.';

create index if not exists adaptive_learning_evaluations_segment_idx
  on public.adaptive_learning_evaluations (sample_version, cohort, baseline_mastery_tier, baseline_recent_trend, baseline_learning_pace);
