# MAT.5 record correction — 2026-10-05

Applied to production with explicit user authorization. This is a data repair, not
a new teacher approval or a retrospective change to assessment evidence.

## Verified outcome

- Published separate current-year revisions for existing verified MAT.5.5.1,
  MAT.5.4.4 and MAT.5.1.4. Their 2027–2028 draft revisions were retained.
- Created benchmark v3 draft (50 items) from v2. Corrected ordinals 7–13 and 15
  from MAT.5.1.1 to MAT.5.5.1. These eight mappings require fresh human review;
  they are not metric-eligible or teacher-approved. The other 42 unchanged item
  approvals retain their original provenance; no ratings were copied.
- Added missing MAT.5.5.1 mappings to the nine questions from the statistics
  source booklet. They remain candidates, pending independent review.
- Corrected four approved pool question mappings: one to MAT.5.1.3, two to
  MAT.5.4.4, one to MAT.5.1.4. Changed mappings invalidate previous AI approvals
  and return to candidate status pending review.
- Quarantined eight approved questions for incorrect answers, ambiguous options,
  missing information, or objective/grade-scope errors. Original question text
  was retained rather than rewritten without fresh assessment.
- All 21 changed pool rows include a `recordCorrection.before` snapshot and
  explicit AI-maintenance provenance. Catalog lifecycle audit actor is NULL;
  no human review was impersonated.
- Final MAT.5 pool counts: 137 approved, 21 candidate, 29 rejected.

## History protection

The transaction compares complete historical item and evaluation-result hashes
before and after repair and rolls back if either changes. v1/v2 benchmark item
hash remained `5fdc038fec26d48822164812169a2fb0`. v1 retains 150 results and
150 human ratings. v2 retains 150 results; its human review was ongoing (79
ratings at verification), so later rating hashes can change independently.

No learning events, student answers, quiz sessions, or old model results were
updated. This targeted repair is not a certificate that every remaining MAT.5
question has passed a new quality audit.

## Next human action

In Admin → Education Eval → Benchmark version, select v3. Review the eight
corrected items using “Soru ve düzeltilmiş kazanımı inceledim — insan onayı ver”.
After all 50 items are eligible, activate v3 and start its own evaluation. v1/v2
scores must not be transferred into v3.

## Official references

- MAT.5.5.1: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/452
- MAT.5.1.3 / MAT.5.1.4: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/449
- MAT.5.4.4: https://tymm.meb.gov.tr/ortaokul-matematik-dersi/unite/451

The operational SQL is `scripts/correct-mat5-records-20261005.sql`. It is guarded
against accidental replay once v3 exists. Rollback should use the before snapshots
after checking for subsequent reviews; never overwrite later teacher work.
