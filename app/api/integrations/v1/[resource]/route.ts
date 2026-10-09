import { apiError } from '@/lib/partner-integration-api'
import { runExport } from '@/lib/partner-export'
import { EXPORT_RESOURCES } from '@/lib/partner-resources'
import { importGrades, upsertLinks } from '@/lib/partner-import'

export const runtime = 'nodejs'
export const maxDuration = 60

type Ctx = { params: Promise<{ resource: string }> }
const notFound = () => apiError('not_found', 'Kaynak bulunamadı.', crypto.randomUUID(), 404)

export async function GET(request: Request, { params }: Ctx) {
  const { resource } = await params
  const definition = Object.hasOwn(EXPORT_RESOURCES, resource) ? EXPORT_RESOURCES[resource] : null
  return definition ? runExport(request, definition) : notFound()
}

export async function POST(request: Request, { params }: Ctx) {
  const { resource } = await params
  if (resource === 'grades') return importGrades(request)
  if (resource === 'links') return upsertLinks(request)
  return notFound()
}
