-- The API already authenticates the student and invokes this function with
-- the service role. Do not run it as SECURITY DEFINER: invoker semantics keep
-- future RLS/grant changes from silently becoming privilege escalation.
ALTER FUNCTION public.record_adaptive_answer_event_v1(uuid,uuid,integer,text,numeric,integer,boolean)
  SECURITY INVOKER;
