import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseAudits, decideAudits, deterministicBlock, auditCatalogPayload } from '../scripts/historical-objective-review-policy.mjs'

const result = { index:0,objectiveCode:'MAT.6.1.4',score:90,reason:'40 ve 56 için ortak bölen 8 bulunur; ortak böleni yorumlama ölçülür.',answerCorrect:true,explanationConsistent:true,ageAppropriate:true,unambiguous:true,directObjectiveMatch:true,difficultyMatches:true,standalone:true }
const parse = (provider, extra = {}) => parseAudits(JSON.stringify({ results:[{ ...result,...extra }] }),1,provider,'test')[0]
const candidates = [{ id:'objective-id',objective_code:'MAT.6.1.4' }]
test('katalog bağlamları tekilleştirilir; hiçbir kazanım veya kapsam metni kaybolmaz',()=> {
  const original = [1,2,3].map(index=>({ objective_code:`MAT.6.1.${index}`,title:`Beceri ${index}`,subject:'Matematik',topic:'Sayılar',unit:'Ünite 1' }))
  const encoded = auditCatalogPayload(original)
  assert.equal(encoded.catalog.length,original.length)
  assert.equal(encoded.contexts.length,1)
  encoded.catalog.forEach(([code,title,contextIndex],index)=> {
    assert.equal(code,original[index].objective_code)
    assert.equal(title,original[index].title)
    assert.equal(encoded.contexts[contextIndex].topic,original[index].topic)
  })
})

test('iki bağımsız denetçi aynı gerçek kazanımı onaylamalı',()=> {
  assert.equal(decideAudits([parse('openai'),parse('mistral')],candidates).decision,'approved')
  assert.equal(decideAudits([parse('openai'),parse('mistral',{ objectiveCode:'MAT.6.1.3' })],candidates).decision,'rejected')
  assert.equal(decideAudits([parse('openai'),parse('mistral')],[]).decision,'rejected')
})
test('yanlış cevap veya kapsam dışı soru yüksek puanla bile onaylanmaz',()=> {
  for(const field of ['answerCorrect','explanationConsistent','ageAppropriate','unambiguous','directObjectiveMatch']) {
    assert.equal(decideAudits([parse('openai'),parse('mistral',{ [field]:false })],candidates).decision,'rejected')
  }
  assert.equal(decideAudits([parse('openai'),parse('mistral',{ score:79 })],candidates).decision,'rejected')
  assert.equal(decideAudits([parse('openai'),parse('mistral',{ reason:'Bu kazanımı doğrudan olmasa da dolaylı ölçer.' })],candidates).decision,'rejected')
})
test('eksik/tekrarlı veya türü bozuk model yanıtı karar sayılmaz',()=> {
  assert.throws(()=>parseAudits('{"results":[]}',1,'openai','test'))
  assert.throws(()=>parse('openai',{ answerCorrect:'true' }))
  assert.throws(()=>parse('openai',{ difficultyMatches:undefined }))
  assert.equal(parse('mistral',{ objectiveCode:null,directObjectiveMatch:false,difficultyMatches:undefined,standalone:undefined }).approved,false)
  assert.throws(()=>decideAudits([parse('openai'),parse('openai')],candidates))
})
test('eksik cevap ve yinelenen seçenekler deterministik olarak yakalanır',()=> {
  const question={ q:'12 ve 18 ortak bölenleri nedir?',opts:['1, 2, 3, 6','1, 2'],ans:0,exp:'Ortak bölenler 1, 2, 3 ve 6.' }
  assert.equal(deterministicBlock(question),null)
  assert.ok(deterministicBlock({ ...question,ans:5 }))
  assert.ok(deterministicBlock({ ...question,opts:['8','8'] }))
  assert.equal(deterministicBlock({ ...question,opts:['-8','8'] }),null)
  assert.equal(deterministicBlock({ ...question,opts:['1,2','12'] }),null)
  assert.ok(deterministicBlock({ ...question,hasVisual:true }))
  assert.equal(deterministicBlock({ ...question,sourceBased:true }),null)
  assert.equal(deterministicBlock({ ...question,passage:'Kaynakta örnek işlemler yer alıyordu.' }),null)
  assert.equal(deterministicBlock({ ...question,type:'true_false',opts:[],ans:0 }),null)
  assert.equal(deterministicBlock({ ...question,type:'true_false',opts:[],ans:true }),null)
  assert.ok(deterministicBlock({ ...question,type:'true_false',opts:[],ans:2 }))
})
