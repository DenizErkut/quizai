// Tier 0 benzer/yinelenen metin tespiti (AI altyapı planı P1-4): kelime shingle + Jaccard + MinHash. Saf, bağımlılıksız.

export function normalizeForSimilarity(text: string): string {
  return String(text ?? '').normalize('NFC').replace(/İ/g, 'i').replace(/I/g, 'ı').toLocaleLowerCase('tr')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function shingles(text: string, size = 3): Set<string> {
  const words = normalizeForSimilarity(text).split(' ').filter(Boolean)
  const out = new Set<string>()
  if (words.length === 0) return out
  if (words.length <= size) { out.add(words.join(' ')); return out }
  for (let i = 0; i + size <= words.length; i++) out.add(words.slice(i, i + size).join(' '))
  return out
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const item of a) if (b.has(item)) intersection++
  return intersection / (a.size + b.size - intersection)
}

function fnv1a(value: string, seed: number): number {
  let hash = (2166136261 ^ seed) >>> 0
  for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0 }
  return hash >>> 0
}

/** MinHash imzası (varsayılan 64 hash). Büyük kümelerde ikili Jaccard yerine imza karşılaştırılır. */
export function minHash(set: Set<string>, hashes = 64): number[] {
  const signature = new Array<number>(hashes).fill(0xffffffff)
  for (const item of set) for (let h = 0; h < hashes; h++) { const v = fnv1a(item, h * 2654435761); if (v < signature[h]) signature[h] = v }
  return signature
}

export function minHashSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let same = 0
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) same++
  return same / a.length
}

/** İki soru metni neredeyse aynı mı? (varsayılan eşik 0,8 shingle-Jaccard) */
export function isNearDuplicate(a: string, b: string, threshold = 0.8): boolean {
  return jaccard(shingles(a), shingles(b)) >= threshold
}
