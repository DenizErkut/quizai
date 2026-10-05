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

## Remaining milestones

1. Diagnose misconceptions using objective-specific, repeated distractor and
   reasoning evidence; keep uncertainty and teacher exceptions visible.
2. Select an intervention with rationale and record delivery/outcome linkage.
3. Select the next objective using verified evidence and explicit prerequisite
   rules, with a fresh baseline. Until implemented, verified cycles request
   teacher planning rather than inventing a new objective.
4. Version and audit decisions, evaluate policy in shadow mode and run genuine
   student pilots. No student answer or teacher approval may be synthesized.

Read-only production audit at implementation start: one assigned cycle, 166
objective mastery rows, zero transfer-reviewed measurements. These counts do
not establish verified learning.
