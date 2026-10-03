import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createContinuousReview,finalizeContinuousReview,hasContinuousApproval,continuousReviewContent,CONTINUOUS_REVIEW_POLICY } from '../lib/continuous-question-review'
import { hasAutomatedObjectiveApproval,hasVerifiedBankQuality } from '../lib/objective-mapping-verification'
import { applyCanonicalObjectiveMappings,type CanonicalObjectiveCandidate } from '../lib/learning-objective-mapping'
import { balanceAnswerPositions,promoteQuestionsToBank } from '../lib/question-bank'

const objective: CanonicalObjectiveCandidate = { id:'id',title:'Ortak bölen problemleri',objectiveCode:'MAT.6.1.4',revisionId:'rev',curriculumVersionId:'v',grade:'6. sınıf',subject:'Matematik',ref:'LO1',topic:null,unit:null,matchBasis:'topic_exact' }
const accepted = { ok:true,score:92,reason:'Günlük hayattaki ortak bölen problemini doğru ölçüyor.',difficultyMatches:true,objectiveMatches:true,answerCorrect:true,explanationConsistent:true,ageAppropriate:true,unambiguous:true }
const audits = () => ['openai','mistral'].map(provider => ({ provider,model:'test',result:{ ...accepted } }))
test('insan onaylı yeniden kullanımda sonradan eklenen görsel veya bağlam tekrar inceleme gerektirir',() => {
  const q = { q:'Örnek soru',opts:['1','2'],ans:0,difficulty:'normal',objectiveMappingStatus:'human_approved',learningObjectiveId:'id',learningObjectiveRevisionId:'rev',curriculumVersionId:'v' }
  const reused = { ...q,objectiveReuseEvidence:{ content:continuousReviewContent(q),objectiveId:'id',revisionId:'rev',curriculumVersionId:'v' } }
  assert.equal(finalizeContinuousReview(reused).objectiveMappingStatus,'human_approved')
  assert.equal(finalizeContinuousReview({ ...reused,passage:'Yeni kaynak' }).objectiveMappingStatus,'review_required')
  assert.equal(finalizeContinuousReview({ ...reused,svg:'<svg />' }).objectiveMappingStatus,'review_required')
  assert.equal(finalizeContinuousReview({ ...reused,learningObjectiveRevisionId:'new' }).objectiveMappingStatus,'review_required')
})
function question(): Record<string,any> {
  const q = { q:'40 ve 56 kg meyve eşit kasalara konulacak. En büyük kasa kaç kg?',type:'multiple_choice',opts:['4','8','10','12'],ans:1,exp:'En büyük ortak bölen 8 kg.',difficulty:'normal',learningObjectiveRef:'LO1' } as Record<string,any>
  q.objectiveProductionReview = createContinuousReview(q,objective,audits())
  return finalizeContinuousReview(applyCanonicalObjectiveMappings([q],[objective]).questions[0])
}
test('iki tam bağımsız olumlu denetim AI onayını ve kaliteli stok kanıtını oluşturur',() => {
  const q=question()
  assert.equal(q.objectiveMappingStatus,'ai_approved')
  assert.equal(q.qualityVerificationVersion,CONTINUOUS_REVIEW_POLICY)
  assert.equal(hasAutomatedObjectiveApproval(q),true)
  assert.equal(hasVerifiedBankQuality(q),true)
})
test('tek sağlayıcı, eksik alan veya puan eşiği altı otomatik onay vermez',() => {
  const q=question()
  for (const checks of [audits().slice(0,1),audits().map(a=>({ ...a,provider:'openai' })),audits().map(a=>({ ...a,result:{ ...a.result,score:79 } })),audits().map(a=>({ ...a,result:{ ...a.result,unambiguous:undefined } }))]) {
    const changed = { ...q,objectiveProductionReview:createContinuousReview(q,objective,checks) }
    assert.equal(finalizeContinuousReview(changed).objectiveMappingStatus,'review_required')
  }
})
test('doğru seçeneği koruyan sıralama değişikliği yeniden onay istemez',() => {
  const q=question(), reordered={ ...q,opts:['8','12','4','10'],ans:0 }
  assert.equal(hasContinuousApproval(reordered),true)
  assert.equal(hasContinuousApproval({ ...reordered,ans:1 }),false)
})
test('metin, açıklama, zorluk, bağlam veya kazanım sürümü değişirse onay geçersizdir',() => {
  const q=question()
  for (const change of [{ q:'Farklı soru' },{ exp:'Yanlış açıklama' },{ difficulty:'zor' },{ passage:'Yeni kaynak' },{ learningObjectiveRevisionId:'rev2' },{ learningObjectiveCode:'MAT.6.1.5' }]) {
    assert.equal(hasContinuousApproval({ ...q,...change }),false)
    assert.equal(finalizeContinuousReview({ ...q,...change }).objectiveMappingStatus,'review_required')
  }
})
test('görseller, eksik kazanım ve denetçi kesintisi öğretmen kuyruğuna gider',() => {
  const q=question()
  assert.equal(finalizeContinuousReview({ ...q,svg:'<svg></svg>' }).objectiveReviewException,'visual_review_required')
  assert.equal(createContinuousReview(q,null,audits()).decision,'teacher_review')
  assert.equal(createContinuousReview(q,objective,[audits()[0],{ provider:'mistral',model:'test',result:null }]).reason,'review_unavailable')
})
test('kanonik yeniden eşleştirme değişmeyen AI ve insan onayını korur',() => {
  const q=question()
  assert.equal(applyCanonicalObjectiveMappings([q],[objective]).questions[0].objectiveMappingStatus,'ai_approved')
  assert.equal(applyCanonicalObjectiveMappings([{ ...q,objectiveMappingStatus:'human_approved' }],[objective]).questions[0].objectiveMappingStatus,'human_approved')
  assert.equal(applyCanonicalObjectiveMappings([q],[{ ...objective,revisionId:'rev2' }]).questions[0].objectiveMappingStatus,'mapped')
  assert.deepEqual(balanceAnswerPositions([q])[0].opts,q.opts)
})
test('AI onaylı soru doğrudan kullanılabilir; istisna gölge terfisiyle onaylanamaz',async () => {
  let written: any[]=[]
  const db={ from:()=>({ upsert:async (rows: any[],options:any)=>{ written=rows;assert.equal(options.ignoreDuplicates,true);return { error:null } } }) }
  const dimensions={ subject:'Matematik',topic:'Ortak bölen',grade:'6. sınıf',language:'Türkçe',questionType:'mixed',difficulty:'normal' }
  await promoteQuestionsToBank(db,dimensions,[question()],{ engine:'gpt-4.1-mini' })
  assert.equal(written[0].review_status,'approved')
  assert.equal(written[0].question_type,'multiple_choice')
  await promoteQuestionsToBank(db,dimensions,[{ ...question(),objectiveMappingStatus:'review_required' }],{ teacherExceptions:true })
  assert.equal(written[0].review_status,'candidate')
  assert.equal(written[0].awaiting_expert_review,true)
})
