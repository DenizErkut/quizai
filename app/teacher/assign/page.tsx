'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import PaperAnswerImport from '@/components/teacher/PaperAnswerImport'
import PaperBulkImport from '@/components/teacher/PaperBulkImport'
import ScenarioAssign from '@/components/teacher/ScenarioAssign'
import OpenEndedResults from '@/components/teacher/OpenEndedResults'
import QuizPaperImport from '@/components/teacher/QuizPaperImport'
import QRCode from 'qrcode'
import type { ScenarioSheetItem } from '@/lib/open-ended-print'
import { useTeacherEntitlement, LOCKED_MESSAGE } from '@/components/teacher/useTeacherEntitlement'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'

// '6' -> 'ortaokul 6. sınıf' (the test generator expects the school-level form).
function gradeLabel(grade: string | null | undefined): string {
  const n = Number(String(grade || '').match(/\d{1,2}/)?.[0])
  if (!n) return String(grade || '')
  return `${n <= 4 ? 'ilkokul' : n <= 8 ? 'ortaokul' : 'lise'} ${n}. sınıf`
}

// Ödevde seçilebilen soru tipleri (sıralama hariç); "Karma" hepsini seçer.
const ASSIGN_QUESTION_TYPES = ['multiple_choice', 'multi_true_false', 'table_fill', 'matching', 'fill_blank', 'true_false', 'short_answer']
const questionTypeField = (types: string[]) => types.length === 1 ? types[0] : 'mixed'

// Birden fazla tip seçildiğinde (yapay zekâ üretimi) her tip için ayrı üretilip birleştirilir; soru seti ödevde sabitlenir.
async function generateTypedQuizSet(token: string | undefined, params: { topic: string; fileContent?: string; title: string; subject?: string; grade: string; difficulty: string; count: number; types: string[] }): Promise<{ questions?: Array<Record<string, unknown>>; error?: string }> {
  const perType = params.types.map((_, index) => Math.floor(params.count / params.types.length) + (index < params.count % params.types.length ? 1 : 0)).filter(Boolean)
  const types = params.types.slice(0, perType.length)
  const results = await Promise.all(types.map(async (type, index) => {
    const res = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        teacherPrint: true, topic: params.fileContent ? params.title : params.topic, ...(params.fileContent ? { fileContent: params.fileContent } : {}),
        subject: params.subject, grade: params.grade, difficulty: params.difficulty === 'adaptive' ? 'normal' : params.difficulty,
        questionCount: perType[index], questionType: type, includeVisuals: true, language: 'tr',
      }),
    })
    const data = await res.json().catch(() => null)
    return res.ok && Array.isArray(data?.questions) ? { questions: data.questions as Array<Record<string, unknown>> } : { error: String(data?.message || data?.error || 'Test hazırlanamadı.') }
  }))
  const failed = results.find(result => result.error)
  if (failed) return { error: failed.error }
  const questions = results.flatMap(result => result.questions || [])
  return questions.length ? { questions: questions.map(q => [Math.random(), q] as const).sort((a, b) => a[0] - b[0]).map(item => item[1]) } : { error: 'Test hazırlanamadı.' }
}

const DIFFICULTIES = [
  { value: 'adaptive', label: '🎯 Otomatik (adaptif): %10 kolay · %60 normal · %20 zor · %10 çok zor' },
  { value: 'kolay', label: 'Kolay' },
  { value: 'normal', label: 'Normal' },
  { value: 'zor', label: 'Zor' },
  { value: 'cok zor', label: 'Çok Zor' },
]

type OeClassRow = { figure_svg?: string | null; figure_image?: string | null; answer_table?: string | null; id: string; classroom_id: string; batch_id?: string | null; title: string; grade: string; scenario: string; question: string; rubric?: Array<{ criterion: string; maxPoints: number; description?: string }>; classrooms?: { name?: string } }

