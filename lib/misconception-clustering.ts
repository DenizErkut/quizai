// Semantic canonicalization of per-question misconception labels.
//
// Catalog ids are `mc_<hash>` and unique per question, so the "≥3 observations
// → confirmed" rule never fires. This module groups one student's labels by
// subject+topic, asks a model to propose clusters of labels describing the SAME
// error, and validates the proposal strictly. Nothing here changes the catalog:
// proposals go to expert review (approve_misconception_cluster).

export type ClusterableLabel = { id: string; label: string; evidenceCount: number }
export type ClusterGroup = { studentId: string; subject: string; topic: string; items: ClusterableLabel[] }
export type ProposedCluster = { canonicalLabel: string; memberIds: string[]; rationale: string }

export const MIN_CLUSTER_SIZE = 3
export const MAX_GROUP_ITEMS = 40

type Row = { student_id: string; misconception_id: string; subject: string; topic: string; evidence_count: number; label: string }

/** Groups student misconception rows by student+subject+topic; keeps groups able to reach a cluster. */
export function groupClusterableRows(rows: Row[]): ClusterGroup[] {
  const groups = new Map<string, ClusterGroup>()
  for (const row of rows) {
    const key = JSON.stringify([row.student_id, row.subject, row.topic])
    const group = groups.get(key) ?? { studentId: row.student_id, subject: row.subject, topic: row.topic, items: [] }
    group.items.push({ id: row.misconception_id, label: row.label, evidenceCount: row.evidence_count })
    groups.set(key, group)
  }
  return [...groups.values()].filter(group => group.items.length >= MIN_CLUSTER_SIZE)
    .map(group => ({ ...group, items: group.items.slice(0, MAX_GROUP_ITEMS) }))
}

export function buildClusterPrompt(group: ClusterGroup): string {
  const list = group.items.map((item, index) => `${index + 1}. ${item.label}`).join('\n')
  return `Aşağıda tek bir öğrencinin "${group.subject} / ${group.topic}" konusunda gözlenen yanılgı etiketleri var. `
    + `Her etiket farklı bir sorudan geldi; aynı kavramsal hatayı farklı sözcüklerle anlatan etiketleri kümele.\n\n`
    + `Kurallar:\n- Bir küme yalnızca AYNI temel kavramsal hatayı anlatan en az ${MIN_CLUSTER_SIZE} etiket içerir.\n`
    + `- Sadece aynı konuda olmak yeterli değil; hatanın mekanizması aynı olmalı (ör. "binler basamağını onlarla karıştırma" ile "toplamayı çıkarmayla karıştırma" ayrı hatalardır).\n`
    + `- Emin değilsen etiketi kümeye ALMA. Bir etiket en fazla bir kümede yer alır. Hiç küme yoksa boş liste dön.\n`
    + `- canonicalLabel: 5-160 karakter, öğrenciyi suçlamayan, tek cümlelik Türkçe hata tanımı.\n\n`
    + `Etiketler:\n${list}\n\n`
    + `Yalnızca şu JSON'u dön: {"clusters":[{"canonicalLabel":"...","members":[1,2,3],"rationale":"..."}]} (members = yukarıdaki numaralar)`
}

/** Strict validation: unknown/duplicate members, small clusters and bad labels are dropped, never repaired. */
export function parseClusterResponse(text: string, group: ClusterGroup): ProposedCluster[] {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return []
  let parsed: { clusters?: unknown }
  try { parsed = JSON.parse(text.slice(start, end + 1)) } catch { return [] }
  if (!Array.isArray(parsed.clusters)) return []
  const used = new Set<string>()
  const result: ProposedCluster[] = []
  for (const raw of parsed.clusters as Array<Record<string, unknown>>) {
    const label = typeof raw?.canonicalLabel === 'string' ? raw.canonicalLabel.trim() : ''
    const rationale = typeof raw?.rationale === 'string' ? raw.rationale.trim().slice(0, 500) : ''
    if (label.length < 5 || label.length > 160 || !Array.isArray(raw.members)) continue
    const ids = [...new Set(raw.members.map(Number))].map(n => Number.isInteger(n) ? group.items[n - 1]?.id : undefined)
    if (ids.some(id => !id) || ids.length < MIN_CLUSTER_SIZE || ids.some(id => used.has(id!))) continue
    ids.forEach(id => used.add(id!))
    result.push({ canonicalLabel: label, memberIds: ids as string[], rationale })
  }
  return result
}

/** Stable key so re-running generation never duplicates a pending proposal. */
export function clusterMemberKey(memberIds: string[]): string {
  return [...memberIds].sort().join(',')
}
