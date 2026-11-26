// Müfredat içerik merkezi (SEO/GEO) için URL slug yardımcıları. Saf ve bağımlılıksız.

/** "Türkçe" → "turkce", "T.C. İnkılap Tarihi ve Atatürkçülük" → "tc-inkilap-tarihi-ve-ataturkculuk". */
export function slugify(value: string): string {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i').toLocaleLowerCase('en')
    .replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\./g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

/** "7. sınıf" → "7-sinif" (yalnız 1–12). */
export function gradeSlug(grade: string): string | null {
  const n = Number(String(grade || '').match(/\d{1,2}/)?.[0])
  return n >= 1 && n <= 12 ? `${n}-sinif` : null
}

/** "7-sinif" → 7. */
export function gradeNumberFromSlug(slug: string): number | null {
  const match = /^(\d{1,2})-sinif$/.exec(String(slug || ''))
  const n = match ? Number(match[1]) : NaN
  return n >= 1 && n <= 12 ? n : null
}

export const MIN_INDEXABLE_OBJECTIVES = 10
