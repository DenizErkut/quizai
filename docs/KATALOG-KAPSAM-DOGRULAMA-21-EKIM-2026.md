# Katalog Kapsam Doğrulaması: Türkçe 6/7, İngilizce 5.7 ve DKAB (21 Ekim 2026)

> **Yöntem:** 2 Eylül 2026'da MEB programlama sitesinden indirilmiş resmî program PDF'lerinin metni (`pdftotext`) ile canlı `learning_objective_catalog` (yalnızca `is_active`) kod kod karşılaştırıldı. MEB sitesine bu ortamdan şu an erişilemedi (`tymm.meb.gov.tr` çözümlenmiyor), bu yüzden yalnızca elimdeki PDF kopyaları kullanıldı. Sonuçlar, PDF metin çıkarımının doğruluğuna bağlıdır; "kesin" denilen yerler yalnızca kodların PDF metninde geçip geçmediğidir.

## 1. Türkçe 5–8 (T.D / T.K / T.O / T.Y kodları)

- PDF'te toplam **365** kazanım kodu var (5. sınıf 80, 6. sınıf 91, 7. sınıf 96, 8. sınıf 98).
- Katalogda aktif **380** kod var (80 + 100 + 102 + 98).
- **PDF'te olup katalogda olmayan kod: 0.** Katalog PDF'teki her kodu içeriyor.
- **Katalogda olup PDF'te olmayan kod: 15** (daha önce "14" olarak raporlanmıştı; bugünkü sayım 15, 6. sınıf 9 + 7. sınıf 6):

| Katalog kodu | Başlık (kısaltılmış) | PDF'teki en yakın kazanım (benzerlik) | Değerlendirme |
|---|---|---|---|
| T.D.6.24 | Dinlediğindeki probleme çözüm üretebilme | T.D.6.9 (0,69) | PDF'te karşılığı yok |
| T.D.6.25 | Dinleme sürecine yönelik öz yansıtma | T.D.6.23 (0,52) | PDF'te karşılığı yok |
| T.K.6.25 | Konuşmada beden dilini ve mekânı etkili kullanma | T.K.6.23 (0,82) | PDF'te benzeri var, ayrı kazanım mı yoksa farklı ifade mi belirsiz |
| T.K.6.26 | Konuşma sürecine yönelik öz yansıtma | T.K.6.1 (0,54) | PDF'te karşılığı yok |
| T.O.6.26 | Metindeki probleme çözüm üretebilme | PDF'te aynı başlık **T.O.6.24** koduyla var | Aynı kazanımın farklı numarası, yinelenen |
| T.O.6.27 | Okuma sürecine yönelik öz yansıtma | T.D.6.18 (0,54) | PDF'te karşılığı yok |
| T.Y.6.20 | Uygun geçiş ve bağlantı ifadelerini kullanma | T.Y.6.17 (0,90) | PDF'te çok benzeri var (T.Y.6.17), yinelenen olabilir |
| T.Y.6.21 | Yazım kuralları ve noktalama işaretlerini uygulama | T.Y.6.18 (0,75) | PDF'te benzeri var (T.Y.6.18) |
| T.Y.6.22 | Yazma sürecine yönelik öz yansıtma | T.Y.6.1 (0,52) | PDF'te karşılığı yok |
| T.D.7.27 | Dinleme sürecine yönelik öz yansıtma | T.D.7.25 (0,52) | PDF'te karşılığı yok |
| T.K.7.26 | Konuşma sürecine yönelik öz yansıtma | T.K.7.1 (0,54) | PDF'te karşılığı yok |
| T.O.7.27 | Metindeki probleme çözüm üretebilme | PDF'te aynı başlık **T.O.7.25** koduyla var (1,00) | Aynı kazanımın farklı numarası, yinelenen |
| T.O.7.28 | Okuma sürecine yönelik öz yansıtma | T.D.7.19 (0,54) | PDF'te karşılığı yok |
| T.Y.7.21 | Yazım kuralları ve noktalama işaretlerini uygulama | T.Y.7.19 (0,75) | PDF'te benzeri var (T.Y.7.19) |
| T.Y.7.22 | Yazma sürecine yönelik öz yansıtma | T.Y.7.1 (0,52) | PDF'te karşılığı yok |

