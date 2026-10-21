'use client'
import { useState, useEffect } from 'react'
import LocationSelect from '@/components/LocationSelect'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import GradeImportWizard from '@/components/GradeImportWizard'
import ReportsHub from '@/components/ReportsHub'
import LearningRiskOverview from '@/components/LearningRiskOverview'
import InstitutionComparisons from '@/components/institution/InstitutionComparisons'
import InstitutionTeachers from '@/components/institution/InstitutionTeachers'
import { gradeLabel } from '@/lib/i18n/grade'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'
import PanelLanguageSwitch from '@/components/PanelLanguageSwitch'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'

const GRADES = [
  { value: 'ilkokul 1. sinif', label: 'İlkokul 1. Sınıf' },
  { value: 'ilkokul 2. sinif', label: 'İlkokul 2. Sınıf' },
  { value: 'ilkokul 3. sinif', label: 'İlkokul 3. Sınıf' },
  { value: 'ilkokul 4. sinif', label: 'İlkokul 4. Sınıf' },
  { value: 'ortaokul 5. sinif', label: 'Ortaokul 5. Sınıf' },
  { value: 'ortaokul 6. sinif', label: 'Ortaokul 6. Sınıf' },
  { value: 'ortaokul 7. sinif', label: 'Ortaokul 7. Sınıf' },
  { value: 'ortaokul 8. sinif', label: 'Ortaokul 8. Sınıf' },
  { value: 'lise 9. sinif', label: 'Lise 9. Sınıf' },
  { value: 'lise 10. sinif', label: 'Lise 10. Sınıf' },
  { value: 'lise 11. sinif', label: 'Lise 11. Sınıf' },
  { value: 'lise 12. sinif', label: 'Lise 12. Sınıf' },
]

function gradeOptionLabel(value: string, tr: (text: string, params?: Record<string, string | number>) => string): string {
  const [level, num] = value.split(' ')
  const n = parseInt(num)
  return tr(level === 'ilkokul' ? 'İlkokul {n}. Sınıf' : level === 'ortaokul' ? 'Ortaokul {n}. Sınıf' : 'Lise {n}. Sınıf', { n })
}

