import test from 'node:test'
import assert from 'node:assert/strict'
import { localeFromLanguage, languageFromLocale, localeDir, translate, LOCALES } from '../lib/i18n/core'
import { DICTIONARIES } from '../lib/i18n/dictionaries'

test('localeFromLanguage maps stored names, codes and unknown values', () => {
  assert.equal(localeFromLanguage('Deutsch'), 'de')
  assert.equal(localeFromLanguage('العربية'), 'ar')
  assert.equal(localeFromLanguage('en-US'), 'en')
  assert.equal(localeFromLanguage('xx'), 'tr')
  assert.equal(localeFromLanguage(null), 'tr')
  assert.equal(languageFromLocale('fr'), 'Français')
  assert.equal(localeDir('ar'), 'rtl')
  assert.equal(localeDir('es'), 'ltr')
})

test('translate falls back to Turkish source and fills placeholders', () => {
  assert.equal(translate(undefined, 'Çıkış yap'), 'Çıkış yap')
  assert.equal(translate(DICTIONARIES.en, 'Çıkış yap'), 'Sign out')
  assert.equal(translate(DICTIONARIES.en, 'bilinmeyen metin'), 'bilinmeyen metin')
  assert.equal(translate(DICTIONARIES.en, 'Bu ay {n} test hakkı kaldı', { n: 3 }), '3 tests left this month')
  assert.equal(translate(undefined, 'Merhaba {ad}', { ad: 'Ece' }), 'Merhaba Ece')
})

test('every locale dictionary covers the same keys and keeps placeholders', () => {
  const keys = Object.keys(DICTIONARIES.en).sort()
  for (const l of LOCALES.filter(x => x.code !== 'tr')) {
    const dict = DICTIONARIES[l.code as keyof typeof DICTIONARIES]
    assert.deepEqual(Object.keys(dict).sort(), keys, l.code)
    for (const key of keys) {
      const want = (key.match(/\{\w+\}/g) || []).sort().join()
      assert.equal((dict[key].match(/\{\w+\}/g) || []).sort().join(), want, `${l.code}: ${key}`)
    }
  }
})