export default function TeacherAssignPage() {
  const { t: tr, locale } = useT()
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [assignFile, setAssignFile] = useState<File | null>(null)
  const [assignFileContent, setAssignFileContent] = useState('')
  const [fileError, setFileError] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [assignmentType, setAssignmentType] = useState<'quiz' | 'open_ended' | 'scenario'>('quiz')
  const [form, setForm] = useState({
    classroom_id: '',
    title: '',
    topic: '',
    grade: '',
    difficulty: 'adaptive',
    question_count: 10,
    due_date: '',
    question_type: 'multiple_choice',
    question_types: ['multiple_choice'] as string[], // çoklu seçim (karma); sıralama ödevlerde kullanılmaz
    source_type: 'generate', // 'generate' | 'from_file' | 'similar'
  })

  // ── Açık Uçlu Soru ödevi ──
  const [openEndedAssignments, setOpenEndedAssignments] = useState<any[]>([])
  const [oeMethod, setOeMethod] = useState<'ai' | 'manual' | null>(null)
  const [oeForm, setOeForm] = useState({ classroom_id: '', title: '', grade: '', subject: '', topic: '', due_date: '' })
  const [oeScenario, setOeScenario] = useState('')
  const [oeQuestion, setOeQuestion] = useState('')
  const [oeRubric, setOeRubric] = useState<{ criterion: string; maxPoints: number; description: string }[]>([
    { criterion: '', maxPoints: 25, description: '' },
    { criterion: '', maxPoints: 25, description: '' },
    { criterion: '', maxPoints: 25, description: '' },
    { criterion: '', maxPoints: 25, description: '' },
  ])
  const [oeGenerating, setOeGenerating] = useState(false)
  const [oeSaving, setOeSaving] = useState(false)
  const [oeError, setOeError] = useState('')
  const [oeGenerated, setOeGenerated] = useState(false) // AI ile üretildi mi (önizleme aşaması)
  const [oeUsedMeb, setOeUsedMeb] = useState(false) // uretim gercek MEB kaynagina mi dayandi
  const [oeCount, setOeCount] = useState(1) // ayni konuda kac farkli soru uretilecek
  const [oeItems, setOeItems] = useState<{ scenario: string; question: string; rubric: { criterion: string; maxPoints: number; description: string }[]; figureSvg?: string | null; answerTable?: string | null }[] | null>(null)
  const [quizImportId, setQuizImportId] = useState('') // optik kâğıt aktarma paneli açık olan test ödevi
  const [quizPool, setQuizPool] = useState(false) // test/quiz soruları onaylı soru bankasından çekilsin
  const [quizPoolError, setQuizPoolError] = useState('')
  const [quizPoolVisualFail, setQuizPoolVisualFail] = useState(false) // havuzda görsel kuralı için yeterli görselli soru yok
  const [oePool, setOePool] = useState(false) // sorular onaylı soru havuzundan çekilsin
  const [oePoolNote, setOePoolNote] = useState('')
  const [oeExtra, setOeExtra] = useState<{ figureSvg: string | null; answerTable: string | null }>({ figureSvg: null, answerTable: null })
  const [printBusy, setPrintBusy] = useState('')
  const [printMessage, setPrintMessage] = useState('')
  const { limited: planLimited } = useTeacherEntitlement()
  const [importGroup, setImportGroup] = useState('') // açık uçlu ödev grubunun kâğıt içe aktarma paneli
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    let { data: t, error } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle()
    if (error) {
      console.error('[teacher/assign] teachers sorgusu basarisiz, tekrar deneniyor:', error)
      await new Promise(r => setTimeout(r, 600))
      ;({ data: t, error } = await supabase.from('teachers').select('*').eq('user_id', user.id).maybeSingle())
    }
    if (!t?.approved) { router.push('/teacher'); return }
    setTeacher(t)

    const { data: cls } = await supabase.from('classrooms').select('*').eq('teacher_id', t.id).order('created_at', { ascending: false })
    const { data: asgn } = await supabase
      .from('assignments')
      .select('*, classrooms(name), assignment_completions(count)')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })
    const { data: oeAsgn } = await supabase
      .from('open_ended_assignments')
      .select('*, classrooms(name)')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })

    setClassrooms(cls ?? [])
    setAssignments(asgn ?? [])
    setOpenEndedAssignments(oeAsgn ?? [])
    if (cls?.length) {
      setForm(p => ({ ...p, classroom_id: cls[0].id }))
      setOeForm(p => ({ ...p, classroom_id: cls[0].id }))
    }
    setLoading(false)
  }

  async function extractFileContent(file: File) {
    setFileLoading(true)
    setFileError('')
    const formData = new FormData()
    formData.append('file', file)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/extract-file', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session?.access_token}` },
      body: formData,
    })
    const data = await res.json()
    setFileLoading(false)

    if (data.error) {
      setFileError(data.error)
      return ''
    }
    return data.content || ''
  }

  async function createAssignment(skipPool = false) {
    if (!form.classroom_id || !form.title.trim() || !form.topic.trim()) return
    setQuizPoolError(''); setQuizPoolVisualFail(false)
    setSaving(true)

    // Havuzdan çek: sorular onaylı soru bankasından seçilip ödevde dondurulur (yapay zekâ kullanılmaz).
    let poolQuestions: unknown[] | null = null
    if (quizPool && !skipPool) {
      if (!form.grade) { setQuizPoolError(tr('Havuzdan çekmek için sınıf seviyesini seçmelisin.')); setSaving(false); return }
      const { data: { session } } = await supabase.auth.getSession()
      const poolRes = await fetch('/api/teacher/quiz-pool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ grade: form.grade, topic: form.topic.trim(), count: form.question_count, questionType: questionTypeField(form.question_types), questionTypes: form.question_types, difficulty: form.difficulty }),
      })
      const poolData = await poolRes.json().catch(() => null)
      if (!poolRes.ok || !Array.isArray(poolData?.questions)) { setQuizPoolError(poolData?.error || tr('Havuzdan soru getirilemedi.')); setQuizPoolVisualFail(poolRes.status === 422 && typeof poolData?.visualRequired === 'number'); setSaving(false); return }
      poolQuestions = poolData.questions
    }

    // PDF/dosya içeriği varsa konuya ekle
    let finalTopic = form.topic.trim()
    if (assignFile && !assignFileContent) {
      const extracted = await extractFileContent(assignFile)
      if (extracted) finalTopic = extracted.slice(0, 3000)
    } else if (assignFileContent) {
      finalTopic = assignFileContent.slice(0, 3000)
    }

    // Karma (çoklu tip) yapay zekâ ödevi: seçilen tiplerin tamamı için soru seti şimdi üretilip ödevde sabitlenir.
    if (!poolQuestions && form.question_types.length > 1) {
      setQuizPoolError(tr('Seçilen soru tipleri için sorular hazırlanıyor… (30-90 saniye sürebilir)'))
      const { data: { session } } = await supabase.auth.getSession()
      const classroom = classrooms.find(c => c.id === form.classroom_id)
      const generated = await generateTypedQuizSet(session?.access_token, {
        topic: form.topic.trim(), fileContent: finalTopic.length > 200 ? finalTopic : undefined, title: form.title.trim(), subject: classroom?.subject || undefined,
        grade: gradeLabel(form.grade || classroom?.grade), difficulty: form.difficulty, count: form.question_count, types: form.question_types,
      })
      if (!generated.questions) { setQuizPoolError(generated.error || tr('Test hazırlanamadı.')); setSaving(false); return }
      poolQuestions = generated.questions
      setQuizPoolError('')
    }

    const { data, error: insertError } = await supabase.from('assignments').insert({
      classroom_id: form.classroom_id,
      teacher_id: teacher.id,
      title: form.title.trim(),
      topic: finalTopic,
      grade: form.grade,
      difficulty: form.difficulty,
      question_type: questionTypeField(form.question_types),
      ...(form.question_types.length > 1 ? { question_types: form.question_types } : {}),
      source_type: form.source_type,
      question_count: poolQuestions ? poolQuestions.length : form.question_count,
      due_date: form.due_date || null,
      ...(poolQuestions ? { pool_questions: poolQuestions } : {}),
    }).select('*, classrooms(name), assignment_completions(count)').single()

    setSaving(false)
    if (insertError || !data) {
      console.error('[createAssignment]', insertError)
      setQuizPoolError(tr('Ödev kaydedilemedi: {msg}', { msg: insertError?.message || tr('bilinmeyen hata') }))
      return
    }
    setShowForm(false)
    setForm(p => ({ ...p, title: '', topic: '', due_date: '' }))
    setAssignments(prev => [data, ...prev])
    setPrintMessage(tr('✓ Ödev oluşturuldu ve listenin en üstüne eklendi.'))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function deleteAssignment(id: string) {
    if (!confirm(tr('Bu ödevi silmek istediğine emin misin?'))) return
    await supabase.from('assignments').delete().eq('id', id)
    setAssignments(prev => prev.filter(a => a.id !== id))
  }

  function resetOeForm() {
    setOeMethod(null)
    setOeForm(p => ({ ...p, title: '', grade: '', subject: '', topic: '', due_date: '' }))
    setOeScenario(''); setOeQuestion('')
    setOeRubric([
      { criterion: '', maxPoints: 25, description: '' },
      { criterion: '', maxPoints: 25, description: '' },
      { criterion: '', maxPoints: 25, description: '' },
      { criterion: '', maxPoints: 25, description: '' },
    ])
    setOeGenerated(false); setOeUsedMeb(false); setOeError('')
    setOeCount(1); setOeItems(null); setOePool(false); setOePoolNote(''); setOeExtra({ figureSvg: null, answerTable: null })
  }

  async function generateOeWithAI() {
    if (oePool ? !oeForm.subject.trim() : (!oeForm.subject.trim() || !oeForm.topic.trim())) { setOeError(oePool ? tr('Havuzdan çekmek için ders seçmelisin.') : tr('Ders ve konu zorunlu.')); return }
    setOeError(''); setOePoolNote(''); setOeGenerating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/teacher/create-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ mode: 'ai', preview: true, count: oeCount, fromPool: oePool, ...oeForm }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setOeError(data?.error || tr('Soru üretilemedi.')); return }
      // preview modunda dogrudan assignment kaydedilmedi, sadece uretilen
      // icerik donuyor - once ogretmen onaylasin
      if (Array.isArray(data.items) && data.items.length > 1) {
        setOeItems(data.items.map((item) => ({ figureSvg: item.figureSvg || null, answerTable: item.answerTable || null, scenario: item.scenario, question: item.question, rubric: (item.rubric || []).map((r) => ({ criterion: r.criterion, maxPoints: r.maxPoints, description: r.description || '' })) })))
      } else setOeItems(null)
      setOeExtra({ figureSvg: data.figureSvg || null, answerTable: data.answerTable || null })
      if (data.fromPool) setOePoolNote(data.topicMatched >= data.items.length ? tr('📚 {n} soru havuzdan getirildi.', { n: data.items.length }) : tr('📚 {n} soru havuzdan getirildi; bunların {m} tanesi konuya uygun, kalanı aynı dersten.', { n: data.items.length, m: data.topicMatched }))
      setOeScenario(data.scenario); setOeQuestion(data.question)
      setOeRubric(data.rubric.map((r) => ({ criterion: r.criterion, maxPoints: r.maxPoints, description: r.description || '' })))
      setOeUsedMeb(!!data.usedMebSource)
      setOeGenerated(true)
    } catch (e) {
      console.error('[generateOeWithAI]', e)
      setOeError(tr('Beklenmeyen bir hata oluştu.'))
    } finally {
      setOeGenerating(false)
    }
  }

  async function saveOeAssignment() {
    if (!oeForm.classroom_id || !oeForm.title.trim()) { setOeError(tr('Sınıf ve başlık zorunlu.')); return }
    if (oeItems && oeItems.length > 1 && oeItems.some(item => !item.scenario.trim() || !item.question.trim())) { setOeError(tr('Her sorunun senaryosu ve sorusu dolu olmalı.')); return }
    if (!(oeItems && oeItems.length > 1) && (!oeScenario.trim() || !oeQuestion.trim())) { setOeError(tr('Senaryo ve soru zorunlu.')); return }
    const validRubric = oeRubric.filter(r => r.criterion.trim() && r.maxPoints > 0)
    if (!(oeItems && oeItems.length > 1) && validRubric.length === 0) { setOeError(tr('En az bir puanlama kriteri girmelisiniz.')); return }

    setOeError(''); setOeSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/teacher/create-open-ended', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          mode: 'manual', // hem AI-onaylanmis hem manuel icerik ayni sekilde kalici kaydedilir
          created_via: oePool && oeGenerated ? 'pool' : oeGenerated ? 'ai' : 'manual',
          ...oeForm,
          ...(oeItems && oeItems.length > 1 ? { items: oeItems } : { scenario: oeScenario, question: oeQuestion, rubric: validRubric, figureSvg: oeExtra.figureSvg, answerTable: oeExtra.answerTable }),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) { setOeError(data?.error || tr('Ödev kaydedilemedi.')); return }
      setOpenEndedAssignments(prev => [...(data.assignments ?? [data.assignment]), ...prev])
      setShowForm(false)
      resetOeForm()
    } catch (e) {
      console.error('[saveOeAssignment]', e)
      setOeError(tr('Beklenmeyen bir hata oluştu.'))
    } finally {
      setOeSaving(false)
    }
  }

  async function deleteOeAssignment(id: string) {
    if (!confirm(tr('Bu açık uçlu ödevi silmek istediğine emin misin?'))) return
    await supabase.from('open_ended_assignments').delete().eq('id', id)
    setOpenEndedAssignments(prev => prev.filter(a => a.id !== id))
  }

  // One card per batch of open-ended questions (a batch shares batch_id).
  const oeGroups: any[][] = []
  const oeByBatch = new Map<string, unknown[]>()
  for (const a of openEndedAssignments) {
    if (a.batch_id) {
      const group = oeByBatch.get(a.batch_id)
      if (group) group.push(a); else { const created = [a]; oeByBatch.set(a.batch_id, created); oeGroups.push(created) }
    } else oeGroups.push([a])
  }
  oeGroups.forEach(group => group.sort((x, y) => (x.batch_index ?? 0) - (y.batch_index ?? 0)))
  // Test ve açık uçlu ödevler tek listede, en yeni en üstte (yeni oluşturulan ödev aşağıda kalmasın).
  const listRank = new Map<string, number>(
    [...oeGroups.map(group => ({ key: `oe-${group[0].batch_id || group[0].id}`, at: Math.max(...group.map(item => new Date(item.created_at || 0).getTime())) })),
      ...assignments.map(item => ({ key: `quiz-${item.id}`, at: new Date(item.created_at || 0).getTime() }))]
      .sort((x, y) => y.at - x.at).map((entry, index) => [entry.key, index] as [string, number]))
  const baseTitle = (title: string) => String(title || '').replace(/ — Soru \d+\/\d+$/, '')

  async function deleteOeGroup(group: any[]) {
    if (!confirm(group.length > 1 ? tr('Bu {n} soruluk açık uçlu ödevi silmek istediğine emin misin?', { n: group.length }) : tr('Bu açık uçlu ödevi silmek istediğine emin misin?'))) return
    const ids = group.map(a => a.id)
    await supabase.from('open_ended_assignments').delete().in('id', ids)
    setOpenEndedAssignments(prev => prev.filter(a => !ids.includes(a.id)))
  }

  // Sınıf dökümü: her öğrenci için ad/numara hazır, her soru ayrı sayfa, QR = öğrenci + soru (toplu tarama için).
  async function printOpenEndedClass(group: OeClassRow[]) {
    if (planLimited) { setPrintMessage(LOCKED_MESSAGE); return }
    const first = group[0]
    setPrintBusy(`oe-${first.id}`); setPrintMessage('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/teacher/students-roster', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      const roster = await res.json().catch(() => null)
      const students = ((roster?.students || []) as Array<{ id: string; fullName: string; schoolNo: string | null; classroomId?: string }>).filter(student => student.classroomId === first.classroom_id)
      if (!students.length) { setPrintMessage(tr('Bu sınıfta öğrenci yok.')); return }
      const { openEndedScenarioSheetHtml, teacherQrPayload, shortSheetCode } = await import('@/lib/open-ended-print')
      const { printLearningDocument } = await import('@/lib/learning-print')
      const title = baseTitle(first.title)
      const code = shortSheetCode(first.batch_id || first.id)
      const pages: ScenarioSheetItem[] = []
      for (const student of students) {
        for (const [index, a] of group.entries()) {
          pages.push({
            scenario: a.scenario, question: a.question, rubric: a.rubric || [], sessionId: a.id, position: index + 1, total: group.length, code,
            figureSvg: a.figure_svg, figureImage: a.figure_image, answerTable: a.answer_table,
            studentName: student.fullName, schoolNo: student.schoolNo,
            qrDataUrl: await QRCode.toDataURL(teacherQrPayload(student.id, a.id), { width: 260, margin: 1 }),
          })
        }
      }
      await printLearningDocument(title, `${first.classrooms?.name || ''} · ${students.length} öğrenci × ${group.length} soru`, openEndedScenarioSheetHtml(pages, { studentName: '', title, grade: gradeLabel(first.grade) }), { studentLine: false })
    } catch (e) { setPrintMessage(e?.message || tr('Yazdırma görünümü açılamadı.')) }
    finally { setPrintBusy('') }
  }

  async function printOpenEndedGroup(group: any[], withKey: boolean) {
    if (planLimited) { setPrintMessage(LOCKED_MESSAGE); return }
    const first = group[0]
    setPrintBusy(`oe-${first.id}`); setPrintMessage('')
    try {
      const { openEndedStudentSheetHtml, openEndedTeacherKeyHtml, shortSheetCode } = await import('@/lib/open-ended-print')
      const { printLearningDocument } = await import('@/lib/learning-print')
      const code = shortSheetCode(first.batch_id || first.id)
      const items = group.map(a => ({ scenario: a.scenario, question: a.question, rubric: a.rubric || [] }))
      const title = baseTitle(first.title)
      const html = openEndedStudentSheetHtml(items, { code, title, grade: gradeLabel(first.grade), subject: first.subject, topic: first.topic })
        + (withKey ? openEndedTeacherKeyHtml(items, { code }) : '')
      await printLearningDocument(title, `${first.classrooms?.name || ''} · ${group.length} soru`, html, { studentLine: false })
    } catch (e) { setPrintMessage(e?.message || tr('Yazdırma görünümü açılamadı.')) }
    finally { setPrintBusy('') }
  }

  // Quiz assignments store only topic/difficulty/count (each student gets freshly generated questions),
  // so a printable class copy is generated once here with the same quality pipeline.
  async function printQuizAssignment(a, withKey: boolean) {
    if (planLimited) { setPrintMessage(LOCKED_MESSAGE); return }
    setPrintBusy(`quiz-${a.id}`); setPrintMessage(tr('Basılı test hazırlanıyor… (30-90 saniye sürebilir)'))
    try {
      if (Array.isArray(a.pool_questions) && a.pool_questions.length) {
        const { printLearningDocument, questionPrintHtml, answerKeyHtml } = await import('@/lib/learning-print')
        const classroomName = classrooms.find(c => c.id === a.classroom_id)?.name || ''
        await printLearningDocument(a.title, `${classroomName} · ${a.pool_questions.length} soru`, questionPrintHtml(a.pool_questions) + (withKey ? answerKeyHtml(a.pool_questions) : ''))
        setPrintMessage('')
        return
      }
      const classroom = classrooms.find(c => c.id === a.classroom_id)
      const topicText = String(a.topic || '')
      const fromFile = topicText.length > 200
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          teacherPrint: true, topic: fromFile ? a.title : topicText, ...(fromFile ? { fileContent: topicText } : {}),
          subject: classroom?.subject || undefined, grade: gradeLabel(a.grade || classroom?.grade),
          difficulty: a.difficulty === 'adaptive' ? 'normal' : (a.difficulty || 'normal'), questionCount: Math.min(Number(a.question_count) || 10, 30),
          questionType: a.question_type || 'mixed', includeVisuals: true, language: 'tr',
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !Array.isArray(data?.questions) || !data.questions.length) {
        setPrintMessage(data?.message || (data?.error === 'insufficient_questions' ? tr('Kalite kontrolünden yeterli soru geçmedi, birkaç saniye sonra tekrar deneyin.') : (data?.error || tr('Test hazırlanamadı.'))))
        return
      }
      const { printLearningDocument, questionPrintHtml, answerKeyHtml } = await import('@/lib/learning-print')
      await printLearningDocument(a.title, `${classroom?.name || ''} · ${data.questions.length} soru`, questionPrintHtml(data.questions) + (withKey ? answerKeyHtml(data.questions) : ''))
      setPrintMessage('')
    } catch (e) { setPrintMessage(e?.message || tr('Test hazırlanamadı.')) }
    finally { setPrintBusy('') }
  }

  // Basılı sınıf dökümü ve kâğıt aktarımı için ödevin SABİT soru seti gerekir: havuzdan çekilen ödevde zaten vardır;
  // diğerlerinde ilk basımda bir kez üretilir ve ödeve kaydedilir (öğrenciler de aynı seti çözer, kâğıtla çevrim içi aynı sorulara dayanır).
  async function ensureQuizSet(a): Promise<Array<Record<string, unknown>> | null> {
    if (Array.isArray(a.pool_questions) && a.pool_questions.length) return a.pool_questions
    const completionCount = a.assignment_completions?.[0]?.count || 0
    if (completionCount > 0 && !confirm(tr('Bu ödevi bazı öğrenciler zaten çözdü. Basılı döküm için soru seti sabitlenecek; devam edilsin mi?'))) return null
    const classroom = classrooms.find(c => c.id === a.classroom_id)
    const topicText = String(a.topic || '')
    const fromFile = topicText.length > 200
    const { data: { session } } = await supabase.auth.getSession()
    if (Array.isArray(a.question_types) && a.question_types.length > 1) {
      const generated = await generateTypedQuizSet(session?.access_token, { topic: topicText, fileContent: fromFile ? topicText : undefined, title: a.title, subject: classroom?.subject || undefined, grade: gradeLabel(a.grade || classroom?.grade), difficulty: a.difficulty || 'normal', count: Math.min(Number(a.question_count) || 10, 30), types: a.question_types })
      if (!generated.questions) { setPrintMessage(generated.error || tr('Test hazırlanamadı.')); return null }
      const { error: typedError } = await supabase.from('assignments').update({ pool_questions: generated.questions, question_count: generated.questions.length }).eq('id', a.id)
      if (typedError) { setPrintMessage(tr('Soru seti kaydedilemedi: {msg}', { msg: typedError.message })); return null }
      setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, pool_questions: generated.questions, question_count: generated.questions.length } : x))
      return generated.questions
    }
    const res = await fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        teacherPrint: true, topic: fromFile ? a.title : topicText, ...(fromFile ? { fileContent: topicText } : {}),
        subject: classroom?.subject || undefined, grade: gradeLabel(a.grade || classroom?.grade),
        difficulty: a.difficulty === 'adaptive' ? 'normal' : (a.difficulty || 'normal'), questionCount: Math.min(Number(a.question_count) || 10, 30),
        questionType: a.question_type || 'mixed', includeVisuals: true, language: 'tr',
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !Array.isArray(data?.questions) || !data.questions.length) { setPrintMessage(data?.message || data?.error || tr('Test hazırlanamadı.')); return null }
    const { error } = await supabase.from('assignments').update({ pool_questions: data.questions, question_count: data.questions.length }).eq('id', a.id)
    if (error) { setPrintMessage(tr('Soru seti kaydedilemedi: {msg}', { msg: error.message })); return null }
    setAssignments(prev => prev.map(x => x.id === a.id ? { ...x, pool_questions: data.questions, question_count: data.questions.length } : x))
    return data.questions
  }

  // Sınıf dökümü: her öğrenci için QR'lı optik cevap kâğıdı + soru kitapçığı (QR: öğrenci + ödev kimliği).
  async function printQuizClass(a, withKey: boolean) {
    if (planLimited) { setPrintMessage(LOCKED_MESSAGE); return }
    setPrintBusy(`quizclass-${a.id}`); setPrintMessage(tr('Basılı döküm hazırlanıyor… (soru seti yoksa 30-90 saniye sürebilir)'))
    try {
      const questions = await ensureQuizSet(a)
      if (!questions) return
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/teacher/students-roster', { headers: { Authorization: `Bearer ${session?.access_token}` } })
      const roster = await res.json().catch(() => null)
      const students = ((roster?.students || []) as Array<{ id: string; fullName: string; schoolNo: string | null; classroomId?: string }>).filter(student => student.classroomId === a.classroom_id)
      if (!students.length) { setPrintMessage(tr('Bu sınıfta öğrenci yok.')); return }
      const { quizClassSheetsHtml, quizAnswerKeyHtml, quizQrPayload } = await import('@/lib/quiz-print')
      const { printLearningDocument } = await import('@/lib/learning-print')
      const code = String(a.id).replace(/-/g, '').slice(0, 8).toUpperCase()
      const classroomName = classrooms.find(c => c.id === a.classroom_id)?.name || ''
      const sheets = await Promise.all(students.map(async student => ({ name: student.fullName, schoolNo: student.schoolNo, qrDataUrl: await QRCode.toDataURL(quizQrPayload(student.id, a.id), { width: 260, margin: 1 }) })))
      const html = quizClassSheetsHtml(questions, sheets, { title: a.title, classroom: classroomName, code }) + (withKey ? quizAnswerKeyHtml(questions, { title: a.title, code }) : '')
      await printLearningDocument(a.title, `${classroomName} · ${students.length} öğrenci × ${questions.length} soru`, html, { studentLine: false })
      setPrintMessage('')
    } catch (e) { setPrintMessage(e?.message || tr('Yazdırma görünümü açılamadı.')) }
    finally { setPrintBusy('') }
  }

  const rubricTotal = oeRubric.reduce((s, r) => s + (Number(r.maxPoints) || 0), 0)

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text3)', fontSize: '14px' }}>{tr('Yükleniyor...')}</div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: '13px', textDecoration: 'none' }}>{tr('← Panel')}</Link>
            <h1 style={{ fontSize: '20px', fontWeight: 700 }}>{tr('Ödev Ata')}</h1>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(v => !v)} style={{ justifyContent: 'center' }}>
            {tr('+ Yeni ödev')}
          </button>
        </div>

        {/* Yeni ödev formu */}
        {showForm && (
          <div className="card anim-up" style={{ marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '10px' }}>{tr('Yeni Ödev')}</div>

            {/* Ödev türü */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {[
                { value: 'quiz', label: tr('📝 Test / Quiz') },
                { value: 'open_ended', label: tr('💬 Açık Uçlu Soru') },
                { value: 'scenario', label: tr('🧩 Senaryodan Ata') },
              ].map(opt => (
                <button key={opt.value} onClick={() => { setAssignmentType(opt.value as any); resetOeForm() }}
                  style={{ flex: 1, padding: '10px', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)',
                    background: assignmentType === opt.value ? 'rgba(8,36,101,0.08)' : 'var(--bg2)',
                    borderColor: assignmentType === opt.value ? 'rgba(8,36,101,0.3)' : 'var(--border)',
                    color: assignmentType === opt.value ? 'var(--primary)' : 'var(--text3)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>

            {assignmentType === 'scenario' ? (
              <ScenarioAssign classrooms={classrooms} onCreated={created => { setOpenEndedAssignments(prev => [...(created as typeof prev), ...prev]); setShowForm(false) }} />
            ) : assignmentType === 'open_ended' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {oeError && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>{oeError}</div>}

                {!oeMethod ? (
                  // ── Yöntem seçimi ──
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <button onClick={() => setOeMethod('ai')}
                      style={{ padding: '20px 14px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                      <div style={{ fontSize: '30px', marginBottom: '8px' }}>🤖</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>{tr('Yapay Zeka Hazırlasın')}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5 }}>{tr('Ders ve konu gir, senaryo + soru + rubrik saniyeler içinde üretilsin')}</div>
                    </button>
                    <button onClick={() => setOeMethod('manual')}
                      style={{ padding: '20px 14px', borderRadius: '14px', border: '1.5px solid var(--border)', background: 'var(--bg2)', cursor: 'pointer', textAlign: 'center', fontFamily: 'var(--font-sans)' }}>
                      <div style={{ fontSize: '30px', marginBottom: '8px' }}>✍️</div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>{tr('Kendim Oluşturayım')}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5 }}>{tr('Senaryoyu, soruyu ve puanlama kriterlerini kendin yaz')}</div>
                    </button>
                  </div>
                ) : (
                  <>
                    <button onClick={() => { setOeMethod(null); setOeGenerated(false) }}
                      style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: 'var(--text3)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: 0 }}>
                      {tr('← Yöntemi değiştir')}
                    </button>

                    {/* Ortak alanlar */}
                    <select value={oeForm.classroom_id} onChange={e => setOeForm(p => ({ ...p, classroom_id: e.target.value }))} style={inputStyle}>
                      {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input placeholder={tr('Ödev başlığı (örn: Su Döngüsü - Açık Uçlu)')} value={oeForm.title}
                      onChange={e => setOeForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <select value={oeForm.grade} onChange={e => setOeForm(p => ({ ...p, grade: e.target.value }))} style={inputStyle}>
                        <option value="">{tr('Sınıf seviyesi')}</option>
                        {['5','6','7','8','9','10','11','12'].map(g => <option key={g} value={g}>{tr('{g}. Sınıf', { g })}</option>)}
                      </select>
                      <input placeholder={tr('Ders (örn: Fen Bilimleri)')} value={oeForm.subject}
                        onChange={e => setOeForm(p => ({ ...p, subject: e.target.value }))} style={inputStyle} />
                    </div>
                    <div>
                      <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>{tr('Son tarih (isteğe bağlı)')}</label>
                      <input type="datetime-local" value={oeForm.due_date}
                        onChange={e => setOeForm(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} />
                    </div>

                    {oeMethod === 'ai' && !oeGenerated && (
                      <>
                        <input placeholder={oePool ? tr('Konu (isteğe bağlı — havuzda bu konuya uyanlar öne alınır)') : tr('Konu (örn: Su döngüsü ve buharlaşma)')} value={oeForm.topic}
                          onChange={e => setOeForm(p => ({ ...p, topic: e.target.value }))} style={inputStyle} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', padding: '10px 12px', border: `1.5px solid ${oePool ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '10px', background: oePool ? 'var(--accent-bg)' : 'transparent' }}>
                          <input type="checkbox" checked={oePool} onChange={e => setOePool(e.target.checked)} style={{ width: 18, height: 18 }} />
                          {tr('📚 Soruları havuzdan çek')}
                          <span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text3)' }}>{tr('Onaylı AUS sorularından gelir, yapay zeka kullanılmaz')}</span>
                        </label>
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>{tr('Soru sayısı (aynı konuda farklı açık uçlu sorular)')}</label>
                          <select value={oeCount} onChange={e => setOeCount(Number(e.target.value))} style={inputStyle}>
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{tr('{n} soru', { n })}</option>)}
                          </select>
                        </div>
                        <button className="btn btn-primary" onClick={generateOeWithAI} disabled={oeGenerating}
                          style={{ justifyContent: 'center', opacity: oeGenerating ? 0.6 : 1 }}>
                          {oeGenerating ? tr('✨ Üretiliyor...') : oePool ? tr('📚 Havuzdan Getir') : tr('🤖 Yapay Zeka ile Oluştur')}
                        </button>
                      </>
                    )}

                    {oeMethod === 'ai' && oeGenerated && oeItems && oeItems.length > 1 && (
                      <>
                        {oePoolNote && <div style={{ fontSize: '11px', color: 'var(--text2)' }}>{oePoolNote}</div>}
                        <div style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600 }}>{tr('✓ {n} farklı soru üretildi — göndermeden önce düzenleyebilir veya silebilirsin', { n: oeItems.length })}</div>
                        {oeItems.map((item, index) => (
                          <div key={index} style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '12px' }}>{tr('Soru {n}', { n: index + 1 })}</strong>
                              <button onClick={() => setOeItems(prev => prev && prev.length > 2 ? prev.filter((_, j) => j !== index) : prev)} disabled={oeItems.length <= 2}
                                style={{ fontSize: '11px', color: 'var(--red)', background: 'none', border: 'none', cursor: oeItems.length <= 2 ? 'default' : 'pointer', opacity: oeItems.length <= 2 ? 0.4 : 1 }}>{tr('Sil')}</button>
                            </div>
                            <textarea value={item.scenario} rows={3} onChange={e => setOeItems(prev => prev && prev.map((x, j) => j === index ? { ...x, scenario: e.target.value } : x))}
                              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-sans)' }} aria-label={tr('Soru {n} senaryo', { n: index + 1 })} />
                            <textarea value={item.question} rows={2} onChange={e => setOeItems(prev => prev && prev.map((x, j) => j === index ? { ...x, question: e.target.value } : x))}
                              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-sans)' }} aria-label={tr('Soru {n} soru metni', { n: index + 1 })} />
                            <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{tr('Puanlama: {list}', { list: item.rubric.map(r => `${r.criterion} (${r.maxPoints})`).join(' · ') })}</div>
                          </div>
                        ))}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button className="btn" onClick={generateOeWithAI} disabled={oeGenerating} style={{ justifyContent: 'center' }}>{oeGenerating ? '⏳' : tr('🔄 Yeniden Üret')}</button>
                          <button className="btn btn-primary" onClick={saveOeAssignment} disabled={oeSaving || !oeForm.title.trim()}
                            style={{ flex: 1, justifyContent: 'center', opacity: oeSaving ? 0.6 : 1 }}>{oeSaving ? tr('Kaydediliyor...') : tr('✓ Onayla ve {n} Ödevi Oluştur', { n: oeItems.length })}</button>
                        </div>
                      </>
                    )}

                    {(oeMethod === 'manual' || (oeMethod === 'ai' && oeGenerated)) && !(oeItems && oeItems.length > 1) && (
                      <>
                        {oeMethod === 'ai' && oeGenerated && (
                          <div style={{ fontSize: '11px', color: 'var(--green)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span>{tr('✓ Üretildi — göndermeden önce dilediğin gibi düzenleyebilirsin')}</span>
                            {oeUsedMeb ? (
                              <span style={{ padding: '2px 8px', borderRadius: '99px', background: 'rgba(13,148,136,0.1)', color: '#0d9488', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                {tr('📚 Gerçek MEB kaynağına dayanıyor')}
                              </span>
                            ) : (
                              <span style={{ padding: '2px 8px', borderRadius: '99px', background: 'var(--bg2)', color: 'var(--text3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {tr('ℹ️ Bu konuda yüklü MEB kaynağı bulunamadı — genel bilgiden üretildi')}
                              </span>
                            )}
                          </div>
                        )}
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>{tr('Senaryo / Durum')}</label>
                          <textarea value={oeScenario} onChange={e => setOeScenario(e.target.value)} rows={3}
                            placeholder={tr('Öğrencinin okuyacağı kısa senaryo/durum metni...')}
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>{tr('Soru‖açık uçlu')}</label>
                          <textarea value={oeQuestion} onChange={e => setOeQuestion(e.target.value)} rows={2}
                            placeholder={tr('Senaryoya dayanan açık uçlu soru...')}
                            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'var(--font-sans)' }} />
                        </div>
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 600 }}>{tr('Puanlama Kriterleri (Rubrik)')}</label>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: rubricTotal === 100 ? 'var(--green)' : 'var(--red)' }}>
                              {tr('Toplam: {n} / 100', { n: rubricTotal })}
                            </span>
                          </div>
                          {oeRubric.map((r, i) => (
                            <div key={i} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 32px', gap: '6px', marginBottom: '6px' }}>
                              <input placeholder={tr('Kriter {n} (örn: Bilimsel doğruluk)', { n: i + 1 })} value={r.criterion}
                                onChange={e => setOeRubric(prev => prev.map((x, j) => j === i ? { ...x, criterion: e.target.value } : x))}
                                style={{ ...inputStyle, padding: '8px 10px', fontSize: '12px' }} />
                              <input type="number" min={0} max={100} value={r.maxPoints}
                                onChange={e => setOeRubric(prev => prev.map((x, j) => j === i ? { ...x, maxPoints: Number(e.target.value) } : x))}
                                style={{ ...inputStyle, padding: '8px 10px', fontSize: '12px', textAlign: 'center' }} />
                              <button onClick={() => setOeRubric(prev => prev.filter((_, j) => j !== i))}
                                style={{ border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg2)', color: 'var(--red)', cursor: 'pointer', fontSize: '13px' }}>✕</button>
                            </div>
                          ))}
                          <button onClick={() => setOeRubric(prev => [...prev, { criterion: '', maxPoints: 0, description: '' }])}
                            style={{ fontSize: '11px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', padding: '2px 0' }}>
                            {tr('+ Kriter ekle')}
                          </button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          {oeMethod === 'ai' && (
                            <button className="btn" onClick={generateOeWithAI} disabled={oeGenerating}
                              style={{ justifyContent: 'center' }}>
                              {oeGenerating ? '⏳' : tr('🔄 Yeniden Üret')}
                            </button>
                          )}
                          <button className="btn btn-primary" onClick={saveOeAssignment}
                            disabled={oeSaving || !oeForm.title.trim() || !oeScenario.trim() || !oeQuestion.trim()}
                            style={{ flex: 1, justifyContent: 'center', opacity: oeSaving ? 0.6 : 1 }}>
                            {oeSaving ? tr('Kaydediliyor...') : tr('✓ Onayla ve Ödevi Oluştur')}
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
                <button className="btn" onClick={() => { setShowForm(false); resetOeForm() }} style={{ justifyContent: 'center' }}>{tr('İptal')}</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <select value={form.classroom_id} onChange={e => setForm(p => ({ ...p, classroom_id: e.target.value }))} style={inputStyle}>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input placeholder={tr('Ödev başlığı (örn: Hücre Bölünmesi Testi)')} value={form.title}
                onChange={e => setForm(p => ({ ...p, title: e.target.value }))} style={inputStyle} />
              <input placeholder={tr('Konu (AI buna göre soru üretir)')} value={form.topic}
                onChange={e => setForm(p => ({ ...p, topic: e.target.value }))} style={inputStyle} />
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', padding: '10px 12px', border: `1.5px solid ${quizPool ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '10px', background: quizPool ? 'var(--accent-bg)' : 'transparent' }}>
                <input type="checkbox" checked={quizPool} onChange={e => setQuizPool(e.target.checked)} style={{ width: 18, height: 18 }} />
                {tr('📚 Soruları havuzdan çek')}
                <span style={{ fontWeight: 400, fontSize: '11px', color: 'var(--text3)' }}>{tr('Onaylı soru havuzundan gelir, yapay zeka kullanılmaz')}</span>
              </label>
              <div style={{ fontSize: '11px', color: 'var(--text3)', lineHeight: 1.5 }}>{tr('👁️ Görsel kuralı zorunludur: sayısal derslerde en az %30 (yeni nesil %50), sözel derslerde yaklaşık %10 soru gerçek görsel içerir. Havuzda yeterli görselli soru yoksa ödev oluşturulmaz.')}</div>
              {quizPoolError && <div role="alert" style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)' }}>{quizPoolError}</div>}
              {quizPoolVisualFail && !saving && (
                <button type="button" className="btn" style={{ justifyContent: 'center' }} onClick={() => { setQuizPool(false); void createAssignment(true) }}>
                  {tr('🤖 Havuzu kapat, yapay zekâ görselli sorularla oluştursun')}
                </button>
              )}
              <div style={{ marginTop: '6px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>
                  {tr('Veya dosyadan soru üret (PDF, DOCX, JPG, PNG)')}
                </label>
                <input type="file" accept=".pdf,.docx,.jpg,.jpeg,.png,.txt"
                  onChange={async e => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setAssignFile(file)
                    setFileError('')
                    if (!form.topic) setForm(p => ({ ...p, topic: file.name.replace(/\.[^.]+$/, '') }))
                    if (file.type.includes('text') || file.name.endsWith('.txt')) {
                      const text = await file.text()
                      setAssignFileContent(text.slice(0, 3000))
                    } else {
                      setAssignFileContent('')
                    }
                  }}
                  style={{ fontSize: '12px', color: 'var(--text)', width: '100%' }} />
                {fileLoading && (
                  <p style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px' }}>{tr('⏳ Dosya okunuyor...')}</p>
                )}
                {assignFile && !fileLoading && !fileError && (
                  <p style={{ fontSize: '11px', color: 'var(--green)', marginTop: '4px' }}>✓ {assignFile.name}</p>
                )}
                {fileError && (
                  <div style={{ marginTop: '8px', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '10px', padding: '12px' }}>
                    <div style={{ fontWeight: 700, color: 'var(--red)', fontSize: '12px', marginBottom: '6px' }}>{tr('⚠️ PDF Yüklenemedi')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.6, marginBottom: '8px' }}>
                      {tr('Çözüm önerileri:')}<br/>
                      {tr("• PDF'i Word'e çevir → tekrar yükle")}<br/>
                      {tr("• Büyük PDF'i 50 sayfalık parçalara böl")}<br/>
                      {tr('• Metni kopyalayıp Konu alanına yapıştır')}
                    </div>
                    <a href="https://bigconvert.11zon.com/" target="_blank" rel="noopener noreferrer"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '7px', background: '#082465', color: '#fff', fontSize: '11px', fontWeight: 700, textDecoration: 'none' }}>
                      {tr('🔄 Ücretsiz PDF Dönüştür / Küçült →')}
                    </a>
                  </div>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value }))} style={inputStyle}>
                  <option value="">{tr('Sınıf seviyesi')}</option>
                  {['5','6','7','8','9','10','11','12'].map(g => <option key={g} value={g}>{tr('{g}. Sınıf', { g })}</option>)}
                </select>
                <select value={form.difficulty} onChange={e => setForm(p => ({ ...p, difficulty: e.target.value }))} style={inputStyle}>
                  {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{tr(d.label)}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>{tr('Soru sayısı: {n}', { n: form.question_count })}</label>
                  <input type="range" min={5} max={30} step={5} value={form.question_count}
                    onChange={e => setForm(p => ({ ...p, question_count: Number(e.target.value) }))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }} />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>{tr('Son tarih (isteğe bağlı)')}</label>
                  <input type="datetime-local" value={form.due_date}
                    onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} style={inputStyle} />
                </div>
              </div>
              {/* Soru tipi */}
              <div style={{ marginTop: '6px' }}>
                <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '4px', fontWeight: 600 }}>{tr('Soru tipi')}</label>
                <div style={{ fontSize: '10px', color: '#5b4cf5', marginBottom: '6px', fontWeight: 600 }}>{tr('MM = Maarif Modeli soru tipi')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                  {[
                    { value: 'multiple_choice', label: tr('🔤 Çoktan Seçmeli'), maarif: false },
                    { value: 'fill_blank', label: tr('✏️ Boşluk Doldurma'), maarif: false },
                    { value: 'true_false', label: tr('✓✗ D/Y'), maarif: false },
                    { value: 'multi_true_false', label: tr('📋✓✗ Çoklu D/Y'), maarif: true },
                    { value: 'table_fill', label: tr('🗂️ Tablo Doldurma'), maarif: true },
                    { value: 'matching', label: tr('🔗 Eşleştirme'), maarif: false },
                    { value: 'short_answer', label: tr('💬 Kısa Cevap'), maarif: false },
                    { value: 'mixed', label: tr('🎲 Karma Sorular'), maarif: false },
                  ].map(t => {
                    const isMixed = t.value === 'mixed'
                    const selected = isMixed ? form.question_types.length === ASSIGN_QUESTION_TYPES.length : form.question_types.includes(t.value)
                    return (
                    <button key={t.value} type="button" aria-pressed={selected}
                      onClick={() => setForm(p => {
                        if (isMixed) return { ...p, question_types: p.question_types.length === ASSIGN_QUESTION_TYPES.length ? ['multiple_choice'] : [...ASSIGN_QUESTION_TYPES], question_type: questionTypeField(p.question_types.length === ASSIGN_QUESTION_TYPES.length ? ['multiple_choice'] : [...ASSIGN_QUESTION_TYPES]) }
                        const next = p.question_types.includes(t.value) ? p.question_types.filter(type => type !== t.value) : [...p.question_types, t.value]
                        const types = next.length ? next : p.question_types
                        return { ...p, question_types: types, question_type: questionTypeField(types) }
                      })}
                      style={{ padding: '6px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', textAlign: 'center', position: 'relative',
                        background: selected ? 'rgba(8,36,101,0.08)' : t.maarif ? 'rgba(91,76,245,0.03)' : 'var(--bg2)',
                        borderColor: selected ? 'rgba(8,36,101,0.3)' : t.maarif ? 'rgba(91,76,245,0.25)' : 'var(--border)',
                        color: selected ? 'var(--primary)' : 'var(--text3)',
                      }}>
                      {t.maarif && <span style={{ position: 'absolute', top: '2px', right: '4px', fontSize: '7px', color: '#5b4cf5', fontWeight: 800 }}>MM</span>}
                      {selected ? '✓ ' : ''}{t.label}
                    </button>
                    )
                  })}
                </div>
                <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '6px' }}>{tr('Birden fazla tip seçebilirsin; "Karma Sorular" hepsini seçer (sıralama ödevlerde kullanılmaz).')}</div>
              </div>

              {/* Dosya kaynağı seçimi */}
              {assignFile && (
                <div style={{ marginTop: '6px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '6px', fontWeight: 600 }}>{tr('Dosyadan soru üretme yöntemi')}</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { value: 'from_file', label: tr('📄 Dosyadaki Soruları Kullan') },
                      { value: 'similar', label: tr('🔀 Benzer Sorular Üret') },
                      { value: 'generate', label: tr('✨ Konuya Göre Üret') },
                    ].map(s => (
                      <button key={s.value} onClick={() => setForm(p => ({ ...p, source_type: s.value }))}
                        style={{ flex: 1, padding: '7px 8px', borderRadius: '8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', textAlign: 'center',
                          background: form.source_type === s.value ? 'rgba(8,36,101,0.08)' : 'var(--bg2)',
                          borderColor: form.source_type === s.value ? 'rgba(8,36,101,0.3)' : 'var(--border)',
                          color: form.source_type === s.value ? 'var(--primary)' : 'var(--text3)',
                        }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button className="btn btn-primary" onClick={() => void createAssignment()}
                  disabled={saving || !form.title.trim() || !form.topic.trim()}
                  style={{ flex: 1, justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                  {saving ? tr('Kaydediliyor...') : tr('Ödevi Oluştur')}
                </button>
                <button className="btn" onClick={() => setShowForm(false)} style={{ justifyContent: 'center' }}>{tr('İptal')}</button>
              </div>
            </div>
            )}
          </div>
        )}

        {/* Ödev listesi */}
        {assignments.length === 0 && openEndedAssignments.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>📝</div>
            <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '6px' }}>{tr('Henüz ödev yok')}</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)' }}>{tr('İlk ödevi oluştur ve öğrencilerine ata.')}</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {printMessage && <div role="status" style={{ padding: '10px 12px', background: 'var(--bg2)', borderRadius: '9px', fontSize: '13px', color: 'var(--text2)' }}>{printMessage}</div>}
            {oeGroups.map((group: any[]) => {
              const a = group[0]
              const busy = printBusy === `oe-${a.id}`
              return (
              <div key={`oe-${a.batch_id || a.id}`} className="card" style={{ padding: '14px 16px', borderLeft: '3px solid #6366f1', order: listRank.get(`oe-${a.batch_id || a.id}`) ?? 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '5px' }}>{group.length > 1 ? baseTitle(a.title) : a.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <span>{tr('💬 Açık Uçlu')}{group.length > 1 ? ` · ${tr('{n} soru', { n: group.length })}` : ''}</span>
                      {a.subject && <span>📚 {tr(a.subject)}</span>}
                      <span>🏫 {a.classrooms?.name}</span>
                      <span>{a.created_via === 'ai' ? tr('🤖 AI ile') : a.created_via === 'pool' ? tr('📚 Havuzdan') : tr('✍️ Manuel')}</span>
                      {a.due_date && (
                        <span style={{ color: new Date(a.due_date) < new Date() ? 'var(--red)' : 'var(--text3)' }}>
                          🕐 {new Date(a.due_date).toLocaleDateString(intlLocale(locale))}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                      <button className="btn btn-sm" disabled={busy} onClick={() => void printOpenEndedGroup(group, false)}>{tr('🖨️ Öğrenci formu (PDF)')}</button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => void printOpenEndedGroup(group, true)}>{tr('👩‍🏫 Puanlama anahtarıyla')}</button>
                      <button className="btn btn-sm" onClick={() => setImportGroup(importGroup === `res-${a.batch_id || a.id}` ? '' : `res-${a.batch_id || a.id}`)}>{tr('📊 Sınıf sonuçları')}</button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => void printOpenEndedClass(group)}>{tr('🖨️ Sınıf dökümü (ad + QR)')}</button>
                      <button className="btn btn-sm" onClick={() => planLimited ? setPrintMessage(LOCKED_MESSAGE) : setImportGroup(importGroup === `bulk-${a.batch_id || a.id}` ? '' : `bulk-${a.batch_id || a.id}`)}>{tr('📥 Kâğıt cevapları aktar')}</button>
                    </div>
                    {importGroup === (a.batch_id || a.id) && <PaperAnswerImport group={group} onClose={() => setImportGroup('')} />}
                    {importGroup === `res-${a.batch_id || a.id}` && <OpenEndedResults groupId={a.batch_id || a.id} onClose={() => setImportGroup('')} />}
                    {importGroup === `bulk-${a.batch_id || a.id}` && <PaperBulkImport group={group} onClose={() => setImportGroup('')} onSingle={() => setImportGroup(a.batch_id || a.id)} />}
                  </div>
                  <button onClick={() => deleteOeGroup(group)}
                    style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid rgba(220,38,38,0.25)', background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                    {tr('Sil')}
                  </button>
                </div>
              </div>
              )
            })}
            {assignments.map((a) => {
              const isOverdue = a.due_date && new Date(a.due_date) < new Date()
              const completions = a.assignment_completions?.[0]?.count || 0
              return (
                <div key={a.id} className="card" style={{ padding: '14px 16px', order: listRank.get(`quiz-${a.id}`) ?? 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '5px' }}>{a.title}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        <span>📚 {a.topic}</span>
                        <span>🏫 {a.classrooms?.name}</span>
                        <span>{tr('❓ {n} soru', { n: a.question_count })}</span>
                        <span>{tr('✅ {n} tamamladı', { n: completions })}</span>
                        <span>{tr(({'multiple_choice':'🔤 Çoktan Seçmeli','fill_blank':'✏️ Boşluk Doldurma','true_false':'✓✗ D/Y','multi_true_false':'📋✓✗ Çoklu D/Y','table_fill':'🗂️ Tablo','matching':'🔗 Eşleştirme','ordering':'📋 Sıralama','short_answer':'💬 Kısa Cevap','mixed':'🎲 Karma'} as any)[a.question_type] || '🔤 Çoktan Seçmeli')}</span>
                        {a.due_date && (
                          <span style={{ color: isOverdue ? 'var(--red)' : 'var(--text3)' }}>
                            🕐 {new Date(a.due_date).toLocaleDateString(intlLocale(locale))}{isOverdue ? ` ${tr('(süresi doldu)')}` : ''}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
                        <button className="btn btn-sm" disabled={printBusy === `quiz-${a.id}`} onClick={() => void printQuizAssignment(a, false)}>{tr('🖨️ Basılı test (PDF)')}</button>
                        <button className="btn btn-sm" disabled={printBusy === `quiz-${a.id}`} onClick={() => void printQuizAssignment(a, true)}>{tr('👩‍🏫 Cevap anahtarıyla')}</button>
                        <button className="btn btn-sm" disabled={printBusy === `quizclass-${a.id}`} onClick={() => void printQuizClass(a, true)}>{tr('🖨️ Sınıf dökümü (optik + QR)')}</button>
                        <button className="btn btn-sm" onClick={() => planLimited ? setPrintMessage(LOCKED_MESSAGE) : (Array.isArray(a.pool_questions) && a.pool_questions.length ? setQuizImportId(quizImportId === a.id ? '' : a.id) : setPrintMessage(tr('Önce "Sınıf dökümü (optik + QR)" ile soru setini oluşturup basın; sonra cevap kâğıtlarını buradan aktarabilirsiniz.')))}>{tr('📥 Kâğıt cevapları aktar')}</button>
                      </div>
                      {quizImportId === a.id && <QuizPaperImport assignment={a} onClose={() => setQuizImportId('')} />}
                    </div>
                    <button onClick={() => deleteAssignment(a.id)}
                      style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '7px', border: '1px solid rgba(220,38,38,0.25)', background: 'transparent', color: 'var(--red)', cursor: 'pointer', fontFamily: 'var(--font-sans)', flexShrink: 0, marginLeft: '10px' }}>
                      {tr('Sil')}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--border)',
  background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
