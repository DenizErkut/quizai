-- One-time historical review. Existing teacher decisions are preserved.
CREATE TABLE public.historical_objective_backfill_runs (
  id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  cutoff timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','complete','stopped')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.historical_objective_backfill_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historical_objective_backfill_runs FROM PUBLIC,anon,authenticated;
GRANT SELECT, INSERT, UPDATE ON public.historical_objective_backfill_runs TO service_role;

CREATE TABLE public.historical_objective_backfill_reviews (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id uuid NOT NULL,
  source text NOT NULL CHECK (source IN ('bank', 'sessions')),
  record_id uuid NOT NULL,
  question_index integer NOT NULL,
  previous_question jsonb NOT NULL,
  previous_bank_state jsonb,
  previous_event_mappings jsonb,
  applied_question jsonb NOT NULL,
  review jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, source, record_id, question_index)
);
ALTER TABLE public.historical_objective_backfill_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.historical_objective_backfill_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.historical_objective_backfill_reviews TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.historical_objective_backfill_reviews_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.apply_historical_objective_backfill_review(
  p_run_id uuid, p_source text, p_record_id uuid, p_question_index integer,
  p_expected_question jsonb, p_objective_id uuid, p_review jsonb,
  p_bank_fingerprint text, p_bank_grade text, p_bank_subject text, p_bank_topic text,
  p_reusable_question jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_question jsonb;
  v_updated jsonb;
  v_questions jsonb;
  v_grade text;
  v_subject text;
  v_objective public.learning_objective_catalog%ROWTYPE;
  v_bank public.question_bank%ROWTYPE;
  v_existing public.question_bank%ROWTYPE;
  v_review jsonb := p_review;
  v_approved boolean := coalesce(p_review->>'decision', '') = 'approved';
  v_difficulty_ok boolean := false;
  v_bank_state jsonb;
  v_old_events jsonb;
  v_events integer := 0;
  v_added boolean := false;
  v_run public.historical_objective_backfill_runs%ROWTYPE;
  v_mapping jsonb;
BEGIN
  SELECT * INTO v_run FROM public.historical_objective_backfill_runs WHERE id=p_run_id AND status='running' AND expires_at>now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Historical run not active'; END IF;
  IF p_source NOT IN ('bank', 'sessions') OR p_run_id IS NULL
    OR (p_source='bank' AND p_question_index<>-1)
    OR p_review->>'runId' IS DISTINCT FROM p_run_id::text
    OR p_review->>'policyVersion' IS DISTINCT FROM 'historical-objective-backfill-v1'
    OR p_review->>'decision' NOT IN ('approved', 'rejected')
    OR length(coalesce(p_review->>'reason', '')) < 8 THEN
    RAISE EXCEPTION 'Invalid historical review';
  END IF;
  IF EXISTS (SELECT 1 FROM public.historical_objective_backfill_reviews
    WHERE run_id=p_run_id AND source=p_source AND record_id=p_record_id AND question_index=p_question_index) THEN
    RETURN jsonb_build_object('status', 'already_applied', 'updatedEvents', 0);
  END IF;
  IF p_source='bank' THEN
    SELECT * INTO v_bank FROM public.question_bank WHERE id=p_record_id AND created_at<=v_run.cutoff FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    v_question := v_bank.question;
    v_grade := v_bank.grade_key;
    v_subject := v_bank.subject_key;
    v_bank_state := jsonb_build_object('review_status', v_bank.review_status, 'quality_score', v_bank.quality_score,
      'awaiting_expert_review', v_bank.awaiting_expert_review, 'updated_at', v_bank.updated_at);
  ELSE
    SELECT questions::jsonb, grade INTO v_questions, v_grade FROM public.quiz_sessions WHERE id=p_record_id AND completed AND created_at<=v_run.cutoff FOR UPDATE;
    IF NOT FOUND OR p_question_index<0 OR p_question_index>=jsonb_array_length(v_questions) THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
    v_question := v_questions->p_question_index;
    v_subject := coalesce(nullif(v_question->>'subject', ''), p_bank_subject);
  END IF;
  IF v_question IS DISTINCT FROM p_expected_question THEN RETURN jsonb_build_object('status', 'conflict'); END IF;
  IF v_question->>'objectiveMappingStatus' IN ('human_approved','human_rejected','ai_approved','ai_rejected') THEN
    RETURN jsonb_build_object('status', 'already_reviewed');
  END IF;
  IF v_approved THEN
    SELECT c.* INTO v_objective FROM public.learning_objective_catalog c
    JOIN public.curriculum_versions version ON version.id=c.curriculum_version_id AND version.status='active'
    WHERE c.id=p_objective_id AND c.is_active AND c.verification_status='verified' AND c.lifecycle_status='active';
    IF NOT FOUND OR v_objective.current_revision_id IS NULL
      OR p_review->>'objectiveRevisionId' IS DISTINCT FROM v_objective.current_revision_id::text
      OR p_review->>'objectiveTitle' IS DISTINCT FROM v_objective.title
      OR substring(v_grade from '[0-9]+') IS DISTINCT FROM substring(v_objective.grade from '[0-9]+')
      OR regexp_replace(translate(lower(v_subject), 'çğıöşü', 'cgiosu'), '[^a-z0-9]', '', 'g')
         IS DISTINCT FROM regexp_replace(translate(lower(v_objective.subject), 'çğıöşü', 'cgiosu'), '[^a-z0-9]', '', 'g') THEN
      RAISE EXCEPTION 'Objective lifecycle or dimensions changed';
    END IF;
    IF jsonb_typeof(p_review->'audits') IS DISTINCT FROM 'array' OR jsonb_array_length(p_review->'audits')<>2 THEN RAISE EXCEPTION 'Two audits required'; END IF;
    IF (SELECT count(DISTINCT a->>'provider') FROM jsonb_array_elements(p_review->'audits') a) <> 2
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_review->'audits') a
        WHERE a->'approved' IS DISTINCT FROM 'true'::jsonb OR a->>'objectiveCode' IS DISTINCT FROM v_objective.objective_code
          OR (a->>'score')::numeric<80
          OR jsonb_typeof(a->'score') IS DISTINCT FROM 'number'
          OR a->'answerCorrect' IS DISTINCT FROM 'true'::jsonb
          OR a->'explanationConsistent' IS DISTINCT FROM 'true'::jsonb
          OR a->'ageAppropriate' IS DISTINCT FROM 'true'::jsonb
          OR a->'unambiguous' IS DISTINCT FROM 'true'::jsonb
          OR a->'directObjectiveMatch' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'Independent audits did not agree'; END IF;
    v_difficulty_ok := length(coalesce(p_reusable_question->>'difficulty', ''))>0 AND NOT EXISTS
      (SELECT 1 FROM jsonb_array_elements(p_review->'audits') a WHERE a->'difficultyMatches' IS DISTINCT FROM 'true'::jsonb);
  ELSIF p_objective_id IS NOT NULL THEN RAISE EXCEPTION 'Rejected review must not map an objective';
  END IF;

  v_updated := (v_question - 'historicalBankQuality' - 'qualityVerificationVersion') || jsonb_build_object(
    'learningObjectiveId', CASE WHEN v_approved THEN v_objective.id ELSE NULL END,
    'learningObjectiveCode', CASE WHEN v_approved THEN v_objective.objective_code ELSE NULL END,
    'learningObjectiveRevisionId', CASE WHEN v_approved THEN v_objective.current_revision_id ELSE NULL END,
    'curriculumVersionId', CASE WHEN v_approved THEN v_objective.curriculum_version_id ELSE NULL END,
    'objectiveVerified', v_approved, 'difficultyVerified', v_difficulty_ok,
    'objectiveMappingStatus', CASE WHEN v_approved THEN 'ai_approved' ELSE 'ai_rejected' END,
    'objectiveMappingVersion', 'historical-objective-backfill-v1',
    'objectiveBackfillReview', p_review);
  IF v_approved AND v_difficulty_ok THEN
    v_updated := v_updated || jsonb_build_object('difficulty', p_reusable_question->>'difficulty', 'qualityVerificationVersion', 'historical-objective-backfill-v1');
  END IF;
  v_mapping := jsonb_build_object('learningObjectiveId', v_updated->'learningObjectiveId', 'learningObjectiveCode', v_updated->'learningObjectiveCode',
    'learningObjectiveRevisionId', v_updated->'learningObjectiveRevisionId', 'curriculumVersionId', v_updated->'curriculumVersionId',
    'objectiveVerified', v_approved, 'difficultyVerified', v_difficulty_ok,
    'objectiveMappingStatus', v_updated->'objectiveMappingStatus', 'objectiveMappingVersion','historical-objective-backfill-v1', 'objectiveBackfillReview',p_review);
  IF v_difficulty_ok THEN v_mapping := v_mapping || jsonb_build_object('qualityVerificationVersion','historical-objective-backfill-v1'); END IF;

  IF p_source='bank' THEN
    v_review := p_review || jsonb_build_object('poolStatus', CASE WHEN v_approved AND v_bank.report_count=0 AND NOT v_bank.awaiting_expert_review
      AND v_bank.review_status IN ('candidate','approved') THEN 'approved' ELSE 'excluded' END);
    v_updated := v_updated || jsonb_build_object('objectiveBackfillReview', v_review);
    UPDATE public.question_bank SET question=v_updated, updated_at=now(),
      review_status=CASE WHEN v_approved AND report_count=0 AND NOT awaiting_expert_review AND review_status IN ('candidate','approved') THEN 'approved'
        WHEN NOT v_approved AND review_status IN ('candidate','approved') THEN 'candidate' ELSE review_status END,
      awaiting_expert_review=CASE WHEN NOT v_approved THEN true ELSE awaiting_expert_review END,
      quality_score=CASE WHEN v_approved THEN least(1, (p_review->>'score')::numeric/100) ELSE 0 END
      WHERE id=p_record_id;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'objectiveId', learning_objective_id)), '[]'::jsonb)
      INTO v_old_events FROM public.learning_events WHERE source_type='quiz_session' AND source_id=p_record_id AND question_index=p_question_index;
    v_review := p_review || jsonb_build_object('poolStatus', 'excluded');
    IF v_approved AND p_bank_fingerprint ~ '^[a-f0-9]{64}$'
      AND NOT coalesce((v_question->>'sourceBased')::boolean, false) AND NOT (v_question ? 'passage')
      AND NOT coalesce((v_question->>'hasVisual')::boolean, false) AND NOT (v_question ? 'svg') AND NOT (v_question ? 'chartData') THEN
      SELECT * INTO v_existing FROM public.question_bank WHERE fingerprint=p_bank_fingerprint FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.question_bank (fingerprint,subject_key,topic_key,grade_key,language_key,question_type,difficulty,question,
          review_status,quality_score,source_session_id,source_engine,awaiting_expert_review,ai_policy_version,promoted_at)
        VALUES (p_bank_fingerprint,p_bank_subject,p_bank_topic,p_bank_grade,'tr',coalesce(v_question->>'type','multiple_choice'),
          coalesce(p_reusable_question->>'difficulty','normal'),p_reusable_question || v_mapping,
          'approved',least(1,(p_review->>'score')::numeric/100),p_record_id,'historical_objective_review',false,'historical-objective-backfill-v1',now())
        ON CONFLICT (fingerprint) DO NOTHING;
        v_added := FOUND;
        v_review := p_review || jsonb_build_object('poolStatus', CASE WHEN v_added THEN 'added' ELSE 'already_in_bank' END);
      ELSIF v_existing.subject_key=p_bank_subject AND v_existing.grade_key=p_bank_grade AND v_existing.review_status='approved'
        AND v_existing.report_count=0 AND NOT v_existing.awaiting_expert_review THEN
        v_review := p_review || jsonb_build_object('poolStatus','already_in_bank');
      END IF;
    END IF;
    v_updated := v_updated || jsonb_build_object('objectiveBackfillReview', v_review);
    v_questions := jsonb_set(v_questions, ARRAY[p_question_index::text], v_updated);
    UPDATE public.quiz_sessions SET questions=v_questions,
      objective_mapped_count=(SELECT count(*) FROM jsonb_array_elements(v_questions) q WHERE nullif(q->>'learningObjectiveId','') IS NOT NULL),
      objective_mapping_version='historical-objective-backfill-v1' WHERE id=p_record_id;
    UPDATE public.learning_events SET learning_objective_id=CASE WHEN v_approved THEN v_objective.id ELSE NULL END
      WHERE source_type='quiz_session' AND source_id=p_record_id AND question_index=p_question_index;
    GET DIAGNOSTICS v_events = ROW_COUNT;
  END IF;
  INSERT INTO public.historical_objective_backfill_reviews (run_id,source,record_id,question_index,previous_question,previous_bank_state,previous_event_mappings,applied_question,review)
    VALUES (p_run_id,p_source,p_record_id,p_question_index,v_question,v_bank_state,v_old_events,v_updated,v_review);
  RETURN jsonb_build_object('status','applied','updatedEvents',v_events,'addedToBank',v_added,'decision',p_review->>'decision');
END;
$$;
REVOKE ALL ON FUNCTION public.apply_historical_objective_backfill_review(uuid,text,uuid,integer,jsonb,uuid,jsonb,text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_historical_objective_backfill_review(uuid,text,uuid,integer,jsonb,uuid,jsonb,text,text,text,text,jsonb) TO service_role;
