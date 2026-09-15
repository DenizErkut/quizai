CREATE INDEX IF NOT EXISTS quiz_sessions_completed_user_idx
  ON public.quiz_sessions (user_id, pct)
  WHERE completed = true;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_quiz_badges_for_user(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  completed_count bigint;
  has_perfect boolean;
BEGIN
  SELECT count(*), coalesce(bool_or(pct = 100), false)
  INTO completed_count, has_perfect
  FROM public.quiz_sessions
  WHERE user_id = p_user_id AND completed = true;

  INSERT INTO public.badges (user_id, badge_key)
  SELECT p_user_id, badge_key
  FROM (VALUES
    ('first_test', completed_count >= 1),
    ('tests_10', completed_count >= 10),
    ('tests_50', completed_count >= 50),
    ('tests_100', completed_count >= 100),
    ('perfect_score', has_perfect)
  ) AS earned(badge_key, qualifies)
  WHERE qualifies
  ON CONFLICT (user_id, badge_key) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_quiz_badges_after_session()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.completed = true AND (TG_OP = 'INSERT' OR OLD.completed IS DISTINCT FROM NEW.completed OR OLD.pct IS DISTINCT FROM NEW.pct) THEN
    PERFORM private.sync_quiz_badges_for_user(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quiz_sessions_sync_badges ON public.quiz_sessions;
CREATE TRIGGER quiz_sessions_sync_badges
AFTER INSERT OR UPDATE OF completed, pct ON public.quiz_sessions
FOR EACH ROW EXECUTE FUNCTION private.sync_quiz_badges_after_session();

DO $$
DECLARE
  uid uuid;
BEGIN
  FOR uid IN SELECT DISTINCT user_id FROM public.quiz_sessions WHERE completed = true LOOP
    PERFORM private.sync_quiz_badges_for_user(uid);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_quiz_badges_for_user(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.sync_quiz_badges_after_session() FROM PUBLIC, anon, authenticated;
