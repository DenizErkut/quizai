# Pratium Güvenlik Test Raporu — 6 Kasım 2026

Kapsam: depo (kod + bağımlılıklar), Supabase güvenlik denetçisi (advisors), son iki haftada eklenen özellikler (tek ekran giriş, QR giriş, veli onayı, öğretmen toplu aktarım, sesli komutlar).
Yöntem: statik kod incelemesi, `npm audit`, yetki denetimi taraması (234 API uç noktası), sır/anahtar taraması, Supabase advisors, güvenlik başlıkları incelemesi, yeni özelliklerin tehdit modeli incelemesi.

**Sınırlar (dürüst not):** Bu ortamdan pratium.com'a çıkış ağ politikasıyla engelli (proxy 403), bu yüzden canlı sisteme karşı dinamik test (DAST/sızma denemesi), oturumlu rol testleri ve yük testi YAPILMADI. Aşağıdaki bulgular koddan ve yapılandırmadan çıkarılmıştır; "doğrulandı" yazanlar kodda/çıktıda görülenlerdir. Üçüncü taraf bir sızma testi ayrıca önerilir.

## Özet

| # | Önem | Bulgu | Durum |
|---|------|-------|-------|
| 1 | **Kritik** | Next.js 16.3.8 sürümünde bilinen kritik açıklar (kimlik doğrulamasız RCE ×2, DoS) | Doğrulandı (npm audit) |
| 2 | **Yüksek** | Tüm girişler sunucudan geçtiği için Supabase IP hız sınırı ortak kovaya düşebilir (hizmet engelleme riski) — benim eklediğim değişiklik | Koddan çıkarıldı |
| 3 | **Orta** | `login-identifier`: IP sınırı yok, e-posta yolunda hız sınırı yok, T.C. için zamanlama/429 ile hesap varlığı sızması | Doğrulandı |
| 4 | **Orta** | QR giriş: onay ekranında cihaz bilgisi yok (QR-jacking/oltalama), oluşturma ucu sınırsız | Koddan çıkarıldı |
| 5 | **Orta** | Yönetici/öğretmen/kurum hesaplarında çok faktörlü doğrulama (MFA) kapalı | Doğrulandı (Supabase advisor) |
| 6 | **Orta** | CSP yalnızca "Report-Only"; `unsafe-inline` ve `unsafe-eval` açık | Doğrulandı |
| 7 | **Orta** | Kayıt bekleme verisi (T.C. dahil) 48 saat tarayıcı localStorage'ında | Doğrulandı |
| 8 | Düşük | Bağımlılıklar: dompurify (kritik, geçişli), zod (yüksek, DoS) | Doğrulandı |
| 9 | Düşük | IP hız sınırlayıcı sunucusuz bellekte (örnek başına) — "en iyi çaba" | Doğrulandı (kodda belirtilmiş) |
| 10 | Düşük | HSTS `includeSubDomains`/`preload` yok; şifre en az 6 karakter | Doğrulandı |
| 11 | Bilgi | 33 tabloda RLS açık ama politika yok (yalnızca service_role erişimi, tasarım gereği) | Advisor INFO |

## Ayrıntılar

### 1. Next.js kritik açıkları — Kritik
`next@16.3.8`, etkilenen aralıkta (16.0.0–16.4.0): görüntü optimizasyonu API'sinde SVG ile kimlik doğrulamasız uzaktan kod çalıştırma (GHSA-2464-fhr4-w9xw), `use cache` işlevlerinde kimlik doğrulamasız RCE (GHSA-673q-mjm6-r5xr), Server Actions'ta DoS (GHSA-p3m5-59mp-jv5r). Düzeltme: `next@16.4.5` (ana sürüm değişikliği değil).
Hafifletici bilgi: kodda `next/image` ve `use cache` kullanımı yok; yine de `/_next/image` ucu varsayılan olarak açıktır ve Server Actions yapılandırılmıştır. **Önce bunu yamalamalıyız.**

