'use client'
import { useCallback,useEffect,useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import MathText from '@/components/MathText'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'

type Item={practiceId:string;cycleId:string;fingerprint:string;status:string;practiceStatus:string;
  question:string;options:string[];firstChoice:number|null;retryChoice:number|null;studentExplanation:string|null;
  intervention:{label:string;reason:string}|null;review:{decision:string;note:string;reviewedAt:string}|null}
export default function InterventionReviewQueue({classroomId,studentId}:{classroomId:string;studentId:string}) {
  const { t: tr, locale } = useT()
  const dl = intlLocale(locale)
  const none = tr('Yok')
  const [items,setItems]=useState<Item[]>([]),[notes,setNotes]=useState<Record<string,string>>({})
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[showAll,setShowAll]=useState(false)
  const [loaded,setLoaded]=useState(false)
  const load=useCallback(async()=>{
    setItems([])
    setLoaded(false)
    try {
      const {data:{session}}=await createClient().auth.getSession()
      if(!session)throw new Error(tr('Oturum gerekli.'))
      const response=await fetch(`/api/teacher/intervention-review?${new URLSearchParams({classroomId,studentId})}`,
        {cache:'no-store',headers:{Authorization:`Bearer ${session.access_token}`}})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||tr('İncelemeler alınamadı.'))
      setItems(data.items||[]);setLoaded(true);setMessage('')
    } catch(error){setMessage(error instanceof Error?error.message:tr('İncelemeler alınamadı.'))}
  },[classroomId,studentId,tr])
  useEffect(()=>{
    const timer=window.setTimeout(()=>{setNotes({});void load()},0)
    return()=>window.clearTimeout(timer)
  },[load])
  async function save(item:Item,decision:'continue'|'needs_followup'){
    setBusy(true)
    try {
      const {data:{session}}=await createClient().auth.getSession()
      if(!session)throw new Error(tr('Oturum gerekli.'))
      const response=await fetch('/api/teacher/intervention-review',{method:'POST',
        headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
        body:JSON.stringify({classroomId,studentId,practiceId:item.practiceId,fingerprint:item.fingerprint,decision,note:notes[item.practiceId]||''})})
      const data=await response.json()
      if(!response.ok)throw new Error(data.error||tr('İnceleme kaydedilemedi.'))
      await load();setMessage(data.note)
    }catch(error){setMessage(error instanceof Error?error.message:tr('İnceleme kaydedilemedi.'))}
    finally{setBusy(false)}
  }
  const visible=items.filter(item=>showAll||item.status!=='reviewed')
  return <section style={{marginTop:18,borderTop:'1px solid var(--border)',paddingTop:14}}>
    <strong>{tr('Çalışma yaklaşımı incelemeleri')}</strong>
    <p>{tr('Seçili öğrencinin son 30 döngüsündeki belirsiz veya çelişkili çalışma kararları. Bu inceleme kazanım doğrulaması değildir; test puanlarını ve önce/sonra incelemelerini değiştirmez.')}</p>
    <button className="btn" disabled={busy} onClick={()=>void load()}>{tr('Yenile')}</button>{' '}
    <label><input type="checkbox" checked={showAll} onChange={event=>setShowAll(event.target.checked)}/> {tr('İncelenenleri de göster')}</label>
    {message&&<p role="status">{message}</p>}
    {!loaded&&!message&&<p>{tr('İncelemeler yükleniyor…')}</p>}
    {loaded&&!visible.length&&<p>{tr('Gösterilecek çalışma incelemesi yok.')}</p>}
    {visible.map(item=><article key={item.practiceId} style={{marginTop:12,padding:14,border:'1px solid var(--border)',borderRadius:12}}>
      <strong>{item.status==='reviewed'?tr('İncelendi'):item.status==='needs_followup'?tr('Öğretmen takibi bekliyor'):tr('İnceleme öneriliyor')}</strong>
      <p>{item.intervention?.label} · {item.intervention?.reason}</p>
      <p><MathText text={item.question}/></p>
      <p>{tr('İlk seçim: {first} · Yeniden seçim: {retry}',{first:item.firstChoice===null?none:String.fromCharCode(65+item.firstChoice),retry:item.retryChoice===null?none:String.fromCharCode(65+item.retryChoice)})}</p>
      {item.studentExplanation&&<p><strong>{tr('Öğrencinin gerekçesi:')}</strong> <MathText text={item.studentExplanation}/></p>}
      {item.review&&<p>{tr('Son öğretmen notu: {note}',{note:item.review.note})} · {new Date(item.review.reviewedAt).toLocaleString(dl)}</p>}
      <label htmlFor={`intervention-note-${item.practiceId}`}>{tr('İnceleme gerekçeniz (zorunlu)')}</label>
      <textarea id={`intervention-note-${item.practiceId}`} rows={3} maxLength={1000} value={notes[item.practiceId]||''}
        onChange={event=>setNotes(old=>({...old,[item.practiceId]:event.target.value}))} style={{display:'block',width:'100%',margin:'8px 0'}}/>
      <button className="btn btn-primary" disabled={busy||(notes[item.practiceId]||'').trim().length<10} onClick={()=>void save(item,'continue')}>{tr('İnceledim · çalışma sürdürülebilir')}</button>{' '}
      <button className="btn" disabled={busy||(notes[item.practiceId]||'').trim().length<10} onClick={()=>void save(item,'needs_followup')}>{tr('Ek inceleme için duraklat')}</button>
      <p style={{fontSize:12}}>{tr('Duraklatma sonraki çalışma ve ölçüm isteklerini durdurur. Önce planı öğrenciyle gözden geçirin; ardından sürdürme kararı verin. Geçmiş yanıtlar silinmez, otomatik yeni test atanmaz.')}</p>
    </article>)}
  </section>
}
