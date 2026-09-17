'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Analytics = { period_days:number; adoption:{eligible_students:number;total_openers:number;new_openers_30d:number;adoption_rate:number|null}; engagement:{active_users_30d:number;total_user_messages_30d:number;avg_messages_per_active_user:number|null}; actions:{suggested_30d:number;clicked_30d:number;click_through_rate:number|null}; proactive:{nudges_sent_30d:number} }
export default function CoachAnalytics() {
  const [data,setData]=useState<Analytics|null>(null)
  const [error,setError]=useState('')
  async function load(){ const {data:{session}}=await createClient().auth.getSession(); if(!session)return; const response=await fetch('/api/admin/coach-analytics',{headers:{Authorization:`Bearer ${session.access_token}`}}); if(response.ok)setData(await response.json()); else setError('Koç analitikleri alınamadı.') }
  useEffect(()=>{ void load() },[])
  return <div className="card" style={{marginBottom:'1rem'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
      <strong style={{color:'var(--primary)'}}>✦ Pratium Koç kullanımı</strong>
      <button className="btn btn-sm" onClick={()=>void load()}>Yenile</button>
    </div>
    {error && <div style={{color:'var(--red)',fontSize:12,marginTop:8}}>{error}</div>}
    {data && <>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:8,marginTop:10,fontSize:12}}>
        <div>Koçu hiç deneyen<br/><strong>{data.adoption.total_openers}</strong> / {data.adoption.eligible_students} öğrenci</div>
        <div>Benimseme oranı<br/><strong>{data.adoption.adoption_rate===null?'—':`%${Math.round(data.adoption.adoption_rate*100)}`}</strong></div>
        <div>Son 30 günde ilk kez açan<br/><strong>{data.adoption.new_openers_30d}</strong></div>
        <div>30 günlük aktif kullanıcı<br/><strong>{data.engagement.active_users_30d}</strong></div>
        <div>30 günlük öğrenci mesajı<br/><strong>{data.engagement.total_user_messages_30d}</strong></div>
        <div>Aktif kullanıcı başına mesaj<br/><strong>{data.engagement.avg_messages_per_active_user===null?'—':data.engagement.avg_messages_per_active_user.toFixed(1)}</strong></div>
      </div>
      <div style={{fontSize:12,marginTop:10}}>
        <strong>Eylem butonu (suggest_practice)</strong>
        <div style={{marginTop:5}}>Önerilen: {data.actions.suggested_30d} · Tıklanan: {data.actions.clicked_30d} · Click-through: {data.actions.click_through_rate===null?'—':`%${Math.round(data.actions.click_through_rate*100)}`}</div>
      </div>
      <div style={{fontSize:12,marginTop:10,color:'var(--text3)'}}>Proaktif nudge (son 30 gün): {data.proactive.nudges_sent_30d}</div>
    </>}
  </div>
}
