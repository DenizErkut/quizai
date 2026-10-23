import test from 'node:test'
import assert from 'node:assert/strict'
import { canLinkActionCycle, actionFollowup, proposalObjectiveId, evidenceFacts, type ActionProposal, type ActionCycle } from '../lib/teacher-action-workbench'
import { verifiedLearningMetrics } from '../lib/verified-learning-metrics'
const objective = '3ef99283-6b78-4e36-b7a9-e3824f36ec82'
const proposal: ActionProposal = { id:'proposal',teacher_id:'teacher',student_id:'student',classroom_id:'class',agent_name:'agent',policy_version:'v1',
  proposed_action:'assign_practice',title:'Öneri',rationale:'Kanıt gerekçesi',evidence:{objectiveId:objective},status:'approved',created_at:'2026-10-23T09:00:00Z',reviewed_at:'2026-10-23T10:00:00Z',review_note:'Öğretmen gerekçesi' }
const cycle: ActionCycle = { id:'cycle',teacher_id:'teacher',student_id:'student',classroom_id:'class',learning_objective_id:objective,created_at:'2026-10-23T10:01:00Z',status:'active' }
test('link requires exact teacher/student/class/objective, approval and time ordering',()=>{
  assert.equal(canLinkActionCycle(proposal,cycle,'teacher'),true)
  for(const patch of [{teacher_id:'other'},{student_id:'other'},{classroom_id:'other'},{learning_objective_id:'other'},
    {created_at:'2026-10-23T09:59:59Z'},{created_at:'invalid'}]) assert.equal(canLinkActionCycle(proposal,{...cycle,...patch},'teacher'),false)
  for(const patch of [{status:'pending'},{status:'rejected'},{proposed_action:'send_message'},{classroom_id:null},{teacher_id:'other'},{reviewed_at:null},{reviewed_at:'invalid'}, {evidence:{}}])
    assert.equal(canLinkActionCycle({...proposal,...patch},cycle,'teacher'),false)
})
test('only validated objective IDs are extracted, not codes or topic-name similarity',()=>{
  assert.equal(proposalObjectiveId(proposal),objective)
  assert.equal(proposalObjectiveId({evidence:{objective_id:objective}}),objective)
  assert.equal(proposalObjectiveId({evidence:{learningObjectiveId:objective}}),objective)
  assert.equal(proposalObjectiveId({evidence:{objectiveId:'MAT.6.1.1'}}),null)
  assert.equal(proposalObjectiveId({evidence:null}),null)
})
test('facts show only recorded nonnegative integer counts; no fake confidence',()=>{
  assert.deepEqual(evidenceFacts(null),[])
  assert.deepEqual(evidenceFacts({answeredItems:0,independentItems:2,evidenceCount:-1,sessionCount:'5',questionCount:1.5,confidence:99}),[
    {key:'answeredItems',value:0},{key:'independentItems',value:2}])
})
test('assignment and scores never become a verified learning claim without review',()=>{
  const empty=verifiedLearningMetrics([],[])
  assert.equal(actionFollowup(cycle,empty).status,'assigned')
  assert.equal(actionFollowup(cycle,{...empty,baselineScorePct:0}).status,'started')
  assert.equal(actionFollowup(cycle,{...empty,transferScorePct:100}).status,'measured')
  assert.equal(actionFollowup(cycle,{...empty,verifiedTransferScorePct:0}).status,'reviewed')
  assert.equal(actionFollowup(cycle,empty).metrics.verifiedMastery,null)
})
