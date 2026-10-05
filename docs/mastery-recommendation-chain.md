# Mastery-driven next step — milestone 1

The student NextBestAction card and both recommendation read endpoints now share
mastery-next-step-v1. Authenticated student identity scopes cycles, exact objective
state, attempts, guided practice and teacher measurements. No database migration
or fabricated evidence is introduced.

Assigned cycles take precedence over general topic recommendations. Decisions
follow baseline → guided practice → post → teacher review → delayed transfer →
transfer review. The existing stage APIs still enforce authorization, question
quality and disjoint test sets. Invalid timestamps, missing support, mismatched
sessions or missing teacher reviews cannot verify mastery. The 80% threshold is
an operational product criterion, not a calibrated probability or causal claim.
Latest misconception labels remain suspected signals, not diagnoses.

If evidence cannot be read, the card does not fall back to an asserted mastery
decision. Without an assigned cycle, legacy recommendations remain explicitly
general practice suggestions. Independent study-plan generation was removed from
this card; no plan is silently created on page load.

## Milestone 2: objective-linked intervention selection

objective-intervention-v1 reads a bounded 30-day window of the authenticated
student's objective events and reconstructs choices from completed source
sessions. It checks grade/subject/topic and verified objective mapping; assisted
practice is excluded. Question text fingerprints and session identities prevent
repeated submissions from masquerading as independent evidence.

A reviewed catalog label with at least two different question texts and two
sessions permits contrastive practice, not a confirmed diagnosis. Newer correct
counter evidence or competing signals returns diagnostic reflection with a
teacher-review recommendation. Teacher standard overrides and standard pilot
cohorts remain standard. Missing or capped source windows fail closed.

The guided-practice start persists its policy, reason and evidence IDs in the
server-authored practice question snapshot, beside the selected bank question ID.
Existing practices are not rewritten. Targeted selection still excludes all
measurement IDs/texts and requires existing quality approval. If no targeted
candidate remains, generic reflection is explicitly labelled as fallback.
Public responses omit raw evidence IDs, misconception labels and answer keys
before completion. Hints adapt by mode without returning solutions and survive
reload. Intervention delivery/outcome remains the real practice attempt, not a
synthetic completion or teacher approval.

These operational rules have not been validated as a causal or psychological
diagnosis. The product does not automatically close a misconception as resolved.

## Milestone 3: teacher intervention exceptions

The teacher's per-student measurement panel now includes a pending/history
intervention review queue (latest 30 cycles). Only an approved teacher owning
the class with the exact student on its roster may read or write decisions.
Reviews are append-only records in the existing service-only agent audit table.
They bind student/class/teacher/objective/cycle/practice and a content/plan
fingerprint; changed content invalidates the prior review.

Teacher decisions require a rationale: continue, or needs_followup. Follow-up
pauses subsequent guided-practice and measurement requests, including resume
and submission, with a fail-closed read error path. The student's next-step card
and practice page surface the pause. Existing responses, scores and mastery
evidence remain untouched. Continue releases only this workflow pause; it does
not confirm a misconception, create a test or approve verified learning.
Decisions apply to subsequent requests; this is not a transaction-level
cancellation of an already executing request.

A read-only graph audit found six verified prerequisite edges, but only one
current edge with a human reviewer. Missing prerequisite links are unknown,
not proof that an objective has no prerequisites. Automated next-objective
selection therefore remains a separate milestone requiring reviewed graph
coverage and actual transfer-reviewed learning evidence.

## Milestone 4: prerequisite-aware next-objective planning

`next-objective-v1` runs only after the current cycle reaches the exact
teacher-reviewed delayed-transfer threshold. It considers active, verified
catalog objectives connected by a current `prerequisite_of` edge with a human
reviewer and matching curriculum/scope. Missing, expired, unreviewed,
ambiguous or mismatched edges fail closed to teacher review. A single safe
candidate is shown as non-actionable and still requires teacher planning plus a
fresh, unaided baseline; the system never creates a cycle or treats an old
mastery estimate as a new baseline.

## Remaining milestones

1. Validate misconception signals against teacher-reviewed reasoning, and
   evaluate intervention choices/outcomes rather than calling them diagnoses.
2. Provide approved objective-specific micro-content; current practice modes
   are bounded scaffolding, not full lessons.
3. Expand reviewed prerequisite coverage and let teachers start a candidate
   cycle after its fresh baseline is collected.
4. Version and audit decisions, evaluate policy in shadow mode and run genuine
   student pilots. No student answer or teacher approval may be synthesized.

Read-only production audit at implementation start: one assigned cycle, 166
objective mastery rows, zero transfer-reviewed measurements. These counts do
not establish verified learning.
