-- Anlık test kitapçıklarında ÜNİTE/KONU değerini açıkça konu alanında tut.
-- subtopic geriye dönük uyumluluk için korunur.
alter table public.exam_resources
  add column if not exists topic text not null default '';

update public.exam_resources
set topic = coalesce(nullif(topic, ''), subtopic, '')
where purpose = 'instant_test';

create index if not exists exam_resources_instant_topic_idx
  on public.exam_resources (purpose, grade, subject, topic, review_status)
  where purpose = 'instant_test';
