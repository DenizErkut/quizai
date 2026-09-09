export function clampScore(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.round(Math.min(1, Math.max(0, parsed)) * 1000) / 1000
}

export function matchingPartialScore(correctCount: number, pairCount: number): number {
  if (pairCount <= 0) return 0
  return clampScore(correctCount / pairCount)
}

// Her doğru ikili sıralama ilişkisini ödüllendirir; tek kaydırma tüm puanı silmez.
export function orderingPartialScore(currentOrder: string[], expectedOrder: string[]): number {
  if (expectedOrder.length < 2 || currentOrder.length !== expectedOrder.length) return 0
  const positions = new Map(currentOrder.map((item, index) => [item, index]))
  let correctPairs = 0
  let totalPairs = 0
  for (let left = 0; left < expectedOrder.length; left++) {
    for (let right = left + 1; right < expectedOrder.length; right++) {
      totalPairs++
      const leftPosition = positions.get(expectedOrder[left])
      const rightPosition = positions.get(expectedOrder[right])
      if (leftPosition !== undefined && rightPosition !== undefined && leftPosition < rightPosition) correctPairs++
    }
  }
  return matchingPartialScore(correctPairs, totalPairs)
}

export function answerScore(answer: { correct?: boolean; awardedScore?: unknown }): number {
  return answer.awardedScore === undefined ? (answer.correct ? 1 : 0) : clampScore(answer.awardedScore)
}
