export function requiresBookletVisual(question: { q?: unknown; requires_visual?: unknown }) {
  return question.requires_visual === true || /(?:aşağıdaki|yukarıdaki|verilen)\s+(?:şekil|görsel|grafik|harita|resim)|şekilde\s+göster|shown\s+(?:below|above)|(?:following|given)\s+(?:figure|diagram|image|chart)/iu.test(String(question.q || ''))
}
