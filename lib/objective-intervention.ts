import { createHash } from 'node:crypto'
import { questionBankKey } from './question-bank'
import { sameLearningScope } from './learning-evidence-scope'
import { hasVerifiedObjectiveMapping } from './objective-mapping-verification'
import { misconceptionId } from './misconceptions'

export const OBJECTIVE_INTERVENTION_POLICY = 'objective-intervention-v1'
export type ObjectiveScope = {id:string;subject:string;topic:string;grade:string}
export type ErrorObservation = {eventId:string;objectiveId:string;questionKey:string;sessionId:string;misconceptionId:string;correct:boolean;occurredAt:string}
export type ReviewedMisconception = {id:string;subject:string;topic:string;label:string;verification_status:string}
export type InterventionPlan = {
  policyVersion:typeof OBJECTIVE_INTERVENTION_POLICY; objectiveId:string;
  mode:'diagnostic_reflection'|'contrastive_practice'|'guided_application';
  label:string;reason:string;teacherReviewRecommended:boolean;
  signal:{id:string;label:string;status:'repeated_signal';questionCount:number;sessionCount:number}|null;
  evidenceIds:string[]; selectedAt:string;
}

/** Reconstruct evidence from stored choices, not caller-authored correctness or projection labels. */
export function observationsFromQuestion(input:{
  objective:ObjectiveScope;eventId:string;sessionId:string;occurredAt:string;
  question:Record<string,unknown>;answer:Record<string,unknown>;grade:string;topic:string;
}):ErrorObservation[] {
  const {question:q,answer:a,objective:o}=input
  if(q.learningObjectiveId!==o.id || q.objectiveVerified!==true || !hasVerifiedObjectiveMapping(q)
    || !sameLearningScope({grade:input.grade,subject:q.subject},o)
    || questionBankKey(input.topic)!==questionBankKey(o.topic)
    || q.coachedPractice===true || a.hintUsed===true) return []
  if(!Array.isArray(q.opts)||!Array.isArray(q.distractorMisconceptions)
    || q.opts.length!==q.distractorMisconceptions.length || !Number.isInteger(q.ans)
    || Number(q.ans)<0 || Number(q.ans)>=q.opts.length || q.distractorMisconceptions[Number(q.ans)]!==null
    || !Number.isInteger(a.userAns)||Number(a.userAns)<0||Number(a.userAns)>=q.opts.length
    || typeof q.q!=='string'||!q.q.trim())return []
  const correct=a.userAns===q.ans
  const labels=correct?q.distractorMisconceptions:[q.distractorMisconceptions[Number(a.userAns)]]
  const questionKey=createHash('sha256').update(questionBankKey(q.q)).digest('hex')
  return [...new Set(labels.filter((label):label is string=>typeof label==='string'&&label.trim().length>=5))]
    .map(label=>({eventId:input.eventId,objectiveId:o.id,questionKey,sessionId:input.sessionId,
      misconceptionId:misconceptionId(String(q.subject),input.topic,label),correct,occurredAt:input.occurredAt}))
}

