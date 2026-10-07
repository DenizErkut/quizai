import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { buildClusterPrompt, clusterMemberKey, groupClusterableRows, parseClusterResponse } from '@/lib/misconception-clustering'

const CLUSTER_MODEL = 'claude-sonnet-4-5'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Generates review proposals only; nothing is merged until an expert approves. */
export async function generateClusterProposals(db: Db, maxGroups: number) {
  const { data: rows, error } = await db.from('student_misconceptions')
    .select('student_id,misconception_id,subject,topic,evidence_count,misconception_catalog!inner(label,verification_status)')
    .neq('status', 'resolved').neq('misconception_catalog.verification_status', 'rejected').limit(5000)
  if (error) throw new Error(error.message)
  const flat = (rows ?? []).map((row: Record<string, unknown>) => ({ ...row, label: (row.misconception_catalog as { label: string }).label }))
  const { data: open } = await db.from('misconception_cluster_proposals').select('student_id,member_key').eq('status', 'proposed')
  const openKeys = new Set((open ?? []).map((row: { student_id: string; member_key: string }) => `${row.student_id}|${row.member_key}`))
  // Largest groups first; groups already holding an open proposal over all of their members are skipped.
  const groups = groupClusterableRows(flat).sort((a, b) => b.items.length - a.items.length)
    .filter(group => !openKeys.has(`${group.studentId}|${clusterMemberKey(group.items.map(item => item.id))}`))
    .slice(0, maxGroups)

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let created = 0
  const failures: string[] = []
  for (const group of groups) {
    try {
      const msg = await anthropic.messages.create({ model: CLUSTER_MODEL, max_tokens: 2000, temperature: 0,
        messages: [{ role: 'user', content: buildClusterPrompt(group) }] })
      logAnthropicUsage('misconception-clusters', CLUSTER_MODEL, msg)
      const block = msg.content[0]
      for (const cluster of parseClusterResponse(block?.type === 'text' ? block.text : '', group)) {
        const { error: insertError } = await db.from('misconception_cluster_proposals').insert({
          student_id: group.studentId, subject: group.subject, topic: group.topic, canonical_label: cluster.canonicalLabel,
          member_ids: cluster.memberIds, member_key: clusterMemberKey(cluster.memberIds), rationale: cluster.rationale, model: CLUSTER_MODEL,
        })
        if (insertError && insertError.code !== '23505') failures.push(insertError.message)
        else if (!insertError) created += 1
      }
    } catch (err) { failures.push(err instanceof Error ? err.message : 'LLM çağrısı başarısız') }
  }
  return { groupsAnalyzed: groups.length, proposalsCreated: created, failures }
}
