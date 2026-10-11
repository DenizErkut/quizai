type TFn = (text: string, params?: Record<string, string | number>) => string

// 'ortaokul 6. sinif' gibi saklanan sınıf değerini arayüz diline çevirir.
export function gradeLabel(value: string | null | undefined, t: TFn): string {
  if (!value) return ''
  const m = value.trim().match(/^(ilkokul|ortaokul|lise)\s+(\d+)\./i)
  if (!m) return t(value)
  const n = parseInt(m[2])
  const level = m[1].toLowerCase()
  return t(level === 'ilkokul' ? 'İlkokul {n}. Sınıf' : level === 'ortaokul' ? 'Ortaokul {n}. Sınıf' : 'Lise {n}. Sınıf', { n })
}
