// eslint "храповик": mevcut dosyalardaki eski hatalar kapıyı tetiklemez, ama hiçbir dosyanın hata sayısı artamaz
// ve yeni dosyalar (taban kaydı olmayan) hatasız olmalıdır. Saf fonksiyonlar burada, çalıştırıcı lint-ratchet.mjs'te.
export function errorCountsFromEslintJson(results, root = '') {
  const counts = {}
  for (const result of results) {
    const file = result.filePath.startsWith(root) ? result.filePath.slice(root.length).replace(/^[\\/]+/, '') : result.filePath
    const errors = result.messages.filter(message => message.severity === 2).length
    counts[file.replace(/\\/g, '/')] = errors
  }
  return counts
}

/** current: { dosya: hataSayısı } (yalnızca değişen dosyalar), baseline: { dosya: hataSayısı } (yalnızca hatalı dosyalar). */
export function compareToBaseline(current, baseline) {
  const regressions = []
  const improvements = []
  for (const [file, errors] of Object.entries(current)) {
    const allowed = baseline[file] ?? 0
    if (errors > allowed) regressions.push({ file, errors, allowed })
    else if (errors < allowed) improvements.push({ file, errors, allowed })
  }
  return { regressions, improvements }
}

/** Tabanı yalnızca hatası olan dosyalarla, dosya adına göre sıralı üretir. */
export function buildBaseline(counts) {
  return Object.fromEntries(Object.entries(counts).filter(([, errors]) => errors > 0).sort(([a], [b]) => a.localeCompare(b)))
}
