# Bilinen sorunlar

## Vercel preview dağıtımları hata veriyor — 16 Eylül 2026

`staging-load-test` dalından oluşan bazı Preview dağıtımları yaklaşık 47 saniye sonra hata veriyor; aynı değişikliklerin `main` üzerindeki Production dağıtımları başarılı. Bu, üretim davranışını etkilemiyor ancak Preview ortamının build/ortam değişkenleri ve dağıtım günlükleri ayrı olarak incelenmeli.

Takip adımları: hata veren Preview dağıtımının build günlüğünü açmak, Production ile ortam değişkeni farklarını karşılaştırmak ve Preview'a özgü eksik değişken veya migration bağlantısını gidermek.