export default function InstitutionPage() {
  const { t: tr, locale } = useT()
  const dateLocale = intlLocale(locale)
  const [institution, setInstitution] = useState<any>(null)
  const [instLoc, setInstLoc] = useState({ country: '', state: '', city: '' })
  const [locSaving, setLocSaving] = useState(false)
  const [locMsg, setLocMsg] = useState('')
  const [students, setStudents] = useState<any[]>([])
  const [analytics, setAnalytics] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'students' | 'teachers' | 'analytics' | 'risk' | 'import' | 'reports' | 'profile'>('overview')
  const [sortBy, setSortBy] = useState<'name' | 'avgPct' | 'totalTests' | 'streak'>('avgPct')
  const [regenerating, setRegenerating] = useState(false)
  const [regenMsg, setRegenMsg] = useState('')
  const [linkCopied, setLinkCopied] = useState(false)

  // Öğrenci kaydı (kurum tarafından dogrudan hesap acma)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [asName, setAsName] = useState('')
  const [asSurname, setAsSurname] = useState('')
  const [asEmail, setAsEmail] = useState('')
  const [asAge, setAsAge] = useState('')
  const [asGrade, setAsGrade] = useState('')
  const [asClassNumber, setAsClassNumber] = useState('')
  const [asParentEmail, setAsParentEmail] = useState('')
  const [asPhone, setAsPhone] = useState('')
  const [asLoading, setAsLoading] = useState(false)
  const [asError, setAsError] = useState('')
  const [asCreated, setAsCreated] = useState<{ email: string; password: string } | null>(null)

  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login/institution'); return }

    const { data: { session } } = await supabase.auth.getSession()
    const checkRes = await fetch('/api/institution/check-admin', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const checkJson = await checkRes.json()
    if (!checkJson.isAdmin) { router.push('/login/institution'); return }

    const instRes = await fetch('/api/institution/data', {
      headers: { 'Authorization': `Bearer ${session?.access_token}` }
    })
    const instJson = await instRes.json()
    if (!instJson.institution) { router.push('/login/institution'); return }

    setInstitution(instJson.institution)
    setInstLoc({ country: instJson.institution.country || '', state: instJson.institution.state || '', city: instJson.institution.city || '' })
    const studentData = instJson.students || []
    setStudents(studentData)
    setAnalytics(instJson.analytics || null)

    const active = studentData.filter((s: any) => s.totalTests > 0)
    const overallAvg = active.length
      ? Math.round(active.reduce((a: number, s: any) => a + (s.avgPct ?? 0), 0) / active.length) : 0
    setStats({
      total: studentData.length,
      active: active.length,
      overallAvg,
      topStreaker: [...studentData].sort((a: any, b: any) => b.streak - a.streak)[0],
      topScorer: [...studentData].sort((a: any, b: any) => (b.avgPct ?? 0) - (a.avgPct ?? 0))[0],
    })
    setLoading(false)
  }

  async function handleAddStudent() {
    if (!asName.trim() || !asSurname.trim()) { setAsError(tr('Ad ve soyad zorunludur.')); return }
    if (!asEmail.trim()) { setAsError(tr('E-posta zorunludur.')); return }
    if (!asGrade) { setAsError(tr('Sınıf zorunludur.')); return }
    if (asAge && (parseInt(asAge) < 5 || parseInt(asAge) > 35)) { setAsError(tr('Geçerli bir yaş girin (5-35).')); return }

    setAsError(''); setAsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/institution/create-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          fullName: `${asName.trim()} ${asSurname.trim()}`,
          email: asEmail.trim(),
          age: asAge || undefined,
          grade: asGrade,
          classNumber: asClassNumber,
          parentEmail: asParentEmail,
          phone: asPhone,
        }),
      })
      let data: any = null
      try { data = await res.json() } catch { /* 5xx bazen JSON degil */ }
      if (!res.ok) { setAsError(data?.error || tr('Kayıt oluşturulamadı. Lütfen tekrar dene.')); return }

      setAsCreated({ email: data.email, password: data.password })
      // Formu temizle ama basari kartini gostermeye devam et
      setAsName(''); setAsSurname(''); setAsEmail(''); setAsAge(''); setAsGrade('')
      setAsClassNumber(''); setAsParentEmail(''); setAsPhone('')
      load() // ogrenci listesini tazele
    } catch (e: any) {
      console.error('[handleAddStudent] beklenmeyen hata:', e)
      setAsError(tr('Beklenmeyen bir hata oluştu. Lütfen tekrar dene.'))
    } finally {
      setAsLoading(false)
    }
  }

  async function saveInstitutionLocation() {
    if (!instLoc.country || !instLoc.state.trim() || !instLoc.city.trim()) { setLocMsg('❌ ' + tr('Ülke, eyalet/il ve şehir/ilçe zorunludur.')); return }
    setLocSaving(true); setLocMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/institution/location', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(instLoc),
      })
      if (!res.ok) throw new Error('save failed')
      setInstitution((prev: any) => ({ ...prev, ...instLoc }))
      setLocMsg('✅ ' + tr('Konum kaydedildi.'))
    } catch {
      setLocMsg('❌ ' + tr('Konum kaydedilemedi. Lütfen tekrar deneyin.'))
    } finally {
      setLocSaving(false)
      setTimeout(() => setLocMsg(''), 4000)
    }
  }

  async function regenerateCode() {
    const hasExisting = !!institution?.code
    if (hasExisting) {
      const confirmed = window.confirm(
        tr('Yeni bir davet kodu oluşturursan mevcut kod ({code}) artık geçersiz olur — bu kodu paylaştığın öğrenciler yeni kayıt için yeni kodu kullanmalı. Zaten kayıtlı öğrenciler etkilenmez. Devam edilsin mi?', { code: institution.code })
      )
      if (!confirmed) return
    }
    setRegenerating(true)
    setRegenMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/institution/regenerate-code', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || tr('Kod oluşturulamadı.'))
      setInstitution((prev: any) => ({ ...prev, code: json.code }))
      setRegenMsg(tr('✅ Yeni davet kodu oluşturuldu.'))
    } catch (e: any) {
      setRegenMsg('❌ ' + (e.message || tr('Kod oluşturulamadı.')))
    } finally {
      setRegenerating(false)
      setTimeout(() => setRegenMsg(''), 4000)
    }
  }

  // Davet kodunu doğrudan kayıt ekranına yönlendiren link — QR kod ve
  // "linki kopyala" butonu bunu kullanıyor. register/page.tsx bu ?kurum=
  // parametresini okuyup kodu otomatik doğruluyor ve öğrenciyi kayıt
  // adımına götürüyor (rol seçimini atlıyor).
  const registerLink = institution?.code
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://www.pratium.com'}/register?kurum=${institution.code}`
    : ''

  function copyRegisterLink() {
    if (!registerLink) return
    navigator.clipboard.writeText(registerLink).then(() => {
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    })
  }

  function pctColor(pct: number | null) {
    if (pct === null) return 'var(--text4)'
    if (pct >= 70) return '#16a34a'
    if (pct >= 50) return '#d97706'
    return '#dc2626'
  }

  const filtered = students
    .filter(s => !search || s.name?.toLowerCase().includes(search.toLowerCase()) || s.grade?.toLowerCase().includes(search.toLowerCase()))
    .sort((a: any, b: any) => {
      if (sortBy === 'name') return a.name?.localeCompare(b.name)
      if (sortBy === 'avgPct') return (b.avgPct ?? -1) - (a.avgPct ?? -1)
      if (sortBy === 'totalTests') return b.totalTests - a.totalTests
      if (sortBy === 'streak') return b.streak - a.streak
      return 0
    })

  const leaderboard = [...students].filter(s => s.totalTests > 0).sort((a, b) => (b.avgPct ?? 0) - (a.avgPct ?? 0))

  const TABS = [
    { key: 'overview',   label: tr('📊 Genel Bakış') },
    { key: 'students',   label: tr('👥 Öğrenciler') },
    { key: 'teachers',   label: tr('👩‍🏫 Öğretmenlerimiz') },
    { key: 'analytics',  label: tr('📈 Analitik') },
    { key: 'risk',       label: `${tr('⚠️ Risk')}${analytics?.riskStudents?.length ? ` (${analytics.riskStudents.length})` : ''}` },
    { key: 'reports',    label: tr('📋 RAPORLAR') },
    { key: 'import',     label: tr('📥 Not İçe Aktar') },
    { key: 'profile',    label: tr('⚙️ Profil') },
  ]

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div className="spinner" />
    </main>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Navbar */}
      <nav style={{ background: '#29483d', padding: '0 1.5rem', height: '68px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, gap: '12px', boxShadow: '0 8px 24px rgba(41,72,61,0.15)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
          <img src="/pratium-logo-new.svg" alt="Pratium" style={{ height: '28px', filter: 'brightness(0) invert(1)' }} />
          <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: 500 }}>🏛️ {institution?.name}</span>
        </div>
        <div className="nav-scroll-x" style={{ display: 'flex', gap: '4px', alignItems: 'center', flex: 1, minWidth: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key as any)}
              style={{ padding: '6px 10px', borderRadius: '8px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', flexShrink: 0, transition: 'all 0.15s',
                background: activeTab === t.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: activeTab === t.key ? '#fff' : 'rgba(255,255,255,0.6)',
              }}>
              {t.label}
            </button>
          ))}
          <Link href="/institution/integrations"
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', fontSize: '12px', fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {tr('🔌 Entegrasyonlar')}
          </Link>
          <PanelLanguageSwitch />
          <button onClick={() => { supabase.auth.signOut(); router.push('/login') }}
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-sans)', marginLeft: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
            {tr('Çıkış')}
          </button>
        </div>
      </nav>

      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '1.5rem', paddingBottom: '5rem' }}>

        {/* ── GENEL BAKIŞ ─────────────────────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>
              {tr('Kurum Paneli')}
            </h1>

            {/* KPI Kartları */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginBottom: '1.5rem' }}>
              {[
                { icon: '👥', label: tr('Kayıtlı'), value: stats?.total ?? 0, color: '#6366f1' },
                { icon: '⚡', label: tr('Aktif'), value: stats?.active ?? 0, color: '#0891b2', sub: tr('test çözdü') },
                { icon: '📊', label: tr('Ort. Başarı'), value: stats?.overallAvg ? `%${stats.overallAvg}` : '—', color: pctColor(stats?.overallAvg) },
                { icon: '📝', label: tr('Bu Hafta'), value: analytics?.thisWeekTests ?? 0, color: '#7c3aed', sub: tr('önceki: {n}', { n: analytics?.prevWeekTests ?? 0 }) },
                { icon: '⚠️', label: tr('Risk'), value: analytics?.riskStudents?.length ?? 0, color: '#dc2626', sub: tr('öğrenci') },
              ].map((s, i) => (
                <div key={i} className="card" style={{ textAlign: 'center', padding: '14px 10px', cursor: s.label === tr('Risk') ? 'pointer' : undefined }}
                  onClick={() => s.label === tr('Risk') && setActiveTab('risk')}>
                  <div style={{ fontSize: '22px', marginBottom: '4px' }}>{s.icon}</div>
                  <div style={{ fontWeight: 800, fontSize: '20px', color: s.color }}>{s.value}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px' }}>{s.label}</div>
                  {s.sub && <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '1px' }}>{s.sub}</div>}
                </div>
              ))}
            </div>

            {/* Kurum öğrenme içgörüsü: karar desteği, öğrenci PII'si göstermeden */}
            <div className="card" style={{ marginBottom: '1rem', background: 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(30,207,184,0.07))' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 800, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{tr('Kurum öğrenme içgörüsü')}</div>
                  <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary)', marginTop: '4px' }}>{tr('Bu hafta hangi aksiyon öncelikli?')}</div>
                </div>
                <span style={{ fontSize: '22px' }}>🏫</span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: 1.6 }}>
                {(analytics?.riskStudents?.length ?? 0) > 0
                  ? tr('{n} öğrencide erken destek sinyali var. İlgili öğretmenlerle kısa bir konu bazlı tekrar planı oluşturun.', { n: analytics.riskStudents.length })
                  : (stats?.active ?? 0) > 0
                    ? tr('{n} aktif öğrencinin kurum ortalaması {avg}. Sınıflar arasında konu bazlı farklılıkları analiz ederek ortak destek materyali planlayın.', { n: stats.active, avg: stats.overallAvg ? `%${stats.overallAvg}` : tr('hesaplanıyor') })
                    : tr('Henüz yeterli performans verisi oluşmadı. Öğrencilerin ilk testlerini tamamlamasını bekleyin.')}
              </div>
            </div>

            {/* Haftalık Trend Mini */}
            {analytics?.weeklyTrend && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>{tr('📈 Haftalık Test Trendi')}</div>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={analytics.weeklyTrend}>
                    <defs>
                      <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                    <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="tests" name={tr('Test Sayısı')} stroke="#6366f1" fill="url(#trendGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Top 5 Liderlik */}
            <div className="card">
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>{tr('🏆 Top 5 Öğrenci')}</div>
              {leaderboard.slice(0, 5).map((s: any, i: number) => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <div style={{ fontSize: i < 3 ? '18px' : '13px', fontWeight: 700, width: 28, textAlign: 'center', color: 'var(--text3)' }}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}
                  </div>
                  <div style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--primary)' }}>{s.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)' }}>{gradeLabel(s.grade, tr)}</div>
                  <div style={{ fontWeight: 800, fontSize: '15px', color: pctColor(s.avgPct) }}>%{s.avgPct}</div>
                </div>
              ))}
              {leaderboard.length === 0 && <div style={{ fontSize: '13px', color: 'var(--text3)', textAlign: 'center', padding: '1rem' }}>{tr('Henüz test çözen öğrenci yok.')}</div>}
            </div>
          </div>
        )}

        {/* ── ÖĞRENCİLER ─────────────────────────────────────────────────── */}
        {activeTab === 'students' && (
          <div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', flex: 1 }}>{tr('👥 Öğrenciler')}</h1>
              <button onClick={() => { setShowAddStudent(v => !v); setAsCreated(null); setAsError('') }}
                style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
                {showAddStudent ? tr('✕ Kapat') : tr('➕ Öğrenci Kaydet')}
              </button>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                style={{ padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '12px', fontFamily: 'var(--font-sans)' }}>
                <option value="avgPct">{tr('Başarıya Göre')}</option>
                <option value="totalTests">{tr('Test Sayısına Göre')}</option>
                <option value="streak">{tr('Seriye Göre')}</option>
                <option value="name">{tr('İsme Göre')}</option>
              </select>
            </div>

            {showAddStudent && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                {asCreated ? (
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <div style={{ fontSize: '40px', marginBottom: '8px' }}>✅</div>
                    <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--primary)', marginBottom: '4px' }}>
                      {tr('Öğrenci hesabı oluşturuldu!')}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '14px' }}>
                      {tr('Bu bilgileri öğrenciyle paylaş — giriş yaptıktan sonra şifresini değiştirebilir.')}
                    </div>
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', textAlign: 'left', maxWidth: '320px', margin: '0 auto' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '2px' }}>{tr('E-posta')}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '10px' }}>{asCreated.email}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '2px' }}>{tr('Geçici Şifre')}</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 700, color: 'var(--primary)' }}>{asCreated.password}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '14px' }}>
                      <button onClick={() => {
                        navigator.clipboard.writeText(tr('E-posta: {email}', { email: asCreated.email }) + '\n' + tr('Şifre: {password}', { password: asCreated.password }))
                        setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000)
                      }}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {linkCopied ? tr('✓ Kopyalandı') : tr('📋 Kopyala')}
                      </button>
                      <button onClick={() => setAsCreated(null)}
                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                        {tr('+ Başka Öğrenci Ekle')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '10px' }}>{tr('Yeni Öğrenci Kaydı')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div>
                        <label className="field-label">{tr('Ad *')}</label>
                        <input className="input" value={asName} onChange={e => setAsName(e.target.value)} placeholder="Ahmet" />
                      </div>
                      <div>
                        <label className="field-label">{tr('Soyad *')}</label>
                        <input className="input" value={asSurname} onChange={e => setAsSurname(e.target.value)} placeholder="Yılmaz" />
                      </div>
                      <div>
                        <label className="field-label">{tr('Yaş')}</label>
                        <input className="input" type="number" value={asAge} onChange={e => setAsAge(e.target.value)} placeholder="14" />
                      </div>
                      <div>
                        <label className="field-label">{tr('Sınıf *')}</label>
                        <select className="input" value={asGrade} onChange={e => setAsGrade(e.target.value)} style={{ cursor: 'pointer' }}>
                          <option value="">{tr('Seç...')}</option>
                          {GRADES.map(g => <option key={g.value} value={g.value}>{gradeOptionLabel(g.value, tr)}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="field-label">{tr('Sınıf Numarası')}</label>
                        <input className="input" value={asClassNumber} onChange={e => setAsClassNumber(e.target.value)} placeholder={tr('Örn: 14')} />
                      </div>
                      <div>
                        <label className="field-label">{tr('E-posta *')}</label>
                        <input className="input" type="email" value={asEmail} onChange={e => setAsEmail(e.target.value)} placeholder="ogrenci@mail.com" />
                      </div>
                      <div>
                        <label className="field-label">{tr('Veli E-postası (Opsiyonel)')}</label>
                        <input className="input" type="email" value={asParentEmail} onChange={e => setAsParentEmail(e.target.value)} placeholder="veli@mail.com" />
                      </div>
                      <div>
                        <label className="field-label">{tr('Telefon (Opsiyonel)')}</label>
                        <input className="input" type="tel" value={asPhone} onChange={e => setAsPhone(e.target.value)} placeholder="05xx xxx xx xx" />
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', margin: '8px 0 12px' }}>
                      {tr('Hesap otomatik olarak onaylı oluşturulur — öğrencinin e-posta doğrulaması yapmasına gerek yok. Okul adı ({name}) otomatik atanır.', { name: institution?.name ?? '' })}
                    </div>
                    {asError && <div style={{ padding: '10px 12px', background: 'var(--red-bg)', borderRadius: '9px', fontSize: '13px', color: 'var(--red)', marginBottom: '10px' }}>{asError}</div>}
                    <button onClick={handleAddStudent} disabled={asLoading}
                      style={{ width: '100%', padding: '11px', borderRadius: '10px', border: 'none', background: asLoading ? 'var(--bg2)' : '#6366f1', color: asLoading ? 'var(--text3)' : '#fff', fontSize: '14px', fontWeight: 700, cursor: asLoading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-sans)' }}>
                      {asLoading ? tr('Oluşturuluyor...') : tr('Öğrenci Hesabı Oluştur →')}
                    </button>
                  </>
                )}
              </div>
            )}
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder={tr('🔍 Öğrenci veya sınıf ara...')}
              style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--bg2)', color: 'var(--primary)', fontSize: '13px', fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box', marginBottom: '1rem' }} />

            {filtered.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>👥</div>
                <div style={{ fontSize: '14px', color: 'var(--text2)', fontWeight: 600 }}>
                  {students.length === 0 ? tr('Henüz kayıtlı öğrenci yok') : tr('Sonuç bulunamadı')}
                </div>
                {students.length === 0 && (
                  <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '8px', lineHeight: 1.6 }}>
                    {institution?.code ? (
                      <>
                        {tr('Kurum kodunu paylaşın:')}<br />
                        <strong style={{ fontFamily: 'monospace', fontSize: '20px', color: '#6366f1', letterSpacing: '0.1em' }}>{institution.code}</strong>
                      </>
                    ) : (
                      <>
                        {tr('Henüz bir davet kodunuz yok.')}<br />
                        <button onClick={() => setActiveTab('profile')}
                          style={{ marginTop: '8px', padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#6366f1', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                          {tr('✨ Profil sekmesinden oluştur')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {filtered.map((s: any) => (
                  <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #082465, #1ECFB8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '13px', flexShrink: 0, overflow: 'hidden' }}>
                      {s.avatar_url ? <img src={s.avatar_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : s.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)' }}>{s.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {s.grade && <span>📚 {gradeLabel(s.grade, tr)}</span>}
                        <span>{tr('📝 {n} test', { n: s.totalTests })}</span>
                        {s.streak > 0 && <span>{tr('🔥 {n} gün', { n: s.streak })}</span>}
                        {s.weeklyTests > 0 && <span style={{ color: '#16a34a' }}>{tr('+{n} bu hafta', { n: s.weeklyTests })}</span>}
                        <span style={{ color: 'var(--text4)', fontSize: '10px' }}>
                          {s.lastActive ? tr('Son: {date}‖aktivite', { date: new Date(s.lastActive).toLocaleDateString(dateLocale) }) : tr('Aktif değil')}
                        </span>
                      </div>
                      {s.weakTopics?.length > 0 && (
                        <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {s.weakTopics.map((t: any) => (
                            <span key={t.topic} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(220,38,38,0.08)', color: '#dc2626', border: '1px solid rgba(220,38,38,0.15)' }}>
                              ⚠️ {tr(t.topic).slice(0, 12)} %{t.avg}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '20px', color: pctColor(s.avgPct) }}>
                        {s.avgPct !== null ? `%${s.avgPct}` : '—'}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text4)' }}>{tr('ortalama')}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ANALİTİK ────────────────────────────────────────────────────── */}
        {activeTab === 'analytics' && analytics && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>{tr('📈 Detaylı Analitik')}</h1>
            <InstitutionComparisons />

            {/* Sınıf bazlı kırılım */}
            {analytics.gradeBreakdown?.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>{tr('📚 Sınıf Bazlı Başarı')}</div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={analytics.gradeBreakdown} barSize={32}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="grade" tickFormatter={(v: any) => gradeLabel(String(v), tr)} tick={{ fontSize: 11, fill: "var(--text3)" }} />
                    <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} domain={[0, 100]} unit="%" />
                    <Tooltip formatter={(v: any) => [`%${v}`, tr('Ortalama')]} contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="avgPct" name={tr('Ortalama')} radius={[6, 6, 0, 0]}>
                      {analytics.gradeBreakdown.map((entry: any, i: number) => (
                        <Cell key={i} fill={entry.avgPct >= 70 ? '#16a34a' : entry.avgPct >= 50 ? '#d97706' : '#dc2626'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                  {analytics.gradeBreakdown.map((g: any) => (
                    <div key={g.grade} style={{ padding: '6px 10px', borderRadius: '8px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '12px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{gradeLabel(g.grade, tr)}</span>
                      <span style={{ color: 'var(--text3)', marginLeft: '6px' }}>{tr('{n} öğrenci · {tests} test', { n: g.count, tests: g.tests })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Haftalık test trendi */}
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>{tr('📈 8 Haftalık Test & Başarı Trendi')}</div>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={analytics.weeklyTrend}>
                  <defs>
                    <linearGradient id="testGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="pctGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#16a34a" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                  <YAxis tick={{ fontSize: 10, fill: 'var(--text3)' }} />
                  <Tooltip contentStyle={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="tests" name={tr('Test Sayısı')} stroke="#6366f1" fill="url(#testGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="avgPct" name={tr('Ortalama %')} stroke="#16a34a" fill="url(#pctGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Konu haritası */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#dc2626', marginBottom: '12px' }}>{tr('⚠️ Zayıf Konular')}</div>
                {analytics.weakTopics?.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{tr('Zayıf konu yok! 🎉')}</div>}
                {analytics.weakTopics?.map((t: any, i: number) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 500 }}>{tr(t.topic)}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#dc2626' }}>%{t.avg}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.avg}%`, background: '#dc2626', borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '2px' }}>{tr('{n} test', { n: t.count })}</div>
                  </div>
                ))}
              </div>

              <div className="card">
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#16a34a', marginBottom: '12px' }}>{tr('✅ Güçlü Konular')}</div>
                {analytics.strongTopics?.length === 0 && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{tr('Henüz yeterli veri yok.')}</div>}
                {analytics.strongTopics?.map((t: any, i: number) => (
                  <div key={i} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--primary)', fontWeight: 500 }}>{tr(t.topic)}</span>
                      <span style={{ fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>%{t.avg}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${t.avg}%`, background: '#16a34a', borderRadius: 99 }} />
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text4)', marginTop: '2px' }}>{tr('{n} test', { n: t.count })}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── KURUM ÖĞRETMENLERİ ─────────────────────────────────────────── */}
        {activeTab === 'teachers' && <InstitutionTeachers />}
        {/* ── RİSK ALARMI ─────────────────────────────────────────────────── */}
        {activeTab === 'risk' && (
          <div>
            <LearningRiskOverview endpoint="/api/institution/learning-risk" title={tr('Kurum erken uyarıları')} />
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '4px' }}>{tr('⚠️ Risk Alarmı')}</h1>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '1.25rem' }}>
              {tr('7+ gün aktif olmayan veya ortalaması %40 altında olan öğrenciler')}
            </p>

            {!analytics?.riskStudents?.length ? (
              <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>✅</div>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--primary)' }}>{tr('Risk altında öğrenci yok!')}</div>
                <div style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '8px' }}>{tr('Tüm öğrenciler aktif ve başarılı görünüyor.')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analytics.riskStudents.map((s: any) => {
                  const daysSince = s.lastActive
                    ? Math.floor((Date.now() - new Date(s.lastActive).getTime()) / 86400000)
                    : null
                  return (
                    <div key={s.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', borderLeft: '3px solid #dc2626' }}>
                      <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #dc2626, #ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: '14px', flexShrink: 0 }}>
                        {s.name?.slice(0, 2).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--primary)' }}>{s.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {s.grade && <span>📚 {gradeLabel(s.grade, tr)}</span>}
                          {s.reason === 'inactive'
                            ? <span style={{ color: '#d97706' }}>⏰ {daysSince !== null ? tr('{n} gündür aktif değil', { n: daysSince }) : tr('Hiç aktif olmadı')}</span>
                            : <span style={{ color: '#dc2626' }}>📉 {tr('Ortalama %{n}', { n: s.avgPct })}</span>
                          }
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: '18px', color: pctColor(s.avgPct) }}>
                          {s.avgPct !== null ? `%${s.avgPct}` : '—'}
                        </div>
                        <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600, marginTop: '2px' }}>
                          {s.reason === 'inactive' ? tr('İnaktif') : tr('Düşük Puan')}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── RAPORLAR ────────────────────────────────────────────────────── */}
        {activeTab === 'reports' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>{tr('📋 Raporlar')}</h1>
            <ReportsHub scope="institution" gradesEndpoint="/api/institution/reports" sectionalEndpoint="/api/institution/reports" hubEndpoint="/api/institution/reports-hub" />
          </div>
        )}

        {/* ── NOT İÇE AKTAR ───────────────────────────────────────────────── */}
        {activeTab === 'import' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>{tr('📥 Not / Veri İçe Aktar')}</h1>
            <p style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1.25rem' }}>
              {tr('MOZAİK, e-Okul veya kendi hazırladığın Excel/CSV dosyalarındaki öğrenci numarası, sınıf, isim ve ders notlarını kuruma kayıtlı öğrencilerle eşleştirip içeri aktar.')}
            </p>
            <GradeImportWizard scope="institution" rosterEndpoint="/api/institution/students-roster" commitEndpoint="/api/institution/import-grades" />
          </div>
        )}

        {/* ── PROFİL ──────────────────────────────────────────────────────── */}
        {activeTab === 'profile' && (
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--primary)', marginBottom: '1.25rem' }}>{tr('⚙️ Kurum Profili')}</h1>
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '1rem' }}>{tr('🏛️ Kurum Bilgileri')}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '13px' }}>
                {[
                  { label: tr('Kurum Adı'), value: institution?.name },
                  { label: tr('Kurum Kodu'), value: institution?.code, mono: true },
                  { label: tr('E-posta'), value: institution?.admin_email },
                  { label: tr('İndirim Oranı'), value: institution?.discount_rate ? `%${institution.discount_rate}` : tr('Yok') },
                  { label: tr('Durum'), value: institution?.active ? tr('✅ Aktif') : tr('🔴 Pasif') },
                  { label: tr('Kayıt Tarihi'), value: institution?.created_at ? new Date(institution.created_at).toLocaleDateString(dateLocale) : '—' },
                  ...(institution?.sellers ? [{ label: tr('Satıcı'), value: `${institution.sellers.full_name} (${institution.sellers.code})` }] : []),
                ].map((item, i) => (
                  <div key={i} style={{ padding: '10px 14px', background: 'var(--bg2)', borderRadius: '10px' }}>
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '4px', fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontWeight: 600, color: 'var(--primary)', fontFamily: (item as any).mono ? 'monospace' : undefined }}>
                      {item.value || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '8px' }}>{tr('📋 Kurum Davet Kodu ve Linki')}</div>
              <div style={{ padding: '20px', background: 'var(--bg2)', borderRadius: '12px', display: 'flex', gap: '24px', alignItems: 'center', flexWrap: 'wrap' }}>

                {/* Sol: QR kod — kayıt linkine bağlı, doğrudan taranarak açılır */}
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  {institution?.code ? (
                    <>
                      <div style={{ padding: '10px', background: '#fff', borderRadius: '14px', display: 'inline-block', boxShadow: '0 2px 10px rgba(0,0,0,0.08)' }}>
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&color=082465&bgcolor=ffffff&data=${encodeURIComponent(registerLink)}`}
                          alt={tr('{name} kayıt QR kodu', { name: institution.name })}
                          width={160} height={160}
                          style={{ display: 'block' }}
                        />
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '8px', maxWidth: '180px' }}>
                        {tr('Öğrenciler telefonla okutunca doğrudan kurumunuza bağlı kayıt ekranı açılır')}
                      </div>
                    </>
                  ) : (
                    <div style={{ width: 160, height: 160, borderRadius: '14px', background: '#fff', border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: 'var(--text3)', textAlign: 'center', padding: '10px' }}>
                      {tr('Kod oluşturunca QR burada görünecek')}
                    </div>
                  )}
                </div>

                {/* Sağ: kod, link ve işlemler */}
                <div style={{ flex: 1, minWidth: '220px', textAlign: 'center' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px' }}>{tr('Öğrenciler kayıt sırasında bu kodu kullanacak')}</div>
                  {institution?.code ? (
                    <div style={{ fontFamily: 'monospace', fontSize: '32px', fontWeight: 900, color: '#6366f1', letterSpacing: '0.15em' }}>{institution.code}</div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic' }}>{tr('Henüz davet kodu oluşturulmadı')}</div>
                  )}

                  {institution?.code && (
                    <div style={{ marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', flexWrap: 'wrap' }}>
                      <code style={{ fontSize: '11px', color: 'var(--text2)', background: '#fff', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border)', wordBreak: 'break-all' }}>
                        {registerLink}
                      </code>
                      <button onClick={copyRegisterLink}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: '#fff', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
                        {linkCopied ? tr('✅ Kopyalandı') : tr('🔗 Linki Kopyala')}
                      </button>
                    </div>
                  )}

                  <button onClick={regenerateCode} disabled={regenerating}
                    style={{
                      marginTop: '16px', padding: '10px 20px', borderRadius: '10px', border: 'none',
                      background: regenerating ? 'var(--border)' : '#6366f1', color: '#fff',
                      fontSize: '13px', fontWeight: 700, cursor: regenerating ? 'default' : 'pointer',
                      fontFamily: 'var(--font-sans)', display: 'inline-flex', alignItems: 'center', gap: '8px',
                    }}>
                    {regenerating ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (institution?.code ? '🔄' : '✨')}
                    {institution?.code ? tr('Yeni Kod Oluştur') : tr('Davet Kodu Oluştur')}
                  </button>
                  {regenMsg && (
                    <div style={{ fontSize: '12px', marginTop: '10px', color: regenMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>
                      {regenMsg}
                    </div>
                  )}
                  <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '10px', lineHeight: 1.5 }}>
                    {tr('Bu kod (veya QR / link) ile kayıt olan tüm öğrenciler otomatik olarak kurumunuzun öğrenci listesine eklenir.')}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ marginTop: '16px', padding: '1.25rem', background: '#fff', borderRadius: '16px', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--primary)', marginBottom: '4px' }}>📍 {tr('Kurum konumu')}</div>
              {institution && !institution.state && (
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px' }}>{tr('Kurumunuzun il/ilçe bilgisi eksik. Tamamlamanız önerilir.')}</div>
              )}
              <LocationSelect value={instLoc} onChange={next => setInstLoc(prev => ({ ...prev, ...next }))} />
              <button onClick={saveInstitutionLocation} disabled={locSaving}
                style={{ marginTop: '12px', padding: '10px 20px', borderRadius: '10px', border: 'none', background: locSaving ? 'var(--border)' : '#6366f1', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: locSaving ? 'default' : 'pointer', fontFamily: 'var(--font-sans)' }}>
                {tr('Konumu kaydet')}
              </button>
              {locMsg && <div style={{ fontSize: '12px', marginTop: '10px', color: locMsg.startsWith('✅') ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{locMsg}</div>}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
