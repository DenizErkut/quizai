// Server side of the teacher membership policy: resolves a teacher's tier, earns the invite grant,
// meters free-tier usage and produces the 402 response used by gated routes.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server-create-client'
import {
  FREE_TEACHER_LIMITS, TEACHER_GRANT_DAYS, TEACHER_INVITE_TARGET, countQualifyingStudents, decideFeature, decideTeacherAccess,
  type StudentSubscription, type TeacherAccess, type TeacherFeature,
} from '@/lib/teacher-entitlements'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export type TeacherEntitlement = TeacherAccess & {
  qualifyingStudents: number
  inviteTarget: number
  expiresAt: string | null
  usage: { aiTotal: number; liveThisMonth: number }
  limits: typeof FREE_TEACHER_LIMITS
}

async function qualifyingStudentCount(teacherId: string, teacherUserId: string, now: Date): Promise<number> {
  const { data: classrooms } = await db.from('classrooms').select('id').eq('teacher_id', teacherId)
  const classroomIds = (classrooms ?? []).map((row: { id: string }) => row.id)
  if (!classroomIds.length) return 0
  const studentIds = new Set<string>()
  for (let from = 0; from < 20_000; from += 1000) {
    const { data } = await db.from('classroom_students').select('student_id').in('classroom_id', classroomIds).order('student_id').range(from, from + 999)
    for (const row of (data ?? []) as Array<{ student_id: string }>) studentIds.add(row.student_id)
    if ((data?.length ?? 0) < 1000) break
  }
  const ids = [...studentIds]
  const subs: StudentSubscription[] = []
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await db.from('subscriptions').select('user_id, plan, status, price_paid, current_period_end').eq('status', 'active').in('user_id', ids.slice(i, i + 100))
    subs.push(...((data ?? []) as StudentSubscription[]))
  }
  return countQualifyingStudents(subs, teacherUserId, now)
}

export async function resolveTeacherEntitlement(userId: string, now = new Date()): Promise<TeacherEntitlement | null> {
  const { data: teacher } = await db.from('teachers').select('id, approved').eq('user_id', userId).maybeSingle()
  if (!teacher?.approved) return null

  const [institution, profile, grantRow] = await Promise.all([
    db.from('institution_users').select('institution_id').eq('user_id', userId).eq('role', 'teacher').or('is_active.is.null,is_active.eq.true').limit(1),
    db.from('profiles').select('plan, plan_expires_at').eq('id', userId).maybeSingle(),
    db.from('teacher_entitlements').select('expires_at').eq('user_id', userId).maybeSingle(),
  ])
  const base = {
    institutionLinked: Boolean(institution.data?.length),
    profilePlan: profile.data?.plan ?? null,
    planExpiresAt: profile.data?.plan_expires_at ?? null,
    grant: grantRow.data ?? null,
    now,
  }
  // The invite count only matters (and is only computed) while nothing else already opens full access.
  let access = decideTeacherAccess({ ...base, qualifyingStudents: 0 })
  let qualifyingStudents = 0
  if (access.tier === 'limited') {
    qualifyingStudents = await qualifyingStudentCount(teacher.id, userId, now)
    access = decideTeacherAccess({ ...base, qualifyingStudents })
  }

  let expiresAt: string | null = grantRow.data?.expires_at ?? null
  if (access.shouldGrant) {
    expiresAt = new Date(now.getTime() + TEACHER_GRANT_DAYS * 86_400_000).toISOString()
    await db.from('teacher_entitlements').upsert({ user_id: userId, source: 'invite_gold_10', qualifying_students: qualifyingStudents, granted_at: now.toISOString(), expires_at: expiresAt })
    // Full Altın membership for the teacher too, unless a longer/higher plan is already active.
    const currentEnd = base.planExpiresAt ? new Date(base.planExpiresAt).getTime() : 0
    if (base.profilePlan !== 'unlimited' && currentEnd < new Date(expiresAt).getTime()) {
      await db.from('profiles').update({ plan: 'premium', plan_expires_at: expiresAt }).eq('id', userId)
    }
    await db.from('notifications').insert({
      user_id: userId, type: 'teacher_gold_granted', title: 'Altın öğretmen üyeliğin açıldı 🎉',
      body: `${qualifyingStudents} öğrencin yıllık Altın üyelik aldı. 1 yıl boyunca tüm öğretmen özellikleri açık.`,
    })
  }

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const [ai, live] = await Promise.all([
    db.from('teacher_usage_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'ai_generation'),
    db.from('teacher_usage_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('kind', 'live_quiz').gte('created_at', monthStart),
  ])
  return {
    ...access, qualifyingStudents, inviteTarget: TEACHER_INVITE_TARGET, expiresAt,
    usage: { aiTotal: ai.count ?? 0, liveThisMonth: live.count ?? 0 }, limits: FREE_TEACHER_LIMITS,
  }
}

export function upgradeRequired(reason: string, entitlement?: TeacherEntitlement | null) {
  return NextResponse.json({
    error: reason, code: 'upgrade_required', upgradeUrl: '/pricing',
    invite: entitlement ? { qualifyingStudents: entitlement.qualifyingStudents, target: entitlement.inviteTarget } : undefined,
  }, { status: 402 })
}

/** Returns a 402 response when the teacher may not use the feature, otherwise null. */
export async function gateTeacherFeature(userId: string, feature: TeacherFeature): Promise<NextResponse | null> {
  const entitlement = await resolveTeacherEntitlement(userId)
  if (!entitlement) return null // callers keep their own "approved teacher" checks
  const decision = decideFeature(entitlement, feature, entitlement.usage)
  return decision.allowed ? null : upgradeRequired(decision.reason || 'Bu özellik Altın üyelikte açıktır.', entitlement)
}

export async function recordTeacherUsage(userId: string, kind: 'ai_generation' | 'live_quiz') {
  await db.from('teacher_usage_events').insert({ user_id: userId, kind })
}

/** Roster cap for the class dashboard of limited teachers. */
export async function dashboardStudentCap(userId: string): Promise<number | null> {
  const entitlement = await resolveTeacherEntitlement(userId)
  return entitlement && entitlement.tier === 'limited' ? FREE_TEACHER_LIMITS.dashboardStudents : null
}