**Okuma:** On beş kodun hepsi katalogda `active / verified` görünüyor, ama 2026 PDF'inde yok. En az üçü (T.O.6.26, T.O.7.27, T.Y.6.20) PDF'teki başka bir kodla aynı veya çok yakın bir kazanımın yinelenmiş hâli gibi görünüyor; kalanların (özellikle "… sürecine yönelik öz yansıtma yapabilme" kazanımları) PDF'te kazanım satırı olarak karşılığı bulunmuyor. "Öz yansıtma yapabilme" ifadesi PDF metninde yalnızca iki yerde (Konuşma ve Yazma) ve kazanım satırı olarak değil, bir tablo bağlamında geçiyor; ayrıntısını doğrulamadım. Kayıtların başka bir (eski veya taslak) program sürümünden gelmiş olması olası, ama kaynağını doğrulamadım.

**Kullanım etkisi:** Bu 15 kazanımla ilişkili öğrenme olayı **2**, mastery satırı **0**, değerlendirme (benchmark) kaydı **0**. Yani kaldırmak veya `needs_review` yapmak öğrenci verisini neredeyse hiç etkilemez.

## 2. İngilizce `ENG.5.7.*` kodları

- 6, 7 ve 8. sınıflarda ve 5. sınıfın 1–6 ile 8. birimlerinde katalog ile PDF'teki kod sayıları **birebir aynı** (birim başına 23–24).
- Katalogda **ENG.5.7.\*** için 22 kod var, PDF metninde **hiç ENG.5.7 kodu yok**. PDF 5. sınıf birimlerini ENG.5.6'dan doğrudan ENG.5.8'e atlayarak numaralandırıyor.
- Ama PDF'in aynı bölümünde **"THEME 7: LIFE IN NATURE"** başlığı ve içeriği ENG.5.6 ile ENG.5.8 arasında yer alıyor. Yani 7. tema PDF'te var, yalnızca kod numarası eksik; PDF'te tek bir ENG.5.8 seti var.
- Katalogdaki ENG.5.7 (22 kod) ve ENG.5.8 (22 kod) yapısı diğer birimlerle tutarlı. PDF'te bir numaralandırma hatası olma olasılığı yüksek.
- **Sonuç:** Kısmen doğrulandı. Kayıtları kaldırmak için bir gerekçe yok. Kesin teyit için PDF'in 5. sınıf Tema 7 ve Tema 8 sayfalarına bakıp hangi kod setinin hangi temaya ait olduğunu kontrol etmek gerekir.

## 3. DKAB (Din Kültürü ve Ahlak Bilgisi)

- Katalogda 4–12. sınıflar için 169 aktif/`verified` kazanım var (kod biçimi `DKAB.sınıf.ünite.kazanım`). Kaynak olarak "tymm.meb.gov.tr Din Kültürü ve Ahlak Bilgisi 4-8. sınıf" ve "…dersi-2 (lise 9-12)" yazılı.
- 2 Eylül'de indirilen MEB program listesinde (88 program) **DKAB programı yok**, bu yüzden DKAB kazanımlarını karşılaştıracak bir PDF'im yok.
- **Sonuç:** Doğrulanamadı. DKAB programının resmî PDF'i (MEB Talim ve Terbiye Kurulu) elde edilirse aynı yöntemle birkaç dakikada karşılaştırılabilir.

## 4. Önerilen sonraki adımlar

1. **15 Türkçe kodu için karar:** (a) yönetici panelindeki Katalog İnceleme akışından `needs_review` yapıp öğrenci seçiminden çıkarmak, (b) yinelenen üçünü (T.O.6.26, T.O.7.27 ve benzeri) PDF'teki koda birleştirmek, (c) olduğu gibi bırakmak. Öneri: (a), çünkü etkisi çok küçük ve katalogun "doğrulandı" iddiasını doğru tutar. Katalog denetim kaydı (`learning_catalog_review_audit`) olduğu için işlem geri alınabilir.
2. **ENG.5.7 / ENG.5.8:** PDF'in ilgili sayfalarına bakıp teyit edin (Bölüm 2).
3. **DKAB:** Resmî program PDF'ini sağlayın, karşılaştırmayı ben yapayım.