test('literal t() keys in translated pages exist in the dictionaries', async () => {
  const { readFileSync } = await import('node:fs')
  const files = ['components/Navbar.tsx', 'app/home/page.tsx', 'app/page.tsx', 'app/(auth)/login/page.tsx']
  const missing: string[] = []
  for (const file of files) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(/\bt\('((?:[^'\\]|\\.)*)'/g)) {
      const key = match[1].replace(/\\'/g, "'")
      if (!(key in DICTIONARIES.en)) missing.push(`${file}: ${key}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('duplicate source texts never carry conflicting translations', async () => {
  const { ALL_ENTRIES } = await import('../lib/i18n/entries')
  const seen = new Map<string, string>()
  const conflicts: string[] = []
  for (const entry of ALL_ENTRIES) {
    const signature = entry.slice(1).join('\u0000')
    const previous = seen.get(entry[0])
    if (previous !== undefined && previous !== signature) conflicts.push(entry[0])
    seen.set(entry[0], signature)
  }
  assert.deepEqual(conflicts, [])
})

test('every dashboard/pricing entry is referenced by its page', async () => {
  const { readFileSync } = await import('node:fs')
  const { dashboardPricingEntries } = await import('../lib/i18n/entries/dashboard-pricing')
  const source = ['app/dashboard/page.tsx', 'app/pricing/page.tsx', 'components/Navbar.tsx'].map(f => readFileSync(f, 'utf8')).join('\n')
  const unused = dashboardPricingEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key.replace(/'/g, "\\'").replace(/^\{n\}/, '')) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('profile entries are used by the profile page', async () => {
  const { readFileSync } = await import('node:fs')
  const { profileEntries } = await import('../lib/i18n/entries/profile')
  const source = readFileSync('app/profile/page.tsx', 'utf8')
  const unused = profileEntries.map(e => e[0]).filter(key => !/^(İlkokul|Ortaokul|Lise|Üniversite) \d\. Sınıf$/.test(key) && !source.includes(key.replace(/'/g, "\\'")))
  assert.deepEqual(unused, [])
})

test('context suffix disambiguates identical source words and is dropped in Turkish', () => {
  assert.equal(translate(undefined, 'Sıralama‖soru tipi'), 'Sıralama')
  assert.equal(translate({ 'Sıralama‖soru tipi': 'Ordering' }, 'Sıralama‖soru tipi'), 'Ordering')
})

test('quiz setup entries are used by the setup component', async () => {
  const { readFileSync } = await import('node:fs')
  const { quizSetupEntries } = await import('../lib/i18n/entries/quiz-setup')
  const source = readFileSync('components/quiz/QuizSetup.tsx', 'utf8')
  const unused = quizSetupEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('quiz question entries are used by the question component', async () => {
  const { readFileSync } = await import('node:fs')
  const { quizQuestionEntries } = await import('../lib/i18n/entries/quiz-question')
  const source = readFileSync('components/quiz/QuizQuestion.tsx', 'utf8')
  const constants = readFileSync('lib/quiz-constants.ts', 'utf8')
  const unused = quizQuestionEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key) && !constants.includes(`label: '${key}'`))
  assert.deepEqual(unused, [])
})

test('quiz result entries are used by the result component', async () => {
  const { readFileSync } = await import('node:fs')
  const { quizResultEntries } = await import('../lib/i18n/entries/quiz-result')
  const source = readFileSync('components/QuizResult.tsx', 'utf8')
  const constants = readFileSync('lib/quiz-constants.ts', 'utf8')
  const unused = quizResultEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key) && !constants.includes(key))
  assert.deepEqual(unused, [])
})

test('quiz flow entries are used by the quiz page', async () => {
  const { readFileSync } = await import('node:fs')
  const { quizFlowEntries } = await import('../lib/i18n/entries/quiz-flow')
  const source = readFileSync('app/quiz/page.tsx', 'utf8')
  const unused = quizFlowEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('community entries are used by leaderboard or the shared page header', async () => {
  const { readFileSync } = await import('node:fs')
  const { communityEntries } = await import('../lib/i18n/entries/community')
  const source = ['app/leaderboard/page.tsx', 'components/PageHeader.tsx'].map(f => readFileSync(f, 'utf8')).join('\n')
  const unused = communityEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('coach entries are used by the coach page or widget', async () => {
  const { readFileSync } = await import('node:fs')
  const { coachEntries } = await import('../lib/i18n/entries/coach')
  const source = ['app/koc/page.tsx', 'components/CoachMascot.tsx'].map(f => readFileSync(f, 'utf8')).join('\n')
  const unused = coachEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('review entries are used by the review page or shared header', async () => {
  const { readFileSync } = await import('node:fs')
  const { reviewEntries } = await import('../lib/i18n/entries/review')
  const source = readFileSync('app/review/page.tsx', 'utf8')
  const unused = reviewEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('archive entries are used by the archive pages', async () => {
  const { readFileSync } = await import('node:fs')
  const { archiveEntries } = await import('../lib/i18n/entries/archive')
  const source = ['app/archive/ArchiveClient.tsx', 'app/archive/page.tsx', 'app/archive/[id]/page.tsx'].map(f => readFileSync(f, 'utf8')).join('\n')
  const unused = archiveEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('daily entries are used by the daily page, shared header or already defined elsewhere', async () => {
  const { readFileSync } = await import('node:fs')
  const { dailyEntries } = await import('../lib/i18n/entries/daily')
  const source = readFileSync('app/daily/page.tsx', 'utf8')
  const unused = dailyEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('analysis entries are used by the analysis page', async () => {
  const { readFileSync } = await import('node:fs')
  const { analysisEntries } = await import('../lib/i18n/entries/analysis')
  const source = readFileSync('app/analysis/page.tsx', 'utf8')
  const unused = analysisEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('auth login entries are used by the role login pages', async () => {
  const { readFileSync } = await import('node:fs')
  const { authLoginEntries } = await import('../lib/i18n/entries/auth-login')
  const source = ['student', 'parent', 'teacher', 'institution'].map(r => readFileSync(`app/(auth)/login/${r}/page.tsx`, 'utf8')).join('\n')
  const unused = authLoginEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('notes entries are used by the notes page', async () => {
  const { readFileSync } = await import('node:fs')
  const { notesEntries } = await import('../lib/i18n/entries/notes')
  const source = readFileSync('app/notes/page.tsx', 'utf8')
  const unused = notesEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('plan entries are used by the plan page or already defined', async () => {
  const { readFileSync } = await import('node:fs')
  const { planEntries } = await import('../lib/i18n/entries/plan')
  const source = readFileSync('app/plan/page.tsx', 'utf8')
  const unused = planEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('live entries are used by the live quiz screen', async () => {
  const { readFileSync } = await import('node:fs')
  const { liveEntries } = await import('../lib/i18n/entries/live')
  const source = readFileSync('app/live/LiveContent.tsx', 'utf8')
  const unused = liveEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('register entries are used by the registration page', async () => {
  const { readFileSync } = await import('node:fs')
  const { registerEntries } = await import('../lib/i18n/entries/register')
  const source = readFileSync('app/(auth)/register/page.tsx', 'utf8')
  const unused = registerEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('exam entries are used by the exam page, shared header or exam metadata', async () => {
  const { readFileSync } = await import('node:fs')
  const { examEntries } = await import('../lib/i18n/entries/exam')
  const source = readFileSync('app/exam/page.tsx', 'utf8')
  const unused = examEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('student school entries are used by assignments and classes pages', async () => {
  const { readFileSync } = await import('node:fs')
  const { studentSchoolEntries } = await import('../lib/i18n/entries/student-school')
  const source = ['app/assignments/page.tsx', 'app/classes/page.tsx'].map(f => readFileSync(f, 'utf8')).join('\n')
  const unused = studentSchoolEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('referral entries are used by the referral page', async () => {
  const { readFileSync } = await import('node:fs')
  const { referralEntries } = await import('../lib/i18n/entries/referral')
  const source = readFileSync('app/referral/page.tsx', 'utf8')
  const unused = referralEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('notifications entries are used by the notifications page', async () => {
  const { readFileSync } = await import('node:fs')
  const { notificationsEntries } = await import('../lib/i18n/entries/notifications')
  const source = readFileSync('app/notifications/page.tsx', 'utf8')
  const unused = notificationsEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('open-ended entries are used by the open-ended page', async () => {
  const { readFileSync } = await import('node:fs')
  const { openEndedEntries } = await import('../lib/i18n/entries/open-ended')
  const source = readFileSync('app/acik-uclu/page.tsx', 'utf8')
  const unused = openEndedEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('teacher register entries are used by the teacher register page', async () => {
  const { readFileSync } = await import('node:fs')
  const { teacherRegisterEntries } = await import('../lib/i18n/entries/teacher-register')
  const source = readFileSync('app/(auth)/register/teacher/page.tsx', 'utf8')
  const unused = teacherRegisterEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('pdf tools entries are used by the pdf tools page', async () => {
  const { readFileSync } = await import('node:fs')
  const { pdfToolsEntries } = await import('../lib/i18n/entries/pdf-tools')
  const source = readFileSync('app/pdf-tools/page.tsx', 'utf8')
  const unused = pdfToolsEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('reading entries are used by the reading page', async () => {
  const { readFileSync } = await import('node:fs')
  const { readingEntries } = await import('../lib/i18n/entries/reading')
  const source = readFileSync('app/reading/page.tsx', 'utf8')
  const unused = readingEntries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
  assert.deepEqual(unused, [])
})

test('teacher panel entries are used by the teacher dashboard and its components', async () => {
  const { readFileSync } = await import('node:fs')
  const { teacherPanelEntries } = await import('../lib/i18n/entries/teacher-panel')
  const sources = ['app/teacher/page.tsx', 'components/teacher/LearningInsights.tsx', 'components/teacher/AgentApprovalQueue.tsx', 'components/teacher/TeacherInviteLink.tsx', 'components/teacher/TeacherPlanBanner.tsx']
    .map(file => readFileSync(file, 'utf8')).join('\n')
  const unused = teacherPanelEntries.map(e => e[0]).filter(key => !sources.includes(key.replace(/'/g, "\\'")) && !sources.includes(key))
  assert.deepEqual(unused, [])
})

for (const [name, entriesFile, exportName, files] of [
  ['teacher students', 'teacher-students', 'teacherStudentsEntries', ['app/teacher/students/page.tsx']],
  ['teacher notify', 'teacher-notify', 'teacherNotifyEntries', ['app/teacher/notify/page.tsx', 'app/teacher/reports/page.tsx', 'app/teacher/import-grades/page.tsx']],
  ['teacher report', 'teacher-report', 'teacherReportEntries', ['app/teacher/report/page.tsx']],
  ['teacher ai training', 'teacher-ai-training', 'teacherAiTrainingEntries', ['app/teacher/ai-training/page.tsx']],
  ['teacher assign', 'teacher-assign', 'teacherAssignEntries', ['app/teacher/assign/page.tsx']],
  ['teacher performance', 'teacher-performance', 'teacherPerformanceEntries', ['app/teacher/performance/page.tsx']],
  ['parent', 'parent', 'parentEntries', ['app/parent/page.tsx', 'app/parent/report/page.tsx']],
  ['institution', 'institution', 'institutionEntries', ['app/institution/page.tsx']],
  ['institution parts', 'institution-parts', 'institutionPartsEntries', ['components/institution/InstitutionTeachers.tsx', 'components/institution/InstitutionComparisons.tsx']],
  ['institution integrations', 'institution-integrations', 'institutionIntegrationsEntries', ['app/institution/integrations/page.tsx']],
  ['teacher live', 'teacher-live', 'teacherLiveEntries', ['app/teacher/live/page.tsx']],
  ['teacher components', 'teacher-components', 'teacherComponentsEntries', ['components/teacher/PeriodicAiQuiz.tsx', 'components/teacher/TeacherKnowledgeTestShortcut.tsx', 'components/teacher/PaperAnswerImport.tsx']],
] as const) {
  test(`${name} entries are used by their pages`, async () => {
    const { readFileSync } = await import('node:fs')
    const entries = (await import(`../lib/i18n/entries/${entriesFile}`))[exportName] as Array<[string, ...string[]]>
    const source = files.map(file => readFileSync(file, 'utf8')).join('\n')
    const unused = entries.map(e => e[0]).filter(key => !source.includes(key.replace(/'/g, "\\'")) && !source.includes(key))
    assert.deepEqual(unused, [])
  })
}
