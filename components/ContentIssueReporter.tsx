'use client'
// components/ContentIssueReporter.tsx
//
// 18 Ağustos 2026 — Madde 2 (pratium-bekleyen-isler-uygulama-plani.md):
// "Öğretmen geri bildirim döngüsünün resmileştirilmesi". Önceden hata
// bildirme sadece öğrenciye özgüydü (components/QuizResult.tsx'teki
// reportError() — quiz sonuç ekranındaki "bu soruyu bildir" butonu).
// Öğretmenler bugüne kadar ekran görüntüsü + WhatsApp/e-posta ile
// bildiriyordu, admin elle DB'den araştırıyordu.
//
// Bu bileşen İKİ İŞİ birden yapar (aynı öğretmen/öğrenci genel bildirim
// akışını paylaşabilsinler diye):
//   1. Yeni bir içerik hatası bildirme formu (belirli bir soruya bağlı
//      olmak ZORUNDA değil — öğretmen bir konu/kaynak hakkında genel bir
//      sorun da bildirebilir, quiz sonuç ekranındaki gibi tek bir soruya
//      bağlı olmayabilir).
//   2. "Bildirdiklerim" — kullanıcının kendi bildirdiği (reporter_role
//      fark etmeksizin, hem öğrenci hem öğretmen bildirimleri dahil, RLS
//      zaten sadece kendi user_id'sine ait satırları döndürür) satırların
//      durumunu (status) ve varsa admin'in yazdığı kök nedeni (root_cause)
//      gösteren salt-okunur bir liste — "bildirdiğim hata düzeltildi"
//      görünürlüğü, öğretmen/öğrenci güvenini inşa etmesi için.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface MyReport {
  id: string
  question_text: string
  topic: string
  status: string
  root_cause: string | null
  admin_note: string | null
  reported_at: string
}

export default function ContentIssueReporter({ reporterRole }: { reporterRole: 'teacher' | 'student' }) {
  const supabase = createClient() as any
  const [topic, setTopic] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState('')
  const [myReports, setMyReports] = useState<MyReport[]>([])
  const [loadingReports, setLoadingReports] = useState(true)

  useEffect(() => { loadMyReports() }, [])

  async function loadMyReports() {
    setLoadingReports(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoadingReports(false); return }
    const { data } = await supabase
      .from('error_reports')
      .select('id, question_text, topic, status, root_cause, admin_note, reported_at')
      .eq('user_id', user.id)
      .order('reported_at', { ascending: false })
      .limit(20)
    setMyReports(data || [])
    setLoadingReports(false)
  }

  async function submit() {
    if (!description.trim()) { setMsg('❌ Açıklama gerekli.'); return }
    setSubmitting(true)
    setMsg('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('error_reports').insert({
        user_id: user?.id || null,
        question_text: description.trim(),
        correct_answer: null,
        user_answer: null,
        topic: topic.trim() || 'Genel',
        status: 'pending',
        source: reporterRole === 'teacher' ? 'teacher' : 'student',
        reporter_role: reporterRole,
      })
      if (error) throw error
      setMsg('✅ Bildirdiğin için teşekkürler — admin en kısa sürede inceleyecek.')
      setTopic('')
      setDescription('')
      loadMyReports()
    } catch (e: any) {
      setMsg(`❌ ${e.message || 'Bildirim gönderilemedi.'}`)
    } finally {
      setSubmitting(false)
    }
  }

  const statusLabel = (s: string) => s === 'pending' ? '⏳ Bekliyor' : s === 'confirmed' ? '✓ Onaylandı (düzeltiliyor/düzeltildi)' : s === 'rejected' ? '✗ İncelendi (sorun bulunmadı)' : s

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)', marginBottom: '10px' }}>
          🔧 İçerik/Soru Hatası Bildir
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '12px' }}>
          Bir soruda, kaynakta ya da konu anlatımında sorun mu fark ettin? Ekran görüntüsü/WhatsApp yerine
          artık doğrudan buradan bildirebilirsin — admin panelindeki "Hata Bildirimleri" listesine düşer,
          durumunu aşağıdan takip edebilirsin.
        </div>
        <input
          value={topic}
          onChange={e => setTopic(e.target.value)}
          placeholder="Konu / Ders (opsiyonel, ör. 6. Sınıf Fen Bilimleri - Güneş Sistemi)"
          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', boxSizing: 'border-box', marginBottom: '8px' }}
        />
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Sorunu anlat — ne bekliyordun, ne gördün?"
          rows={3}
          style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px', fontFamily: 'var(--font-sans)', boxSizing: 'border-box', resize: 'vertical', marginBottom: '8px' }}
        />
        {msg && (
          <div style={{ fontSize: '12px', marginBottom: '8px', color: msg.startsWith('✅') ? 'var(--green)' : 'var(--red)' }}>{msg}</div>
        )}
        <button
          disabled={submitting}
          onClick={submit}
          style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', background: submitting ? 'var(--bg2)' : '#6366f1', color: submitting ? 'var(--text3)' : '#fff', fontWeight: 700, fontSize: '13px', cursor: submitting ? 'default' : 'pointer', fontFamily: 'var(--font-sans)' }}>
          {submitting ? 'Gönderiliyor...' : '📤 Bildir'}
        </button>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--primary)' }}>📋 Bildirdiklerim</div>
          <button className="btn btn-sm" onClick={loadMyReports}>↺ Yenile</button>
        </div>
        {loadingReports ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '1.5rem', fontSize: '13px' }}>Yükleniyor...</div>
        ) : myReports.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text3)', padding: '1.5rem', fontSize: '13px' }}>Henüz bir bildirimin yok.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {myReports.map(r => (
              <div key={r.id} style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>{r.topic || 'Genel'}</span>
                  <span style={{ fontSize: '11px', color: r.status === 'pending' ? 'var(--red)' : r.status === 'confirmed' ? 'var(--amber)' : 'var(--green)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {statusLabel(r.status)}
                  </span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: r.root_cause ? '4px' : 0 }}>{r.question_text}</div>
                {r.root_cause && (
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontStyle: 'italic', marginTop: '4px' }}>Kök neden: {r.root_cause}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
