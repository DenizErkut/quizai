import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import ts from 'typescript'
const require=createRequire(import.meta.url)
const objective='44444444-4444-4444-8444-444444444444',id='55555555-5555-4555-8555-555555555555',cycleId='66666666-6666-4666-8666-666666666666'
const policy=require('../.backfill/unit-tests/lib/teacher-action-workbench.js')
const metrics=require('../.backfill/unit-tests/lib/verified-learning-metrics.js').verifiedLearningMetrics([],[])
function fixture({status='pending',member=true,approved=true}={}) {
  const writes=[]
  const rows={teachers:[{id:'teacher',user_id:'user',approved}],classrooms:[{id:'class',teacher_id:'teacher'}],classroom_students:member?[{classroom_id:'class',student_id:'student'}]:[],
    agent_action_approval_queue:[{id,teacher_id:'teacher',classroom_id:'class',student_id:'student',proposed_action:'assign_practice',status,reviewed_at:'2026-10-23T10:00:00Z',evidence:{objectiveId:objective}}],
    verified_learning_cycles:[{id:cycleId,teacher_id:'teacher',student_id:'student',classroom_id:'class',learning_objective_id:objective,created_at:'2026-10-23T11:00:00Z'}],agent_decision_audit:[]}
  const db={auth:{getUser:async()=>({data:{user:{id:'user'}}})},from(table){
    let filtered=[...(rows[table]||[])],single=false,payload=null,operation='read'
    const field=(r,k)=>k.includes('->>')?r[k.split('->>')[0]]?.[k.split('->>')[1]]:r[k]
    const q={select(){return q},eq(k,v){filtered=filtered.filter(r=>field(r,k)===v);return q},in(k,vs){filtered=filtered.filter(r=>vs.includes(field(r,k)));return q},
      order(){return q},limit(n){filtered=filtered.slice(0,n);return q},maybeSingle(){single=true;return q},
      update(p){operation='update';payload=p;return q},insert(p){operation='insert';payload=p;return q},
      then(resolve){if(operation==='insert'){rows[table].push(payload);writes.push({table,payload})}if(operation==='update')for(const r of filtered){Object.assign(r,payload);writes.push({table,payload})}
        return resolve({data:single?filtered[0]||null:filtered,error:null})}}
    return q
  }}
  const fakeRequire=name=>{
    if(name==='next/server')return {NextResponse:{json:(data,init)=>Response.json(data,init)}}
    if(name==='@/lib/supabase/server-create-client')return {createClient:()=>db}
    if(name==='@/lib/intervention-review')return {authorizedReviewTeacher:async()=>member?'teacher':null}
    if(name==='@/lib/load-verified-learning-metrics')return {loadCyclesMetrics:async(_db,cycles)=>cycles.map(()=>metrics)}
    if(name==='@/lib/teacher-action-workbench')return policy
    throw Error(`Unexpected import ${name}`)
  }
  const code=ts.transpileModule(readFileSync(new URL('../app/api/teacher/agent-approvals/route.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText
  const evaluated={exports:{}};new Function('require','module','exports',code)(fakeRequire,evaluated,evaluated.exports)
  const req=(body,token=true,statusQuery='pending')=>({headers:new Headers(token?{Authorization:'Bearer test'}:{}),json:async()=>body,nextUrl:new URL(`https://example.invalid/api?status=${statusQuery}`)})
  return {api:evaluated.exports,req,rows,writes}
}
test('actual handlers reject anonymous and unapproved callers without writes',async()=>{
  for(const options of [{},{approved:false}]){const f=fixture(options)
    for(const method of ['GET','PATCH','POST'])assert.equal((await f.api[method](f.req({},options.approved===false))).status,403)
    assert.equal(f.writes.length,0)
  }
})
test('stale membership hides records and forbids decisions and links',async()=>{
  const f=fixture({member:false,status:'approved'})
  assert.deepEqual((await (await f.api.GET(f.req(null,true,'all'))).json()).items,[])
  assert.equal((await f.api.PATCH(f.req({id,status:'approved',note:'Öğretmen incelemesi tamam.'}))).status,403)
  assert.equal((await f.api.POST(f.req({id,cycleId}))).status,403)
  assert.equal(f.writes.length,0)
})
test('conditional decision writes only queue review fields, not execution',async()=>{
  const f=fixture()
  assert.equal((await f.api.PATCH(f.req({id,status:'approved',note:'kısa'}))).status,400)
  const response=await f.api.PATCH(f.req({id,status:'approved',note:'Öğretmen incelemesi tamam.'}))
  assert.equal(response.status,200);assert.equal((await response.json()).executionStatus,'not_executed')
  assert.deepEqual(f.writes.map(w=>w.table),['agent_action_approval_queue'])
  assert.equal((await f.api.PATCH(f.req({id,status:'rejected',note:'Tekrar karar verilemez.'}))).status,409)
})
test('links validate exact scope; retries are idempotent and approved-only is not execution',async()=>{
  const f=fixture({status:'approved'})
  let read=await (await f.api.GET(f.req(null,true,'approved'))).json()
  assert.equal(read.items[0].followup,null)
  f.rows.verified_learning_cycles[0].student_id='foreign'
  assert.equal((await f.api.POST(f.req({id,cycleId}))).status,422)
  f.rows.verified_learning_cycles[0].student_id='student'
  assert.equal((await f.api.POST(f.req({id,cycleId}))).status,200)
  assert.equal((await f.api.POST(f.req({id,cycleId}))).status,200)
  assert.deepEqual(f.writes.map(w=>w.table),['agent_decision_audit'])
  read=await (await f.api.GET(f.req(null,true,'approved'))).json()
  assert.equal(read.items[0].followup.status,'assigned')
  assert.equal(read.items[0].followup.metrics.verifiedMastery,null)
})
