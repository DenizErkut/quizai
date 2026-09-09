# Kazanım Düzeyi Mastery Pipeline v1

Bu aşama, kanonik kazanıma bağlanan soruların kanıtını konu düzeyinin yanında
kazanım düzeyinde de ölçülebilir hâle getirir.

## Davranış

- Mevcut konu mastery hesapları ve kullanıcı ekranları değişmez.
- `learning_objective_id` taşıyan Learning Event kayıtları ayrıca kazanım
  düzeyinde gruplanır.
- Sonuç, `student_mastery` içinde `algorithm_version = objective_v1` ve dolu
  `learning_objective_key` ile saklanır.
- İşlem aynı oturum için tekrar çalıştırılabilir; mükerrer mastery satırı üretmez.
- Taslak müfredat kazanımları normal soru üretimine açılmaz. Aday çözümleyici
  yalnızca aktif müfredat sürümünü kullanmaya devam eder.

## Ölçüm

`learning_objective_pipeline_daily` servis görünümü günlük olarak şunları verir:

- tamamlanan test ve soru sayısı,
- kanonik kazanıma bağlanan soru sayısı ve oranı,
- oluşan Learning Event sayısı,
- kazanım kimliği taşıyan Learning Event sayısı ve oranı.

Migration: `scripts/049_objective_mastery_pipeline_v1.sql`.
