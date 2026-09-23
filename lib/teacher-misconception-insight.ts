// lib/teacher-misconception-insight.ts
// 23 Eylül 2026 — haber-analizi raporunun (Tema 2 farkı) işaret ettiği
// gerçek boşluk: misconception motoru (misconception_catalog →
// student_misconceptions → misconception_counter_evidence →
// resolveAdaptiveLearningPolicy → adaptive-evidence-checkpoints) baştan
// sona çalışıyor ama zincirin çıktısı yalnızca ÖĞRENCİYE
// (components/student/LearningSummary.tsx) ve ADMIN paneline
// (components/admin/Misconception*.tsx) ulaşıyordu — hiçbir öğretmen
// sayfasında ("app/teacher/*") gösterilmiyordu. Bu dosya, lib/class-risk.ts
// ile AYNI desenle (tek sorguda tüm sınıf, N+1 yok), "öğrenci X'in Y
// yanılgısı çözüldü / hâlâ açık" anlatısını öğretmene taşıyor.
//
// Bilinçli kapsam kararı: yalnızca status IN ('confirmed','resolved')
// gösteriliyor — 'suspected' (henüz doğrulanmamış aday) öğretmene
// gösterilmiyor, çünkü misconception_catalog'un kendi tasarımı
// (verification_status: candidate/verified/rejected) doğrulanmamış
// sinyali öğretmene "kesin" gibi sunmamayı zaten ilke edinmiş.
import { SupabaseClient } from '@supabase/supabase-js'

export interface StudentMisconceptionEntry {
  misconceptionId: string
  label: string
  subject: string
  topic: string
  status: 'confirmed' | 'resolved'
  confidenceScore: number | null
  lastSeenAt: string | null
  resolvedAt: string | null
  reopenedAt: string | null
}

export interface StudentMisconceptionSummary {
  studentId: string
  fullName: string
  openCount: number
  resolvedCount: number
  entries: StudentMisconceptionEntry[]
}

export interface ClassMisconceptionSummary {
  studentsWithOpen: number
  studentsWithResolved: number
  // Sınıfta en çok tekrar eden, hâlâ açık (resolved olmamış) yanılgılar —
  // öğretmenin "hangi kavram yanılgısını sınıfça tekrar etmeliyim"
  // sorusuna doğrudan cevap. lib/class-risk.ts'teki topConcernTopics ile
  // aynı fikir, konu yerine yanılgı bazlı.
  topOpenMisconceptions: { label: string; studentCount: number }[]
  students: StudentMisconceptionSummary[]
}

export async function computeClassMisconceptionSummary(
  supabase: SupabaseClient,
  studentIds: string[],
  studentNames: Record<string, string>
): Promise<ClassMisconceptionSummary> {
  if (!studentIds.length) {
    return { studentsWithOpen: 0, studentsWithResolved: 0, topOpenMisconceptions: [], students: [] }
  }

  // Not: PostgREST'in FK-embedding sözdizimini (`.select('...,misconception_catalog(label)')`)
  // bu kod tabanında hiçbir yerde daha önce kullanılmamış bulduk — şema
  // cache'inde ilişkinin keşfedilebilir olup olmadığı doğrulanmadan buna
  // güvenmek riskli. Bunun yerine lib/class-risk.ts ile AYNI, kod
  // tabanında zaten kanıtlanmış desen: iki ayrı sorgu + JS'te Map ile
  // birleştirme (N+1 değil, tek IN sorgusu her tablo için).
  const [{ data: rows }, { data: catalogRows }] = await Promise.all([
    supabase
      .from('student_misconceptions')
      .select('student_id, misconception_id, subject, topic, status, confidence_score, last_seen_at, resolved_at, reopened_at')
      .in('student_id', studentIds)
      .in('status', ['confirmed', 'resolved'])
      .order('last_seen_at', { ascending: false }),
    supabase.from('misconception_catalog').select('id, label'),
  ])

  const labelById = new Map<string, string>((catalogRows ?? []).map((c: any) => [c.id, c.label]))

  const byStudent = new Map<string, StudentMisconceptionEntry[]>()
  ;(rows ?? []).forEach((r: any) => {
    const entry: StudentMisconceptionEntry = {
      misconceptionId: r.misconception_id,
      label: labelById.get(r.misconception_id) || r.topic || 'Kavram yanılgısı',
      subject: r.subject,
      topic: r.topic,
      status: r.status,
      confidenceScore: typeof r.confidence_score === 'number' ? r.confidence_score : null,
      lastSeenAt: r.last_seen_at,
      resolvedAt: r.resolved_at,
      reopenedAt: r.reopened_at,
    }
    if (!byStudent.has(r.student_id)) byStudent.set(r.student_id, [])
    byStudent.get(r.student_id)!.push(entry)
  })

  const students: StudentMisconceptionSummary[] = studentIds
    .map(studentId => {
      const entries = byStudent.get(studentId) ?? []
      return {
        studentId,
        fullName: studentNames[studentId] || 'Öğrenci',
        openCount: entries.filter(e => e.status === 'confirmed').length,
        resolvedCount: entries.filter(e => e.status === 'resolved').length,
        entries,
      }
    })
    .filter(s => s.entries.length > 0)

  const studentsWithOpen = students.filter(s => s.openCount > 0).length
  const studentsWithResolved = students.filter(s => s.resolvedCount > 0).length

  const openLabelCounts = new Map<string, number>()
  students.forEach(s => {
    s.entries.filter(e => e.status === 'confirmed').forEach(e => {
      openLabelCounts.set(e.label, (openLabelCounts.get(e.label) || 0) + 1)
    })
  })
  const topOpenMisconceptions = [...openLabelCounts.entries()]
    .map(([label, studentCount]) => ({ label, studentCount }))
    .sort((a, b) => b.studentCount - a.studentCount)
    .slice(0, 5)

  return { studentsWithOpen, studentsWithResolved, topOpenMisconceptions, students }
}
