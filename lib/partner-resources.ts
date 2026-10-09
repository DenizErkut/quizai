// Export / import resources of the partner (CRM/ERP) API v1. Each resource is tenant-scoped to the
// integration's institution; identified scopes additionally require the institution admin's
// data-processing acknowledgement when the credential is issued.
import { studentRef, type PartnerIntegration } from '@/lib/partner-integration-api'
import { getIdentitiesBySupabaseIds } from '@/lib/identity/client'
import { institutionStudentIds, type ExportContext, type ExportResource } from '@/lib/partner-export'

type Row = Record<string, unknown>

function rpcResource(name: string, scope: string, fn: string, mapRow: (row: Row, integration: PartnerIntegration) => Row = row => row): ExportResource {
  return {
    name, scope,
    fetch: async (ctx: ExportContext) => {
      const { data, error } = await ctx.db.rpc(fn, { p_institution: ctx.integration.institution_id, p_since: ctx.since, p_limit: ctx.limit + 1, p_offset: ctx.offset })
      if (error) throw new Error(fn)
      return ((data ?? []) as Row[]).map(row => mapRow(row, ctx.integration))
    },
  }
}

function withStudent(row: Row, integration: PartnerIntegration): Row {
  const { user_id, ...rest } = row
  return { ...studentRef(integration, String(user_id)), ...rest }
}

const classrooms = rpcResource('classrooms', 'classrooms:read', 'partner_export_classrooms', (row, integration) => {
  const { student_user_ids, ...rest } = row
  const ids = Array.isArray(student_user_ids) ? (student_user_ids as string[]) : []
  return { ...rest, students: ids.map(id => studentRef(integration, id)) }
})

const identifiedStudents: ExportResource = {
  name: 'students_identified', scope: 'students:read:identified', maxLimit: 100,
  fetch: async ctx => {
    const institutionId = ctx.integration.institution_id
    let query = ctx.db.from('institution_users').select('user_id, joined_at').eq('institution_id', institutionId).eq('role', 'student')
      .or('is_active.is.null,is_active.eq.true').order('user_id', { ascending: true })
    if (ctx.since) query = query.gt('joined_at', ctx.since)
    const { data: members, error } = await query.range(ctx.offset, ctx.offset + ctx.limit)
    if (error) throw new Error('members')
    const page = (members ?? []) as Array<{ user_id: string; joined_at: string | null }>
    const ids = page.slice(0, ctx.limit).map(member => member.user_id)
    if (!ids.length) return []
    const [profiles, identities, memberships, links] = await Promise.all([
      ctx.db.from('profiles').select('id, grade, class_number, school').in('id', ids),
      getIdentitiesBySupabaseIds(ids).catch(() => ({} as Record<string, { full_name?: string }>)),
      ctx.db.from('classroom_students').select('classroom_id, student_id').in('student_id', ids),
      ctx.db.from('partner_external_links').select('student_id, system, external_id').eq('institution_id', institutionId).in('student_id', ids),
    ])
    if (profiles.error || memberships.error || links.error) throw new Error('students')
    const classroomIds = [...new Set((memberships.data ?? []).map((m: { classroom_id: string }) => m.classroom_id))]
    const classroomRows = classroomIds.length ? (await ctx.db.from('classrooms').select('id, name').in('id', classroomIds)).data ?? [] : []
    const classroomName = new Map(classroomRows.map((c: { id: string; name: string }) => [c.id, c.name]))
    const profileById = new Map((profiles.data ?? []).map((p: { id: string }) => [p.id, p as Row]))
    const out: Row[] = page.slice(0, ctx.limit).map(member => {
      const profile = profileById.get(member.user_id) || {}
      const externalIds: Record<string, string> = {}
      for (const link of (links.data ?? []) as Array<{ student_id: string; system: string; external_id: string }>) if (link.student_id === member.user_id) externalIds[link.system] = link.external_id
      return {
        ...studentRef(ctx.integration, member.user_id),
        full_name: (identities as Record<string, { full_name?: string }>)[member.user_id]?.full_name ?? null,
        school_no: profile.class_number ?? null, grade: profile.grade ?? null, school: profile.school ?? null,
        membership_since: member.joined_at,
        classrooms: ((memberships.data ?? []) as Array<{ classroom_id: string; student_id: string }>).filter(m => m.student_id === member.user_id)
          .map(m => ({ id: m.classroom_id, name: classroomName.get(m.classroom_id) ?? null })),
        external_ids: externalIds,
      }
    })
    // keep the "limit + 1" contract so the helper can see whether another page exists
    return page.length > ctx.limit ? [...out, {}] : out
  },
}

