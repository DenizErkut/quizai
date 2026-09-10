import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type TriageCategory = 'ready_review' | 'subject_missing' | 'multi_grade' | 'non_k12' | 'likely_free_text'
interface QueueCandidate {
  dimension_key: string
  observed_label: string
  observed_subject: string
  occurrence_count: number
  student_count: number
  sample_grades: string[]
  status: string
  mapped_node_id: string | null
  last_seen_at: string | null
}
interface TriagedCandidate extends QueueCandidate {
  triage_category: TriageCategory
  priority_score: number
}
interface UnitNode { id: string; label: string; subject: string; grade: string; level: string }
interface UnitSuggestion { id: string; score: number }

function canonicalText(value: string) {
  return String(value || '').toLocaleLowerCase('tr-TR')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü]+/gi, ' ').replace(/\s+/g, ' ').trim()
}

function triageCandidate(candidate: QueueCandidate): TriagedCandidate {
  const grades = Array.isArray(candidate.sample_grades) ? candidate.sample_grades : []
  const label = String(candidate.observed_label || '')
  const words = label.trim().split(/\s+/).filter(Boolean)
  const isUniversity = grades.some((grade: string) => /universite|üniversite/i.test(grade))
  let category: TriageCategory
  if (label.length > 160 || words.length > 24) category = 'likely_free_text'
  else if (isUniversity) category = 'non_k12'
  else if (grades.length !== 1) category = 'multi_grade'
  else if (canonicalText(candidate.observed_subject) === 'genel') category = 'subject_missing'
  else category = 'ready_review'
  const penalty = category === 'ready_review' ? 0 : category === 'subject_missing' ? 20 : 100
  return {
    ...candidate,
    triage_category: category,
    priority_score: Math.max(0, Number(candidate.occurrence_count || 0) * 5 + Number(candidate.student_count || 0) * 10 - penalty),
  }
}

function unitSuggestionScore(candidate: TriagedCandidate, unit: UnitNode): number {
  const label = canonicalText(candidate.observed_label)
  const unitLabel = canonicalText(unit.label)
  if (!label || !unitLabel) return 0
  let score = label === unitLabel ? 100 : label.includes(unitLabel) || unitLabel.includes(label) ? 70 : 0
  const labelWords = new Set(label.split(' ').filter((word: string) => word.length > 3))
  const unitWords = unitLabel.split(' ').filter((word: string) => word.length > 3)
  if (unitWords.length) score = Math.max(score, Math.round(unitWords.filter((word: string) => labelWords.has(word)).length / unitWords.length * 60))
  if (canonicalText(candidate.observed_subject) !== 'genel' && canonicalText(candidate.observed_subject) === canonicalText(unit.subject)) score += 20
  return score
}