### 2. Girişin tamamının sunucudan geçmesi — Yüksek (kendi eklediğim değişiklik)
Yeni `/login` tüm kimlik türlerini (e-posta dahil) `/api/auth/login-identifier` üzerinden doğruluyor. Supabase `signInWithPassword` çağrısı artık kullanıcıların IP'sinden değil Vercel'in çıkış IP'lerinden yapılıyor. Supabase'in IP başına oturum açma hız sınırı bu ortak IP'lere uygulanırsa, bir saldırgan kasıtlı denemelerle tüm kullanıcıların girişini geçici engelleyebilir; meşru yoğunlukta da sınıra takılma riski var.
Öneri: e-posta ile girişi eskisi gibi tarayıcıdan doğrudan yap; sunucu yolunu yalnızca T.C./vergi no/telefon/kullanıcı kodu için kullan.

### 3. `login-identifier` sertleştirmesi — Orta
- IP bazlı sınır yok (`allowByIp` var ama kullanılmıyor).
- Hesap bazlı sınır (`checkRateLimit`, günlük 30) yalnızca kimliği çözülen T.C./vergi no/kod/telefon için işliyor; 30 denemeden sonra yalnızca bu hesaplara 429 dönüyor → hesabın varlığı sızar. T.C. numaraları gizli değil, bu yüzden bilinen bir T.C.'ye karşı şifre denemesi ve 30 deneme ile hesabı o gün kilitleme (DoS) mümkün.
- Bilinmeyen kimlikte sabit 400 ms bekleme var ama bilinen hesapta gerçek Supabase çağrısı daha farklı sürede dönüyor (zamanlama farkı).
- E-posta yolunda hiç hız sınırı yok.
Öneri: IP başına + kimlik başına kademeli gecikme, hata yanıtlarında sabit süre, sınır aşımında hesap varlığını belli etmeyen aynı yanıt, şüpheli denemede CAPTCHA (Cloudflare Turnstile).

### 4. QR ile giriş — Orta
- Onay ekranı "bu hesapla başka cihazda giriş yapılsın mı?" diyor ama hangi cihaz/konum/IP olduğunu göstermiyor. Saldırgan kendi QR'ını kurbana gösterip onaylatabilir (QR-jacking). Süre kısa (3 dk) ve tek kullanımlık (iyi).
- `POST /api/auth/qr` oturumsuz ve hız sınırsız: tabloyu doldurma/maliyet saldırısı.
Öneri: onay ekranında tarayıcı/işletim sistemi/yaklaşık konum göster, onayda kısa kod eşleştirme (iki ekranda aynı 4 haneli sayı), IP sınırı.

### 5. MFA — Orta
Supabase advisor: "çok az MFA seçeneği etkin". Yönetici hesabı ele geçirilirse tüm içerik/öğrenci verisine erişim sağlanır.
Öneri: yönetici, kurum yöneticisi ve öğretmen için TOTP MFA zorunlu; admin sayfasında MFA seviyesi (aal2) kontrolü.

### 6. CSP — Orta
Başlıklar iyi (nosniff, X-Frame-Options, Referrer-Policy, Permissions-Policy, HSTS) ancak CSP yalnızca raporluyor ve `script-src 'unsafe-inline' 'unsafe-eval'` içeriyor; olası bir XSS'in etkisini sınırlamıyor.
Öneri: `/api/csp-report` ihlallerini incele, nonce tabanlı CSP'ye geç, `unsafe-eval`'ı kaldır, sonra "Report-Only"den çıkar.

### 7. Kayıt bekleme verisi — Orta
`lib/pending-registration.ts`: e-posta onayı bekleyen kayıtta ad, yaş, okul, **T.C. Kimlik No** 48 saat tarayıcı localStorage'ında duruyor. Bir XSS veya paylaşımlı cihaz bu veriyi okuyabilir.
Öneri: bekleyen kaydı sunucuda (TR-PG) şifreli ve kısa ömürlü sakla, tarayıcıya yalnızca rastgele bir referans yaz; ya da T.C.'yi kayıtta değil onay sonrası iste.

