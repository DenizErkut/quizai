alter table public.exam_resources
  add column if not exists learning_objective_codes text[] not null default '{}'::text[];

alter table public.exam_resources
  drop constraint if exists exam_resources_learning_objective_codes_count_check;

alter table public.exam_resources
  add constraint exam_resources_learning_objective_codes_count_check
  check (cardinality(learning_objective_codes) <= 100);

create or replace function public.update_exam_resource_document_v2(
  p_resource_id uuid,
  p_title text,
  p_grade text,
  p_subject text,
  p_topic text,
  p_raw_text text,
  p_chunks text[],
  p_learning_objective_codes text[] default '{}'::text[]
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_resource public.exam_resources%rowtype;
  v_index integer;
begin
  select * into v_resource
  from public.exam_resources
  where id = p_resource_id
  for update;

  if not found then
    raise exception 'Exam resource not found';
  end if;
  if cardinality(p_chunks) is null or cardinality(p_chunks) < 1 or cardinality(p_chunks) > 500 then
    raise exception 'Invalid chunk count';
  end if;
  if cardinality(coalesce(p_learning_objective_codes, '{}'::text[])) > 100 then
    raise exception 'Too many learning objective codes';
  end if;

  update public.exam_resources
  set title = btrim(p_title),
      grade = btrim(p_grade),
      subject = nullif(btrim(p_subject), ''),
      topic = btrim(p_topic),
      subtopic = btrim(p_topic),
      raw_text = p_raw_text,
      learning_objective_codes = coalesce(p_learning_objective_codes, '{}'::text[])
  where id = p_resource_id;

  delete from public.exam_chunks where exam_resource_id = p_resource_id;
  for v_index in 1..cardinality(p_chunks) loop
    insert into public.exam_chunks (
      exam_resource_id, chunk_index, content, embedding, exam_type, year,
      subject, source_type, reuse_policy, grade, subtopic
    ) values (
      p_resource_id, v_index - 1, p_chunks[v_index], null, v_resource.exam_type,
      v_resource.year, nullif(btrim(p_subject), ''), v_resource.source_type,
      v_resource.reuse_policy, btrim(p_grade), btrim(p_topic)
    );
  end loop;

  return cardinality(p_chunks);
end;
$$;

revoke all on function public.update_exam_resource_document_v2(uuid,text,text,text,text,text,text[],text[]) from public, anon, authenticated;
grant execute on function public.update_exam_resource_document_v2(uuid,text,text,text,text,text,text[],text[]) to service_role;