/** Product rule for intervention selection; repeated signal never becomes a psychological diagnosis. */
export function selectObjectiveIntervention(input:{
  objective:ObjectiveScope;observations:ErrorObservation[];catalog:ReviewedMisconception[];
  baselineScore:number|null;now?:number;
}):InterventionPlan {
  const now=input.now??Date.now(), cutoff=now-30*86400000
  const base={policyVersion:OBJECTIVE_INTERVENTION_POLICY,objectiveId:input.objective.id,selectedAt:new Date(now).toISOString()} as const
  const diagnostic=(reason:string,teacherReviewRecommended=false):InterventionPlan=>({...base,
    mode:'diagnostic_reflection',label:'Gerekçeni açıklayarak çalış',reason,teacherReviewRecommended,signal:null,evidenceIds:[]})
  const observations=input.observations.filter(e=>e.objectiveId===input.objective.id&&e.questionKey&&e.sessionId
    &&Number.isFinite(Date.parse(e.occurredAt))&&Date.parse(e.occurredAt)>=cutoff&&Date.parse(e.occurredAt)<=now)
  const ids=[...new Set(observations.filter(e=>!e.correct).map(e=>e.misconceptionId))]
  const signals=ids.flatMap(id=>{
    const catalog=input.catalog.find(c=>c.id===id&&c.verification_status==='verified'
      &&questionBankKey(c.subject)===questionBankKey(input.objective.subject)
      &&questionBankKey(c.topic)===questionBankKey(input.objective.topic))
    const errors=observations.filter(e=>e.misconceptionId===id&&!e.correct)
    const questions=new Set(errors.map(e=>e.questionKey)),sessions=new Set(errors.map(e=>e.sessionId))
    if(!catalog||questions.size<2||sessions.size<2)return []
    const lastError=Math.max(...errors.map(e=>Date.parse(e.occurredAt)))
    const counter=observations.some(e=>e.misconceptionId===id&&e.correct&&Date.parse(e.occurredAt)>=lastError)
    return [{catalog,errors,questionCount:questions.size,sessionCount:sessions.size,counter}]
  })
  if(signals.length>1||signals.some(s=>s.counter))
    return diagnostic('Birden fazla hata sinyali veya daha yeni doğru karşı kanıt var. Önce gerekçeni inceleyerek hangi düşüncenin değiştiğini kontrol edeceğiz.',true)
  const signal=signals[0]
  if(signal)return {...base,mode:'contrastive_practice',label:'İki düşünceyi karşılaştırarak çalış',
    reason:'Aynı kazanımda en az iki farklı soru ve iki oturumda tekrarlanan, katalogda incelenmiş bir hata sinyali var. Bu kesin teşhis değildir; doğru ve yanlış düşünceyi karşılaştıran çalışma seçildi.',
    teacherReviewRecommended:false,
    signal:{id:signal.catalog.id,label:signal.catalog.label,status:'repeated_signal',questionCount:signal.questionCount,sessionCount:signal.sessionCount},
    evidenceIds:[...new Set(signal.errors.map(e=>e.eventId))]}
  if(!observations.some(e=>!e.correct)&&input.baselineScore!==null&&Number.isFinite(input.baselineScore)&&input.baselineScore>=80&&input.baselineScore<=100)
    return {...base,mode:'guided_application',label:'Bilgini farklı soruda uygula',
      reason:'Ön testte ürün eşiği karşılandı; tekrarlanan doğrulanabilir hata sinyali yok. Ölçümden ayrı bir soruda gerekçeli uygulama yapacağız. Bu, öğrenme doğrulaması değildir.',
      teacherReviewRecommended:false,signal:null,evidenceIds:[]}
  return diagnostic('Hata nedenini kesinleştirecek bağımsız kanıt henüz yok. Yanıtını, düşünme adımlarını ve yeniden denemeni kaydederek çalışacağız.')
}

export function interventionHint(plan:InterventionPlan|null):string {
  if(plan?.mode==='contrastive_practice')return 'Aynı sonuca götürdüğünü düşündüğün iki farklı düşünceyi karşılaştır. Her biri verilen bilgilerle tutarlı mı? Bir karşı örnek düşünüp seçenekleri yeniden değerlendir; gerekçeni kendi cümlelerinle kur.'
  if(plan?.mode==='guided_application')return 'Bildiğin kuralın bu yeni durumda hangi koşullarda geçerli olduğunu belirle. Verilenleri kuralla ilişkilendir ve sonucu kendi gerekçenle kontrol et.'
  return 'Önce sorunun tam olarak ne istediğini belirle. Verilen bilgileri tek tek işaretle; seçenekleri bu bilgilerle karşılaştır. Sonucu tahmin etmek yerine kendi gerekçeni kur.'
}

/** Only an option explicitly carrying the reviewed label can implement the contrastive plan. */
export function contrastiveCandidate(question:Record<string,unknown>,plan:InterventionPlan):boolean {
  return Boolean(plan.signal&&Array.isArray(question.distractorMisconceptions)
    &&question.distractorMisconceptions.some((label,index)=>index!==question.ans&&questionBankKey(label)===questionBankKey(plan.signal!.label)))
}

export function storedInterventionPlan(question:Record<string,unknown>):InterventionPlan|null {
  const raw=question.objectiveIntervention as InterventionPlan|undefined
  return raw?.policyVersion===OBJECTIVE_INTERVENTION_POLICY&&raw.objectiveId===question.learningObjectiveId
    &&['diagnostic_reflection','contrastive_practice','guided_application'].includes(raw.mode)
    &&typeof raw.label==='string'&&typeof raw.reason==='string'&&Array.isArray(raw.evidenceIds)
    &&typeof raw.teacherReviewRecommended==='boolean'&&typeof raw.selectedAt==='string'?raw:null
}

export function publicInterventionPlan(plan:InterventionPlan|null) {
  if(!plan)return null
  return {policyVersion:plan.policyVersion,mode:plan.mode,label:plan.label,reason:plan.reason,
    teacherReviewRecommended:plan.teacherReviewRecommended}
}
