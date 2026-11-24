-- Yazılıya Hazırlanıyorum: sorulara şekil/görsel (PDF'ten kırpılan PNG/JPEG ya da sade SVG) desteği.
alter table public.written_exam_questions add column if not exists figure_svg text;
alter table public.written_exam_questions add column if not exists figure_image text;
