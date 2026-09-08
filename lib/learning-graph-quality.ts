export interface GraphNode {
  id: string
  node_type: string
  label: string
  subject: string | null
  grade: string | null
  is_active: boolean
}

export interface GraphEdge {
  id: string
  source_node_id: string
  target_node_id: string
  edge_type: string
  is_verified: boolean
}

export interface ObjectiveLink {
  id: string
  objective_code: string
  graph_node_id: string | null
  topic_node_id: string | null
  subject: string
  grade: string
  is_active: boolean
}

export interface GraphQualityIssue {
  code: 'invalid_part_of' | 'cross_subject' | 'cross_grade' | 'prerequisite_cycle' | 'orphan_node' | 'duplicate_node' | 'broken_objective_link'
  severity: 'error' | 'warning'
  message: string
  nodeIds: string[]
  edgeIds: string[]
}

function canonical(value: string | null) {
  return (value || '').toLocaleLowerCase('tr-TR')
    .replace(/sinif/g, 'sınıf')
    .replace(/(\d+)\s*\.\s*sınıf/g, '$1. sınıf')
    .replace(/\s+/g, ' ').trim()
}

export function analyzeLearningGraph(nodes: GraphNode[], edges: GraphEdge[], objectives: ObjectiveLink[]) {
  const issues: GraphQualityIssue[] = []
  const nodeById = new Map(nodes.map(node => [node.id, node]))
  const verified = edges.filter(edge => edge.is_verified)
  const expectedPartOf = new Set(['learning_objective:topic', 'topic:unit', 'unit:subject'])

  for (const edge of verified) {
    const source = nodeById.get(edge.source_node_id)
    const target = nodeById.get(edge.target_node_id)
    if (!source || !target) continue
    if (edge.edge_type === 'part_of' && !expectedPartOf.has(`${source.node_type}:${target.node_type}`)) {
      issues.push({ code: 'invalid_part_of', severity: 'error', message: `Geçersiz hiyerarşi: ${source.node_type} → ${target.node_type}`, nodeIds: [source.id, target.id], edgeIds: [edge.id] })
    }
    if (source.subject && target.subject && canonical(source.subject) !== canonical(target.subject)) {
      issues.push({ code: 'cross_subject', severity: 'error', message: `Dersler arası bağlantı: ${source.subject} → ${target.subject}`, nodeIds: [source.id, target.id], edgeIds: [edge.id] })
    }
    if (source.grade && target.grade && canonical(source.grade) !== canonical(target.grade)) {
      issues.push({ code: 'cross_grade', severity: 'error', message: `Sınıflar arası bağlantı: ${source.grade} → ${target.grade}`, nodeIds: [source.id, target.id], edgeIds: [edge.id] })
    }
  }

  const outgoingPartOf = new Set(verified.filter(edge => edge.edge_type === 'part_of').map(edge => edge.source_node_id))
  for (const node of nodes.filter(node => node.is_active && ['learning_objective', 'topic', 'unit'].includes(node.node_type))) {
    if (!outgoingPartOf.has(node.id)) {
      issues.push({ code: 'orphan_node', severity: 'warning', message: `Kopuk ${node.node_type}: ${node.label}`, nodeIds: [node.id], edgeIds: [] })
    }
  }

  const groups = new Map<string, GraphNode[]>()
  for (const node of nodes.filter(node => node.is_active)) {
    const key = [node.node_type, canonical(node.subject), canonical(node.grade), canonical(node.label)].join('|')
    groups.set(key, [...(groups.get(key) || []), node])
  }
  for (const duplicates of groups.values()) {
    if (duplicates.length > 1) {
      issues.push({ code: 'duplicate_node', severity: 'warning', message: `Mükerrer aktif düğüm: ${duplicates[0].label} (${duplicates.length} adet)`, nodeIds: duplicates.map(node => node.id), edgeIds: [] })
    }
  }

  const prerequisiteEdges = verified.filter(edge => edge.edge_type === 'prerequisite_of')
  const adjacency = new Map<string, GraphEdge[]>()
  for (const edge of prerequisiteEdges) adjacency.set(edge.source_node_id, [...(adjacency.get(edge.source_node_id) || []), edge])
  const visited = new Set<string>(); const activePath = new Set<string>(); const cycleEdges = new Set<string>()
  function visit(nodeId: string) {
    if (visited.has(nodeId)) return false
    visited.add(nodeId); activePath.add(nodeId)
    let foundCycle = false
    for (const edge of adjacency.get(nodeId) || []) {
      if (activePath.has(edge.target_node_id) || visit(edge.target_node_id)) {
        cycleEdges.add(edge.id); foundCycle = true
      }
    }
    activePath.delete(nodeId); return foundCycle
  }
  for (const nodeId of adjacency.keys()) visit(nodeId)
  if (cycleEdges.size > 0) issues.push({ code: 'prerequisite_cycle', severity: 'error', message: `Ön koşul grafiğinde döngü bulundu (${cycleEdges.size} bağlantı).`, nodeIds: [], edgeIds: [...cycleEdges] })

  const verifiedEdgeKeys = new Set(verified.map(edge => `${edge.source_node_id}:${edge.target_node_id}:${edge.edge_type}`))
  for (const objective of objectives.filter(item => item.is_active)) {
    const graphNode = objective.graph_node_id ? nodeById.get(objective.graph_node_id) : null
    const topicNode = objective.topic_node_id ? nodeById.get(objective.topic_node_id) : null
    const valid = graphNode && topicNode && graphNode.node_type === 'learning_objective' && topicNode.node_type === 'topic'
      && verifiedEdgeKeys.has(`${graphNode.id}:${topicNode.id}:part_of`)
      && canonical(objective.subject) === canonical(topicNode.subject)
      && canonical(objective.grade) === canonical(topicNode.grade)
    if (!valid) issues.push({ code: 'broken_objective_link', severity: 'error', message: `Kazanım zinciri eksik veya tutarsız: ${objective.objective_code}`, nodeIds: [objective.graph_node_id, objective.topic_node_id].filter(Boolean) as string[], edgeIds: [] })
  }

  return {
    generatedAt: new Date().toISOString(), nodeCount: nodes.length, verifiedEdgeCount: verified.length,
    errorCount: issues.filter(issue => issue.severity === 'error').length,
    warningCount: issues.filter(issue => issue.severity === 'warning').length, issues,
  }
}
