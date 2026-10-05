'use client'
import { useCallback,useEffect,useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MathText from '@/components/MathText'

type Item={practiceId:string;cycleId:string;fingerprint:string;status:string;practiceStatus:string;
  question:string;options:string[];firstChoice:number|null;retryChoice:number|null;studentExplanation:string|null;
  intervention:{label:string;reason:string}|null;review:{decision:string;note:string;reviewedAt:string}|null}
export default function InterventionReviewQueue({classroomId,studentId}:{classroomId:string;studentId:string}) {
  const [items,setItems]=useState<Item[]>([]),[notes,setNotes]=useState<Record<string,string>>({})
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[showAll,setShowAll]=useState(false)
  const [loaded,setLoaded]=useState(false)
  const load=useCallback(async()=>{
    setItems([])
    setLoaded(false)
    try {
      const {data:{session}}=await createClient().auth.getSession()
      if(!session)throw new Error('Oturum gerekli.')
      const response=await fetch(`/api/teacher/intervention-review?${new URLSearchParams({classroomId,studentId})}`,
        {cache:'no-store',headers:{Authorization:`Bearer ${session.access_token}`}})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'İncelemeler alınamadı.')
      setItems(data.items||[]);setLoaded(true);setMessage('')
    } catch(error){setMessage(error instanceof Error?error.message:'İncelemeler alınamadı.')}
  },[classroomId,studentId])
  useEffect(()=>{
    const timer=window.setTimeout(()=>{setNotes({});void load()},0)
    return()=>window.clearTimeout(timer)
  },[load])
  async function save(item:Item,decision:'continue'|'needs_followup'){
    setBusy(true)
    try {
      const {data:{session}}=await createClient().auth.getSession()
      if(!session)throw new Error('Oturum gerekli.')
      const response=await fetch('/api/teacher/intervention-review',{method:'POST',
        headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
        body:JSON.stringify({classroomId,studentId,practiceId:item.practiceId,fingerprint:item.fingerprint,decision,note:notes[item.practiceId]||''})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||'İnceleme kaydedilemedi.')
      await load();setMessage(data.note)
    }catch(error){setMessage(error instanceof Error?error.message:'İnceleme kaydedilemedi.')}
    finally{setBusy(false)}
  }
  const visible=items.filter(item=>showAll||item.status!=='reviewed')
  return <section style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:14}}>
    <strong>Çalışma yaklaşımı incelemeleri</strong>
    <p>Seçili öğrencinin son 30 döngüsündeki belirsiz veya çelişkili çalışma kararları. Bu inceleme kazanım doğrulaması değildir; test puanlarını ve önce/sonra incelemelerini değiştirmez.</p>
    <button className="btn" disabled={busy} onClick={()=>void load()}>Yenile</button>{' '}
    <label><input type="checkbox" checked={showAll} onChange={event=>setShowAll(event.target.checked)}/> İncelenenleri de göster</label>
    {message&&<p role="status">{message}</p>}
    {!loaded&&!message&&<p>İncelemeler yükleniyor…</p>}
    {loaded&&!visible.length&&<p>Gösterilecek çalışma incelemesi yok.</p>}
    {visible.map(item=><article key={item.practiceId} style={{marginTop:12,padding:14,border:'1px solid var(--border)',borderRadius:12}}>
      <strong>{item.status==='reviewed'?'İncelendi':item.status==='needs_followup'?'Öğretmen takibi bekliyor':'İnceleme öneriliyor'}</strong>
      <p>{item.intervention?.label} · {item.intervention?.reason}</p>
      <p><MathText text={item.question}/></p>
      <p>İlk seçim: {item.firstChoice===null?'Yok':String.fromCharCode(65+item.firstChoice)} · Yeniden seçim: {item.retryChoice===null?'Yok':String.fromCharCode(65+item.retryChoice)}</p>
      {item.studentExplanation&&<p><strong>Öğrencinin gerekçesi:</strong> <MathText text={item.studentExplanation}/></p>}
      {item.review&&<p>Son öğretmen notu: {item.review.note} · {new Date(item.review.reviewedAt).toLocaleString('tr-TR')}</p>}
      <label htmlFor={`intervention-note-${item.practiceId}`}>İnceleme gerekçeniz (zorunlu)</label>
      <textarea id={`intervention-note-${item.practiceId}`} rows={3} maxLength={1000} value={notes[item.practiceId]||''}
        onChange={event=>setNotes(old=>({...old,[item.practiceId]:event.target.value}))} style={{display:'block',width:'100%',margin:'8px 0'}}/>
      <button className="btn btn-primary" disabled={busy||(notes[item.practiceId]||'').trim().length<10} onClick={()=>void save(item,'continue')}>İnceledim · çalışma sürdürülebilir</button>{' '}
      <button className="btn" disabled={busy||(notes[item.practiceId]||'').trim().length<10} onClick={()=>void save(item,'needs_followup')}>Ek inceleme için duraklat</button>
      <p style={{fontSize:12}}>Duraklatma sonraki çalışma ve ölçüm isteklerini durdurur. Önce planı öğrenciyle gözden geçirin; ardından sürdürme kararı verin. Geçmiş yanıtlar silinmez, otomatik yeni test atanmaz.</p>
    </article>)}
  </section>
}
