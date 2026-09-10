'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Risk = { student_id: string; student_name: string; classes: { id: string; name: string }[]; subject: string; topic: string; mastery: number; retention: number; score: number; level: 'high' | 'medium'; evidence: string[] }
type Data = { classrooms: { id: string; name: string }[]; counts: { high_students: number; medium_students: number; total_warnings: number }; warnings: Risk[] }

const reasons: Record<string, string> = {
  low_mastery: 'temel eksik', low_retention: 'kalıcılık düşüyor', long_inactivity: 'uzun süredir tekrar yok', declining_trend: 'performans düşüyor',
}

export default function LearningRiskOverview({ endpoint, title = 'Erken uyarılar' }: { endpoint: string; title?: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [classroomId, setClassroomId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [standardOverrides,setStandardOverrides]=useState<Set<string>>(new Set())
  const overrideKey=(studentId:string,subject:string,topic:string)=>`${studentId}|${subject.toLocaleLowerCase('tr-TR')}|${topic.toLocaleLowerCase('tr-TR')}`

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      const query = classroomId ? `?classroomId=${encodeURIComponent(classroomId)}` : ''
      const response = await fetch(`${endpoint}${query}`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!cancelled && response.ok) setData(await response.json())
      if(endpoint.includes('/teacher')){const overrideResponse=await fetch('/api/teacher/adaptive-overrides',{headers:{Authorization:`Bearer ${session.access_token}`}});if(!cancelled&&overrideResponse.ok){const payload=await overrideResponse.json();setStandardOverrides(new Set((payload.overrides??[]).map((item:{student_id:string;subject:string;topic:string})=>overrideKey(item.student_id,item.subject,item.topic))))}}
      if (!cancelled) setLoading(false)
    }
    void load()
    return () => { cancelled = true }
  }, [classroomId, endpoint])

  async function logAction(item: Risk, action: 'notify' | 'assign' | 'resolve') {
    const { data: { session } } = await createClient().auth.getSession()
    if (!session) return
    setBusy(`${item.student_id}-${item.topic}`)
    await fetch('/api/teacher/learning-risk/actions', {
      method: 'POST', headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, student_id: item.student_id, classroom_id: item.classes[0]?.id, subject: item.subject, topic: item.topic }),
    })
    setBusy(null)
  }
  async function toggleAdaptive(item:Risk){const classroom=item.classes[0]?.id;if(!classroom)return;const id=overrideKey(item.student_id,item.subject,item.topic);const standard=standardOverrides.has(id);setBusy(`${item.student_id}-${item.topic}`);const {data:{session}}=await createClient().auth.getSession();if(!session){setBusy(null);return}const response=await fetch('/api/teacher/adaptive-overrides',{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({student_id:item.student_id,classroom_id:classroom,subject:item.subject,topic:item.topic,mode:standard?'automatic':'standard',reason:`${item.evidence.map(value=>reasons[value]).filter(Boolean).join(', ')} nedeniyle öğretmen müdahalesi`})});if(response.ok)setStandardOverrides(current=>{const next=new Set(current);if(standard)next.delete(id);else next.add(id);return next});setBusy(null)}

  return <section className="card" style={{ marginBottom: '1.5rem' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div><div style={{ fontSize: 14, fontWeight: 800, color: 'var(--primary)' }}>⚠️ {title}</div><div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>En az 3 kanıt ve %30 güven · yüksek riskler önce</div></div>
      <select value={classroomId} onChange={event => setClassroomId(event.target.value)} style={{ padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12 }}>
        <option value="">Tüm sınıflar</option>
        {(data?.classrooms ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </div>
    {loading ? <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" /></div> : !data?.warnings.length ? <div style={{ marginTop: 14, fontSize: 12, color: 'var(--text3)' }}>Bu kapsamda güvenilir bir risk uyarısı yok.</div> : <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '14px 0 10px' }}><span className="badge badge-red">Yüksek: {data.counts.high_students}</span><span className="badge badge-yellow">Orta: {data.counts.medium_students}</span><span className="badge">Konu uyarısı: {data.counts.total_warnings}</span></div>
      <div style={{ display: 'grid', gap: 8 }}>{data.warnings.slice(0, 20).map(item => <div key={`${item.student_id}-${item.subject}-${item.topic}`} style={{ borderTop: '1px solid var(--border)', paddingTop: 9, display: 'grid', gridTemplateColumns: 'minmax(130px, 1fr) minmax(180px, 2fr) auto', gap: 10, alignItems: 'center', fontSize: 12 }}>
        <span><strong>{item.student_name}</strong><br/><span style={{ color: 'var(--text3)', fontSize: 10 }}>{item.classes.map(c => c.name).join(', ') || 'Sınıfsız'}</span></span>
        <span><strong>{item.topic}</strong><br/><span style={{ color: 'var(--text3)', fontSize: 10 }}>{item.subject} · {item.evidence.map(value => reasons[value]).filter(Boolean).join(', ')}</span>{endpoint.includes('/teacher') && <><br/><span style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
          <button disabled={busy === `${item.student_id}-${item.topic}`} onClick={() => logAction(item, 'notify')} style={miniButton}>Bildir</button>
          <a href={`/teacher/assign?classroomId=${encodeURIComponent(item.classes[0]?.id || '')}&topic=${encodeURIComponent(item.topic)}&studentId=${encodeURIComponent(item.student_id)}`} onClick={() => { void logAction(item, 'assign') }} style={miniButton}>Çalışma planla</a>
          <button disabled={busy === `${item.student_id}-${item.topic}`} onClick={() => logAction(item, 'resolve')} style={miniButton}>Çözüldü</button>
          <button disabled={!item.classes[0]?.id||busy===`${item.student_id}-${item.topic}`} onClick={()=>void toggleAdaptive(item)} style={miniButton}>{standardOverrides.has(overrideKey(item.student_id,item.subject,item.topic))?'Adaptasyonu otomatiğe al':'30 gün standart mod'}</button>
        </span></>}</span>
        <span style={{ color: item.level === 'high' ? 'var(--red)' : '#b7791f', fontWeight: 800, textAlign: 'right' }}>{item.level === 'high' ? 'Yüksek' : 'Orta'}<br/><span style={{ fontSize: 10 }}>risk {item.score}</span></span>
      </div>)}</div>
    </>}
  </section>
}

const miniButton = { border: '1px solid var(--border)', borderRadius: 7, background: 'var(--surface)', color: 'var(--text2)', padding: '4px 7px', fontSize: 10, fontWeight: 700, textDecoration: 'none', cursor: 'pointer' } as const
