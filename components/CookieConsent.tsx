'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useT } from '@/lib/i18n/I18nProvider'

type Choice = { necessary: true; analytics: boolean; personalization: boolean; decidedAt: string; version: string }
const VERSION = '2026-09-01'

export default function CookieConsent() {
  const { t: tr } = useT()
  const [userId, setUserId] = useState('')
  const [visible, setVisible] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [analytics, setAnalytics] = useState(false)
  const [personalization, setPersonalization] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }: any) => {
      if (!user) return
      setUserId(user.id)
      const saved = localStorage.getItem(`pratium-cookie-consent:${user.id}`)
      if (!saved) { setVisible(true); return }
      try {
        const choice = JSON.parse(saved) as Choice
        setAnalytics(!!choice.analytics)
        setPersonalization(!!choice.personalization)
        if (choice.version !== VERSION) setVisible(true)
      } catch { setVisible(true) }
    })
  }, [])

  function save(nextAnalytics: boolean, nextPersonalization: boolean) {
    if (!userId) return
    const choice: Choice = { necessary: true, analytics: nextAnalytics, personalization: nextPersonalization, decidedAt: new Date().toISOString(), version: VERSION }
    localStorage.setItem(`pratium-cookie-consent:${userId}`, JSON.stringify(choice))
    window.dispatchEvent(new CustomEvent('pratium:cookie-consent', { detail: choice }))
    setAnalytics(nextAnalytics)
    setPersonalization(nextPersonalization)
    setVisible(false)
    setPreferencesOpen(false)
  }

  if (!userId) return null

  return <>
    {visible && <section className="cookie-consent" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
      <div className="cookie-copy">
        <div className="cookie-mascot"><img src="/mascot-prati-face-v2.webp" alt="" /></div>
        <div><h2 id="cookie-title">{tr('Çerez tercihlerin senin kontrolünde')}</h2><p>{tr('Pratium’un güvenli biçimde çalışması için zorunlu çerezleri kullanıyoruz. Analiz ve kişiselleştirme çerezleri yalnızca izin verirsen etkinleştirilir. Ayrıntılar için')} <Link href="/cookie-policy">{tr('Çerez Politikası')}</Link> {tr('sayfasını inceleyebilirsin.')}</p></div>
      </div>
      {preferencesOpen && <div className="cookie-preferences">
        <label><span><b>{tr('Zorunlu çerezler')}</b><small>{tr('Oturum, güvenlik ve tercih kaydı için gereklidir.')}</small></span><input type="checkbox" checked disabled aria-label={tr('Zorunlu çerezler her zaman açık')} /></label>
        <label><span><b>{tr('Analiz çerezleri')}</b><small>{tr('Platformun nasıl kullanıldığını toplu biçimde anlamamıza yardımcı olur.')}</small></span><input type="checkbox" checked={analytics} onChange={e=>setAnalytics(e.target.checked)} /></label>
        <label><span><b>{tr('Kişiselleştirme çerezleri')}</b><small>{tr('Dil, görünüm ve öğrenme deneyimi tercihlerini hatırlar.')}</small></span><input type="checkbox" checked={personalization} onChange={e=>setPersonalization(e.target.checked)} /></label>
      </div>}
      <div className="cookie-actions">
        <button onClick={()=>save(true,true)}>{tr('Tümünü kabul et')}</button>
        <button onClick={()=>save(false,false)}>{tr('Tümünü reddet')}</button>
        {preferencesOpen ? <button onClick={()=>save(analytics,personalization)}>{tr('Tercihleri kaydet')}</button> : <button onClick={()=>setPreferencesOpen(true)}>{tr('Tercihler')}</button>}
      </div>
    </section>}
    {!visible && <button className="cookie-reopen" onClick={()=>setVisible(true)} aria-label={tr('Çerez tercihlerini aç')}>{tr('🍪 Çerez tercihleri')}</button>}
  </>
}