### 8. Bağımlılıklar — Düşük
`dompurify` ≤3.4.16 (geçişli; kodda doğrudan kullanım yok), `zod` <4.6.6 (büyük koleksiyonlarda bellek tüketimi). `npm audit fix` ile düzelir.

### 9–10. Diğer
- IP sınırlayıcı bellek içi: çok örnekli sunucusuz ortamda gerçek koruma değil. Vercel Firewall/WAF hız sınırı kuralı tanımlanmalı.
- HSTS'e `includeSubDomains; preload` ekle. Parola kuralı: en az 8 karakter + sızmış parola kontrolü (Supabase "leaked password protection").

## Olumlu bulgular (doğrulandı)
- 234 API uç noktasından yetkisiz görünenler (21) tek tek incelendi: cron uçları `CRON_SECRET` ile sabit zamanlı doğrulanıyor (secret yoksa reddediyor); yönetici ve öğretmen uçlarında kimlik/rol ya da imzalı iş belirteci denetimi var; PayTR geri çağrısı hash doğruluyor; İyzico geri çağrısı pasif.
- `SERVICE_ROLE_KEY` hiçbir istemci dosyasında yok; depoda gerçek sır/anahtar yok (test dosyasındaki anahtarlar `.invalid` örnek).
- Supabase advisors: yalnızca MFA uyarısı var; açık tablo, güvensiz görünüm vb. yok.
- T.C. Kimlik No yalnızca TR-PG'de; okuma işlevleri değeri döndürmüyor; API yanıtlarına ve günlüklere yazılmıyor.
- Hız sınırı sunucu tarafı ve hata durumunda kapalı (fail-closed); oturumsuz arama uçlarında (kurum kodu, davet kodu, satıcı kodu) IP sınırı var.
- Veli–öğrenci T.C. bağlantısı hesap varlığını ifşa etmiyor (eşleşme olsun olmasın aynı yanıt) ve öğrenci onayı şart.
- SVG yükleri izin listesiyle temizleniyor ve yalnızca `<img>` olarak gösteriliyor (betik çalışmaz); görsel veri URL'leri biçim ve boyut denetimli.
- Aşırı yetki: öğretmen sonuç/aktarım uçları ödevin öğretmene ait olmasını ve öğrencinin sınıf üyeliğini sunucuda doğruluyor.

## Yapabileceklerimiz (öncelik sırasıyla)

**Hemen (bu hafta)**
1. `next`'i 16.4.5'e yükselt + `npm audit fix` (dompurify, zod). Küçük, test edilebilir bir PR.
2. E-posta girişini doğrudan Supabase'e geri al (bulgu 2), T.C./vergi no/telefon/kod yolunu IP + kimlik başına kademeli gecikmeyle sertleştir (bulgu 3), `POST /api/auth/qr`'a IP sınırı ekle.
3. Vercel Firewall'da giriş/QR/kod arama uçları için hız sınırı kuralı.

**Kısa vade (2-4 hafta)**
4. Yönetici/öğretmen/kurum için MFA (TOTP) zorunluluğu.
5. QR giriş onay ekranına cihaz bilgisi ve iki ekranda eşleşen kısa kod.
6. Bekleyen kayıt verisini sunucuya taşı (T.C. tarayıcıda durmasın).
7. CSP'yi nonce tabanlı hale getirip zorunlu moda al.

**Orta vade**
8. Bağımsız sızma testi (özellikle giriş, QR, veli bağlama, rol atlama, IDOR) ve canlı sisteme karşı DAST taraması (ZAP/Burp) — izinli test penceresiyle.
9. CI'ya `npm audit` kapısı (kritik/yüksek bulguda başarısız), sır taraması (gitleaks) ve bağımlılık güncelleme botu.
10. Güvenlik olay günlüğü ve uyarıları: art arda başarısız girişler, olağandışı QR onayları, toplu T.C. sorgusu denemeleri.
11. KVKK: Aydınlatma Metni'nde T.C. ve sesli komut/mikrofon işlemesinin güncellenmesi (sizde bekleyen madde), veri saklama/silme takvimi.
