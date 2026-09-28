-- Education Eval: immutable, provenance-backed MEB benchmark v1.
-- Only human-verified teacher questions with publication evidence count toward
-- the 50-question success set. Regression examples are stored separately and
-- can never enter its metric denominator.

CREATE TABLE IF NOT EXISTS public.education_eval_benchmark_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  curriculum_version_id uuid NOT NULL REFERENCES public.curriculum_versions(id) ON DELETE RESTRICT,
  target_size integer NOT NULL DEFAULT 50 CHECK (target_size = 50),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'retired')),
  description text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version)
);

CREATE TABLE IF NOT EXISTS public.education_eval_benchmark_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_set_id uuid NOT NULL REFERENCES public.education_eval_benchmark_sets(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal BETWEEN 1 AND 50),
  case_type text NOT NULL DEFAULT 'benchmark'
    CHECK (case_type IN ('benchmark', 'regression')),
  source_type text NOT NULL CHECK (source_type IN ('teacher', 'anonymous', 'ai', 'regression')),
  source_resource_id uuid REFERENCES public.exam_resources(id) ON DELETE RESTRICT,
  question_bank_id uuid REFERENCES public.question_bank(id) ON DELETE RESTRICT,
  source_version text NOT NULL CHECK (char_length(source_version) = 64),
  source_reference text NOT NULL,
  grade text NOT NULL,
  subject text NOT NULL,
  objective_id uuid NOT NULL REFERENCES public.learning_objective_catalog(id) ON DELETE RESTRICT,
  objective_code text NOT NULL,
  objective_title text NOT NULL,
  question_snapshot jsonb NOT NULL CHECK (jsonb_typeof(question_snapshot) = 'object'),
  answer_key jsonb NOT NULL CHECK (jsonb_typeof(answer_key) IN ('object', 'array', 'string', 'number')),
  teacher_approved boolean NOT NULL DEFAULT false,
  approval_evidence_paths text[] NOT NULL DEFAULT '{}',
  evidence_verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  evidence_verified_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  metric_eligible boolean NOT NULL DEFAULT false,
  review_notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((case_type = 'benchmark' AND source_type = 'teacher') OR case_type = 'regression'),
  CHECK (NOT metric_eligible OR (
    case_type = 'benchmark' AND source_type = 'teacher' AND teacher_approved
    AND source_resource_id IS NOT NULL AND question_bank_id IS NOT NULL
    AND cardinality(approval_evidence_paths) > 0
    AND evidence_verified_by IS NOT NULL AND evidence_verified_at IS NOT NULL
    AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL
    AND char_length(btrim(objective_code)) > 0
    AND char_length(btrim(objective_title)) > 0
  )),
  UNIQUE (benchmark_set_id, ordinal),
  UNIQUE (benchmark_set_id, question_bank_id)
);

CREATE INDEX IF NOT EXISTS education_eval_benchmark_items_metric_idx
  ON public.education_eval_benchmark_items (benchmark_set_id, metric_eligible, ordinal);

ALTER TABLE public.education_eval_benchmark_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.education_eval_benchmark_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.education_eval_benchmark_sets FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.education_eval_benchmark_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.education_eval_benchmark_sets TO service_role;
GRANT ALL ON public.education_eval_benchmark_items TO service_role;

CREATE OR REPLACE FUNCTION public.guard_education_eval_benchmark_item_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT s.status INTO v_status
    FROM public.education_eval_benchmark_sets s
    WHERE s.id = OLD.benchmark_set_id;
  ELSE
    SELECT s.status INTO v_status
    FROM public.education_eval_benchmark_sets s
    WHERE s.id = NEW.benchmark_set_id;
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Benchmark items can only be changed while the set is draft';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF NEW.case_type = 'regression' THEN
    NEW.metric_eligible := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS education_eval_benchmark_item_draft_guard
  ON public.education_eval_benchmark_items;
CREATE TRIGGER education_eval_benchmark_item_draft_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.education_eval_benchmark_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_education_eval_benchmark_item_v1();

CREATE OR REPLACE FUNCTION public.guard_education_eval_benchmark_activation_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_eligible integer;
BEGIN
  IF NEW.status = 'active' AND OLD.status <> 'active' THEN
    SELECT count(*) INTO v_eligible
    FROM public.education_eval_benchmark_items i
    WHERE i.benchmark_set_id = NEW.id AND i.metric_eligible = true;
    IF v_eligible <> NEW.target_size THEN
      RAISE EXCEPTION 'Benchmark activation requires exactly % eligible questions; found %', NEW.target_size, v_eligible;
    END IF;
    NEW.activated_at := now();
  END IF;
  IF OLD.status = 'active' AND NEW.status <> 'retired' THEN
    RAISE EXCEPTION 'An active benchmark is immutable; retire it and create a new version';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS education_eval_benchmark_activation_guard
  ON public.education_eval_benchmark_sets;
CREATE TRIGGER education_eval_benchmark_activation_guard
  BEFORE UPDATE OF status ON public.education_eval_benchmark_sets
  FOR EACH ROW EXECUTE FUNCTION public.guard_education_eval_benchmark_activation_v1();

REVOKE ALL ON FUNCTION public.guard_education_eval_benchmark_item_v1() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_education_eval_benchmark_activation_v1() FROM PUBLIC, anon, authenticated;

INSERT INTO public.education_eval_benchmark_sets
  (code, version, title, curriculum_version_id, target_size, description)
SELECT 'meb-k12-controlled', 1, 'MEB Kontrollü Başlangıç Benchmark’ı', v.id, 50,
       'Öğretmen onaylı, kaynak ve izin kanıtı doğrulanmış 50 soru. Onaysız regresyon vakaları başarı ölçümüne katılmaz.'
FROM public.curriculum_versions v
WHERE lower(v.authority) = 'meb' AND v.status = 'active'
ORDER BY v.academic_year_start DESC
LIMIT 1
ON CONFLICT (code, version) DO NOTHING;

COMMENT ON TABLE public.education_eval_benchmark_sets IS
  'Versioned Education Eval benchmark sets. Activation requires exactly 50 eligible, teacher-verified items.';
COMMENT ON TABLE public.education_eval_benchmark_items IS
  'Immutable question, answer, objective and source snapshots; regressions never count toward benchmark metrics.';
