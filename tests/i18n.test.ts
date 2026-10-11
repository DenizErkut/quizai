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
