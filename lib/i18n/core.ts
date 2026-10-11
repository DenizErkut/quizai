// UI translation core. Turkish is the source language: the Turkish text itself is the key, so a string
// that has no entry in a locale's dictionary simply renders in Turkish. Pure module (no aliases) so the
// node:test runner can import it.

export type Locale = 'tr' | 'en' | 'de' | 'fr' | 'es' | 'ar'
export type Dictionary = Record<string, string>

export const LOCALES: { code: Locale; language: string; label: string; flag: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'tr', language: 'Türkçe', label: 'Türkçe', flag: '🇹🇷', dir: 'ltr' },
  { code: 'en', language: 'English', label: 'English', flag: '🇬🇧', dir: 'ltr' },
  { code: 'de', language: 'Deutsch', label: 'Deutsch', flag: '🇩🇪', dir: 'ltr' },
  { code: 'fr', language: 'Français', label: 'Français', flag: '🇫🇷', dir: 'ltr' },
  { code: 'es', language: 'Español', label: 'Español', flag: '🇪🇸', dir: 'ltr' },
  { code: 'ar', language: 'العربية', label: 'العربية', flag: '🇸🇦', dir: 'rtl' },
]

export const DEFAULT_LOCALE: Locale = 'tr'

/** `profiles.language` stores the language name ("English"); accept codes too ("en", "en-US"). */
export function localeFromLanguage(value: string | null | undefined): Locale {
  const raw = String(value ?? '').trim()
  if (!raw) return DEFAULT_LOCALE
  const byName = LOCALES.find(l => l.language === raw)
  if (byName) return byName.code
  const short = raw.toLowerCase().split(/[-_]/)[0]
  return LOCALES.find(l => l.code === short)?.code ?? DEFAULT_LOCALE
}

export function languageFromLocale(locale: Locale): string {
  return LOCALES.find(l => l.code === locale)?.language ?? 'Türkçe'
}

const INTL: Record<Locale, string> = { tr: 'tr-TR', en: 'en-GB', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', ar: 'ar' }

/** BCP-47 tag for Intl/Date formatting. */
export function intlLocale(locale: Locale): string {
  return INTL[locale]
}

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return LOCALES.find(l => l.code === locale)?.dir ?? 'ltr'
}

/**
 * Looks `text` up in `dictionary` (falls back to `text`) and fills `{name}` placeholders from `params`.
 * The same Turkish word can need different translations ("Sıralama": leaderboard vs ordering); append
 * `‖context` to the key to tell them apart. The context is dropped from the fallback text.
 */
const normalizedCache = new WeakMap<Dictionary, Map<string, string>>()
const TR_FOLD: Record<string, string> = { ı: 'i', ğ: 'g', ü: 'u', ş: 's', ö: 'o', ç: 'c' }
const normalizeKey = (value: string) =>
  value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR').replace(/[ığüşöç]/g, ch => TR_FOLD[ch])

// Veri tabanından gelen konu adları yazım/büyük-küçük harf farkı taşıyabilir ("Güneş Sistemi Ve Tutulmalar");
// tam eşleşme yoksa normalize edilmiş eşleşmeyi ve "Ad (1)" gibi sayı ekini dener.
function lookup(dictionary: Dictionary | undefined, text: string): string | undefined {
  if (!dictionary) return undefined
  const exact = dictionary[text]
  if (exact !== undefined) return exact
  if (text.includes('‖') || text.includes('{')) return undefined
  let map = normalizedCache.get(dictionary)
  if (!map) {
    map = new Map()
    for (const key of Object.keys(dictionary)) {
      if (!key.includes('‖')) map.set(normalizeKey(key), dictionary[key])
    }
    normalizedCache.set(dictionary, map)
  }
  const hit = map.get(normalizeKey(text))
  if (hit !== undefined) return hit
  const suffixed = text.match(/^(.*?)(\s*\(\d+\))$/)
  if (suffixed) {
    const base = map.get(normalizeKey(suffixed[1]))
    if (base !== undefined) return base + suffixed[2]
  }
  return undefined
}

export function translate(dictionary: Dictionary | undefined, text: string, params?: Record<string, string | number>): string {
  const template = lookup(dictionary, text) ?? text.replace(/‖.*$/, '')
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match))
}
