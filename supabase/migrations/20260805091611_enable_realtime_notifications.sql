-- notifications tablosu supabase_realtime publication'ina hic eklenmemisti.
-- app/notifications/page.tsx'teki .channel().on('postgres_changes', {event:'INSERT', table:'notifications'})
-- kod tarafinda TAMAMEN DOGRU yazilmisti ama bu publication kaydi olmadan
-- Postgres hicbir zaman bu tablo icin degisiklik olayi yayinlamiyor -
-- bildirim INSERT ediliyor ama acik sayfaya hic ulasmiyordu, sadece
-- sayfa yenilenince yapilan yeni sorguda goruluyordu.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
