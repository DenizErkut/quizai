-- 008_coaching_leads.sql — Supabase'de uygulandı, 27.07.2026
--
-- Özel Koçluk Faz 0/1 (talep toplama) için tek yeni tablo. Kasıtlı olarak
-- minimal: koç eşleştirme, ödeme, oturum takibi gibi tüm operasyonel işler
-- talep doğrulanana kadar MEVCUT özellikler üzerinden (öğretmen paneli =
-- koç paneli, admin'in "+1 ay premium ver" butonu = manuel faturalama)
-- yürütülüyor. Faz 2'de (talep doğrulanırsa) coaches/coaching_sessions gibi
-- ayrı tablolar ve /coach paneli düşünülecek.

CREATE TABLE IF NOT EXISTS coaching_leads (
  id uuid primary key default gen_random_uuid(),
  lead_type text not null check (lead_type in ('kurum','bireysel')),
  name text not null,
  email text not null,
  phone text,
  institution_name text,
  student_grade text,
  message text,
  status text not null default 'yeni' check (status in ('yeni','gorusuldu','anlasma','reddedildi')),
  created_at timestamptz not null default now()
);

ALTER TABLE coaching_leads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_coaching_leads_status ON coaching_leads(status, created_at desc);

-- NOT: RLS'de hiçbir policy tanımlanmadı — bilerek. Bu tabloya erişimin
-- tamamı (form gönderimi POST, admin listeleme GET/PATCH) service-role
-- API route'ları üzerinden (app/api/coaching-leads/route.ts); RLS varsayılan
-- olarak herkesi reddediyor, service role zaten RLS'yi atlıyor.
