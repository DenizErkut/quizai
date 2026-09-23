-- 23 Eylül 2026 — yapılacaklar listesi madde 4'ün kalan kısmı:
-- misconception_catalog'daki evidence_count/doğrulanmış yanılgı tipleriyle
-- adaptive pilot sonuçlarının kesişimi (Snorkel AI temalı haber #1 maddesi —
-- "hangi müdahale hangi öğrenci profilinde işe yarıyor" sorusunun
-- misconception_review müdahalesi özelinde karşılığı).
--
-- Diğer baseline_* alanları gibi (bkz. 20260923110000_adaptive_evaluation_
-- baseline_segments.sql), öğrencinin pilota ATANDIĞI andaki confirmed
-- misconception kümesi DONDURULUYOR — canlı student_misconceptions'a göre
-- değil. Gerekçe aynı: pilotun kendisi (misconception_review müdahaleleri
-- yoluyla) bu kümeyi 7 gün içinde değiştiriyor; "kaç tanesi çözüldü" sorusunu
-- canlı kümeye göre sormak, tam da ölçmek istediğimiz çözülmeyi saymamak
-- anlamına gelir (post-treatment bias).
alter table public.adaptive_learning_evaluations
  add column if not exists baseline_misconception_ids jsonb not null default '[]'::jsonb,
  add column if not exists day7_misconceptions_resolved integer,
  add column if not exists day7_misconception_interventions integer;

comment on column public.adaptive_learning_evaluations.baseline_misconception_ids is
  'Atama anında student_misconceptions.status=''confirmed'' olan misconception_catalog.id değerlerinin donmuş listesi. Boş dizi: o an bilinen bir yanılgı yoktu, ya da bu satır bu kolon eklenmeden önce oluşturuldu (bkz. day7_misconceptions_resolved=NULL ile aynı geriye-dönük uyumluluk deseni).';
comment on column public.adaptive_learning_evaluations.day7_misconceptions_resolved is
  'baseline_misconception_ids içindekilerden 7. gün ölçümü anında student_misconceptions.status=''resolved'' olan sayısı. NULL: henüz ölçülmedi ya da baseline''da hiç yanılgı yoktu (bölme/oran hesaplarken NULL, "sıfır" değil, "uygulanamaz" anlamına gelir).';
comment on column public.adaptive_learning_evaluations.day7_misconception_interventions is
  'Atamadan 7. gün ölçümüne kadar, en az bir sorusu adaptiveFocus=''misconception'' etiketli tamamlanmış quiz oturumu sayısı. ÖNEMLİ: lib/adaptive-learning.ts::resolveAdaptiveLearningPolicy() şu an cohort=''standard'' için ayrıca engellenmiyor — yani bu müdahale iki kohortta da oluşabilir. Bu kolon o karışıklığı gizlemek yerine raporda (adaptive-evaluation/route.ts) açıkça göstermek için var.';

-- Sadece baseline'da yanılgısı olan satırları hızlı filtrelemek için.
create index if not exists adaptive_learning_evaluations_misconception_idx
  on public.adaptive_learning_evaluations (sample_version, cohort)
  where jsonb_array_length(baseline_misconception_ids) > 0;
