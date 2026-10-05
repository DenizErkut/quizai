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

## Remaining milestones

1. Validate misconception signals against teacher-reviewed reasoning, and
   evaluate intervention choices/outcomes rather than calling them diagnoses.
2. Provide a teacher-facing exception workflow and approved objective-specific
   micro-content; current practice modes are bounded scaffolding, not full lessons.
3. Select the next objective using verified evidence and explicit prerequisite
   rules, with a fresh baseline. Until implemented, verified cycles request
   teacher planning rather than inventing a new objective.
4. Version and audit decisions, evaluate policy in shadow mode and run genuine
   student pilots. No student answer or teacher approval may be synthesized.

Read-only production audit at implementation start: one assigned cycle, 166
objective mastery rows, zero transfer-reviewed measurements. These counts do
not establish verified learning.
