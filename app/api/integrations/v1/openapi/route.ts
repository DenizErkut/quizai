// Public OpenAPI description of the partner (CRM/ERP) API — no data, no auth. Import it into
// Postman, Zapier, Make, n8n or an ERP connector builder.
export const runtime = 'nodejs'

const listParams = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 500, default: 100 } },
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'next_cursor of the previous page' },
  { name: 'updated_since', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Incremental sync: only rows changed after this time' },
  { name: 'format', in: 'query', schema: { type: 'string', enum: ['json', 'ndjson', 'csv'], default: 'json' }, description: 'csv/ndjson return the cursor in the X-Next-Cursor header' },
]
const read = (summary: string, scope: string) => ({ get: { summary, description: `Required scope: ${scope}`, security: [{ bearer: [] }], parameters: listParams, responses: { '200': { description: 'Page of rows' }, '401': { description: 'Invalid credential' }, '403': { description: 'Scope missing' }, '429': { description: 'Rate limit (120/min)' } } } })
const write = (summary: string, scope: string) => ({ post: { summary, description: `Required scope: ${scope}`, security: [{ bearer: [] }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object' } } } }, responses: { '200': { description: 'Processed' }, '201': { description: 'Created' }, '409': { description: 'Conflict' }, '422': { description: 'Validation / unresolved rows' } } } })

const spec = {
  openapi: '3.0.3',
  info: { title: 'Pratium Partner API', version: '1.0.0', description: 'Institution-scoped export/import for CRM, ERP and school-management systems. Credentials are issued by the institution admin (Kurum → Entegrasyonlar).' },
  servers: [{ url: 'https://pratium.com/api/integrations/v1' }],
  components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', description: 'ptn_live_… key' } } },
  paths: {
    '/institution': read('Institution info (identity fields need institution:read:identity)', 'institution:read'),
    '/students': read('Pseudonymous student list', 'students:read:pseudonymous'),
    '/students/identified': read('Students with name, school no, class, external ids', 'students:read:identified'),
    '/classrooms': read('Classrooms, teachers and memberships', 'classrooms:read'),
    '/quizzes': read('Completed quiz results per student', 'results:read'),
    '/open-ended': read('Graded open-ended results (no answer text)', 'results:read'),
    '/mastery': read('Topic mastery counters', 'mastery:read'),
    '/grades': { ...read('School grades', 'grades:read'), ...write('Import school grades (label must be unique; rows by student_id | school_no | external{system,id})', 'grades:write') },
    '/links': { ...read('CRM/ERP id ↔ student links', 'students:link'), ...write('Upsert links {system, links:[{student_id|school_no, external_id}]}', 'students:link') },
  },
}

export async function GET() {
  return Response.json(spec, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
