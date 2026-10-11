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

export function localeDir(locale: Locale): 'ltr' | 'rtl' {
  return LOCALES.find(l => l.code === locale)?.dir ?? 'ltr'
}

/** Looks `text` up in `dictionary` (falls back to `text`) and fills `{name}` placeholders from `params`. */
export function translate(dictionary: Dictionary | undefined, text: string, params?: Record<string, string | number>): string {
  const template = dictionary?.[text] ?? text
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match))
}
