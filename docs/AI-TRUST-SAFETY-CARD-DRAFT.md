# Pratium AI Trust & Safety Card — Internal Draft

**Status:** Internal engineering evidence sheet; not a legal notice and not approved for external distribution. Reviewed against the local code snapshot on 25 September 2026. Re-check deployment and provider settings before every external use.

## What the AI does

- Generates or reviews learning questions, explains student-submitted work, creates learning summaries, and can analyze submitted images/visual questions for supported flows.
- Uses the student's quiz context in some tutor interactions (including question text, selected answer, correct answer and explanation) to personalize teaching.
- Records token, provider/model, operation, cost and duration metrics through `lib/ai-usage.ts`; this helper can also associate usage rows with a user ID or quiz session ID. The helper does not store the prompt/response body in `ai_usage_logs`.

## Provider map found in code

| Provider | Verified code use | Important qualification |
|---|---|---|
| Anthropic / Claude | Tutor, coach and several answer/analysis flows call Anthropic directly; see `app/api/chat/route.ts`, `app/api/coach/chat/route.ts`, `app/api/check-answer/route.ts`. | Not all AI traffic is routed through one central gateway. Do not describe Claude as the sole provider. |
| OpenAI | Generation/validation helpers and content/image workflows use OpenAI; see `lib/openai.ts`, `lib/content-quality-scan.ts`, and quiz gateway code. | Feature/model selection may differ by route and environment. |
| Google / Gemini | Multimodal visual-question review and other visual checks use Gemini; see `lib/gemini-visual-quality.ts`. | A failed visual review is intended to fail closed for that visual acceptance path. |
| Mistral | Quiz-provider router supports a configured live fraction and a Mistral adapter; see `lib/ai-gateway/quiz-provider-router.ts`. | Actual production share depends on environment configuration and cannot be inferred from source code alone. |

Supabase is used for application data/authentication. Payment, email, hosting and other vendors must be confirmed from current production configuration and contracts before this card is externally published.

## Controls evidenced in code

- Agent capability allowlists and student/teacher scope checks exist in `lib/agent-security-policy.ts` and agent/teacher API routes.
- Tutor prompts forbid changing grades, mastery, assignments, plans or student profiles; the tutor records a compact decision audit.
- Coach chat currently calls `writeAgentDecisionAudit` for opening and reply events. This corrects older notes claiming the coach was wholly unaudited; batch/cron coach paths still need a separate audit pass.
- Teacher notification now uses an append-oriented attempt/completion audit without putting message text or student IDs in that audit; its existing business history separately stores notification text.
- Agent approval UI/API currently records the teacher's decision only. No executor or end-to-end action runner was found. Approval must not be represented as an action already applied.
- AI usage logging is best-effort; a database logging failure does not fail the user operation. It is therefore operational measurement, not a guaranteed full audit trail.

## Privacy disclosure reconciliation needed

The current public `/privacy` page names Supabase and Anthropic but omits code-evidenced OpenAI, Google/Gemini, and Mistral usage. The separate `/kvkk/aydinlatma` page has unresolved company/address/date placeholders and makes a broad claim that AI payloads are anonymized and contain no identity data. Code shows some prompts include question/answer/learning-history text; although usage logs may store user IDs, provider prompts and each route's minimization behavior need a route-by-route data-flow review before making an absolute anonymity claim.

Recommended review action: legal/privacy owner to approve a vendor-and-purpose disclosure mapped to actual routes, retention/region/subprocessor terms and international-transfer basis. Do not publish a blanket “all content is anonymized” promise until prompt payloads (including uploaded images and free text) are verified. The provider names above are an engineering inventory, not legal advice.

## Claims we should not make yet

- “Every AI action is fully audited” — usage logs are best-effort, and coverage is not universal.
- “Teacher approval executes the action” — there is currently no action execution path in the inspected code.
- “All AI providers see only anonymous data” — not established route-by-route.
- “Production uses X% of provider Y” — source configuration is not the same as live production telemetry.

## Release gate for an external version

1. Confirm the production deployment commit and active provider/environment settings.
2. Map each AI route's exact prompt fields, uploaded media, identifiers and logging fields.
3. Confirm contractual vendor, region, retention, training-use and transfer details with each provider and counsel.
4. Replace placeholders and reconcile `/privacy`, `/kvkk/aydinlatma`, consent UI, and this card under legal/privacy review.
5. Re-run the provider inventory and attach review date, owner and evidence links.
