'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Health = { period_hours:number; ai:{calls:number;p95_duration_ms:number|null;cost_usd:number;missing_context:number}; learning:{completed_sessions:number;covered_sessions:number;event_count:number;coverage_rate:number|null}; alerts:{code:string;severity:string;message:string}[] }
export default function PipelineHealth() {
  const [data,setData]=useState<Health|null>(null)
  const [error,setError]=useState('')
  async function load(){ const {data:{session}}=await createClient().auth.getSession(); if(!session)return; const response=await fetch('/api/admin/pipeline-health',{headers:{Authorization:`Bearer ${session.access_token}`}}); if(response.ok)setData(await response.json()); else setError('Pipeline sağlığı alınamadı.') }
  useEffect(()=>{ void load() },[])
  return <div className="card" style={{marginBottom:'1rem'}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong style={{color:'var(--primary)'}}>🚦 Pipeline sağlığı</strong><button className="btn btn-sm" onClick={()=>void load()}>Yenile</button></div>{error&&<div style={{color:'var(--red)',fontSize:12,marginTop:8}}>{error}</div>}{data&&<><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:10,fontSize:12}}><div>AI çağrısı<br/><strong>{data.ai.calls}</strong></div><div>AI p95 gecikme<br/><strong>{data.ai.p95_duration_ms===null?'—':`${Math.round(data.ai.p95_duration_ms/1000)} sn`}</strong></div><div>24s maliyet<br/><strong>${data.ai.cost_usd.toFixed(4)}</strong></div><div>Learning Event kapsaması<br/><strong>{data.learning.coverage_rate===null?'—':`%${Math.round(data.learning.coverage_rate*100)}`}</strong></div></div>{data.alerts.length?<div style={{marginTop:10,padding:8,borderRadius:8,background:'var(--red-bg)',color:'var(--red)',fontSize:12}}>{data.alerts.map(a=><div key={a.code}>⚠️ {a.message}</div>)}</div>:<div style={{marginTop:10,color:'var(--green)',fontSize:12}}>✓ Son {data.period_hours} saatte eşik aşımı yok.</div>}</>}</div>
}
