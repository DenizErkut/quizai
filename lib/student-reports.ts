// lib/student-reports.ts
// Kurum/Öğretmen/Veli rapor sayfalarının ortak veri katmanı: seçilen bir
// içe aktarımın (grade_imports) notlarını, Pratium'un kendi test
// istatistikleriyle (quiz_sessions, streaks) birleştirir.

import { createClient } from '@supabase/supabase-js'
import { inferSubject, DIGER_DERS } from './student-report-topics'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ReportStudentBase {
  id: string
  fullName: string
  schoolNo: string | null
  grade: string | null
  classroomName?: string | null
}

export interface ReportStudent extends ReportStudentBase {
  grades: Record<string, string>
  pratium: { avgPct: number | null; totalTests: number; streak: number }
}

export interface ImportSummary {
  id: string
  label: string
  created_at: string
}

// Seçilen içe aktarımın notlarını + her öğrencinin Pratium istatistiklerini
// tek seferde çeker ve roster ile birleştirir.
export async function attachGradesAndStats(
  roster: ReportStudentBase[],
  importId: string | null
): Promise<{ students: ReportStudent[]; subjectColumns: string[] }> {
  if (roster.length === 0) return { students: [], subjectColumns: [] }

  const studentIds = roster.map(s => s.id)

  const [gradesRes, sessionsRes, streaksRes] = await Promise.all([
    importId
      ? supabaseAdmin.from('student_grades').select('student_id, subject, value_text')
          .eq('import_id', importId).in('student_id', studentIds)
      : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.from('quiz_sessions').select('user_id, pct')
      .eq('completed', true).in('user_id', studentIds),
    supabaseAdmin.from('streaks').select('user_id, current_streak').in('user_id', studentIds),
  ])

  const gradesByStudent = new Map<string, Record<string, string>>()
  const subjectSet = new Set<string>()
  for (const g of (gradesRes.data ?? [])) {
    if (!gradesByStudent.has(g.student_id)) gradesByStudent.set(g.student_id, {})
    gradesByStudent.get(g.student_id)![g.subject] = g.value_text
    subjectSet.add(g.subject)
  }

  const statsByStudent = new Map<string, { total: number; sum: number }>()
  for (const s of (sessionsRes.data ?? [])) {
    const cur = statsByStudent.get(s.user_id) ?? { total: 0, sum: 0 }
    cur.total += 1
    cur.sum += (s.pct ?? 0)
    statsByStudent.set(s.user_id, cur)
  }

  const streakByStudent = new Map((streaksRes.data ?? []).map((s: any) => [s.user_id, s.current_streak ?? 0]))

  const students: ReportStudent[] = roster.map(s => {
    const stat = statsByStudent.get(s.id)
    return {
      ...s,
      grades: gradesByStudent.get(s.id) ?? {},
      pratium: {
        avgPct: stat && stat.total > 0 ? Math.round(stat.sum / stat.total) : null,
        totalTests: stat?.total ?? 0,
        streak: streakByStudent.get(s.id) ?? 0,
      },
    }
  })

  return { students, subjectColumns: [...subjectSet].sort() }
}

// ────────────────────────────────────────────────────────────────────────
// BÖLÜMSEL (ders bazlı) RAPOR
// Her öğrenci için, her ders için: içe aktarılan okul notu + Pratium'da o
// derse ait konularda çözülen testlerin ortalama % ve adedini bir arada
// gösterir. "Diğer" başlığı, hiçbir müfredat dersiyle eşleşmeyen (öğretmenin
// canlı quiz'de serbest yazdığı gibi) konuları toplar.
// ────────────────────────────────────────────────────────────────────────

export interface SectionalCell {
  importedGrade: string | null
  pratiumAvgPct: number | null
  pratiumTestCount: number
}

export interface SectionalStudent extends ReportStudentBase {
  sections: Record<string, SectionalCell>
}

export async function buildSectionalReport(
  roster: ReportStudentBase[],
  importId: string | null
): Promise<{ students: SectionalStudent[]; subjects: string[] }> {
  if (roster.length === 0) return { students: [], subjects: [] }
  const studentIds = roster.map(s => s.id)

  const [gradesRes, sessionsRes] = await Promise.all([
    importId
      ? supabaseAdmin.from('student_grades').select('student_id, subject, value_text')
          .eq('import_id', importId).in('student_id', studentIds)
      : Promise.resolve({ data: [] as any[] }),
    supabaseAdmin.from('quiz_sessions').select('user_id, topic, grade, pct')
      .eq('completed', true).in('user_id', studentIds),
  ])

  // student_id -> { subject -> okul notu }
  const importedByStudent = new Map<string, Map<string, string>>()
  const subjectSet = new Set<string>()
  for (const g of (gradesRes.data ?? [])) {
    if (!importedByStudent.has(g.student_id)) importedByStudent.set(g.student_id, new Map())
    importedByStudent.get(g.student_id)!.set(g.subject, g.value_text)
    subjectSet.add(g.subject)
  }

  // student_id -> { ders -> { toplam, adet } } (Pratium test sonuçları, konudan derse çıkarılmış)
  const pratiumByStudent = new Map<string, Map<string, { sum: number; count: number }>>()
  for (const s of (sessionsRes.data ?? [])) {
    const subject = inferSubject(s.topic, s.grade)
    subjectSet.add(subject)
    if (!pratiumByStudent.has(s.user_id)) pratiumByStudent.set(s.user_id, new Map())
    const bucket = pratiumByStudent.get(s.user_id)!
    const cur = bucket.get(subject) ?? { sum: 0, count: 0 }
    cur.sum += (s.pct ?? 0)
    cur.count += 1
    bucket.set(subject, cur)
  }

  // "Diğer" varsa listenin en sonunda görünsün, diğerleri alfabetik.
  const subjects = [...subjectSet].filter(s => s !== DIGER_DERS).sort()
  if (subjectSet.has(DIGER_DERS)) subjects.push(DIGER_DERS)

  const students: SectionalStudent[] = roster.map(s => {
    const importedMap = importedByStudent.get(s.id)
    const pratiumMap = pratiumByStudent.get(s.id)
    const sections: Record<string, SectionalCell> = {}
    for (const subj of subjects) {
      const pratium = pratiumMap?.get(subj)
      sections[subj] = {
        importedGrade: importedMap?.get(subj) ?? null,
        pratiumAvgPct: pratium && pratium.count > 0 ? Math.round(pratium.sum / pratium.count) : null,
        pratiumTestCount: pratium?.count ?? 0,
      }
    }
    return { ...s, sections }
  })

  return { students, subjects }
}
