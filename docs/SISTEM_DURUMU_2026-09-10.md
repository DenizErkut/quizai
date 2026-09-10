# QuizAI sistem durumu — 10 Eylül 2026

Bu belge, staging yük testi çalışması sonunda sistemde yapılan ve henüz yapılmayan işleri özetler.

## Tamamlanan işler

### Uygulama ve dağıtım

- `staging-load-test` dalında Vercel Preview dağıtımı için yük testi akışı hazırlandı.
- Supabase istemcileri için merkezi AI kullanım/maliyet loglama altyapısı mevcut.
- Supabase değişkenleri bulunmayan Preview ortamında build’in çökmemesi için güvenli etkisiz istemci katmanı eklendi.
- Supabase yapılandırması olmayan Preview ortamında `/api/*` istekleri `503` döndürüyor.
- Public sayfalar Supabase olmadan statik olarak üretilebiliyor.
- Yerel Production build doğrulaması başarılı: **203 statik sayfa** üretildi.
- İlgili yerel commit: `e9e0b79 Allow preview builds without Supabase staging`.

### Yük testi

Public `/`, `/pricing` ve `/login` sayfaları tek Windows makinesinden ani trafikle test edildi.

| Eşzamanlı istek | Sonuç | Hata oranı | p95 |
|---:|---|---:|---:|
| 100 | 100/100 başarılı | %0 | 384–1384 ms |
| 500 | 500/500 başarılı | %0 | 434–1454 ms |
| 1000 | 1000/1000 başarılı | %0 | 550–2487 ms |
| 1250 | 1250/1250 başarılı | %0 | 4265 ms |
| 1500 | 1430/1500 başarılı | %4,67 | 8556 ms |
| 2000 | 1555/2000 başarılı | %22,25 | 10812 ms |

- 5000 kullanıcı testi yapılmadı; 1500 ve 2000 seviyelerinde hata eşiği aşıldı.
- Hatalar çoğunlukla `fetch failed`; 429 veya 5xx görülmedi.
- Ayrıntılı rapor: `docs/YUK_TESTI_RAPORU_2026-09-10.md`.

### Vercel ve güvenlik

- Preview koruması yeniden `Require Log In → Standard Protection` olarak açıldı.
- Staging Supabase projesi kapatıldı.
- Production Supabase ve Production dağıtımına dokunulmadı.
- Sohbette görünmüş bypass anahtarlarının güvenlik nedeniyle iptal edilmesi gerektiği belirlendi.

### AI maliyet analizi

- Kodda token ve maliyet loglama mevcut (`ai_usage_logs`).
- Production `QuizAI` projesindeki son 30 günlük gerçek kayıtlar incelendi (130 ana quiz üretimi, 68 top-up, 270 Claude doğrulaması, 170 OpenAI doğrulaması, 105 Gemini doğrulaması).
- Gerçek çağrı ortalamaları: ana Claude üretimi **$0,017833**, GPT-4.1-mini pilot üretimi **$0,003555**, top-up **$0,036401**, Claude doğrulaması **$0,002944**, OpenAI doğrulaması **$0,001275**, Gemini doğrulaması **$0,000245**.
- Bu kayıtların oturum bağlamı eksik olduğu için tüm doğrulama maliyetleri tek tek oturumlara bağlanamıyor. Gözlenebilir çağrı ortalaması yaklaşık **$0,0439/quiz**; 10 soruluk test için güvenli gerçekçi aralık **$0,04–$0,07**.
- Top-up oranı kayıtlarda **%52,3** (68/130). Top-up oluşan testlerde maliyet genellikle **$0,07–$0,11** aralığına çıkıyor.
- Mistral shadow %100 açılırsa, gerçek üretim token hacmiyle test başına yaklaşık **$0,0055** eklenir; tasarruf sağlamaz.
- Mistral-first üretim, mevcut üretim çağrısının yerine geçerse (doğrulamalar aynı kalır) yaklaşık **$0,03–$0,04/test**; top-up da Mistral’a taşınırsa yaklaşık **$0,02–$0,03/test** beklenir. Bu, kalite ve fallback oranı doğrulanmadan üretim kararı değildir.
- Bu hesaplar yalnızca AI token ücretidir; Vercel, Supabase ve diğer servis ücretlerini içermez.

## Yapılmayan veya bekleyen işler

### Git ve dağıtım

- `e9e0b79` commit’i henüz uzak `staging-load-test` dalına push edilmedi.
- Bu nedenle Vercel’deki son Preview dağıtımı bu düzeltmeleri henüz içermiyor.
- Push sonrasında yeni Preview build sonucu kontrol edilmeli.

### Supabase

- Staging migration’ları uygulanmadı.
- Sentetik test kullanıcıları ve test verisi oluşturulmadı.
- Giriş, quiz başlatma, cevap kaydetme, adaptif öğrenme ve öneri API’leri staging üzerinde yük testinden geçirilmedi.
- Supabase staging yeniden kurulmadan gerçek veritabanı yük testi yapılamaz.

### Yük testi

- Test tek makineden ani burst şeklindeydi; dağıtılmış ve sürdürülebilir trafik testi değildir.
- Vercel Observability ve Supabase Database Reports metrikleriyle CPU, bağlantı havuzu, sorgu gecikmesi ve rate-limit korelasyonu ölçülmedi.
- Public sayfa testi Supabase veya AI API kapasitesini kanıtlamaz.

### Güvenlik ve temizlik

- Daha önce oluşturulan tüm Vercel bypass secret’ları panelden iptal edilmelidir.
- `test-results/.last-run.json` yerel test çıktısıdır; commit’e alınmamalıdır.
- `supabase/.temp/` yerel/geçici klasördür; commit’e alınmamalıdır.
- Preview’da staging değişkenleri kaldırılmış olmalıdır; Production değişkenleri ayrıca doğrulanmalıdır.

## Mevcut güvenli çalışma durumu

- Production: çalışmaya devam ediyor; değişiklik yapılmadı.
- Preview public sayfaları: Supabase olmadan build edilebilir.
- Preview API’leri: Supabase değişkenleri yoksa bilinçli olarak `503` verir.
- Doğrulanmış public burst seviyesi: **1250 eşzamanlı istek**.
- Kullanıcı deneyimi açısından önerilen public burst seviyesi: **1000 ve altı**.

## Önerilen sonraki sıra

1. Commit’i `staging-load-test` dalına push edin ve Vercel build’ini doğrulayın.
2. Eski Vercel bypass secret’larını iptal edin.
3. Staging’e dönülecekse yeni bir Supabase projesi oluşturup migration’ları uygulayın.
4. Sentetik kullanıcılarla kimlik doğrulama ve quiz API senaryolarını ayrı test edin.
5. Gerçek token loglarını `ai_usage_logs` üzerinden çekip tahmini maliyetleri gerçek ortalamayla değiştirin.
