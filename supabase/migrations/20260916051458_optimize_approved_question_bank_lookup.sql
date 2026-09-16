create index if not exists question_bank_approved_fallback_lookup_idx
  on public.question_bank (
    topic_key, grade_key, language_key, question_type, difficulty,
    use_count, last_used_at
  )
  where review_status = 'approved' and report_count = 0;
