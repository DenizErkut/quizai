import type { Dictionary, Locale } from './core'
import { ALL_ENTRIES } from './entries'

type TargetLocale = Exclude<Locale, 'tr'>
const COLUMN: Record<TargetLocale, number> = { en: 1, de: 2, fr: 3, es: 4, ar: 5 }

function build(locale: TargetLocale): Dictionary {
  const dictionary: Dictionary = {}
  for (const entry of ALL_ENTRIES) dictionary[entry[0]] = entry[COLUMN[locale]]
  return dictionary
}

export const DICTIONARIES: Record<TargetLocale, Dictionary> = {
  en: build('en'), de: build('de'), fr: build('fr'), es: build('es'), ar: build('ar'),
}

export function dictionaryFor(locale: Locale): Dictionary | undefined {
  return locale === 'tr' ? undefined : DICTIONARIES[locale]
}
