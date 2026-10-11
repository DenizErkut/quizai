'use client'
import { useT } from '@/lib/i18n/I18nProvider'

// Lets server components (pages that export `metadata`) render translated static text.
export default function Tr({ text, params }: { text: string; params?: Record<string, string | number> }) {
  const { t } = useT()
  return <>{t(text, params)}</>
}
