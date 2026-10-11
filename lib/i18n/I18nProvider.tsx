'use client'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useUser } from '@/lib/user-context'
import { DEFAULT_LOCALE, languageFromLocale, localeDir, localeFromLanguage, translate, type Locale } from './core'
import { dictionaryFor } from './dictionaries'

const STORAGE_KEY = 'pratium_lang'

interface I18nValue {
  locale: Locale
  dir: 'ltr' | 'rtl'
  t: (text: string, params?: Record<string, string | number>) => string
  setLocale: (locale: Locale) => Promise<void>
}

const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  dir: 'ltr',
  t: (text, params) => translate(undefined, text, params),
  setLocale: async () => {},
})

function readStored(): Locale | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? localeFromLanguage(stored) : null
  } catch { return null }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { profile, updateLanguage } = useUser()
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE)

  // Stored choice wins (also covers logged-out visitors), then the account language, then the browser.
  useEffect(() => {
    const stored = readStored()
    if (stored) { setLocaleState(stored); return }
    if (profile?.language) { setLocaleState(localeFromLanguage(profile.language)); return }
    const browser = typeof navigator !== 'undefined' ? localeFromLanguage(navigator.language) : DEFAULT_LOCALE
    setLocaleState(browser)
  }, [profile?.language])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = localeDir(locale)
  }, [locale])

  const setLocale = useCallback(async (next: Locale) => {
    setLocaleState(next)
    const language = languageFromLocale(next)
    try { localStorage.setItem(STORAGE_KEY, language) } catch { /* private mode */ }
    if (profile) await updateLanguage(language)
  }, [profile, updateLanguage])

  const value = useMemo<I18nValue>(() => {
    const dictionary = dictionaryFor(locale)
    return { locale, dir: localeDir(locale), t: (text, params) => translate(dictionary, text, params), setLocale }
  }, [locale, setLocale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  return useContext(I18nContext)
}
