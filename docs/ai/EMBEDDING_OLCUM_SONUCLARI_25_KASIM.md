# Embedding Ölçümü — Kazanım Eşleştirme (P1-3), 25 Kasım 2026

**Gerçek ölçüm** (bu çalışma ortamında, CPU, Hub'dan indirilen ağırlıklarla). Ücretli API kullanılmadı. Üretim hiçbir şekilde etkilenmedi.

## Görev ve veri

Soru metni → ders+sınıfındaki doğrulanmış aktif kazanım adayları arasından doğru kazanımı sırala (sistemin gerçek aday havuzu mantığı; havuz 17–125 kazanım). Altın veri: `question_bank`'ta **insan onaylı** 385 eşleşme (111 farklı kazanım) — bkz. `KAZANIM_ALTIN_VERI_ARASTIRMASI.md`. "Kazanım yok" için 71 insan reddi.

Modeller (revision SHA'ları `docs/ai/models/*.json`'da; ikisi de safetensors, uzak kod yok): `intfloat/multilingual-e5-large-instruct` (MIT, 0,6 B, sorguya talimat öneki, kazanıma önek yok), `Qwen/Qwen3-Embedding-0.6B` (Apache-2.0, sorguya talimat). Taban çizgisi: karakter 3–5-gram TF-IDF (öğrenme yok). `bge-m3` **ölçülmedi** (depoda safetensors yok; ONNX yolu denenmedi).

## Sonuçlar (n = 385)

| Yöntem | Top-1 | Top-3 | Top-5 | MRR | Sorgu gecikmesi (CPU, 4 çekirdek) | Kazanım katalogu gömme (622 kazanım) |
|---|---:|---:|---:|---:|---:|---:|
| Rastgele (havuz büyüklüğüne göre) | 2,4 % | – | – | – | – | – |
| TF-IDF karakter n-gram | 53,5 % | 75,6 % | 82,9 % | 0,670 | ≈ 0 | – |
| **multilingual-e5-large-instruct** | **52,7 %** | **81,6 %** | **90,1 %** | **0,688** | ≈ 150 ms | 75 sn (tek sefer) |
| Qwen3-Embedding-0.6B | 38,4 % | 67,0 % | 80,3 % | 0,563 | ≈ 74 ms | 33 sn |

Tek başına örneklem hatası: n = 385'te yüzde ≈ 50 için ≈ ±5 puan (%95). e5 ile Qwen3-0.6B arasındaki 14 puanlık Top-1 farkı bu hatanın çok üstünde; e5 ile TF-IDF arasındaki Top-1 farkı **yok** (0,8 puan), Top-3/Top-5 farkı (6 / 7 puan) sınırda anlamlı (eşleşmiş test yapılmadı; madde bazlı tahminler saklanmadı).

### Ders/sınıf kırılımı (n ≥ 20; Top-1 / Top-3)

| Grup | n | e5 | Qwen3-0.6B |
|---|---:|---|---|
| Matematik · 6 | 161 | 42,9 / 79,5 | 22,4 / 56,5 |
| Fizik · 9 | 52 | 38,5 / 75,0 | 40,4 / 67,3 |
| Fen · 6 | 48 | 79,2 / 93,8 | 58,3 / 89,6 |
| Fen · 7 | 36 | 72,2 / 88,9 | 44,4 / 66,7 |
| Fen · 5 | 28 | 78,6 / 92,9 | 78,6 / 96,4 |
| Matematik · 5 | 24 | 37,5 / 54,2 | 12,5 / 41,7 |

Matematikte iki model de zayıf (özellikle 5. sınıf); Fen'de e5 güçlü. Küçük hücreler (n < 20: Kimya, Biyoloji, Sosyal, Matematik 7/9) için sonuç verilmedi.

### "Kazanım yok" tespiti

En yüksek benzerlik skoruyla "eşleşme var / yok" ayrımı (71 insan reddi vs. 385 eşleşme): **AUROC e5 = 0,514, Qwen3 = 0,457 → rastgele düzeyinde.** Benzerlik eşiği "bu soru hiçbir kazanımı ölçmüyor" kararı için kullanılamaz; bu karar şimdilik mevcut LLM denetçilerinde kalmalı.

## Yorum — ne söyleyebiliriz, ne söyleyemeyiz

1. **Embedding tek başına mevcut LLM eşleştirmesinin yerine geçmez.** Top-1 ≈ %53; matematikte %37–43. Kanonik kazanım eşleştirmesi (öğrenci verisini ve kazanım hesabını besliyor) bu düzeyde doğrulukla otomatik yapılmamalı.
2. **Aday daraltma için işe yarıyor:** e5 ile ilk 5 aday içinde doğru kazanım %90; ilk 3'te %82. Şu an LLM'e ≈ 24 aday gösteriliyor (`loadCanonicalObjectiveCandidates`, `maxCandidates = 24`). Önce embedding ile 5 adaya inip LLM'in yalnız bu 5 arasından seçmesi, istem boyutunu ve hata alanını küçültür. Bunu doğrulamak için ayrı deney gerekir (LLM'in 5 aday ile doğruluğu 24 adaya göre düşmüyor mu?) — **yapılmadı**.
3. **TF-IDF taban çizgisi güçlü:** Top-1'de e5'e eşit. Bunun bir nedeni etiketlerin **kısmen model kaynaklı olması** olabilir: insan onaylı eşleşmelerin önemli bölümü başlangıçta bir yapay zekânın önerdiği adaylar arasından konu/başlık eşleşmesiyle seçilmiş olabilir; bu, sözcük örtüşmesini kayırır (kanıtlanmadı, tabloda "öneren" bilgisi yok). Yani embedding'in gerçek üstünlüğü bu veriyle olduğundan **az** görünüyor olabilir.
4. **Genelleme sınırı:** Ders/sınıf kapsamı çok dengesiz (Matematik 6 = %42); İngilizce, Türkçe, Coğrafya için hiç veri yok. Bu sonuçlar o dersler için geçerli sayılmaz.
5. **Model seçimi:** Türkçe + çok dilli bu görevde `multilingual-e5-large-instruct`, `Qwen3-Embedding-0.6B`'den belirgin iyi. Daha büyük Qwen3-Embedding (4B/8B) veya `bge-m3` (safetensors dönüşümü sonrası) ölçülmedi; gerekirse sırada.

## Önerilen sonraki adımlar

* **Hibrit aday daraltma deneyi** (e5 + TF-IDF birleşik sıralama; ardından LLM'in 5 aday ile doğruluk/maliyet ölçümü) — çevrimdışı, ücretsiz.
* Zayıf dersler için uzman etiketlemesi (İngilizce, Matematik 7, Türkçe; ders başına ≈ 30 soru) — daha sağlıklı altın küme.
* `Qwen3-Embedding-4B` ve `bge-m3` (güvenli biçimde) aynı testte.
* Üretimde herhangi bir değişiklik **önerilmez**: sonuçlar henüz "aday daraltma" iddiasını bile LLM ile doğrulamadı.

## Yeniden üretme

Betik: `scripts/ai-benchmark/embedding-eval.py`; ham metrikler: `docs/ai/benchmarks/embedding-2026-11-25/*.json` (soru metni içermez). Veri: üretim DB'sinden salt-okunur çıkarılır (`question_bank` + `learning_objective_catalog`); depoya konmaz.