const links: ExportResource = {
  name: 'links', scope: 'students:link',
  fetch: async ctx => {
    let query = ctx.db.from('partner_external_links').select('student_id, system, external_id, updated_at')
      .eq('institution_id', ctx.integration.institution_id).order('updated_at', { ascending: true }).order('id', { ascending: true })
    if (ctx.since) query = query.gt('updated_at', ctx.since)
    const { data, error } = await query.range(ctx.offset, ctx.offset + ctx.limit)
    if (error) throw new Error('links')
    return ((data ?? []) as Array<{ student_id: string } & Row>).map(({ student_id, ...rest }) => ({ ...studentRef(ctx.integration, student_id), ...rest }))
  },
}

export const EXPORT_RESOURCES: Record<string, ExportResource> = {
  classrooms,
  quizzes: rpcResource('quizzes', 'results:read', 'partner_export_quizzes', withStudent),
  'open-ended': rpcResource('open_ended', 'results:read', 'partner_export_open_ended', withStudent),
  mastery: rpcResource('mastery', 'mastery:read', 'partner_export_mastery', withStudent),
  grades: rpcResource('grades', 'grades:read', 'partner_export_grades', withStudent),
  links,
}
export { identifiedStudents }

export type StudentLocator = { student_id?: unknown; school_no?: unknown; external?: { system?: unknown; id?: unknown } | null }
export type Resolution = { userId: string | null; reason?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Resolves CRM-side student locators (Pratium id / school number / external id) inside one institution. */
export async function resolveStudents(db: ExportContext['db'], institutionId: string, locators: StudentLocator[]): Promise<Resolution[]> {
  const needsSchoolNo = locators.some(l => l.student_id === undefined && typeof l.school_no === 'string')
  const needsExternal = locators.some(l => l.student_id === undefined && l.school_no === undefined && l.external)
  const members = new Set(await institutionStudentIds(institutionId))

  const bySchoolNo = new Map<string, string[]>()
  if (needsSchoolNo) {
    const all = [...members]
    for (let i = 0; i < all.length; i += 100) {
      const { data } = await db.from('profiles').select('id, class_number').in('id', all.slice(i, i + 100))
      for (const row of (data ?? []) as Array<{ id: string; class_number: string | null }>) {
        const no = String(row.class_number ?? '').trim()
        if (no) bySchoolNo.set(no, [...(bySchoolNo.get(no) ?? []), row.id])
      }
    }
  }
  const byExternal = new Map<string, string>()
  if (needsExternal) {
    const wanted = locators.filter(l => l.external && typeof l.external.system === 'string' && typeof l.external.id === 'string')
    const systems = [...new Set(wanted.map(l => l.external!.system as string))]
    for (const system of systems) {
      const ids = [...new Set(wanted.filter(l => l.external!.system === system).map(l => l.external!.id as string))]
      for (let i = 0; i < ids.length; i += 100) {
        const { data } = await db.from('partner_external_links').select('student_id, external_id').eq('institution_id', institutionId).eq('system', system).in('external_id', ids.slice(i, i + 100))
        for (const row of (data ?? []) as Array<{ student_id: string; external_id: string }>) byExternal.set(system + '\u0000' + row.external_id, row.student_id)
      }
    }
  }

  return locators.map((locator): Resolution => {
    if (typeof locator.student_id === 'string') {
      if (!UUID.test(locator.student_id) || !members.has(locator.student_id)) return { userId: null, reason: 'student_not_in_institution' }
      return { userId: locator.student_id }
    }
    if (typeof locator.school_no === 'string') {
      const found = bySchoolNo.get(locator.school_no.trim()) ?? []
      if (found.length === 1) return { userId: found[0] }
      return { userId: null, reason: found.length ? 'ambiguous_school_no' : 'school_no_not_found' }
    }
    if (locator.external && typeof locator.external.system === 'string' && typeof locator.external.id === 'string') {
      const found = byExternal.get(locator.external.system + '\u0000' + locator.external.id)
      return found && members.has(found) ? { userId: found } : { userId: null, reason: 'external_id_not_found' }
    }
    return { userId: null, reason: 'no_student_locator' }
  })
}
