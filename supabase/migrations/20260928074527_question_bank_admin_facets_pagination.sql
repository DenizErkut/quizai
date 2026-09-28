create or replace function public.question_bank_admin_facets_v1(
  p_grade text default null,
  p_subject text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'grades', coalesce((
      select jsonb_agg(value order by value)
      from (
        select distinct q.grade_key as value
        from public.question_bank q
        where q.review_status in ('candidate', 'approved')
          and nullif(q.grade_key, '') is not null
      ) valueset
    ), '[]'::jsonb),
    'subjects', coalesce((
      select jsonb_agg(value order by value)
      from (
        select distinct q.subject_key as value
        from public.question_bank q
        where q.review_status in ('candidate', 'approved')
          and nullif(q.subject_key, '') is not null
          and (nullif(p_grade, '') is null or q.grade_key = p_grade)
      ) valueset
    ), '[]'::jsonb),
    'topics', coalesce((
      select jsonb_agg(value order by value)
      from (
        select distinct q.topic_key as value
        from public.question_bank q
        where q.review_status in ('candidate', 'approved')
          and nullif(q.topic_key, '') is not null
          and (nullif(p_grade, '') is null or q.grade_key = p_grade)
          and (nullif(p_subject, '') is null or q.subject_key = p_subject)
      ) valueset
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.question_bank_admin_facets_v1(text, text) from public, anon, authenticated;
grant execute on function public.question_bank_admin_facets_v1(text, text) to service_role;
