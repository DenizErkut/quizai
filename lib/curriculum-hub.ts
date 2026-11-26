// Müfredat içerik merkezi veri katmanı (SEO/GEO): yalnızca Türkiye (MEB) müfredatının doğrulanmış, aktif kazanımları. Sunucuda çalışır.
import { createClient } from '@/lib/supabase/server-create-client'
import { gradeNumberFromSlug, gradeSlug, slugify } from '@/lib/curriculum-slug'

export interface HubObjective { code: string; title: string; unit: string; topic: string | null }
export interface HubPair { grade: string; gradeSlug: string; gradeNumber: number; subject: string; subjectSlug: string; count: number }
export interface HubPage extends HubPair { units: Array<{ unit: string; objectives: HubObjective[] }>; updatedAt: string | null }

type Row = { objective_code: string; title: string; subject: string; grade: string; unit: string | null; topic: string | null; updated_at: string | null }

async function loadRows(): Promise<Row[]> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: versions } = await db.from('curriculum_versions').select('id').eq('status', 'active').eq('country', 'TR')
  const ids = (versions || []).map(version => version.id)
  if (!ids.length) return []
  const rows: Row[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('learning_objective_catalog')
      .select('objective_code,title,subject,grade,unit,topic,updated_at')
      .in('curriculum_version_id', ids).eq('verification_status', 'verified').eq('is_active', true)
      .order('objective_code', { ascending: true }).range(from, from + 999)
    if (error || !data) break
    rows.push(...(data as Row[]))
    if (data.length < 1000) break
  }
  return rows
}

function pairsFrom(rows: Row[]): HubPair[] {
  const map = new Map<string, HubPair>()
  for (const row of rows) {
    const gs = gradeSlug(row.grade)
    const gn = gradeNumberFromSlug(gs || '')
    if (!gs || !gn || !row.subject) continue
    const key = `${gs}|${row.subject}`
    const existing = map.get(key)
    if (existing) existing.count++
    else map.set(key, { grade: `${gn}. sınıf`, gradeSlug: gs, gradeNumber: gn, subject: row.subject, subjectSlug: slugify(row.subject), count: 1 })
  }
  return [...map.values()].sort((a, b) => a.gradeNumber - b.gradeNumber || a.subject.localeCompare(b.subject, 'tr'))
}

export async function loadHubIndex(): Promise<HubPair[]> {
  return pairsFrom(await loadRows())
}

export async function loadHubPage(gradeSlugValue: string, subjectSlugValue: string): Promise<{ page: HubPage; all: HubPair[] } | null> {
  const rows = await loadRows()
  const all = pairsFrom(rows)
  const pair = all.find(item => item.gradeSlug === gradeSlugValue && item.subjectSlug === subjectSlugValue)
  if (!pair) return null
  const selected = rows.filter(row => gradeSlug(row.grade) === pair.gradeSlug && row.subject === pair.subject)
  const units = new Map<string, HubObjective[]>()
  for (const row of selected) {
    const unit = (row.unit || row.topic || pair.subject).trim()
    const list = units.get(unit) || []
    list.push({ code: row.objective_code, title: row.title.trim(), unit, topic: row.topic })
    units.set(unit, list)
  }
  const updatedAt = selected.map(row => row.updated_at).filter((value): value is string => Boolean(value)).sort().pop() || null
  return { page: { ...pair, units: [...units.entries()].map(([unit, objectives]) => ({ unit, objectives })), updatedAt }, all }
}
