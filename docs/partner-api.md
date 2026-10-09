# Pratium Partner API (v1)

Institution-scoped export/import for CRM, ERP and school-management systems. Machine-readable spec: `GET /api/integrations/v1/openapi`.

## Credentials
The institution admin creates a key in **Kurum → Entegrasyonlar**. The secret (`ptn_live_…`) is shown once; keys expire (default 90 days, max 1 year) and can be revoked any time. Send `Authorization: Bearer <key>`.

Scopes (each key gets only what the admin ticks):

| Scope | Gives |
|---|---|
| `institution:read`, `students:read:pseudonymous` | institution name, pseudonymous student list (default) |
| `institution:read:identity` | institution code, contact e-mail, status |
| `students:read:identified` | name, school no, grade, school, classes, external ids |
| `classrooms:read` | classes, teacher names, memberships |
| `results:read` | quiz and open-ended scores (no question/answer text) |
| `mastery:read` | topic right/wrong counters |
| `grades:read` / `grades:write` | school grades export / import |
| `students:link` | map CRM/ERP record ids to students |

Everything except the first two requires the admin's **data-processing acknowledgement** at issue time (stored on the key). Phone, e-mail, parent data, personal study notes, coach chats and raw answers are never exported.

## Export (GET)
`/students/identified`, `/classrooms`, `/quizzes`, `/open-ended`, `/mastery`, `/grades`, `/links`

Query: `limit` (≤500, students ≤100), `cursor`, `updated_since` (ISO time, for incremental sync), `format=json|ndjson|csv` (csv/ndjson put the cursor in `X-Next-Cursor`). CSV cells beginning with `= + - @` are neutralised against spreadsheet formula injection.

Rows carry `student_id` (keys with `students:read:identified`) or only the pseudonymous `student_ref`.

## Import (POST)
`POST /grades` `{ "label": "2026-1. dönem", "strict": false, "rows": [{ "school_no": "250", "subjects": { "Matematik": "85" } }] }` — locate a student with `student_id`, `school_no` or `external:{system,id}`. A label can be used once (safe retries → `409 duplicate_label`). Unmatched rows are returned in `rejected`; with `strict:true` nothing is imported if any row is unmatched.

`POST /links` `{ "system": "hubspot", "links": [{ "school_no": "250", "external_id": "contact-991" }] }` — upsert per (system, student); an external id owned by another student is rejected.

## Limits and audit
120 requests/minute per key. Every call (including denied ones) is written to the audit log with endpoint, status and request id. Body limit ~2 MB, grades ≤1000 rows, links ≤500.
