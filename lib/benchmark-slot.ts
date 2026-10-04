export function nextBenchmarkOrdinal(ordinals: number[], target: number): number | null {
  const used = new Set(ordinals)
  for (let ordinal = 1; ordinal <= target; ordinal++) {
    if (!used.has(ordinal)) return ordinal
  }
  return null
}
