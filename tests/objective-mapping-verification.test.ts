import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hasAutomatedObjectiveApproval, hasVerifiedBankQuality, objectiveReviewContent, HISTORICAL_OBJECTIVE_REVIEW_POLICY } from '../lib/objective-mapping-verification'

function question() {
  const q: Record<string,unknown> = { q:'40 ve 56 ortak böleni?',opts:['4','8','10','12'],ans:1,exp:'EBOB 8.',difficulty:'normal',learningObjectiveId:'id',learningObjectiveCode:'MAT.6.1.4',objectiveVerified:true,objectiveMappingStatus:'ai_approved',qualityVerificationVersion:HISTORICAL_OBJECTIVE_REVIEW_POLICY }
  q.objectiveBackfillReview={ policyVersion:HISTORICAL_OBJECTIVE_REVIEW_POLICY,decision:'approved',content:objectiveReviewContent(q),reviewedDifficulty:'normal',audits:['openai','mistral'].map(provider=>({ provider,approved:true,score:90,objectiveCode:'MAT.6.1.4',difficultyMatches:true,answerCorrect:true,explanationConsistent:true,ageAppropriate:true,unambiguous:true,directObjectiveMatch:true })) }
  return q
}
test('otomatik onay ancak iki bağımsız denetim ve aynı içerikle geçerlidir',()=> {
  assert.equal(hasAutomatedObjectiveApproval(question()),true)
  assert.equal(hasAutomatedObjectiveApproval({ ...question(),q:'Farklı soru' }),false)
  assert.equal(hasAutomatedObjectiveApproval({ ...question(),ans:2 }),false)
  assert.equal(hasAutomatedObjectiveApproval({ ...question(),learningObjectiveCode:'FB.6.1.1' }),false)
})
test('yapılandırılmış alternatif denetçi bağımsızlığı korur; tek sağlayıcı yeterli değildir',()=> {
  const q=question()
  const review=q.objectiveBackfillReview as { audits: Array<{ provider:string }> }
  review.audits[0].provider='anthropic'
  assert.equal(hasAutomatedObjectiveApproval(q),true)
  review.audits[1].provider='anthropic'
  assert.equal(hasAutomatedObjectiveApproval(q),false)
  review.audits[1].provider='unknown'
  assert.equal(hasAutomatedObjectiveApproval(q),false)
})
test('eski doğru/yanlış biçimi uygulamanın standart seçenekleriyle aynı kanıttır',()=> {
  const q=question()
  Object.assign(q,{ type:'true_false',q:'40 ve 56 sayılarının en büyük ortak böleni 8’dir.',opts:[],ans:0 })
  const review=q.objectiveBackfillReview as { content:string }
  review.content=objectiveReviewContent(q)
  assert.equal(hasAutomatedObjectiveApproval(q),true)
  assert.equal(hasAutomatedObjectiveApproval({ ...q,opts:['Doğru','Yanlış'] }),true)
  assert.equal(hasAutomatedObjectiveApproval({ ...q,opts:['Yanlış','Doğru'] }),false)
})
test('haritalama onayı zorluk doğrulaması eksikse pilot stokunu artırmaz',()=> {
  assert.equal(hasVerifiedBankQuality(question()),true)
  assert.equal(hasVerifiedBankQuality({ ...question(),difficulty:'zor' }),false)
  const q=question()
  const review=q.objectiveBackfillReview as { audits: Array<{ difficultyMatches:boolean }> }
  review.audits[0].difficultyMatches=false
  assert.equal(hasAutomatedObjectiveApproval(q),true)
  assert.equal(hasVerifiedBankQuality(q),false)
})
