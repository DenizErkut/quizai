-- Booklet figure attachment runs as a resumable phase after question extraction:
-- a few PDF pages per step, remembering the page cursor, the last accepted
-- question number (questions continue across pages) and how many figures were
-- attached or left for review.
alter table public.booklet_processing_jobs
  add column if not exists next_page integer not null default 0,
  add column if not exists last_question integer not null default 0,
  add column if not exists figures_attached integer not null default 0,
  add column if not exists figures_review integer not null default 0,
  add column if not exists figure_note text;
