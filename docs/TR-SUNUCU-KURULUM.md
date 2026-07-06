# TR Kimlik Sunucusu — Kurulum Rehberi

## 1. VPS Seçimi
**Önerilen:** Turhost "VPS TR" — Türkiye (İstanbul) veri merkezi, gerçek TR lokasyon.
- Minimum: 2 vCPU / 4GB RAM / 80GB NVMe (kimlik verisi küçük hacimli, bu yeterli)
- Fiyat aralığı: ~1.000-1.800 TL/ay (2026 fiyatlarıyla)
- Alternatifler: Radore, Vargonen, Doruk (hepsi TR veri merkezli)
- **Şirket kurulumu tamamlanınca** kurumsal fatura ile satın alınmalı (VERBİS ve
  sözleşme tarafı şirket olmalı, şahıs değil)

## 2. Sunucu Kurulumu (Ubuntu 24.04 LTS önerilir)

```bash
# PostgreSQL 16 kurulumu
sudo apt update && sudo apt install -y postgresql-16 postgresql-contrib

# Uzaktan bağlantıya izin ver (sadece Vercel IP'lerinden — güvenlik duvarı ile kısıtla!)
sudo nano /etc/postgresql/16/main/postgresql.conf
# listen_addresses = '*'

sudo nano /etc/postgresql/16/main/pg_hba.conf
# host  pratium_identity  pratium_app  <VERCEL_IP_RANGE>/32  scram-sha-256

sudo systemctl restart postgresql
```

## 3. Veritabanı ve Kullanıcı Oluştur

```sql
CREATE DATABASE pratium_identity;
CREATE USER pratium_app WITH ENCRYPTED PASSWORD '[GÜÇLÜ_ŞİFRE]';
GRANT ALL PRIVILEGES ON DATABASE pratium_identity TO pratium_app;
```

Sonra `tr-identity-schema.sql` dosyasını bu veritabanında çalıştır.

## 4. Güvenlik Duvarı (KRİTİK)

```bash
# Sadece Vercel'in çıkış IP'lerine izin ver, başka hiçbir yere açma
sudo ufw allow from <VERCEL_IP_1> to any port 5432
sudo ufw allow from <VERCEL_IP_2> to any port 5432
sudo ufw enable
```

Vercel'in statik çıkış IP'si yoksa, **Vercel Secure Compute** (Pro/Enterprise)
veya bir **SSH tüneli / VPN** ile bağlantıyı sabitlemek gerekir — aksi halde
her istek farklı IP'den gelir ve firewall ile kısıtlama yapılamaz. Bu noktayı
Vercel hesap tipine göre ayrıca çözmemiz gerekecek.

## 5. SSL Zorunlu

```
# postgresql.conf
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
```

Let's Encrypt ile ücretsiz sertifika alınabilir (sunucunun bir domain'i olmalı,
örn. `identity.pratium.com` gibi bir A kaydı).

## 6. Ortam Değişkenleri (Vercel'e eklenecek)

```
TR_IDENTITY_DB_URL=postgresql://pratium_app:[ŞİFRE]@[TR_SUNUCU_IP]:5432/pratium_identity
TR_IDENTITY_DB_SSL=true
```

## 7. Yedekleme (KVKK m.12 — veri güvenliği yükümlülüğü)

```bash
# Günlük otomatik yedek — cron ile
0 3 * * * pg_dump pratium_identity | gzip > /backups/identity-$(date +\%F).sql.gz

# 30 günden eski yedekleri temizle
0 4 * * * find /backups -name "identity-*.sql.gz" -mtime +30 -delete
```

Yedekler de TR sınırları içinde kalmalı — başka bir TR sunucusuna veya
şifreli harici diske alınabilir, ama yurt dışı bulut depolamaya (S3 ABD, vb.)
KOPYALANMAMALI.

## 8. Geçiş Sırası (Mevcut kullanıcılar için)

1. `tr-identity-schema.sql` çalıştırılır (TR sunucusunda)
2. `migration-script.ts` çalıştırılır (mevcut Supabase profiles → TR-PG identities)
3. Geçiş doğrulanır (satır sayıları eşleşiyor mu kontrol edilir)
4. `supabase-profiles-migration.sql` çalıştırılır (Supabase'den kimlik alanları silinir)
5. Kod deploy edilir (register-hybrid-route.ts, identity/client.ts vb.)

**ÖNEMLİ:** 3. adım atlanmadan 4. adıma geçilmemeli — geri dönüşü olmayan
veri kaybı riski var. Migration'ı önce bir test/staging ortamında dene.
