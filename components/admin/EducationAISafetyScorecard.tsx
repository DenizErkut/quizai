'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Scorecard = { periodDays:number; overall:number; status:'strong'|'watch'|'action_required'; generatedAt:string; dimensions:{key:string;label:string;score:number;evidence:string[]}[]; alerts:{severity:string;message:string}[] }

export default function EducationAISafetyScorecard(){
  const [data,setData]=useState<Scorecard|null>(null)
  const [error,setError]=useState('')
  useEffect(()=>{void(async()=>{const {data:{session}}=await createClient().auth.getSession();if(!session)return;const response=await fetch('/api/admin/ai-safety-scorecard',{headers:{Authorization:`Bearer ${session.access_token}`}});if(response.ok)setData(await response.json());else setError('AI Safety Scorecard alınamadı.')})()},[])
  if(error)return <div className="card" style={{color:'var(--red)',marginBottom:16}}>{error}</div>
  if(!data)return <div className="card" style={{marginBottom:16}}>Safety Scorecard hazırlanıyor…</div>
  const color=data.overall>=85?'var(--green)':data.overall>=70?'var(--amber)':'var(--red)'
  return <section className="card" style={{marginBottom:16}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',marginBottom:16}}><div><div className="badge badge-purple" style={{marginBottom:6}}>Education AI Safety Scorecard</div><h2 className="serif" style={{fontSize:22}}>Eğitim yapay zekâsı güvenlik görünümü</h2><div style={{fontSize:12,color:'var(--text3)'}}>Son {data.periodDays} günün canlı operasyon kanıtları</div></div><div style={{fontSize:38,fontWeight:800,color}}>{data.overall}<span style={{fontSize:14}}>/100</span></div></div>
    {data.alerts.length>0&&<div style={{padding:10,borderRadius:10,background:'var(--red-bg)',color:'var(--red)',marginBottom:12,fontSize:12}}>{data.alerts.map(a=><div key={a.message}>⚠️ {a.message}</div>)}</div>}
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(210px,1fr))',gap:10}}>{data.dimensions.map(d=><article key={d.key} style={{border:'1px solid var(--border)',borderRadius:12,padding:12}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong style={{fontSize:13}}>{d.label}</strong><strong style={{color:d.score>=85?'var(--green)':d.score>=70?'var(--amber)':'var(--red)'}}>{d.score}</strong></div><div style={{height:6,background:'var(--bg2)',borderRadius:99,margin:'9px 0',overflow:'hidden'}}><div style={{height:'100%',width:`${d.score}%`,background:d.score>=85?'var(--green)':d.score>=70?'var(--amber)':'var(--red)'}}/></div>{d.evidence.map(item=><div key={item} style={{fontSize:11,color:'var(--text3)',marginTop:4}}>• {item}</div>)}</article>)}</div>
    <div style={{fontSize:10,color:'var(--text3)',marginTop:12}}>Bu skor bir sertifika değildir; denetim, insan onayı, güvenlik müdahalesi ve öğrenme bütünlüğü kanıtlarının operasyon göstergesidir.</div>
  </section>
}
