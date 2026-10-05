import test from 'node:test'
import assert from 'node:assert/strict'
import { planNextObjective } from '../lib/next-objective'

const current = { id:'a', objective_code:'A', title:'A', grade:6, subject:'Fen Bilimleri', graph_node_id:'node-a', curriculum_version_id:'v1', is_active:true, verification_status:'verified' }
const candidate = { id:'b', objective_code:'B', title:'B', grade:6, subject:'Fen Bilimleri', graph_node_id:'node-b', curriculum_version_id:'v1', is_active:true, verification_status:'verified' }
const edge = { id:'e', source_node_id:'node-a', target_node_id:'node-b', edge_type:'prerequisite_of', is_verified:true, reviewed_by:'teacher', valid_from:'2026-01-01', valid_to:null, curriculum_version_id:'v1' }

test('doğrulanmamış öğrenme sonraki kazanım seçmez', () => {
  assert.equal(planNextObjective({ currentObjective:current, candidates:[candidate], edges:[edge], verifiedMastery:false, today:'2026-10-06' }).status, 'not_verified')
})
test('insan incelemesi olmayan veya süresi geçmiş ilişki otomatik aday üretmez', () => {
  assert.equal(planNextObjective({ currentObjective:current, candidates:[candidate], edges:[{...edge, reviewed_by:null}], verifiedMastery:true, today:'2026-10-06' }).status, 'teacher_review')
  assert.equal(planNextObjective({ currentObjective:current, candidates:[candidate], edges:[{...edge, valid_to:'2026-01-01'}], verifiedMastery:true, today:'2026-10-06' }).status, 'teacher_review')
})
test('tek güncel insan incelemeli aday için yeni başlangıç ölçümü ister', () => {
  const result = planNextObjective({ currentObjective:current, candidates:[candidate], edges:[edge], verifiedMastery:true, today:'2026-10-06' })
  assert.equal(result.status, 'baseline_required')
  assert.equal(result.candidate?.objectiveCode, 'B')
  assert.equal(result.actionable, false)
})
test('birden fazla adayda sistem seçim uydurmaz', () => {
  const second = {...candidate, id:'c', objective_code:'C', graph_node_id:'node-c'}
  assert.equal(planNextObjective({ currentObjective:current, candidates:[candidate,second], edges:[edge,{...edge,id:'e2',target_node_id:'node-c'}], verifiedMastery:true, today:'2026-10-06' }).status, 'teacher_review')
})
