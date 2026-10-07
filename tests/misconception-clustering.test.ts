import test from 'node:test'
import assert from 'node:assert/strict'
import { groupClusterableRows, parseClusterResponse, clusterMemberKey } from '../lib/misconception-clustering'

const row = (student: string, id: string, topic = 'T', label = `label ${id}`) =>
  ({ student_id: student, misconception_id: id, subject: 'Matematik', topic, evidence_count: 1, label })

test('groups per student and topic and drops groups below three labels', () => {
  const groups = groupClusterableRows([row('a', '1'), row('a', '2'), row('a', '3'), row('b', '4'), row('b', '5'), row('a', '6', 'Other')])
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].items.map(item => item.id), ['1', '2', '3'])
})

test('accepts a valid cluster and rejects unsafe ones', () => {
  const group = groupClusterableRows(['1', '2', '3', '4', '5'].map(id => row('a', id)))[0]
  const response = JSON.stringify({ clusters: [
    { canonicalLabel: 'Basamak değerini karıştırıyor', members: [1, 2, 3], rationale: 'aynı hata' },
    { canonicalLabel: 'Çakışan üye', members: [3, 4, 5], rationale: 'x' },
    { canonicalLabel: 'Az üye', members: [4, 5], rationale: 'x' },
    { canonicalLabel: 'Var olmayan', members: [4, 5, 9], rationale: 'x' },
    { canonicalLabel: 'abc', members: [4, 5, 1], rationale: 'x' },
  ] })
  const clusters = parseClusterResponse(`json:\n${response}`, group)
  assert.equal(clusters.length, 1)
  assert.deepEqual(clusters[0].memberIds, ['1', '2', '3'])
  assert.deepEqual(parseClusterResponse('not json', group), [])
})

test('member key is order independent', () => {
  assert.equal(clusterMemberKey(['b', 'a', 'c']), clusterMemberKey(['c', 'a', 'b']))
})
