// lib/grades-import.ts
// "Not/Veri İçe Aktar" özelliğinin ortak commit mantığı — hem
// app/api/institution/import-grades hem app/api/teacher/import-grades
// tarafından kullanılır.

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface ImportRow {
  studentId: string
  schoolNo?: string
  subjects: Record<string, string> // { "Türkçe": "18,67", "Matematik": "85" ... }
}

export interface CommitGradeImportParams {
  scope: 'institution' | 'teacher'
  institutionId?: string
  teacherId?: string
  uploadedBy: string
  label: string
  sourceFilename?: string
  rows: ImportRow[]
}

export interface CommitGradeImportResult {
  importId: string
  totalRows: number
  matchedRows: number
  gradesInserted: number
}

// Türkçe ondalık virgülü + olası binlik nokta ayracını normalize edip
// sayıya çevirir. Çeviremezse null döner (örn. "AA", "Yok", "-" gibi harfli
// notlar) — bu durumda değer yine de value_text olarak saklanır, sadece
// value_numeric null kalır (analiz/sıralama o satır için atlanır, gösterim
// etkilenmez).
function parseNumeric(raw: string): number | null {
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

export async function commitGradeImport(params: CommitGradeImportParams): Promise<CommitGradeImportResult> {
  const { scope, institutionId, teacherId, uploadedBy, label, sourceFilename, rows } = params

  const matchedRows = rows.filter(r => r.studentId).length

  const { data: importRow, error: importErr } = await supabaseAdmin
    .from('grade_imports')
    .insert({
      institution_id: scope === 'institution' ? institutionId : null,
      teacher_id: scope === 'teacher' ? teacherId : null,
      uploaded_by: uploadedBy,
      label,
      source_filename: sourceFilename ?? null,
      total_rows: rows.length,
      matched_rows: matchedRows,
    })
    .select('id')
    .single()

  if (importErr || !importRow) throw new Error(`grade_imports oluşturulamadı: ${importErr?.message}`)

  const gradeRecords: {
    student_id: string
    import_id: string
    subject: string
    value_text: string
    value_numeric: number | null
  }[] = []

  for (const row of rows) {
    if (!row.studentId) continue
    for (const [subject, rawValue] of Object.entries(row.subjects)) {
      const value = (rawValue ?? '').toString().trim()
      if (!value) continue
      gradeRecords.push({
        student_id: row.studentId,
        import_id: importRow.id,
        subject,
        value_text: value,
        value_numeric: parseNumeric(value),
      })
    }
  }

  let gradesInserted = 0
  if (gradeRecords.length > 0) {
    // Büyük dosyalarda tek seferde insert etmemek için 500'lük gruplar halinde yaz.
    const CHUNK = 500
    for (let i = 0; i < gradeRecords.length; i += CHUNK) {
      const chunk = gradeRecords.slice(i, i + CHUNK)
      const { error } = await supabaseAdmin.from('student_grades').insert(chunk)
      if (error) throw new Error(`student_grades yazılamadı (satır ${i}): ${error.message}`)
      gradesInserted += chunk.length
    }
  }

  // Eşleşen ama henüz "sınıf numarası" (class_number) girilmemiş öğrencilerin
  // profiline, dosyada geçen okul numarasını yazalım — sonraki içe
  // aktarımlarda otomatik eşleşme oranı artsın diye.
  for (const row of rows) {
    if (!row.studentId || !row.schoolNo) continue
    await supabaseAdmin
      .from('profiles')
      .update({ class_number: row.schoolNo })
      .eq('id', row.studentId)
      .is('class_number', null)
  }

  return {
    importId: importRow.id,
    totalRows: rows.length,
    matchedRows,
    gradesInserted,
  }
}
