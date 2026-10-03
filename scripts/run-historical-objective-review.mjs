import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, appendFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { POLICY, norm } from './historical-objective-review-policy.mjs'

const directory=resolve('.backfill/historical-objectives-20261003')
await mkdir(directory,{ recursive:true })
const credentialPath=resolve(directory,'worker.json')
if(process.argv.includes('--init')) {
  let credential
  try { credential=JSON.parse(await readFile(credentialPath,'utf8')) }
  catch(error) { if(error.code!=='ENOENT') throw error; credential={ runId:randomUUID(),token:randomBytes(32).toString('hex') }; await writeFile(credentialPath,JSON.stringify(credential),{ mode:0o600 }) }
  console.log(JSON.stringify({ runId:credential.runId,tokenHash:createHash('sha256').update(credential.token).digest('hex') })); process.exit(0)
}
const credential=JSON.parse(await readFile(credentialPath,'utf8'))
const endpoint='https://pratium.com/api/admin/objective-mapping-review/backfill'
const headers={ Authorization:`Bearer ${credential.token}`,'Content-Type':'application/json' }
const request=async (body, query='') => {
  const response=await fetch(endpoint+query,{ headers,...(body?{ method:'POST',body:JSON.stringify(body) }:{}),signal:AbortSignal.timeout(130000) })
  const data=await response.json().catch(()=>({ error:`HTTP ${response.status}` }))
  if(!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
  return data
}
let manifest
try { manifest=JSON.parse(await readFile(resolve(directory,'manifest.json'),'utf8')) }
catch(error) {
  if(error.code!=='ENOENT') throw error
  manifest=await request()
  if(!manifest.paginated) throw new Error('Waiting for paginated production deployment')
  manifest.items=[]
  for(const source of ['bank','sessions']) {
    let offset=0
    for(;;) {
      const page=await request(null,`?source=${source}&offset=${offset}`)
      manifest.items.push(...page.items)
      if(!page.hasMore) break
      offset=page.nextOffset
    }
  }
  await writeFile(resolve(directory,'manifest.json'),JSON.stringify(manifest),{ mode:0o600 })
}
if(manifest.runId!==credential.runId||manifest.policy!==POLICY) throw new Error('Snapshot run mismatch')
const fields=['q','opts','ans','exp','explanation','type','blank','referenceAnswer','pairs','items','correctOrder','statements','tableData','tableAnswers','difficulty','svg','chartData','hasVisual','sourceBased','passage']
const unique=new Map()
for(const item of manifest.items) {
  const question=Object.fromEntries(fields.filter(key=>item.question[key]!==undefined).map(key=>[key,item.question[key]]))
  if(!question.difficulty&&item.difficulty) question.difficulty=item.difficulty
  const dimension=`${String(item.grade).match(/\d+/)?.[0] || ''}|${norm(item.subject)}`
  const signature=createHash('sha256').update(JSON.stringify({ dimension,question })).digest('hex')
  const entry=unique.get(signature)||{ signature,dimension,items:[] }
  entry.items.push(item); unique.set(signature,entry)
}
const done=new Set()
try { for(const line of (await readFile(resolve(directory,'remote-results.jsonl'),'utf8')).split('\n').filter(Boolean)) {
  const result=JSON.parse(line)
  for(const applied of result.applied || []) if(['applied','already_applied','already_reviewed'].includes(applied.status)) done.add(applied.key)
} } catch(error) { if(error.code!=='ENOENT') throw error }
try { for(const key of JSON.parse(await readFile(resolve(directory,'superseded.json'),'utf8'))) done.delete(key) }
catch(error) { if(error.code!=='ENOENT') throw error }
const limit=Number(process.argv.find(arg=>arg.startsWith('--limit='))?.split('=')[1] || Infinity)
const groups=new Map()
let targets=[...unique.values()].slice(0,limit)
if(process.argv.includes('--sample')) {
  const chosen=new Map()
  for(const predicate of [
    entry=>entry.items[0].source==='bank'&&/matematik/i.test(entry.items[0].subject),
    entry=>entry.items[0].source==='bank'&&!/matematik/i.test(entry.items[0].subject),
    entry=>entry.items[0].source==='sessions'&&Boolean(entry.items[0].subject),
    entry=>entry.items[0].source==='sessions'&&!entry.items[0].subject,
  ]) for(const entry of [...unique.values()].filter(predicate).slice(0,4)) chosen.set(entry.signature,entry)
  targets=[...chosen.values()]
}
for(const entry of targets) {
  entry.items=entry.items.filter(item=>!done.has(`${item.source}:${item.recordId}:${item.index}`))
  if(!entry.items.length) continue
  for(let offset=0;offset<entry.items.length;offset+=100) groups.set(entry.dimension,[...(groups.get(entry.dimension)||[]),{ ...entry,items:entry.items.slice(offset,offset+100) }])
}
const batches=[]
for(const group of groups.values()) {
  let current=[],count=0
  for(const entry of group) {
    if(current.length===8||count+entry.items.length>180) { batches.push(current); current=[]; count=0 }
    current.push(entry); count+=entry.items.length
  }
  if(current.length) batches.push(current)
}
const stats={ snapshot:manifest.items.length,unique:unique.size,alreadyDone:done.size,applied:0,approved:0,rejected:0,events:0,addedToBank:0,conflicts:0,failed:0 }
console.log(JSON.stringify({ runId:credential.runId,batches:batches.length,...stats }))
let cursor=0
const concurrency=Math.max(1,Math.min(6,Number(process.argv.find(arg=>arg.startsWith('--workers='))?.split('=')[1] || 4)))
async function worker() {
  while(cursor<batches.length) {
    const index=cursor++,entries=batches[index]
    try {
      let result,lastError
      for(let attempt=0;attempt<3;attempt++) {
        try { result=await request({ entries }); break }
        catch(error) { lastError=error; if(attempt<2) await new Promise(resolve=>setTimeout(resolve,3000*2**attempt)) }
      }
      if(!result) throw lastError
      for(const entry of result.results) {
        await appendFile(resolve(directory,'remote-results.jsonl'),JSON.stringify(entry)+'\n')
        for(const applied of entry.applied) {
          if(applied.status==='applied') { stats.applied++; stats[entry.decision]++; stats.events+=applied.updatedEvents || 0; stats.addedToBank+=applied.addedToBank?1:0 }
          else if(applied.status==='error') { stats.failed++; console.warn(`Save failed: ${applied.error}`) }
          else if(applied.status==='conflict') stats.conflicts++
        }
      }
      stats.conflicts+=result.skipped.length
    } catch(error) {
      stats.failed+=entries.reduce((sum,entry)=>sum+entry.items.length,0)
      await appendFile(resolve(directory,'remote-errors.jsonl'),JSON.stringify({ index,error:error.message,signatures:entries.map(entry=>entry.signature) })+'\n')
      console.warn(`Batch ${index+1}: ${error.message}`)
    }
    console.log(JSON.stringify({ batch:index+1,batches:batches.length,...stats }))
  }
}
await Promise.all(Array.from({ length:concurrency },worker))
await writeFile(resolve(directory,'remote-summary.json'),JSON.stringify({ runId:credential.runId,finishedAt:new Date().toISOString(),...stats },null,2))
console.log(JSON.stringify({ complete:true,...stats }))
if(stats.failed) process.exitCode=1
