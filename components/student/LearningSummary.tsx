'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'
import { LIVE_DATA_REFRESH_EVENT } from '@/components/LiveDataRefresh'

type Summary = {
  mastery: { subject: string; topic: string; mastery_score: number; retention_score: number; trend: string }[]
  misconceptions: { subject: string; topic: string; status: string }[]
  recommendationHistory: { new_status: string; created_at: string }[]
}

export default function LearningSummary() {
  const { t: tr } = useT()
  const [data, setData] = useState<Summary | null>(null)
  useEffect(() => {
    async function load() {
      const { data: { session } } = await createClient().auth.getSession()
      if (!session) return
      const response = await fetch('/api/student/learning-summary', { cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}`, 'Cache-Control': 'no-cache' } })
      if (response.ok) setData(await response.json())
    }
    void load()
    window.addEventListener(LIVE_DATA_REFRESH_EVENT, load)
    return () => window.removeEventListener(LIVE_DATA_REFRESH_EVENT, load)
  }, [])
  if (!data || (!data.mastery.length && !data.misconceptions.length && !data.recommendationHistory.length)) return null
  const focus = data.mastery[0]
  const level = (score:number) => score >= 70 ? tr('Güçlü') : score >= 45 ? tr('Gelişiyor') : tr('Tekrar gerekli')
  const trend:Record<string,string> = { improving:tr('Yükseliyor'), stable:tr('Dengeli'), declining:tr('Düşüyor') }
  const lifecycle:Record<string,string> = { accepted:tr('Başlandı'), deferred:tr('Ertelendi'), dismissed:tr('Kapatıldı'), completed:tr('Tamamlandı'), active:tr('Yeni öneri') }
  return <section style={{ marginBottom: '1rem', padding: '16px', borderRadius: '16px', background: '#fffaf4', border: '1px solid #eaded1' }}>
    <div style={{ fontSize: 11, fontWeight: 800, color: '#386455', textTransform: 'uppercase' }}>{tr('Öğrenme durumun')}</div>
    {focus && <div style={{ marginTop: 7, fontSize: 13, color: '#29483d' }}><strong>{tr('En çok destek isteyen konu:')}</strong> {focus.topic}</div>}
    <div style={{ display:'grid',gap:10,marginTop:12 }}>
      {data.mastery.slice(0,3).map(item => <div key={`${item.subject}-${item.topic}`} style={{ borderTop:'1px solid #eaded1',paddingTop:8 }}>
        <div style={{ display:'flex',justifyContent:'space-between',gap:8,fontSize:11 }}><span><strong>{tr(item.topic)}</strong> · {trend[item.trend]||tr('Dengeli')}</span><strong style={{ color:item.mastery_score<45?'#b84d3b':'#386455' }}>{level(item.mastery_score)}</strong></div>
        <div aria-label={tr('{topic} konu gelişimi yüzde {pct}', { topic: item.topic, pct: Math.round(item.mastery_score) })} style={{ height:7,borderRadius:99,background:'#eee5da',marginTop:6,overflow:'hidden' }}><div style={{ width:`${Math.max(0,Math.min(100,item.mastery_score))}%`,height:'100%',background:item.mastery_score>=70?'#3f8b70':item.mastery_score>=45?'#d5a23c':'#d96a55' }}/></div>
        <div style={{ fontSize:10,color:'#7c6d60',marginTop:4 }}>{tr('Konu gelişimi %{a} · bilgiyi koruma %{b}', { a: Math.round(item.mastery_score), b: Math.round(item.retention_score) })}</div>
      </div>)}
    </div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
      <span style={badge}>📈 {tr('{n} konu izleniyor', { n: data.mastery.length })}</span>
      <span style={badge}>🧩 {tr('{n} doğrulanmış yanılgı', { n: data.misconceptions.length })}</span>
      <span style={badge}>🔄 {tr('{n} öneri hareketi', { n: data.recommendationHistory.length })}</span>
    </div>
    {data.misconceptions[0] && <div style={{ marginTop: 9, fontSize: 11, color: '#7c5d45' }}>{tr('Neden: {topic} konusunda kavramı pekiştiren kısa bir tekrar öneriliyor.', { topic: data.misconceptions[0].topic })}</div>}
    {data.recommendationHistory.length>0 && <div style={{ marginTop:9,fontSize:10,color:'#7c6d60' }}>{tr('Son öneri hareketleri: {list}', { list: data.recommendationHistory.slice(0,3).map(item=>lifecycle[item.new_status]||item.new_status).join(' · ') })}</div>}
  </section>
}

const badge = { padding: '4px 8px', borderRadius: 99, background: '#f4eee6', color: '#6f6256', fontSize: 10, fontWeight: 700 } as const
