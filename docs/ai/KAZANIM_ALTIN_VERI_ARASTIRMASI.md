# Kazanım Eşleştirme — Altın Veri Kaynakları Araştırması (P1-3 önkoşulu)

Tarih: 24 Kasım 2026. Salt-okunur sorgularla üretim veritabanından çıkarıldı; hiçbir veri değiştirilmedi. Soru metinleri müfredat/üretilmiş içeriktir (kişisel veri içermez); yine de bu belgeye yalnızca **sayılar** yazıldı, soru metni yazılmadı.

## Kısa sonuç

`question_bank` tablosunda ayrı bir kazanım sütunu yok ama **kazanım eşleşmesi soru JSON'unun içinde** tutuluyor: `question->>'learningObjectiveCode'` (kod), `question->>'objectiveMappingStatus'` (durum), `learningObjectiveId` / `learningObjectiveRevisionId`. Kazanımların kendisi `learning_objective_catalog` tablosunda.

Üç ayrı kalite katmanında altın veri var; **yalnızca birincisi gerçek insan etiketidir**:

| Katman | Kaynak | Adet | Etiketleyen | Kullanım |
|---|---|---|---|---|
| **A — İnsan onaylı eşleşme** | `question_bank`, `objectiveMappingStatus = 'human_approved'` ve kod dolu | **385** soru, **111** farklı kazanım | İnsan (uzman/yönetici) | Asıl altın küme: top-1/top-3 doğruluk |
| **A− — İnsan reddi ("uygun kazanım yok")** | `objectiveMappingStatus = 'human_rejected'` | **129** soru | İnsan | Negatif örnek: eşik/"eşleşme yok" davranışı |
| **B — Çoklu yapay zekâ uzlaşısı** | `historical_objective_backfill_reviews`, `decision = 'approved'`, ≥2 bağımsız sağlayıcı aynı kodu onaylamış | **2.624** | 2+ model (GPT-4.1-mini, Mistral Small, Gemini, Claude Haiku) | Büyük ama **dairesel**: "mevcut sistemle uyum"ı ölçer, doğruluğu değil |
| B− — Yapay zekâ onaylı banka eşleşmesi | `question_bank`, `ai_approved` ve kod dolu | ≈ 1.827 (+ diğerleri) | Model | Aynı uyarı |
| Katalog | `learning_objective_catalog`, `verified + active` | **4.561** kazanım (+15 `candidate` aktif, 17 taslak) | Katalog editörleri (3.833 onay/yayın kaydı, 2 kişi) | Aday havuzu (aranan kümenin kendisi) |

385 insan onaylı eşleşmenin tamamı aktif ve doğrulanmış katalog kazanımlarına bağlanıyor (kontrol edildi: 385/385).

## Kapsam dağılımı (insan onaylı + insan reddi)

| Ders · sınıf | İnsan onaylı | İnsan reddi |
|---|---:|---:|
| Matematik · 6. sınıf | 161 | 33 |
| Fizik · 9. sınıf | 52 | 1 |
| Fen Bilimleri · 6. sınıf | 48 | 17 |
| Fen Bilimleri · 7. sınıf | 36 | 0 |
| Fen Bilimleri · 5. sınıf | 28 | 0 |
| Matematik · 5. sınıf | 24 | 3 |
| Kimya · 9. sınıf | 10 | 0 |
| Sosyal Bilgiler · 6. sınıf | 7 | 6 |
| Matematik · 9. sınıf | 7 | 2 |
| Biyoloji · 9. sınıf | 7 | 5 |
| Matematik · 7. sınıf | 3 | 3 |
| Sosyal Bilgiler · 5. / 7. sınıf | 1 / 1 | 0 / 1 |
| Türkçe · 6. sınıf | 0 | 18 |
| Coğrafya · 9. sınıf | 0 | 12 |
| Genel · 5. sınıf | 0 | 28 |

**Sınırlar:** (1) Dağılım çok çarpık: Matematik 6. sınıf tek başına %42; Matematik 7. sınıf (katalogda 125 kazanım) için yalnızca 3 örnek var; İngilizce (katalogda her sınıfta ≈ 140–190 kazanım) için hiç insan etiketi yok. (2) Ders/sınıf başına örnek sayısı küçük (<30) olan hücreler için sonuçlar "yönlendirici" sayılmalı. (3) Önceki sürümlerdeki etiketleme politikası ve kim etiketledi bilgisi tabloda yok; insan etiketinin "tek uzman" olup olmadığı bilinmiyor → etiket tutarlılığı ölçülemez.

