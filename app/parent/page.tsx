'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveIdentities } from '@/lib/identity/resolve-client'
import ReportsHub from '@/components/ReportsHub'
import ChildConsentStatus from '@/components/ChildConsentStatus'
import { Suspense } from 'react'
import { AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import SubjectPerformanceChart from '@/components/SubjectPerformanceChart'
import { computeWeeklyGrowth } from '@/lib/weekly-growth'
import { computeTopicMastery, TopicMastery } from '@/lib/mastery'
import { analyzeTrend } from '@/lib/predictive-risk'
import { analyzeStudyDuration, StudyDurationInsight } from '@/lib/study-duration-model'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'
import PanelLanguageSwitch from '@/components/PanelLanguageSwitch'

// lib/parent-risk-alert.ts'teki AYNI eşik (35) — o dosyayı buraya import
// ETMİYORUZ bilerek: server-only bir zincire bağlanıyor (identity/client.ts
// → 'pg' Node Postgres sürücüsü, parent-action-sentence.ts → Anthropic SDK),
// bu 'use client' sayfasına eklenince Turbopack tarayıcı paketi için 'dns',
// 'fs', 'net', 'tls' gibi Node çekirdek modüllerini çözemiyor ve build
// patlıyor. Sabit burada bilinçli olarak kopyalanmıştır; RISK_THRESHOLD
// değişirse iki dosyada birden güncellenmeli.
const RISK_THRESHOLD = 35

interface WeeklyGrowthData {
  thisWeekAvg: number | null
  lastWeekAvg: number | null
  thisWeekCount: number
  lastWeekCount: number
  deltaPoints: number | null
}

interface WeakTopicRow {
  topic: string
  wrong_count: number
  total_count: number
  last_seen_at: string | null
}

// Konu Ustalık Haritası + Erken Uyarılar sekmesi için: her zayıf konunun
// mastery skoru (lib/mastery.ts) + varsa risk sınıflandırması (lib/parent-
// risk-alert.ts'teki checkAndNotifyRiskyTopic ile AYNI mantık — reaktif/
// öngörü) — e-postayla sınırlı kalmasın, panelde her zaman görülebilsin diye.
interface TopicRisk extends TopicMastery {
  riskKind: 'reaktif' | 'ongoru' | null
}

interface ChildData {
  child_id: string
  nickname: string
  name: string
  grade: string
  streak: number
  totalTests: number
  avgPct: number | null
  weeklyTests: number
  recentTopics: string[]
  assignmentsDone: number
  weakTopics: string[]
  weakTopicsRaw: WeakTopicRow[]
  topicRisks: TopicRisk[]
  studyDuration: StudyDurationInsight | null
  lastActive: string | null
  sessions: any[]
  leaderRank: number | null
  leaderTotal: number | null
  weeklyGrowth: WeeklyGrowthData | null
}

function ParentContent() {
  const { t: tr, locale } = useT()
  const dateLocale = intlLocale(locale)
  const [children, setChildren] = useState<ChildData[]>([])
  const [selectedChild, setSelectedChild] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trend' | 'weekly-growth' | 'mastery' | 'archive' | 'leaderboard' | 'reports' | 'add'>('dashboard')
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [addCode, setAddCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [addSuccess, setAddSuccess] = useState('')
  const [leaderboard, setLeaderboard] = useState<any[]>([])
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login/parent'); return }

    const childParam = searchParams.get('child')

    const { data: links } = await supabase
      .from('parent_children')
      .select('child_id, nickname')
      .eq('parent_id', user.id)

    if (!links?.length) { setLoading(false); return }

    const childIds = links.map((l: any) => l.child_id)
    const nicknameMap: Record<string, string> = {}
    links.forEach((l: any) => { nicknameMap[l.child_id] = l.nickname || '' })

    // İsimler TR-PG'den toplu çekilir; grade Supabase'de kalır
    const childIdentities = await resolveIdentities(supabase, childIds)

    const childData = await Promise.all(childIds.map(async (cid: string) => {
      const [profileRes, streakRes, sessionsRes, completionsRes, weakRes, weeklyGrowth, studyDuration] = await Promise.all([
        supabase.from('profiles').select('grade').eq('id', cid).maybeSingle(),
        supabase.from('streaks').select('current_streak').eq('user_id', cid).maybeSingle(),
        supabase.from('quiz_sessions').select('id, pct, topic, question_count, score, created_at, question_type').eq('user_id', cid).eq('completed', true).order('created_at', { ascending: false }).limit(50),
        supabase.from('assignment_completions').select('id').eq('student_id', cid),
        // Önceden sadece 'topic' + limit 3 çekiliyordu (Durum kartındaki "Gelişim
        // Alanları" listesi için yeterliydi). Ustalık Haritası + Erken Uyarılar
        // sekmesi mastery hesaplamak için wrong_count/total_count/last_seen_at'e
        // de ihtiyaç duyuyor — limit 20'ye çıkarıldı, en zayıf 3'ü göstermeye
        // devam eden eski davranış aşağıda weakTopics ile korunuyor.
        supabase.from('weak_topics').select('topic, wrong_count, total_count, last_seen_at').eq('user_id', cid).order('wrong_count', { ascending: false }).limit(20),
        // "Gelişim Oranı" (Durum sekmesindeki kart) ve "Haftalık Gelişim" sekmesi
        // AYNI kaynağı kullanır — lib/weekly-growth.ts (e-posta özetiyle de paylaşılıyor).
        // Daha önce bu alan hiç çağrılmıyordu; kart ve sekme bu yüzden boş kalıyordu.
        computeWeeklyGrowth(supabase, cid),
        // Verimli Çalışma Süresi (Faz 11 — yorgunluk/dikkat modeli). Daha önce
        // hiçbir yerde çağrılmıyordu; sadece lib/study-duration-model.ts'te
        // yazılıydı. Yeterli veri (soru-başına-süre) birikene kadar
        // hasEnoughData:false döner, bu beklenen bir durum.
        analyzeStudyDuration(supabase, cid),
      ])
      const sessions = sessionsRes.data ?? []
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7)
      const weeklyTests = sessions.filter((s: any) => new Date(s.created_at) > weekAgo).length
      const avgPct = sessions.length ? Math.round(sessions.reduce((a: number, s: any) => a + s.pct, 0) / sessions.length) : null
      const recentTopics = [...new Set(sessions.slice(0, 5).map((s: any) => s.topic))].slice(0, 3) as string[]

      const weakTopicsRaw: WeakTopicRow[] = weakRes.data ?? []
      const weakTopics = weakTopicsRaw.slice(0, 3).map(w => w.topic)

      // Konu Ustalık Haritası + Erken Uyarılar — lib/parent-risk-alert.ts'teki
      // checkAndNotifyRiskyTopic ile AYNI sınıflandırma: mastery skoru zaten
      // eşiğin altındaysa "reaktif"; henüz altına düşmediyse ama SON
      // testlerin eğilimi kötüye gidiyorsa "öngörü" (erken uyarı). E-posta
      // bildirimiyle sınırlı kalmasın diye panelde canlı gösteriliyor.
      const topicRisks: TopicRisk[] = await Promise.all(weakTopicsRaw.map(async (row) => {
        const mastery = computeTopicMastery(row)
        if (mastery.totalCount < 3) return { ...mastery, riskKind: null }
        if (mastery.masteryScore < RISK_THRESHOLD) return { ...mastery, riskKind: 'reaktif' }
        try {
          const trend = await analyzeTrend(supabase, cid, row.topic)
          if (trend?.decliningTowardRisk) return { ...mastery, riskKind: 'ongoru' }
        } catch { /* trend analizi opsiyonel, hata olursa risksiz say */ }
        return { ...mastery, riskKind: null }
      }))

      return {
        child_id: cid,
        nickname: nicknameMap[cid] || childIdentities[cid]?.full_name || tr('Çocuğum'),
        name: childIdentities[cid]?.full_name ?? tr('İsimsiz'),
        grade: profileRes.data?.grade ?? '',
        streak: streakRes.data?.current_streak ?? 0,
        totalTests: sessions.length,
        avgPct,
        weeklyTests,
        recentTopics,
        assignmentsDone: completionsRes.data?.length ?? 0,
        weakTopics,
        weakTopicsRaw,
        topicRisks,
        studyDuration,
        lastActive: sessions[0]?.created_at ?? null,
        sessions,
        leaderRank: null,
        leaderTotal: null,
        weeklyGrowth,
      }
    }))

    // Bildirim zili (RAPORLAR'ın yanına eklenen 🔔) — /notifications sayfası
    // zaten vardı ama veli paneli navbar'ından hiç bağlanmıyordu, riskli konu
    // uyarıları oraya düşse bile kimse fark etmiyordu.
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false)
    setUnreadNotifications(unreadCount ?? 0)

    // Leaderboard (isimler TR-PG'den, grade Supabase'den)
    const { data: lbData } = await supabase
      .from('profiles')
      .select('id, grade')
      .limit(100)

    if (lbData?.length) {
      const lbIdentities = await resolveIdentities(supabase, lbData.map((p: any) => p.id))
      const lbWithStats = await Promise.all(lbData.map(async (p: any) => {
        const { data: s } = await supabase.from('quiz_sessions').select('pct').eq('user_id', p.id).eq('completed', true)
        const avg = s?.length ? Math.round(s.reduce((a: number, x: any) => a + x.pct, 0) / s.length) : 0
        return { ...p, name: lbIdentities[p.id]?.full_name ?? tr('İsimsiz'), avgPct: avg, totalTests: s?.length ?? 0 }
      }))
      const sorted = lbWithStats.filter(p => p.totalTests > 0).sort((a, b) => b.avgPct - a.avgPct)
      setLeaderboard(sorted.slice(0, 20))

      // Çocukların rank'larını belirle
      childData.forEach(c => {
        const rank = sorted.findIndex(p => p.id === c.child_id)
        c.leaderRank = rank >= 0 ? rank + 1 : null
        c.leaderTotal = sorted.length
      })
    }

    setChildren(childData)
    const initChild = childParam && childData.find(c => c.child_id === childParam)
      ? childParam
      : childData[0]?.child_id ?? null
    setSelectedChild(initChild)
    setLoading(false)
  }

  async function addChild() {
    if (!addCode.trim()) return
    setAdding(true); setAddError(''); setAddSuccess('')
    try {
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/parent/link-child', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ code: addCode.trim() }) })
    const result = await response.json()
    if (!response.ok) { setAddError(result.error || tr('Çocuk eklenemedi.')); return }
    setAddSuccess(tr('Çocuğunuz başarıyla eklendi!'))
    setAddCode('')
    await load()
    } catch { setAddError(tr('Bağlantı hatası. Lütfen yeniden deneyin.')) }
    finally { setAdding(false) }
  }

  async function removeChild(childId: string) {
    if (!confirm(tr('Bu çocuğu listeden kaldırmak istediğinize emin misiniz?'))) return
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/parent/unlink-child', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ childId }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      setAddError(payload?.error || tr('Bağlantı kaldırılamadı.'))
      return
    }
    setChildren(prev => prev.filter(c => c.child_id !== childId))
    setSelectedChild(children.filter(c => c.child_id !== childId)[0]?.child_id ?? null)
  }

  const levelLabel = (v: string) => v === 'yüksek' ? tr('yüksek‖seviye') : v === 'orta' ? tr('orta‖seviye') : tr('düşük‖seviye')

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct >= 70) return 'var(--green)'
    if (pct >= 50) return '#f59e0b'
    return 'var(--red)'
  }

  function timeAgo(iso: string | null) {
    if (!iso) return tr('Henüz aktif değil')
    const diff = Date.now() - new Date(iso).getTime()
    const days = Math.floor(diff / 86400000)
    if (days === 0) return tr('Bugün')
    if (days === 1) return tr('Dün')
    return tr('{n} gün önce', { n: days })
  }

  const selected = children.find(c => c.child_id === selectedChild)

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Veli Navbar */}
      <nav style={{ background: '#29483d', padding: '0 1.5rem', height: '68px', display: 'flex', alignItems: 'center', gap: '12px', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 8px 24px rgba(41,72,61,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '32px', filter: 'brightness(0) invert(1)' }} />
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap' }}>{tr('👨‍👩‍👧 Veli Paneli')}</span>
        </div>
        <div className="nav-scroll-x" style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {[
            { key: 'dashboard', label: tr('📊 Durum') },
            { key: 'trend', label: tr('📈 Trend') },
            { key: 'weekly-growth', label: tr('📊 Haftalık Gelişim') },
            { key: 'mastery', label: tr('🧠 Ustalık & Uyarılar') },
            { key: 'archive', label: tr('📦 Arşiv') },
            { key: 'leaderboard', label: tr('🏆 Sıralama') },
            { key: 'reports', label: tr('📋 RAPORLAR') },
            { key: 'add', label: tr('➕ Çocuk Ekle') },
          ].map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', transition: 'all 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
                background: activeTab === t.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: activeTab === t.key ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>
              {t.label}
            </button>
          ))}
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)', margin: '0 4px', flexShrink: 0 }} />
          {/* Bildirim zili — /notifications zaten vardı, navbar'dan hiç bağlanmıyordu */}
          <button onClick={() => router.push('/notifications')} title={tr('Bildirimler')}
            style={{ position: 'relative', padding: '6px 10px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'rgba(255,255,255,0.7)', fontSize: '15px', cursor: 'pointer', flexShrink: 0 }}>
            🔔
            {unreadNotifications > 0 && (
              <span style={{ position: 'absolute', top: '2px', right: '2px', minWidth: '15px', height: '15px', padding: '0 3px', borderRadius: '999px', background: 'var(--red)', color: '#fff', fontSize: '9px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>
          <PanelLanguageSwitch />
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {tr('Çıkış')}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem', paddingBottom: '5rem' }}>

        {/* Çocuk seçici — tüm sekmelerde görünür */}
        {children.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            {children.map(c => (
              <button key={c.child_id} onClick={() => setSelectedChild(c.child_id)}
                style={{ padding: '7px 16px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid', fontFamily: 'var(--font-sans)', transition: 'all 0.15s',
                  background: selectedChild === c.child_id ? '#082465' : 'var(--bg2)',
                  borderColor: selectedChild === c.child_id ? '#082465' : 'var(--border)',
                  color: selectedChild === c.child_id ? '#fff' : 'var(--text3)',
                }}>
                {c.nickname}
              </button>
            ))}
          </div>
        )}

        {/* Çocuk yok */}
        {children.length === 0 && activeTab !== 'add' && (
          <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>👶</div>
            <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)', marginBottom: '8px' }}>{tr('Henüz çocuk eklenmedi')}</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.5rem' }}>{tr('Çocuğunuzdan Pratium profilindeki veli kodunu alın.')}</div>
            <button onClick={() => setActiveTab('add')} className="btn btn-primary" style={{ justifyContent: 'center' }}>
              {tr('+ Çocuk Ekle')}
            </button>
          </div>
        )}

        {/* DURUM / DASHBOARD */}
        {activeTab === 'dashboard' && selected && (
          <div>
            <div style={{ marginBottom: '1.5rem' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)' }}>
                {selected.name}
              </h1>
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {selected.grade && <span>📚 {selected.grade}</span>}
                <span>{tr('Son aktivite: {when}', { when: timeAgo(selected.lastActive) })}</span>
              </div>
            </div>

            {/* Özet kartlar */}
            {(() => {
              // Gelişim Oranı — bu haftanın ortalaması geçen haftaya göre kaç puan
              // değişmiş (lib/weekly-growth.ts, Haftalık Gelişim sekmesiyle aynı kaynak).
              const wg = selected.weeklyGrowth
              const growthDelta = wg?.deltaPoints ?? null
              const growthHasData = wg?.thisWeekAvg != null && wg?.lastWeekAvg != null
              const growthColor = !growthHasData ? 'var(--text4)' : growthDelta! > 0 ? 'var(--green)' : growthDelta! < 0 ? 'var(--red)' : 'var(--text)'
              const growthValue = !growthHasData ? '—' : `${growthDelta! > 0 ? '+' : ''}${tr('{n} puan', { n: growthDelta })}`

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
                  {[
                    { icon: '🔥', label: tr('Günlük Seri'), value: tr('{n} gün', { n: selected.streak }), color: selected.streak >= 7 ? 'var(--green)' : 'var(--text)' },
                    { icon: '📊', label: tr('Genel Ortalama'), value: selected.avgPct !== null ? `%${selected.avgPct}` : '—', color: pctColor(selected.avgPct) },
                    { icon: '📅', label: tr('Bu Hafta'), value: tr('{n} test', { n: selected.weeklyTests }), color: 'var(--text)' },
                    { icon: '✅', label: tr('Ödev‖veli'), value: tr('{n} tamamlandı', { n: selected.assignmentsDone }), color: 'var(--text)' },
                    { icon: '🏆', label: tr('Genel Sıra'), value: selected.leaderRank ? `#${selected.leaderRank}` : '—', color: selected.leaderRank && selected.leaderRank <= 10 ? 'var(--green)' : 'var(--text)' },
                    { icon: '📈', label: tr('Gelişim Oranı'), value: growthValue, color: growthColor, onClick: () => setActiveTab('weekly-growth') },
                  ].map((s, i) => (
                    <div key={i} className="card" onClick={s.onClick} style={{ textAlign: 'center', padding: '14px 10px', cursor: s.onClick ? 'pointer' : 'default' }}>
                      <div style={{ fontSize: '20px', marginBottom: '4px' }}>{s.icon}</div>
                      <div style={{ fontWeight: 800, fontSize: '18px', color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              )
            })()}

            {/* Veli için açıklanabilir öğrenme özeti */}
            <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(135deg, rgba(30,207,184,0.08), rgba(99,102,241,0.06))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tr('Veli öğrenme özeti')}</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{tr('Bugün nasıl destek olabilirsiniz?')}</div>
                </div>
                <span style={{ fontSize: '22px' }}>💡</span>
              </div>
              {selected.weakTopics.length > 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
                  {tr('Öncelik: {topic}. Kısa ve sakin bir tekrar oturumu öneriyoruz; baskı yerine birlikte hedef belirleyin.', { topic: selected.weakTopics[0] })}
                </div>
              ) : selected.weeklyTests > 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{tr('Bu hafta {n} test tamamlandı. Düzenli çalışma alışkanlığını küçük molalarla destekleyin.', { n: selected.weeklyTests })}</div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>{tr('Henüz bu hafta veri oluşmadı. Birlikte kısa bir çalışma hedefi belirleyebilirsiniz.')}</div>
              )}
            </div>

            {/* Son çalışılan konular + Zayıf konular */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
              <div className="card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>{tr('Son Çalışılan')}</div>
                {selected.recentTopics.length > 0 ? selected.recentTopics.map((t, i) => (
                  <div key={i} style={{ fontSize: '13px', padding: '6px 0', borderBottom: i < selected.recentTopics.length - 1 ? '1px solid var(--border)' : 'none' }}>📚 {t}</div>
                )) : <div style={{ fontSize: '13px', color: 'var(--text4)' }}>{tr('Henüz test çözülmedi')}</div>}
              </div>
              <div className="card">
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>{tr('Gelişim Alanları')}</div>
                {selected.weakTopics.length > 0 ? selected.weakTopics.map((t, i) => (
                  <div key={i} style={{ fontSize: '13px', padding: '6px 0', borderBottom: i < selected.weakTopics.length - 1 ? '1px solid var(--border)' : 'none', color: 'var(--red)' }}>⚠️ {t}</div>
                )) : <div style={{ fontSize: '13px', color: 'var(--green)' }}>{tr('✓ Zayıf konu yok')}</div>}
              </div>
            </div>

            {/* Son testler */}
            {selected.sessions.length > 0 && (
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>{tr('📝 Son Çözülen Testler')}</div>
                {selected.sessions.slice(0, 5).map((s: any) => (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500 }}>{s.topic}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {tr('{score}/{total} doğru · {date}', { score: s.score, total: s.question_count, date: new Date(s.created_at).toLocaleDateString(dateLocale) })}
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '18px', color: pctColor(s.pct) }}>%{s.pct}</div>
                  </div>
                ))}
                <button onClick={() => setActiveTab('archive')} style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 600 }}>
                  {tr('Tüm arşivi gör →')}
                </button>
              </div>
            )}

            {/* Madde 7: rıza durumu görünürlüğü (salt-okunur) */}
            <ChildConsentStatus childId={selected.child_id} />

            {/* Çocuğu kaldır */}
            <div style={{ marginTop: '1rem', textAlign: 'right' }}>
              <button onClick={() => removeChild(selected.child_id)} style={{ fontSize: '12px', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                {tr('Listeden kaldır')}
              </button>
            </div>
          </div>
        )}

        {/* ARŞİV */}
        {/* TREND SEKMESİ */}
        {activeTab === 'trend' && selected && (() => {
          const pctColor = (p: number) => p >= 75 ? '#10b981' : p >= 50 ? '#f59e0b' : '#ef4444'

          // Haftalık trend
          const weeks: Record<string, {week: string; total: number; count: number}> = {}
          selected.sessions.forEach((s: any) => {
            const d = new Date(s.created_at)
            const weekStart = new Date(d)
            weekStart.setDate(d.getDate() - d.getDay())
            const key = weekStart.toISOString().split('T')[0]
            const label = `${weekStart.getDate()}/${weekStart.getMonth()+1}`
            if (!weeks[key]) weeks[key] = { week: label, total: 0, count: 0 }
            weeks[key].total += s.pct
            weeks[key].count += 1
          })
          const trendData = Object.entries(weeks)
            .sort(([a],[b]) => a.localeCompare(b))
            .slice(-8)
            .map(([,v]) => ({ ...v, avg: Math.round(v.total/v.count) }))

          // Konu başarısı
          const topicMap: Record<string, {total: number; count: number}> = {}
          selected.sessions.forEach((s: any) => {
            if (!topicMap[s.topic]) topicMap[s.topic] = { total: 0, count: 0 }
            topicMap[s.topic].total += s.pct
            topicMap[s.topic].count += 1
          })
          const topicData = Object.entries(topicMap)
            .map(([topic, v]) => ({ topic: topic.length > 16 ? topic.slice(0,16)+'…' : topic, avg: Math.round(v.total/v.count) }))
            .sort((a,b) => b.avg - a.avg)

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Haftalık E-posta Gönder */}
              <div className="card" style={{ background: 'linear-gradient(135deg, rgba(8,36,101,0.04), rgba(30,207,184,0.04))', border: '1px solid rgba(99,102,241,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>{tr('📧 Haftalık Özet E-postası')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{tr("Her Pazar 08:00'de otomatik gönderilir. Şimdi de isteyebilirsin.")}</div>
                  </div>
                  <button onClick={async () => {
                    setSendingEmail(true)
                    try {
                      const { data: { session } } = await supabase.auth.getSession()
                      const res = await fetch('/api/parent/send-summary', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
                      })
                      if (res.ok) setEmailSent(true)
                    } catch {}
                    setSendingEmail(false)
                  }} disabled={sendingEmail || emailSent}
                    className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '13px' }}>
                    {emailSent ? tr('✅ Gönderildi!') : sendingEmail ? tr('⏳ Gönderiliyor...') : tr('📨 Özet Gönder')}
                  </button>
                </div>
              </div>

              {/* Haftalık Trend */}
              {trendData.length > 0 && (
                <div className="card">
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '12px' }}>{tr('📈 Haftalık Başarı Trendi')}</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="parentTrend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis domain={[0,100]} tickFormatter={v => `%${v}`} tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: any) => [`%${v}`, tr('Haftalık Ort.')]} />
                      <Area type="monotone" dataKey="avg" stroke="#6366f1" strokeWidth={2.5} fill="url(#parentTrend)" dot={{ fill: '#6366f1', r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Konu bazlı başarı */}
              {topicData.length > 0 && (
                <div className="card">
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '12px' }}>{tr('📚 Konu Başarısı')}</div>
                  <ResponsiveContainer width="100%" height={Math.max(180, topicData.length * 30)}>
                    <BarChart data={topicData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" domain={[0,100]} tickFormatter={v => `%${v}`} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="topic" width={120} tick={{ fontSize: 11, fill: 'var(--text2)' }} />
                      <Tooltip formatter={(v: any) => [`%${v}`, tr('Başarı')]} />
                      <Bar dataKey="avg" radius={[0,6,6,0]}>
                        {topicData.map((d, i) => <Cell key={i} fill={pctColor(d.avg)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Zayıf konular */}
              {selected.weakTopics?.length > 0 && (
                <div className="card" style={{ border: '1.5px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.03)' }}>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: '#dc2626', marginBottom: '10px' }}>{tr('⚠️ Çalışılması Gereken Konular')}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selected.weakTopics.map((topic: string, i: number) => (
                      <span key={i} style={{ padding: '5px 12px', borderRadius: '99px', background: 'rgba(239,68,68,0.1)', color: '#dc2626', fontSize: '12px', fontWeight: 600 }}>
                        ⚠️ {topic}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* HAFTALIK GELİŞİM SEKMESİ */}
        {activeTab === 'weekly-growth' && selected && (() => {
          const g = selected.weeklyGrowth
          if (!g) return null
          const hasComparison = g.thisWeekAvg != null && g.lastWeekAvg != null
          const delta = g.deltaPoints
          const deltaColor = delta == null ? 'var(--text3)' : delta > 0 ? 'var(--green)' : delta < 0 ? 'var(--red)' : 'var(--text3)'
          const deltaArrow = delta == null ? '' : delta > 0 ? '▲' : delta < 0 ? '▼' : '—'
          const compareChartData = [
            { subject: tr('Geçen Hafta'), avgPct: g.lastWeekAvg ?? 0, testCount: g.lastWeekCount },
            { subject: tr('Bu Hafta'), avgPct: g.thisWeekAvg ?? 0, testCount: g.thisWeekCount },
          ]

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div className="card" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
                  {tr('Haftalık Gelişim Oranı')}
                </div>
                {hasComparison ? (
                  <>
                    <div style={{ fontSize: '40px', fontWeight: 800, color: deltaColor, lineHeight: 1 }}>
                      {deltaArrow} {delta! > 0 ? '+' : ''}{delta}
                      <span style={{ fontSize: '20px' }}> {tr('puan')}</span>
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '8px' }}>
                      {tr('Geçen hafta %{last} → Bu hafta %{this}', { last: g.lastWeekAvg, this: g.thisWeekAvg })}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: '14px', color: 'var(--text3)', padding: '1rem 0' }}>
                    {tr('Karşılaştırma için hem bu hafta hem geçen hafta en az bir test çözülmüş olması gerekiyor.')}
                  </div>
                )}
              </div>

              {hasComparison && (
                <div className="card">
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px' }}>{tr('Geçen Hafta vs Bu Hafta')}</div>
                  <SubjectPerformanceChart data={compareChartData} height={180} />
                </div>
              )}

              <div className="card" style={{ background: 'var(--bg2)' }}>
                <div style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: 1.7 }}>
                  {tr('ℹ️ Hafta, Pazartesi gününden başlar. "Bu hafta" bu Pazartesi\'den bugüne, "geçen hafta" ise önceki Pazartesi-Pazar aralığındaki testlerin ortalamasını gösterir. Bu karşılaştırma, her pazar günü gönderilen haftalık özet e-postasına da otomatik olarak ekleniyor.')}
                </div>
              </div>
            </div>
          )
        })()}

        {/* USTALIK HARİTASI + ERKEN UYARILAR + ÇALIŞMA SÜRESİ SEKMESİ */}
        {activeTab === 'mastery' && selected && (() => {
          const masteryColor = (score: number) => score >= 70 ? 'var(--green)' : score >= 45 ? '#f59e0b' : 'var(--red)'
          const riskColor = { yüksek: 'var(--red)', orta: '#f59e0b', düşük: 'var(--green)' } as Record<string, string>
          const atRisk = selected.topicRisks.filter(t => t.riskKind !== null)
          const sd = selected.studyDuration
          const progressLabel = (score: number) => score >= 70 ? tr('İyi ilerliyor') : score >= 45 ? tr('Pekiştirilmeli') : tr('Desteğe ihtiyaç var')
          const homeSupport = (risk: TopicRisk) => risk.forgettingRisk === 'yüksek'
            ? tr('Bugün 10 dakikalık sakin bir tekrar planlayın; cevabı söylemek yerine ne hatırladığını sorun.')
            : tr('Bu hafta kısa bir çalışma hedefi belirleyin ve tamamladığında çabasını takdir edin.')

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

              {/* Erken Uyarılar */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px' }}>{tr('🚨 Erken Uyarılar')}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
                  {tr('Bu liste, riskli konu oluştuğu anda gönderilen e-posta uyarılarıyla AYNI kaynaktan besleniyor — e-postayı kaçırsanız bile burada görebilirsiniz.')}
                </div>
                {atRisk.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--green)' }}>{tr('✓ Şu an aktif bir erken uyarı yok')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {atRisk.map((t, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: t.riskKind === 'reaktif' ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)', border: `1px solid ${t.riskKind === 'reaktif' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}` }}>
                        <div style={{ fontSize: '18px', flexShrink: 0 }}>{t.riskKind === 'reaktif' ? '⚠️' : '📉'}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '13px', color: t.riskKind === 'reaktif' ? '#dc2626' : '#b45309' }}>{t.topic}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                            {t.riskKind === 'reaktif'
                              ? tr('Son çalışmalar bu konuda desteğe ihtiyaç olduğunu gösteriyor (ilerleme göstergesi %{score}).', { score: t.masteryScore })
                              : tr('Genel durum henüz kritik değil; ancak son çalışmalar aşağı yönlü ilerliyor (ilerleme göstergesi %{score}).', { score: t.masteryScore })}
                          </div>
                          <div style={{ fontSize:'12px', color:'var(--text2)', marginTop:'5px' }}><strong>{tr('Evde destek:')}</strong> {homeSupport(t)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Konu Ustalık Haritası */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px' }}>{tr('🧠 Konu Gelişim Haritası')}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>
                  {tr('Çocuğunuzun zorlandığı konular, son çalışmalar ve tekrar ihtiyacı birlikte değerlendirilir.')}
                </div>
                {selected.topicRisks.length === 0 ? (
                  <div style={{ fontSize: '13px', color: 'var(--green)' }}>{tr('✓ Henüz zorlanılan bir konu yok')}</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                    {selected.topicRisks.map((t, i) => (
                      <div key={i} style={{ padding: '12px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.topic}</div>
                        <div style={{ fontWeight: 800, fontSize: '22px', color: masteryColor(t.masteryScore) }}>%{t.masteryScore}</div>
                        <div style={{ fontSize:'11px', fontWeight:700, color:masteryColor(t.masteryScore), marginTop:2 }}>{progressLabel(t.masteryScore)}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '4px', display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                          <span>{tr('Veri güveni: {level}', { level: levelLabel(t.confidence) })}</span>
                          <span>·</span>
                          <span style={{ color: riskColor[t.forgettingRisk] }}>{tr('Tekrar ihtiyacı: {level}', { level: levelLabel(t.forgettingRisk) })}</span>
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '4px' }}>
                          {tr('{wrong}/{total} yanlış · {when}', { wrong: t.wrongCount, total: t.totalCount, when: timeAgo(selected.weakTopicsRaw[i]?.last_seen_at ?? null) })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Verimli Çalışma Süresi */}
              <div className="card">
                <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '4px' }}>{tr('⏱️ Verimli Çalışma Süresi')}</div>
                {!sd || !sd.hasEnoughData ? (
                  <div style={{ fontSize: '13px', color: 'var(--text3)', lineHeight: 1.6 }}>
                    {tr('Henüz yeterli veri yok ({n} test analiz edildi). {name} yeni testler çözdükçe, kaçıncı sorudan sonra dikkatinin dağılmaya başladığı burada görünecek.', { n: sd?.sessionsAnalyzed ?? 0, name: selected.name })}
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '10px' }}>
                      {tr('Son {n} test incelendi · ortalama soru başına {sec} sn', { n: sd.sessionsAnalyzed, sec: sd.avgTimePerQuestionSec })}
                    </div>
                    {sd.fatigueDetected ? (
                      <div style={{ padding: '10px 12px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '10px', fontSize: '12.5px', color: '#78350f' }}>
                        {tr('📉 Testler genelde {n}. sorudan sonra doğruluk düşüyor.', { n: sd.fatiguePointEstimate })}
                        {sd.recommendedSessionLength && <> {tr('Önerilen: tek seferde {n} soruluk testler.', { n: sd.recommendedSessionLength })}</>}
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--green)' }}>{tr('✓ Belirgin bir yorgunluk paterni tespit edilmedi')}</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        {activeTab === 'archive' && selected && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>
              {tr('📦 {name} — Test Arşivi', { name: selected.name })}
            </h2>
            {selected.sessions.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '40px', marginBottom: '12px' }}>📭</div>
                <div style={{ fontSize: '14px', color: 'var(--text3)' }}>{tr('Henüz test çözülmemiş.')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {selected.sessions.map((s: any) => (
                  <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ width: 52, height: 52, borderRadius: '12px', background: s.pct >= 70 ? 'var(--green-bg)' : s.pct >= 50 ? 'rgba(245,158,11,0.08)' : 'var(--red-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontWeight: 800, fontSize: '16px', color: pctColor(s.pct), lineHeight: 1 }}>%{s.pct}</span>
                      <span style={{ fontSize: '10px', color: pctColor(s.pct), opacity: 0.7, marginTop: '2px' }}>{s.score}/{s.question_count}</span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.topic}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                        {new Date(s.created_at).toLocaleDateString(dateLocale, { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* LEADERBOARD */}
        {activeTab === 'leaderboard' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>{tr('🏆 Genel Sıralama')}</h2>

            {/* Çocuğun sırası */}
            {selected && selected.leaderRank && (
              <div className="card" style={{ marginBottom: '1rem', borderLeft: '3px solid var(--accent)', background: 'var(--accent-bg)' }}>
                <div style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>
                  {tr('{name} — #{rank} sırada ({total} öğrenci arasında)', { name: selected.name, rank: selected.leaderRank, total: selected.leaderTotal ?? 0 })}
                </div>
              </div>
            )}

            {leaderboard.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '13px', color: 'var(--text3)' }}>{tr('Sıralama yükleniyor...')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {leaderboard.map((p: any, idx: number) => {
                  const isChild = children.some(c => c.child_id === p.id)
                  return (
                    <div key={p.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', borderLeft: isChild ? '3px solid var(--accent)' : idx < 3 ? '3px solid' : undefined, borderLeftColor: isChild ? 'var(--accent)' : idx === 0 ? '#F59E0B' : idx === 1 ? '#94A3B8' : '#B45309', background: isChild ? 'var(--accent-bg)' : undefined }}>
                      <div style={{ width: 32, textAlign: 'center', fontSize: idx < 3 ? '20px' : '13px', fontWeight: 700, color: 'var(--text4)', flexShrink: 0 }}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: isChild ? 'var(--accent)' : 'var(--primary)' }}>
                          {p.name} {isChild && '⭐'}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>
                          {tr('{n} test · {grade}', { n: p.totalTests, grade: p.grade ?? '' })}
                        </div>
                      </div>
                      <div style={{ fontWeight: 800, fontSize: '20px', color: pctColor(p.avgPct), flexShrink: 0 }}>
                        %{p.avgPct}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* RAPORLAR */}
        {activeTab === 'reports' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>{tr('📋 Çocuklarımın Raporları')}</h1>
            <ReportsHub scope="parent" gradesEndpoint="/api/parent/reports" sectionalEndpoint="/api/parent/reports" hubEndpoint="/api/parent/reports-hub" />
          </div>
        )}

        {/* ÇOCUK EKLE */}
        {activeTab === 'add' && (
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>{tr('➕ Çocuk Ekle')}</h2>
            <div className="card">
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '14px', lineHeight: 1.6 }}>
                {tr('Çocuğunuzdan Pratium profilindeki Veli Kodunu alın ve buraya girin. (Profil Düzenle → Veli Bağlantısı bölümünden bulabilirler)')}
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input value={addCode} onChange={e => setAddCode(e.target.value)}
                  placeholder={tr('8 haneli veli kodu')}
                  onKeyDown={e => e.key === 'Enter' && addChild()}
                  style={{ flex: 1, padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none' }} />
                <button onClick={addChild} disabled={adding || !addCode.trim()}
                  style={{ padding: '10px 18px', borderRadius: '10px', background: '#082465', color: '#fff', border: 'none', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', opacity: adding ? 0.6 : 1 }}>
                  {adding ? '...' : tr('Ekle')}
                </button>
              </div>
              {addError && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--red)' }}>⚠️ {addError}</div>}
              {addSuccess && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--green)' }}>✅ {addSuccess}</div>}
            </div>

            {/* Mevcut çocuklar */}
            {children.length > 0 && (
              <div className="card" style={{ marginTop: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>{tr('Bağlı Çocuklar')}</div>
                {children.map(c => (
                  <div key={c.child_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '13px' }}>{c.nickname}</div>
                      {c.grade && <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{c.grade}</div>}
                    </div>
                    <button onClick={() => removeChild(c.child_id)} style={{ fontSize: '11px', color: 'var(--red)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                      {tr('Kaldır')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default function ParentPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></main>}>
      <ParentContent />
    </Suspense>
  )
}
