'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LIVE_DATA_REFRESH_EVENT } from '@/components/LiveDataRefresh'
import type { LearningStep } from '@/lib/mastery-next-step'

type Recommendation = {id:string;status:string;subject:string;topic:string;reason?:string}
type Action = {subject:string;topic:string;reason:string;source:'mastery'|'recommendation';href?:string;actionable?:boolean;label?:string;dueAt?:string|null;recommendationId?:string;recommendationStatus?:string}

export default function NextBestAction() {
  const router = useRouter()
  const [action,setAction] = useState<Action|null>(null)
  const [busy,setBusy] = useState(false)
  const [refreshKey,setRefreshKey] = useState(0)
  useEffect(()=>{
    const refresh=()=>setRefreshKey(value=>value+1)
    window.addEventListener(LIVE_DATA_REFRESH_EVENT,refresh)
    return()=>window.removeEventListener(LIVE_DATA_REFRESH_EVENT,refresh)
  },[])
  useEffect(()=>{
    let cancelled=false
    void (async()=>{
      try {
        const {data:{session}}=await createClient().auth.getSession()
        if(!session)return
        const response=await fetch('/api/recommendations',{cache:'no-store',headers:{Authorization:`Bearer ${session.access_token}`}})
        if(!response.ok)throw new Error('Öneriler alınamadı')
        const data=await response.json() as {learningSteps?:LearningStep[];learningEvidenceStatus?:string;recommendations?:Recommendation[]}
        const step=data.learningSteps?.[0]
        const recommendation=data.recommendations?.find(item=>item.status==='accepted'||item.status==='active')
        const selected:Action|null=step?{
          subject:step.subject,topic:`${step.objectiveCode} · ${step.topic}`,reason:step.reason,
          source:'mastery',href:step.href,actionable:step.actionable,label:step.label,dueAt:step.dueAt,
        }:data.learningEvidenceStatus!=='loaded'?{
          subject:'',topic:'Öğrenme kanıtları şu an alınamadı',
          reason:'Kayıtlar kontrol edilemediği için öğrenme doğrulaması veya sonraki kazanıma geçiş kararı üretmedik.',
          source:'mastery',actionable:false,label:'Kanıt kontrolü bekleniyor',
        }:recommendation?{
          subject:recommendation.subject,topic:recommendation.topic,
          reason:`${recommendation.reason||'Çalışma planındaki uygun adım.'} Bu öneri doğrulanmış öğrenme sonucu değildir; atanmış ölçüm döngüsü bulunmadığında genel çalışma önerisi olarak sunulur.`,
          source:'recommendation',recommendationId:recommendation.id,recommendationStatus:recommendation.status,
        }:null
        if(!cancelled)setAction(selected)
      } catch {
        if(!cancelled)setAction({subject:'',topic:'Öğrenme adımı şu an alınamadı',reason:'Öğrenme kanıtları kontrol edilmeden yeni adım seçilmedi. Sayfayı yenileyerek tekrar deneyebilirsin.',source:'mastery',actionable:false,label:'Kayıt kontrolü bekleniyor'})
      }
    })()
    return()=>{cancelled=true}
  },[refreshKey])
  if(!action)return null
  const href=action.href||`/quiz?subject=${encodeURIComponent(action.subject)}&topic=${encodeURIComponent(action.topic)}`
  async function start() {
    if(!action||action.actionable===false)return
    if(action.source==='mastery'||action.recommendationStatus==='accepted'){
      router.push(`${href}${action.recommendationId?`&recommendationId=${action.recommendationId}`:''}`)
      return
    }
    setBusy(true)
    try {
      const {data:{session}}=await createClient().auth.getSession()
      if(!session)return
      const response=await fetch('/api/recommendations',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({recommendationId:action.recommendationId,action:'accept'})})
      if(response.ok)router.push(`${href}&recommendationId=${action.recommendationId}`)
    } finally {setBusy(false)}
  }
  return <section style={{marginBottom:'1rem',padding:18,borderRadius:18,background:'linear-gradient(135deg,#29483d,#38705d)',color:'#fff'}}>
    <div style={{fontSize:11,fontWeight:800,color:'#bdf5df'}}>Şimdi ne çalışmalıyım?</div>
    <div style={{fontSize:19,fontWeight:850,marginTop:5}}>{action.topic}</div>
    <div style={{fontSize:12,marginTop:5,lineHeight:1.55}}><strong>Neden:</strong> {action.reason}</div>
    {action.dueAt&&<div style={{fontSize:12,marginTop:8}}>En erken ölçüm: {new Date(action.dueAt).toLocaleString('tr-TR')}</div>}
    <div style={{display:'flex',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center',gap:10,marginTop:13}}>
      <span style={{fontSize:11}}>{action.source==='mastery'?'Kazanım kanıt zincirine göre':'Genel çalışma önerisi'}</span>
      <button disabled={busy||action.actionable===false} onClick={()=>void start()} style={{padding:'9px 13px',border:0,borderRadius:10,background:'#fdd31d',color:'#29483d',fontSize:11,fontWeight:850,opacity:action.actionable===false?.65:1}}>
        {busy?'Açılıyor…':action.label||'Çalışmaya başla →'}
      </button>
    </div>
  </section>
}