async function getAdminUser() {
  const cookieStore = await cookies()
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return null
  const { data: profile } = await adminDb
    .from('profiles').select('is_admin').eq('id', user.id).maybeSingle()
  return profile?.is_admin ? user : null
}

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const status = req.nextUrl.searchParams.get('status') || 'pending'
  const requestedLimit = Number(req.nextUrl.searchParams.get('limit') || 50)
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 50
  const category = req.nextUrl.searchParams.get('category') || 'all'
  const subject = req.nextUrl.searchParams.get('subject') || 'all'
  const search = canonicalText(req.nextUrl.searchParams.get('search') || '')

  let candidatesQuery = adminDb.from('learning_catalog_review_queue')
    .select('dimension_key,observed_label,observed_subject,occurrence_count,student_count,sample_grades,status,mapped_node_id,last_seen_at')
    .order('occurrence_count', { ascending: false })
    .order('last_seen_at', { ascending: false })
    .limit(500)
  if (status !== 'all') candidatesQuery = candidatesQuery.eq('status', status)

  const allCandidatesQuery = adminDb.from('learning_catalog_review_queue')
    .select('dimension_key,observed_label,observed_subject,occurrence_count,student_count,sample_grades,status,mapped_node_id,last_seen_at')
    .order('occurrence_count', { ascending: false }).limit(1000)
  const [candidatesResult, allCandidatesResult, unitsResult, catalogNodesResult, auditResult] = await Promise.all([
    candidatesQuery,
    allCandidatesQuery,
    adminDb.from('learning_graph_nodes')
      .select('id,label,subject,grade,level')
      .eq('node_type', 'unit').eq('is_active', true)
      .order('subject').order('grade').order('label'),
    adminDb.from('learning_graph_nodes').select('id', { count: 'exact', head: true })
      .eq('node_type', 'topic').eq('is_active', true),
    adminDb.from('learning_catalog_review_audit').select('id,dimension_key,action,reviewer_id,created_at').order('created_at', { ascending: false }).limit(20),
  ])

  if (candidatesResult.error) {
    return NextResponse.json({ error: candidatesResult.error.message }, { status: 500 })
  }
  if (unitsResult.error) {
    return NextResponse.json({ error: unitsResult.error.message }, { status: 500 })
  }
  if (allCandidatesResult.error || catalogNodesResult.error) {
    return NextResponse.json({ error: allCandidatesResult.error?.message || catalogNodesResult.error?.message }, { status: 500 })
  }

  const allCandidates = ((candidatesResult.data || []) as QueueCandidate[]).map(triageCandidate)
  const coverageCandidates = (allCandidatesResult.data || []) as QueueCandidate[]
  const units = (unitsResult.data || []) as UnitNode[]
  const categoryCounts = allCandidates.reduce((counts: Record<string, number>, candidate) => {
    counts[candidate.triage_category] = (counts[candidate.triage_category] || 0) + 1
    return counts
  }, {})
  const subjectCounts = allCandidates.reduce((counts: Record<string, number>, candidate) => {
    counts[candidate.observed_subject] = (counts[candidate.observed_subject] || 0) + 1
    return counts
  }, {})
  const candidates = allCandidates
    .filter(candidate => category === 'all' || candidate.triage_category === category)
    .filter(candidate => subject === 'all' || candidate.observed_subject === subject)
    .filter(candidate => !search || canonicalText(candidate.observed_label).includes(search))
    .sort((a, b) => b.priority_score - a.priority_score || b.occurrence_count - a.occurrence_count)
    .slice(0, limit)
    .map(candidate => ({
      ...candidate,
      suggested_unit_ids: units
        .filter(unit => candidate.sample_grades.length === 1 && gradeKeyForApi(unit.grade) === gradeKeyForApi(candidate.sample_grades[0]))
        .map(unit => ({ id: unit.id, score: unitSuggestionScore(candidate, unit) }))
        .filter((suggestion: UnitSuggestion) => suggestion.score >= 35)
        .sort((a: UnitSuggestion, b: UnitSuggestion) => b.score - a.score)
        .slice(0, 5)
        .map((suggestion: UnitSuggestion) => suggestion.id),
    }))

  const statusCounts = coverageCandidates.reduce((counts: Record<string, number>, candidate) => {
    counts[candidate.status] = (counts[candidate.status] || 0) + 1
    return counts
  }, {})
  const total = coverageCandidates.length
  const mapped = statusCounts.mapped || 0
  const dismissed = statusCounts.dismissed || 0
  const decided = mapped + dismissed
  const mappedNodeCount = coverageCandidates.filter(candidate => candidate.mapped_node_id).length
  const percentage = (value: number) => total ? Math.round(value / total * 1000) / 10 : 0
  return NextResponse.json({ candidates, units, recentAudit: auditResult.error ? [] : (auditResult.data || []), stats: {
    total, pending: statusCounts.pending || 0,
    mapped, dismissed,
    mappedNodeCount,
    reviewCompletionPct: percentage(decided),
    mappingRatePct: percentage(mapped),
    graphCoveragePct: percentage(mappedNodeCount),
    activeTopicNodes: catalogNodesResult.count || 0, categoryCounts, subjectCounts,
  } })
}

function gradeKeyForApi(value: string) {
  return canonicalText(value).replace(/sinif/g, 'sınıf').replace(/^(ilk okul|orta okul|ortaokul|lise)\s+/, '').trim()
}

export async function PATCH(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const dimensionKey = typeof body?.dimensionKey === 'string' ? body.dimensionKey.trim() : ''
  const action = body?.action
  const unitNodeId = typeof body?.unitNodeId === 'string' && body.unitNodeId ? body.unitNodeId : null
  const canonicalTopic = typeof body?.canonicalTopic === 'string' ? body.canonicalTopic.trim() : null

  if (action === 'undo') {
    const auditId = typeof body?.auditId === 'string' ? body.auditId : ''
    if (!auditId) return NextResponse.json({ error: 'auditId gerekli.' }, { status: 400 })
    const { data, error } = await adminDb.rpc('undo_learning_catalog_review_v1', { p_audit_id: auditId, p_reviewer_id: user.id })
    if (error) return NextResponse.json({ error: error.message }, { status: 409 })
    return NextResponse.json({ success: true, dimensionKey: data })
  }
  if (!dimensionKey || !['map', 'dismiss'].includes(action)) {
    return NextResponse.json({ error: 'dimensionKey ve action (map|dismiss) gerekli.' }, { status: 400 })
  }
  if (action === 'map' && (!unitNodeId || !canonicalTopic)) {
    return NextResponse.json({ error: 'Eşleştirme için ünite ve kanonik konu zorunlu.' }, { status: 400 })
  }

  const { data, error } = await adminDb.rpc('review_learning_catalog_candidate', {
    p_dimension_key: dimensionKey,
    p_action: action,
    p_reviewer_id: user.id,
    p_unit_node_id: unitNodeId,
    p_canonical_topic: canonicalTopic,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ success: true, topicNodeId: data })
}
