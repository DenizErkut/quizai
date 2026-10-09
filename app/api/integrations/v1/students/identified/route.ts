import { runExport } from '@/lib/partner-export'
import { identifiedStudents } from '@/lib/partner-resources'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: Request) {
  return runExport(request, identifiedStudents)
}
