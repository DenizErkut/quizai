import { CLAUDE_SONNET, SONNET_PARAMS, responseText, sonnetTokens } from '@/lib/claude-models'
import Anthropic from '@anthropic-ai/sdk'
import { logAnthropicUsage } from '@/lib/ai-usage'
import { type ClusterRow, buildClusterPrompt, clusterMemberKey, excludeCanonicalRows, groupClusterableRows, parseClusterResponse } from '@/lib/misconception-clustering'
import { readAll } from '@/lib/paginate'

const CLUSTER_MODEL = CLAUDE_SONNET

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

/** Generates review proposals only; nothing is merged until an expert approves. */
export async function generateClusterProposals(db: Db, maxGroups: number) {
  const { data: rows, error } = await readAll(() => db.from('student_misconceptions')
    .select('student_id,misconception_id,subject,topic,evidence_count,misconception_catalog!inner(label,verification_status,source_type)')
    .neq('status', 'resolved').neq('misconception_catalog.verification_status', 'rejected'), ['student_id', 'misconception_id'])
  if (error) throw new Error(error.message)
  const { data: canonicalRows } = await db.from('misconception_aliases').select('canonical_id')
  const canonicalIds = (canonicalRows ?? []).map((row: { canonical_id: string }) => row.canonical_id)
  type Joined = ClusterRow & { misconception_catalog: { label: string; source_type: string } }
  const flat = excludeCanonicalRows(((rows ?? []) as Joined[])
    .filter(row => row.misconception_catalog.source_type !== 'expert_cluster')
    .map(row => ({ ...row, label: row.misconception_catalog.label })), canonicalIds)
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
      const msg = await anthropic.messages.create({ model: CLUSTER_MODEL, ...SONNET_PARAMS, max_tokens: sonnetTokens(2000),
        messages: [{ role: 'user', content: buildClusterPrompt(group) }] })
      logAnthropicUsage('misconception-clusters', CLUSTER_MODEL, msg)
      for (const cluster of parseClusterResponse(responseText(msg), group)) {
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
