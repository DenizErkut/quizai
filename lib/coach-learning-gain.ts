import type { SupabaseClient } from '@supabase/supabase-js'

export interface CoachGainRow {
  student_id: string
  learning_objective_id: string
  gain_pp: number | string
  transfer_gain_pp: number | string | null
  pre_score_pct: number | string
  post_score_pct: number | string
  post_completed_at: string
  measurement_version?: string | null
}

export interface CoachGainSummary {
  available: boolean
  recordedPairs: number
  currentPairs: number
  transferPairs: number
  verifiedTransferPairs: number
  averageGainPp: number | null
  objectives: Array<{ code: string; pairs: number; averageGainPp: number | null; latestGainPp: number; transferPairs: number }>
}

const mean = (values: number[]) => values.length >= 5
  ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 100) / 100 : null

export function summarizeCoachGain(rows: CoachGainRow[], codes: Record<string, string>): CoachGainSummary {
  const latest = new Map<string, CoachGainRow>()
  for (const row of rows) {
    const existing = latest.get(row.learning_objective_id)
    if (!existing || Date.parse(row.post_completed_at) > Date.parse(existing.post_completed_at)) latest.set(row.learning_objective_id, row)
  }
  const current = [...latest.values()]
  const groups = new Map<string, CoachGainRow[]>()
  for (const row of rows) groups.set(row.learning_objective_id, [...(groups.get(row.learning_objective_id) ?? []), row])
  return {
    available: true, recordedPairs: rows.length, currentPairs: current.length,
    transferPairs: current.filter(row => row.transfer_gain_pp !== null).length,
    verifiedTransferPairs: current.filter(row => row.measurement_version === 'learning-gain-v2-server-scored-transfer' && row.transfer_gain_pp !== null).length,
    averageGainPp: mean(current.map(row => Number(row.gain_pp))),
    objectives: [...groups.entries()].map(([id, group]) => ({
      code: codes[id] ?? 'Kazanım kodu bulunamadı', pairs: group.length,
      averageGainPp: mean(group.map(row => Number(row.gain_pp))),
      latestGainPp: Number(latest.get(id)!.gain_pp),
      transferPairs: group.filter(row => row.transfer_gain_pp !== null).length,
    })).sort((a, b) => b.pairs - a.pairs).slice(0, 12),
  }
}

export async function loadCoachGain(supabase: SupabaseClient, userId: string): Promise<CoachGainSummary> {
  const rows: CoachGainRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('learning_gain_measurements')
      .select('student_id,learning_objective_id,gain_pp,transfer_gain_pp,pre_score_pct,post_score_pct,post_completed_at,measurement_version')
      .eq('student_id', userId).order('post_completed_at', { ascending: false }).range(offset, offset + 499)
    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST205') return { available: false, recordedPairs: 0, currentPairs: 0, transferPairs: 0, verifiedTransferPairs: 0, averageGainPp: null, objectives: [] }
      throw error
    }
    rows.push(...((data ?? []) as CoachGainRow[]))
    if ((data ?? []).length < 500) break
  }
  const ids = [...new Set(rows.map(row => row.learning_objective_id))]
  const codes: Record<string, string> = {}
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.from('learning_objective_catalog').select('id,objective_code').in('id', ids.slice(offset, offset + 100))
    if (error) throw error
    for (const row of data ?? []) codes[row.id] = row.objective_code
  }
  return summarizeCoachGain(rows, codes)
}