## Backfill incelemelerinin yapısı (B katmanı için)

`historical_objective_backfill_reviews` (7.993 kayıt; 3.418 oturum, 4.575 banka): `review.decision` onay/ret, `review.poolStatus` (`approved`, `excluded`, `already_in_bank`, `added`), `review.audits[]` her denetçi için `provider`, `model`, `objectiveCode`, `directObjectiveMatch`, `answerCorrect`, `ageAppropriate` vb. Reddedilenler (5.369) puan ortalaması 41,7; onaylananlar ≈ 90. Reddedilen örneklerden biri müfredat dışı içerik (örn. hukuk maddesi) — yani ret çoğu zaman "kazanım bulunamadı" demek ve **negatif örnek zenginliği** sağlıyor (ama yine model etiketli).

## Önerilen değerlendirme tasarımı (P1-3)

1. **Altın küme = Katman A (385) + A− (129).** Aday havuzu: sorunun dersi+sınıfı içindeki `verified + active` katalog kazanımları (gerçek sistemdeki "sunucu aday kümesi" mantığıyla aynı; `docs/QUESTION-OBJECTIVE-MAPPING-V1.md`). Metrikler: top-1/top-3, "eşleşme yok" için precision/recall.
2. **Katman B (2.624)** yalnızca ikincil: "yapay zekâ uzlaşısına ne kadar uyuyor?" ve maliyet/gecikme için geniş örnek. İnsan etiketiyle karıştırılmaz, ayrı raporlanır.
3. **Yetersiz hücreler** (İngilizce, Matematik 7, Türkçe, Coğrafya): önce uzmanlardan her biri için ≈ 30 soruluk etiketleme isteyin; bu bir **ürün/uzman emeği** kararıdır, modelle kapatılmamalı.
4. **Dairesellikten kaçınma:** model, etiketi üreten sağlayıcılardan biri (GPT-4.1-mini, Mistral Small, Gemini, Haiku) ise B katmanında lehine yanlılık olur; A katmanında bu risk yok.
5. **PII ve saklama:** altın küme yalnızca soru metni + kazanım kodu içerir (öğrenci kimliği yok). Ham metinler depoya konmaz; `scripts/ai-benchmark/` altında yerel/gizli dosya olarak üretilir.

## Çıkarma sorgusu (örnek, salt-okunur)

```sql
-- Katman A: insan onaylı eşleşmeler (soru metni + kod + aday havuzu için ders/sınıf)
select q.id, q.subject_key, q.grade_key,
       q.question->>'q'                       as question_text,
       q.question->'opts'                     as options,
       q.question->>'learningObjectiveCode'   as objective_code
from question_bank q
join learning_objective_catalog c on c.objective_code = q.question->>'learningObjectiveCode'
where q.question->>'objectiveMappingStatus' = 'human_approved'
  and c.is_active and c.verification_status = 'verified';

-- Katman A−: insan "kazanım yok" kararları
select id, subject_key, grade_key, question->>'q' as question_text
from question_bank
where question->>'objectiveMappingStatus' = 'human_rejected';
```

## Sonuç ve karar noktaları

* P1-3 için **veri hazır ama dar**: 385 insan etiketli eşleşme; ders/sınıf kapsamı zayıf. Embedding modellerinin karşılaştırması **bu küme üzerinde anlamlı** (özellikle Matematik 6, Fen 5–7, Fizik 9), ancak İngilizce/Türkçe/Sosyal için karar vermeye yetmez.
* Karar sizin: (a) mevcut 385'lik küme ile ilk turu yapmak; (b) ek uzman etiketlemesi istemek; (c) her ikisi.
* Embedding'i çalıştırmak için model erişimi gerekiyor: Hub erişimi var ama CPU'da 0,6 B parametreli modeller (Qwen3-Embedding-0.6B, multilingual-e5-large-instruct) ücretsiz denenebilir; bunun için ağırlıkların indirilmesi (≈ 1–2 GB) gerekir. İsterseniz bu ortamda yerel çalıştırıp gerçek sonuç çıkarabilirim; ücretli API gerekmez.
