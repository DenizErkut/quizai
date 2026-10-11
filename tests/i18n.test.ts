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
