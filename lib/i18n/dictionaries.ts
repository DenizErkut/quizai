import type { Dictionary, Locale } from './core'
import { en } from './messages/en'
import { de } from './messages/de'
import { fr } from './messages/fr'
import { es } from './messages/es'
import { ar } from './messages/ar'

export const DICTIONARIES: Record<Exclude<Locale, 'tr'>, Dictionary> = { en, de, fr, es, ar }

export function dictionaryFor(locale: Locale): Dictionary | undefined {
  return locale === 'tr' ? undefined : DICTIONARIES[locale]
}
