/** Catalog comparison only: do not change persisted question fingerprints. */
export function educationEvalSubjectKey(value: unknown): string {
  return String(value || '').trim().toLocaleLowerCase('tr-TR').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]+/g, ' ').trim()
}
