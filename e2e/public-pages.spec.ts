import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  // This suite must not access a real Supabase project or user data.
  await page.route('https://e2e.supabase.invalid/**', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'E2E anonymous user' }),
    }),
  )
})

test('landing page renders public entry points', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: /Pratik yap, ba\u015far\u0131ya ula\u015f/i })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Giri\u015f yap' }).first()).toHaveAttribute('href', '/login')
  await expect(page.getByRole('link', { name: '\u00dccretsiz ba\u015fla' }).first()).toHaveAttribute('href', '/register')
})

test('a visitor can start the student registration flow', async ({ page }) => {
  await page.goto('/register')

  await expect(page.getByRole('heading', { name: 'Hesap olu\u015ftur' })).toBeVisible()
  await page.getByRole('button', { name: /\u00d6\u011frenci/i }).click()

  await expect(page.getByText('\u00d6\u011frenci Kayd\u0131')).toBeVisible()
  await expect(page.locator('input[placeholder="Ahmet"]')).toBeVisible()
  await expect(page.locator('input[placeholder="ornek@mail.com"]')).toBeVisible()
})
