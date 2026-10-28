import { expect, test, type Page } from '@playwright/test'

const teacher = '11111111-1111-4111-8111-111111111111', student = '22222222-2222-4222-8222-222222222222'
const classroom = '33333333-3333-4333-8333-333333333333', objective = '44444444-4444-4444-8444-444444444444'
const proposalId = '55555555-5555-4555-8555-555555555555', cycleId = '66666666-6666-4666-8666-666666666666'

async function fixture(page: Page, language = 'Türkçe') {
  const user = { id: teacher, aud: 'authenticated', role: 'authenticated', email: 'teacher@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-10-23T08:00:00Z' }
  const access = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: teacher, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test-signature`
  const session = { access_token: access, refresh_token: 'test-only-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }
  await page.context().addCookies([{ name: 'sb-e2e-auth-token', value: `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`, domain: '127.0.0.1', path: '/' }])
  await page.addInitScript(lang => { localStorage.setItem('pratium_lang', lang); sessionStorage.setItem('prati_mascot_hidden', '1') }, language)
  await page.route('https://e2e.supabase.invalid/**', async route => {
    const path = new URL(route.request().url()).pathname
    const singular = (route.request().headers()['accept'] || '').includes('object+json')
    let rows: unknown = []
    if (path.includes('/auth/')) rows = user
    else if (path.endsWith('/teachers')) rows = [{ id: teacher, user_id: teacher, approved: true, school: 'Test School' }]
    else if (path.endsWith('/profiles')) rows = [{ id: student, grade: 'ortaokul 6. sınıf', language, role: 'teacher', plan: 'platin' }]
    else if (path.endsWith('/classrooms')) rows = [{ id: classroom, name: '6A', grade: '6. sınıf', classroom_students: [{ count: 1 }] }]
    else if (path.endsWith('/classroom_students')) rows = [{ classroom_id: classroom, student_id: student }]
    else if (path.endsWith('/streaks')) rows = [{ current_streak: 0 }]
    if (singular && Array.isArray(rows)) rows = rows[0] || null
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'content-range': '0-0/0' }, body: JSON.stringify(rows) })
  })
  const state = { status: 'pending', note: '', decisions: 0, assignments: 0, links: 0, linked: false, fail: false, failLink: false }
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    let payload: unknown = { items: [] }
    if (url.pathname === '/api/identity/resolve') payload = { identities: { [teacher]: { full_name: 'Test Teacher' }, [student]: { full_name: 'Test Student' } } }
    if (url.pathname === '/api/teacher/learning-insights') payload = { students: 1, topics: [], recommendationCount: 0 }
    if (url.pathname === '/api/teacher/learning-risk') payload = { classrooms: [], counts: {}, warnings: [] }
    if (url.pathname === '/api/teacher/learning-gain') payload = { students: [{ id: student, name: 'Test Student' }], sessions: [], measurements: [], summary: { pairedStudents: 0, pairedObjectives: 0, averageGainPp: null, minimumSummaryPairs: 5 }, interpretation: '' }
    if (url.pathname === '/api/teacher/learning-evidence') payload = { objectives: [] }
    if (url.pathname === '/api/teacher/verified-learning') {
      if (method === 'POST') { state.assignments++; payload = { cycleId } }
      else payload = { options: [{ id: objective, objective_code: 'MAT.6.1.1', title: 'Test objective', availableItems: 16, ready: true }],
        cycles: state.assignments ? [{ id: cycleId, learning_objective_id: objective, created_at: '2026-10-23T12:00:00Z', status: 'active', attempts: [] }] : [] }
    }
    if (url.pathname === '/api/teacher/agent-approvals') {
      if (state.fail) return route.fulfill({ status: 503, json: { error: 'Öneriler ve takip kayıtları alınamadı.' } })
      if (method === 'PATCH') { state.decisions++; const body = request.postDataJSON(); state.status = body.status; state.note = body.note; payload = { decisionOnly: true, executionStatus: 'not_executed' } }
      else if (method === 'POST') {
        state.links++
        if (state.failLink) return route.fulfill({ status: 503, json: { error: 'Döngü bağlantısı kaydedilemedi.' } })
        state.linked = true
        payload = { saved: true }
      } else {
        const filter = url.searchParams.get('status') || 'pending'
        payload = { items: filter === 'all' || filter === state.status ? [{ id: proposalId, student_id: student, classroom_id: classroom,
          agent_name: 'test-agent', policy_version: 'test-v1', proposed_action: 'assign_practice', title: 'Kesirlerde çalışma önerisi', rationale: 'İki farklı oturumda tekrar eden hata gözlendi.',
          evidence: { independentItems: 4, sessionCount: 2 }, objectiveId: objective, status: state.status,
          created_at: '2026-10-23T09:00:00Z', reviewed_at: state.status !== 'pending' ? '2026-10-23T10:00:00Z' : null, review_note: state.note || null,
          followup: state.linked ? { cycleId, status: 'assigned', metrics: { baselineScorePct: null, postScorePct: null, transferScorePct: null, verifiedTransferScorePct: null, verifiedMastery: null, support: null } } : null }] : [], hasMore: false }
      }
    }
    await route.fulfill({ status: 200, json: payload })
  })
  return state
}

test('teacher decision preserves evidence, records a note and does not assign automatically', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/teacher')
  const panel = page.getByRole('region', { name: 'Bulgudan eyleme' })
  await expect(panel.getByText('Kesirlerde çalışma önerisi')).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Öneriyi onayla' })).toBeDisabled()
  await panel.getByRole('textbox').fill('Önce bağımsız çözümü inceleyip kısa bir çalışma atayacağım.')
  await panel.getByRole('button', { name: 'Öneriyi onayla' }).click()
  await expect(panel.getByRole('status')).toContainText('Bu işlem öğrenciye uygulanmadı.')
  expect(state.decisions).toBe(1); expect(state.assignments).toBe(0)
  await panel.getByRole('combobox').selectOption('approved')
  await expect(panel.getByText('Bağlı uygulama kaydı yok; bu öneri uygulanmış sayılmıyor.')).toBeVisible()
  await panel.getByRole('button', { name: 'Kanıtı ve çalışma planını aç' }).click()
  await expect(panel.getByRole('button', { name: 'Öğrenciye ata' })).toBeEnabled()
  state.failLink = true
  await panel.getByRole('button', { name: 'Öğrenciye ata' }).click()
  await expect(panel.getByText('Döngü atandı; öneriye bağlantı kaydedilemedi. Aşağıdaki döngüyü takibe bağlayarak yeniden deneyin.')).toBeVisible()
  expect(state.assignments).toBe(1)
  state.failLink = false
  await panel.getByRole('button', { name: 'Bu döngüyü takibe bağla' }).click()
  await expect(panel.getByText('Döngü önerinin takibine bağlandı.').first()).toBeVisible()
  expect(state.assignments).toBe(1)
  await expect(panel.getByText('Atandı · öğrenci henüz başlamadı')).toBeVisible()
  await expect(panel.getByText('Öğretmen incelemeli aktarım başarısı: Henüz doğrulanmadı').first()).toBeVisible()
})

test('English mobile view exposes read failures instead of an empty success state', async ({ page }) => {
  const state = await fixture(page, 'English')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/teacher')
  const panel = page.getByRole('region', { name: 'From insight to action' })
  await expect(panel.getByRole('heading', { name: 'Evidence and uncertainty', exact: true })).toBeVisible()
  const dismissCookies = page.getByRole('button', { name: 'Reject all', exact: true })
  if (await dismissCookies.isVisible()) await dismissCookies.click()
  await expect(panel.getByRole('combobox')).toHaveValue('pending')
  expect(await panel.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await panel.screenshot({ path: 'test-results/teacher-action-mobile.png' })
  state.fail = true
  await panel.getByRole('button', { name: 'Refresh' }).click()
  await expect(panel.getByRole('alert')).toContainText('Proposals and follow-up records could not be loaded.')
  await expect(panel.getByText('No proposals here.', { exact: false })).toHaveCount(0)
})
