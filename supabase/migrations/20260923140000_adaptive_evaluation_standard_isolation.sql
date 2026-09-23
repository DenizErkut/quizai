-- 23 Eylül 2026 (aynı gün, akşam) — uyum raporu güncellemesinde dürüstçe not
-- düşülen bulgunun düzeltmesi: lib/adaptive-learning.ts::resolveAdaptiveLearningPolicy()
-- şimdiye kadar cohort='standard' atamasını FİİLEN uygulamıyordu — bu tabloya
-- yazılan bir etiketten ibaretti, soru üretimini hiç etkilemiyordu. Kod artık
-- (bkz. isActiveStandardPilotParticipant()) bunu düzeltiyor: standart kohorta
-- atanmış bir öğrenci, 7 günlük gözlem penceresi boyunca artık gerçekten
-- kişiselleştirme almıyor.
--
-- SORUN: bu düzeltme deploy edildiği andan itibaren geçerli. Şu an gözlem
-- penceresi İÇİNDE olan (day7 henüz ölçülmemiş) standard-kohort satırları,
-- pencerelerinin bir kısmında (düzeltmeden önce) kişiselleştirme almış,
-- kalan kısmında (düzeltmeden sonra) almayacak — karma bir rejim. Zaten
-- tamamlanmış (day7 ölçülmüş) standard satırları ise pencerelerinin TAMAMINDA
-- kişiselleştirmeye açıktı. İkisi de "protokolün öngördüğü temiz standart
-- kohort" değil.
--
-- isolation_enforced = false: bu satırın standard-kohort ataması, izolasyon
-- kodu üretime çıkmadan önce (kısmen veya tamamen) geçerliydi — kohort
-- karşılaştırmalarında dikkatli yorumlanmalı / hariç tutulabilir.
-- isolation_enforced = true (yeni satırların varsayılanı): atama anından
-- itibaren izolasyon kodu zaten üretimdeydi.
alter table public.adaptive_learning_evaluations
  add column if not exists isolation_enforced boolean not null default true;

update public.adaptive_learning_evaluations
  set isolation_enforced = false
  where cohort = 'standard' and sample_version = 'adaptive-learning-v3-pilot';

comment on column public.adaptive_learning_evaluations.isolation_enforced is
  'Yalnızca cohort=''standard'' için anlamlı. false: bu atama, resolveAdaptiveLearningPolicy''nin standard kohortu fiilen izole eden düzeltmesinden (23 Eylül 2026 akşam) önce yapıldı veya penceresinin bir kısmı o düzeltmeden önce geçti — kohort karşılaştırmasında "temiz" standart kabul edilemez. true: atamadan itibaren izolasyon zaten üretimdeydi.';
