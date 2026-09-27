# MEB Question Evaluation Suite v1

## Purpose and claim boundary

This suite separates two things that must not be conflated:

- Safety regressions protect against a known failure mode and may be added from a reproduced product defect.
- Benchmark cases measure educational correctness only after a qualified teacher has reviewed and approved the question, answer, explanation, official objective code, curriculum version, and source evidence.

An AI/model review, automated test pass, or product-owner report is not teacher approval. Pending or rejected cases never contribute to benchmark pass rates or MEB coverage claims.

## Current state

`data/evals/meb/question-benchmark-v1.json` contains one reproduced answerability regression for a minimum-cube question whose three orthographic views provide only scalar counts, not occupied-cell layouts. It is explicitly pending teacher review and has no claimed MEB objective mapping. The deterministic guard is tested, but the item is not currently a validated MEB benchmark case.

Therefore v1 currently reports zero approved benchmark items and no benchmark pass rate. This is intentional; a non-zero rate without approved items would be misleading.

## Adding a case

Each case must have a stable ID, provenance reference, question payload, and expected result. For a benchmark case, include the authoritative objective code, curriculum version and official source reference. To mark it `approved`, also record the reviewer identity, review timestamp, and evidence reference. Review should explicitly check answerability, keyed answer, distractors, explanation, grade appropriateness, objective alignment, and visual/data alignment where applicable.

Keep a case `pending_teacher_review` until that review is recorded. Do not backdate or infer review fields. Candidate items can still be used for a narrow deterministic safety regression, but they cannot support educational-quality claims.

## Run and interpretation

Run `npx playwright test e2e/meb-eval-suite.spec.ts`. The regression failure count is a safety signal. `benchmarkPassRate` is `null` until there is at least one approved benchmark case; it is not zero percent. The manifest contains no student PII and is safe to run in CI.

## Limitations / next gate

This is infrastructure and a first regression fixture, not the requested 20–30-case teacher-verified MEB suite. Before claiming a benchmark, a teacher/content reviewer must approve a representative fixed set across objectives, grade levels, difficulty levels, and visual/context-based formats. Cases should be versioned with the curriculum so old test evidence remains interpretable.
