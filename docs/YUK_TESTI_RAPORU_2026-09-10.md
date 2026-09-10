# Public Preview yük testi raporu — 10 Eylül 2026

## Kapsam

Preview dağıtımında `/`, `/pricing` ve `/login` herkese açık sayfaları tek bir Windows makinesinden ani eşzamanlı isteklerle test edildi. Preview koruması test sırasında kapalıydı (`protectedPreviewBypass: false`). Bu sonuçlar giriş, quiz API'leri, Supabase veya sürdürülebilir dağıtılmış trafik kapasitesi değildir.

## Geçerli sonuçlar

| Eşzamanlı istek | Tur | Başarı | Hata | p50 | p95 | p99 |
|---:|---:|---:|---:|---:|---:|---:|
| 100 | 1 | 100/100 | %0 | 1295 ms | 1384 ms | 1400 ms |
| 100 | 2 | 100/100 | %0 | 280 ms | 384 ms | 554 ms |
| 500 | 1 | 500/500 | %0 | 1357 ms | 1454 ms | 1507 ms |
| 500 | 2 | 500/500 | %0 | 372 ms | 434 ms | 506 ms |
| 1000 | 1 | 1000/1000 | %0 | 2205 ms | 2487 ms | 2523 ms |
| 1000 | 2 | 1000/1000 | %0 | 450 ms | 550 ms | 845 ms |
| 1250 | 1 | 1250/1250 | %0 | 3261 ms | 4265 ms | 4335 ms |

1500 istekte 1430/1500 başarılı oldu (%4,67 `fetch failed`); 2000 istekte 1555/2000 başarılı oldu (%22,25 `fetch failed`). Bu iki kademe hata eşiğini geçtiği için 5000 testi yapılmadı.

## Değerlendirme

Tek makine burst testi için doğrulanmış hata­sız seviye 1250 eşzamanlı istektir. 1000 ve altı, gecikme açısından daha sağlıklı çalışma aralığıdır. 1500–2000 sonuçları istemci/soket sınırından etkilenmiş olabilir; uygulama veya Vercel kapasitesi olarak tek başına yorumlanmamalıdır.

## Sonraki adım

Gerçek kullanıcı/quiz ve veritabanı yük testi, ayrı bir staging Supabase kurulana kadar ertelendi. Preview koruması yeniden açılmalıdır. Bu rapor yalnızca ölçülen sonuçları kaydeder; test sırasında oluşturulan `test-results/.last-run.json` ve `supabase/.temp/` dosyaları kaynak değişikliği değildir.
