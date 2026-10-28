// "Yazılıya Hazırlanıyorum" öğrenci API'lerinin ortak sunucu yardımcıları (service_role istemcisi gerektirir).
import type { SupabaseClient } from '@supabase/supabase-js'
import { filterRowsByUserScope } from '@/lib/location/resource-scope'
import { gradeNumberOf } from '@/lib/written-exam'

export type SetRow = { id: string; title: string; grade_number: number; subject: string; term: number; exam_number: number; total_points: number; country: string; state: string | null; city: string | null }
export type Profile = { grade: string | null; country: string | null; state: string | null; city: string | null }

export async function loadProfile(db: SupabaseClient, userId: string): Promise<Profile> {
  const { data } = await db.from('profiles').select('grade,country,state,city').eq('id', userId).maybeSingle()
  return (data as Profile | null) || { grade: null, country: null, state: null, city: null }
}

/** Öğrencinin sınıfına ve konumuna uyan, yayınlanmış set; değilse null. */
export async function accessibleSet(db: SupabaseClient, setId: string, profile: Profile): Promise<SetRow | null> {
  const { data } = await db.from('written_exam_sets')
    .select('id,title,grade_number,subject,term,exam_number,total_points,country,state,city').eq('id', setId).eq('status', 'published').maybeSingle()
  const set = data as SetRow | null
  if (!set) return null
  if (set.grade_number !== gradeNumberOf(profile.grade)) return null
  return filterRowsByUserScope([set], profile, row => row)[0] || null
}
