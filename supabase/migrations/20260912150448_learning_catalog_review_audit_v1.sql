CREATE TABLE IF NOT EXISTS public.learning_catalog_review_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dimension_key text NOT NULL,
  action text NOT NULL CHECK (action IN ('map','dismiss','reset')),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS learning_catalog_review_audit_dimension_idx ON public.learning_catalog_review_audit(dimension_key, created_at DESC);
ALTER TABLE public.learning_catalog_review_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.learning_catalog_review_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.learning_catalog_review_audit TO service_role;

CREATE OR REPLACE FUNCTION public.audit_learning_catalog_review_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.mapped_node_id IS DISTINCT FROM NEW.mapped_node_id THEN
    INSERT INTO public.learning_catalog_review_audit(dimension_key, action, reviewer_id, before_state, after_state)
    VALUES (NEW.dimension_key,
      CASE WHEN NEW.status = 'mapped' THEN 'map' WHEN NEW.status = 'dismissed' THEN 'dismiss' ELSE 'reset' END,
      NEW.reviewed_by, to_jsonb(OLD), to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS learning_catalog_review_audit_trigger ON public.learning_catalog_review_queue;
CREATE TRIGGER learning_catalog_review_audit_trigger
AFTER UPDATE OF status, mapped_node_id ON public.learning_catalog_review_queue
FOR EACH ROW EXECUTE FUNCTION public.audit_learning_catalog_review_v1();
COMMENT ON TABLE public.learning_catalog_review_audit IS 'Immutable admin audit of catalog candidate mapping decisions; service-role only.';
