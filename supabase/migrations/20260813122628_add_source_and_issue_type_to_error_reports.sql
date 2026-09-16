-- Sistematik içerik kalite taraması (Öneri #4) — error_reports tablosunu
-- hem kullanıcı bildirimleri hem sistem taramasının bulguları için
-- paylaşılan TEK kaynak yapıyoruz. Mevcut satırlar 'user_report' olarak
-- kalır (varsayılan), yeni sistem taraması satırları 'system_scan'.
ALTER TABLE public.error_reports ADD COLUMN source text NOT NULL DEFAULT 'user_report';
ALTER TABLE public.error_reports ADD COLUMN issue_type text;

COMMENT ON COLUMN public.error_reports.source IS 'user_report (öğrenci bildirdi) veya system_scan (otomatik tarama buldu)';
COMMENT ON COLUMN public.error_reports.issue_type IS 'system_scan kaynaklı satırlarda hangi kural ihlal edildi: unseen_passage, book_metadata, offtopic_drift, chained_reference, vocabulary_level, answer_inconsistent';
