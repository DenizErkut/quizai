-- Reviewed, explicit record repair. Not a curriculum-wide activation or teacher approval.
-- Before states are retained; locked benchmark questions, runs and ratings are untouched.
BEGIN;
DO $$
DECLARE
  old_catalog public.learning_objective_catalog%ROWTYPE;
  new_revision uuid;
  active_version uuid;
  new_set uuid;
  history_hash text;
  result_hash text;
  repaired integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('mat5-record-repair-20261005'));
  IF EXISTS (SELECT 1 FROM education_eval_benchmark_sets WHERE code='meb-k12-controlled' AND version=3) THEN
    RAISE EXCEPTION 'v3 already exists; inspect rather than overwrite';
  END IF;
  SELECT md5(string_agg(to_jsonb(i)::text,'' ORDER BY id)) INTO history_hash
    FROM education_eval_benchmark_items i;
  SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY id)) INTO result_hash
    FROM education_eval_run_results r;
  SELECT id INTO STRICT active_version FROM curriculum_versions
    WHERE code='MEB-2026-2027' AND status='active';

  -- These three already verified official objectives were imported into the future
  -- draft year. Publish a separate current-year revision, retaining the future draft.
  FOR old_catalog IN SELECT * FROM learning_objective_catalog
    WHERE objective_code IN ('MAT.5.5.1','MAT.5.4.4','MAT.5.1.4')
      AND verification_status='verified' FOR UPDATE
  LOOP
    IF old_catalog.lifecycle_status <> 'draft' OR old_catalog.is_active THEN
      RAISE EXCEPTION 'Unexpected catalog state for %',old_catalog.objective_code;
    END IF;
    INSERT INTO learning_objective_revisions
      (objective_id,curriculum_version_id,revision_number,revision_status,objective_code,
       title,level,grade,subject,unit,topic,topic_node_id,source_type,source_reference,
       content_hash,change_reason,created_by,published_at)
    SELECT old_catalog.id,active_version,coalesce(max(revision_number),0)+1,'published',
      old_catalog.objective_code,old_catalog.title,old_catalog.level,old_catalog.grade,
      old_catalog.subject,old_catalog.unit,old_catalog.topic,old_catalog.topic_node_id,
      old_catalog.source_type,old_catalog.source_reference,
      md5(concat_ws('|',old_catalog.objective_code,old_catalog.title,old_catalog.level,
        old_catalog.grade,old_catalog.subject,old_catalog.unit,old_catalog.topic,old_catalog.topic_node_id::text)),
      'AI maintenance, user-authorized 2026-10-05: verified MEB objective belongs in current curriculum; future draft retained. No new teacher review claimed.',NULL,now()
    FROM learning_objective_revisions WHERE objective_id=old_catalog.id
    RETURNING id INTO new_revision;
    UPDATE learning_objective_catalog SET curriculum_version_id=active_version,
      current_revision_id=new_revision,lifecycle_status='active',is_active=true,
      valid_from='2026-09-01',valid_to=NULL,updated_at=now()
      WHERE id=old_catalog.id;
    UPDATE learning_graph_nodes SET is_active=true,metadata=coalesce(metadata,'{}') ||
      jsonb_build_object('curriculum_version_id',active_version,'objective_revision_id',new_revision),
      updated_at=now() WHERE id=old_catalog.graph_node_id;
    INSERT INTO learning_graph_edges
      (source_node_id,target_node_id,edge_type,confidence,rationale,source_type,is_verified,reviewed_by)
    VALUES (old_catalog.graph_node_id,old_catalog.topic_node_id,'part_of',1.000,
      'AI maintenance: scope retained from existing verified import; current-year revision repair.',
      'objective_revision',true,NULL)
    ON CONFLICT (source_node_id,target_node_id,edge_type) DO UPDATE SET
      is_verified=true,rationale=EXCLUDED.rationale,updated_at=now();
    INSERT INTO learning_objective_lifecycle_audit
      (objective_id,action,actor_id,reason,before_state,after_state)
    SELECT old_catalog.id,'publish_revision',NULL,
      'AI maintenance, user-authorized 2026-10-05; official MEB source checked; future draft preserved; not a new human approval.',
      to_jsonb(old_catalog),to_jsonb(c) FROM learning_objective_catalog c WHERE id=old_catalog.id;
  END LOOP;
  IF (SELECT count(*) FROM learning_objective_catalog WHERE objective_code IN
    ('MAT.5.5.1','MAT.5.4.4','MAT.5.1.4') AND is_active AND curriculum_version_id=active_version) <> 3 THEN
    RAISE EXCEPTION 'Expected three current-year verified objectives';
  END IF;

  INSERT INTO education_eval_benchmark_sets
    (code,version,title,curriculum_version_id,target_size,status,description)
  VALUES ('meb-k12-controlled',3,'MEB kontrollü başlangıç seti — MAT.5 kazanım düzeltmeleri v3',
    active_version,50,'draft','2026-10-05: v1/v2 ve insan puanları değişmedi. 8 istatistik sorusu resmî MAT.5.5.1 ile düzeltildi; değişen eşleşmeler yeni insan incelemesi bekler.')
  RETURNING id INTO new_set;
  INSERT INTO education_eval_benchmark_items
    (benchmark_set_id,ordinal,case_type,source_type,source_resource_id,question_bank_id,
     source_version,source_reference,grade,subject,objective_id,objective_code,objective_title,
     question_snapshot,answer_key,teacher_approved,approval_evidence_paths,evidence_verified_by,
     evidence_verified_at,reviewed_by,reviewed_at,metric_eligible,review_notes)
  SELECT new_set,ordinal,case_type,source_type,source_resource_id,question_bank_id,
    source_version,source_reference,grade,subject,objective_id,objective_code,objective_title,
    question_snapshot,answer_key,teacher_approved,approval_evidence_paths,evidence_verified_by,
    evidence_verified_at,reviewed_by,reviewed_at,metric_eligible,review_notes
  FROM education_eval_benchmark_items WHERE benchmark_set_id=(SELECT id FROM
    education_eval_benchmark_sets WHERE code='meb-k12-controlled' AND version=2);
  UPDATE education_eval_benchmark_items i SET objective_id=o.id,
    objective_code=o.objective_code,objective_title=o.title,
    question_snapshot=i.question_snapshot || jsonb_build_object('learningObjectiveId',o.id,
      'learningObjectiveCode',o.objective_code,'learningObjectiveRevisionId',o.current_revision_id,
      'curriculumVersionId',active_version,'objectiveMappingStatus','review_required','objectiveVerified',false),
    teacher_approved=false,reviewed_by=NULL,reviewed_at=NULL,metric_eligible=false,
    review_notes='AI düzeltmesi 2026-10-05: önceki MAT.5.1.1 doğal sayı etiketi yanlıştı. Resmî kaynak: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/452. Doğru kazanım MAT.5.5.1; soru ve cevap değişmedi. Yeni eşleşme insan incelemesi bekliyor; eski puanlar taşınmadı.'
  FROM learning_objective_catalog o WHERE o.objective_code='MAT.5.5.1'
    AND i.benchmark_set_id=new_set AND i.ordinal IN (7,8,9,10,11,12,13,15)
    AND i.objective_code='MAT.5.1.1';
  GET DIAGNOSTICS repaired=ROW_COUNT;
  IF repaired <> 8 THEN RAISE EXCEPTION 'Expected 8 benchmark corrections, got %',repaired; END IF;

  -- Exact source identity, not semantic guessing: all nine source booklet questions
  -- are explicitly labeled MAT.5.5.1. Keep candidates pending independent review.
  UPDATE question_bank b SET question=b.question || jsonb_build_object(
    'learningObjectiveId',o.id,'learningObjectiveCode',o.objective_code,
    'learningObjectiveRevisionId',o.current_revision_id,'curriculumVersionId',active_version,
    'objectiveMappingStatus','review_required','objectiveVerified',false,
    'objectiveReviewException','corrected_mapping_requires_new_review',
    'recordCorrection',jsonb_build_object('policy','mat5-record-repair-20261005',
      'actorType','ai_maintenance','reason','Printed booklet code and official MEB source agree: MAT.5.5.1.',
      'reviewedAt',now(),'before',to_jsonb(b))),
    awaiting_expert_review=true,updated_at=now()
  FROM learning_objective_catalog o WHERE o.objective_code='MAT.5.5.1'
    AND b.question->>'bookletResourceId'='cd5e1c20-40f6-4c83-9f6f-4195808b26cd'
    AND b.review_status='candidate' AND b.question->>'learningObjectiveCode' IS NULL;
  GET DIAGNOSTICS repaired=ROW_COUNT;
  IF repaired <> 9 THEN RAISE EXCEPTION 'Expected 9 source mappings, got %',repaired; END IF;

  -- Specific reviewed questions: retain answers/content and old approvals in before
  -- snapshots, invalidate reuse approval when the objective changes.
  UPDATE question_bank b SET question=(b.question - 'objectiveBackfillReview' - 'objectiveProductionReview') ||
    jsonb_build_object('learningObjectiveId',o.id,'learningObjectiveCode',o.objective_code,
      'learningObjectiveRevisionId',o.current_revision_id,'curriculumVersionId',active_version,
      'objectiveMappingStatus','review_required','objectiveVerified',false,
      'qualityVerificationVersion',NULL,'objectiveReviewException','corrected_mapping_requires_new_review',
      'recordCorrection',jsonb_build_object('policy','mat5-record-repair-20261005',
        'actorType','ai_maintenance','reason',m.reason,'reviewedAt',now(),'before',to_jsonb(b))),
    review_status='candidate',awaiting_expert_review=true,updated_at=now()
  FROM (VALUES
    ('02029309-cfc4-4cd0-8433-995991447d85'::uuid,'MAT.5.1.3','Parça-bütün oranını kesir olarak temsil ediyor; doğal sayı etiketi yerine kesir temsili.'),
    ('17f8389b-30cd-44ec-b043-45180cbc3087'::uuid,'MAT.5.4.4','Dikdörtgen çevresi 2×(4+9)=26 cm; geometri kazanımı.'),
    ('7423ed62-e8ab-4bcf-b0ae-abd30987721f'::uuid,'MAT.5.4.4','Dikdörtgen çevresi; geometri kazanımı.'),
    ('890922e4-5a43-4fbb-86fb-1755b27c9e66'::uuid,'MAT.5.1.4','Ondalık gösterimleri karşılaştırıyor; doğal sayı problemi değil.')
  ) m(id,code,reason),learning_objective_catalog o
  WHERE b.id=m.id AND o.objective_code=m.code AND b.review_status='approved'
    AND b.question->>'learningObjectiveCode'='MAT.5.1.2';
  GET DIAGNOSTICS repaired=ROW_COUNT;
  IF repaired <> 4 THEN RAISE EXCEPTION 'Expected 4 corrected pool mappings, got %',repaired; END IF;

  UPDATE question_bank b SET question=(b.question - 'objectiveBackfillReview' - 'objectiveProductionReview') ||
    jsonb_build_object('objectiveMappingStatus','review_required','objectiveVerified',false,
      'qualityVerificationVersion',NULL,'objectiveReviewException','mat5_scope_or_answer_error',
      'recordCorrection',jsonb_build_object('policy','mat5-record-repair-20261005',
        'actorType','ai_maintenance','reason',m.reason,'reviewedAt',now(),'before',to_jsonb(b))),
    review_status='candidate',awaiting_expert_review=true,updated_at=now()
  FROM (VALUES
    ('32fcdfb1-4024-4393-b3da-7f5637821e63'::uuid,'Başlangıç 12,5 kg zaten 13 kg altında; tüm seçenekler yeterli. Tek doğru cevap yok; negatif üsler 5. sınıf kazanımıyla uyumsuz.'),
    ('9da94d2b-fa82-4727-8b49-a74f08f8ab43'::uuid,'Birden fazla yetersiz eşya; tablet çıkarma hesabı yanlış; kaynak tablo eksik. Tek doğru cevap güvenilir değil.'),
    ('0ac5cae4-570c-49dd-9ed6-3330e90d37b8'::uuid,'(x−4)+(3x+2) cebirsel ifade sadeleştirme, MAT.5.1.2 doğal sayı problem kazanımı değildir.'),
    ('86165b3b-c141-4871-b6f0-07a56418470e'::uuid,'Ondalık sayılarla toplama, MAT.5.1.2 doğal sayı problemleri kapsamında değildir; uygun sınıf/kazanım incelemesi gerekir.'),
    ('ab0dfb84-b0d8-41f7-9adc-ef98fb5466b3'::uuid,'Ondalık toplama, doğal sayı kazanımı değil; sınıf/kazanım incelemesi gerekir.'),
    ('e8bc33a2-cea1-4233-b483-8f3ddad762cc'::uuid,'Ondalık toplama ve çıkarma, doğal sayı kazanımı değil; sınıf/kazanım incelemesi gerekir.'),
    ('d0ef11be-171d-455c-9551-bb3966180d03'::uuid,'0,75/1 = 0,75 = 75/100; soru hatalı varsayım içeriyor, açıklama matematiksel olarak yanlış.'),
    ('f9ddf401-bd13-422d-9ffb-567ae965cad2'::uuid,'Kesirlerle toplama sorusu, kesirlerin farklı temsili kazanımı değil. MEB 5. sınıf teması kesir toplama beklemez.')
  ) m(id,reason) WHERE b.id=m.id AND b.review_status='approved';
  GET DIAGNOSTICS repaired=ROW_COUNT;
  IF repaired <> 8 THEN RAISE EXCEPTION 'Expected 8 quarantined questions, got %',repaired; END IF;

  IF (SELECT md5(string_agg(to_jsonb(i)::text,'' ORDER BY id)) FROM education_eval_benchmark_items i
      WHERE benchmark_set_id<>new_set) IS DISTINCT FROM history_hash THEN
    RAISE EXCEPTION 'Historical benchmark changed; rolling back';
  END IF;
  IF (SELECT md5(string_agg(to_jsonb(r)::text,'' ORDER BY id)) FROM education_eval_run_results r)
      IS DISTINCT FROM result_hash THEN RAISE EXCEPTION 'Past results changed; rolling back'; END IF;
END $$;
COMMIT;
