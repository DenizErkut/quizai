'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

const TEMPLATES = [
  { label: '📢 Yeni ödev', text: 'Yeni bir ödeviniz var! Pratium\'a girerek kontrol edin.' },
  { label: '🔥 Streak hatırlatıcı', text: 'Bugün test çözmeyi unutma! Streakini koru 🔥' },
  { label: '📊 Sınav yaklaşıyor', text: 'Sınav tarihine az kaldı. Pratium\'da pratik yapmaya devam et!' },
  { label: '🏆 Tebrik', text: 'Bu haftaki performansın harika! Öğrencilerimizin gururu oldunuz.' },
]

export default function TeacherNotifyPage() {
  const [teacher, setTeacher] = useState<any>(null)
  const [classrooms, setClassrooms] = useState<any[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [result, setResult] = useState<{ recipientCount: number; pushDelivered: number } | null>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient() as any

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: t } = await supabase.from('teachers').select('*').eq('user_id', user.id).single()
    if (!t?.approved) { router.push('/teacher'); return }
    setTeacher(t)
    const { data: cls } = await supabase.from('classrooms').select('*').eq('teacher_id', t.id).order('created_at', { ascending: false })
    setClassrooms(cls ?? [])
    if (cls?.length) setSelectedClass(cls[0].id)

    const { data: hist } = await supabase
      .from('teacher_notifications')
      .select('*, classrooms(name)')
      .eq('teacher_id', t.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setHistory(hist ?? [])
    setLoading(false)
  }

  async function sendNotification() {
    if (!message.trim() || !selectedClass) return
    setSending(true)
    setResult(null)

    try {
      // Token al
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Oturum bulunamadı')

      const res = await fetch('/api/teacher/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          classroom_id: selectedClass,
          message: message.trim(),
          title: '📢 Öğretmeninizden mesaj',
        }),
      })

      const json = await res.json()

      if (!res.ok) throw new Error(json.error ?? 'Gönderilemedi')

      setResult({ recipientCount: json.recipientCount, pushDelivered: json.pushDelivered })
      setMessage('')
      setSent(true)
      if (json.notifRecord) setHistory((prev: any[]) => [json.notifRecord, ...prev])
      setTimeout(() => setSent(false), 4000)
    } catch (err: any) {
      alert('Hata: ' + (err.message ?? 'Bilinmeyen hata'))
    } finally {
      setSending(false)
    }
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)' }}>
      <div style={{ color: 'var(--text3)', fontSize: '14px' }}>Yükleniyor...</div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '1.5rem', paddingBottom: '5rem' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          <Link href="/teacher" style={{ color: 'var(--text3)', fontSize: '13px', textDecoration: 'none' }}>← Panel</Link>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Toplu Bildirim</h1>
        </div>

        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '14px' }}>Bildirim Gönder</div>

          {/* Sınıf seçimi */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>Sınıf</label>
            <select value={selectedClass} onChange={e => setSelectedClass(e.target.value)} style={inputStyle}>
              {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Hızlı şablonlar */}
          <div style={{ marginBottom: '10px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '6px' }}>Hızlı şablonlar</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => (
                <button key={t.label} onClick={() => setMessage(t.text)}
                  style={{ fontSize: '12px', padding: '5px 10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', cursor: 'pointer', fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mesaj */}
          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text3)', display: 'block', marginBottom: '5px' }}>Mesaj</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Öğrencilere göndermek istediğin mesajı yaz..."
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6 }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={sendNotification}
            disabled={sending || !message.trim() || !selectedClass}
            style={{ width: '100%', justifyContent: 'center', opacity: sending ? 0.6 : 1 }}
          >
            {sent ? '✓ Gönderildi!' : sending ? 'Gönderiliyor...' : `🔔 ${classrooms.find(c => c.id === selectedClass)?.name || ''} Sınıfına Gönder`}
          </button>

          {/* Sonuç özeti */}
          {sent && result && (
            <div style={{
              marginTop: '10px', padding: '10px 14px', borderRadius: '10px',
              background: 'rgba(30,207,184,0.08)', border: '1px solid rgba(30,207,184,0.2)',
              fontSize: '12px', color: 'var(--text2)',
            }}>
              ✅ <strong>{result.recipientCount}</strong> öğrenciye uygulama bildirimi gönderildi
              {result.pushDelivered > 0 && <> · <strong>{result.pushDelivered}</strong> push bildirimi iletildi</>}
            </div>
          )}
        </div>

        {/* Geçmiş */}
        {history.length > 0 && (
          <div className="card">
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text2)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Gönderim Geçmişi
            </div>
            {history.map((h: any, i: number) => (
              <div key={h.id} style={{ padding: '10px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                <div style={{ fontSize: '13px', marginBottom: '4px', lineHeight: 1.5 }}>{h.message}</div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span>🏫 {h.classrooms?.name}</span>
                  <span>👥 {h.delivered_count}/{h.recipient_count} iletildi</span>
                  <span>🕐 {new Date(h.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '11px 14px', borderRadius: '10px', border: '1.5px solid var(--border)',
  background: 'var(--bg2)', color: 'var(--text)', fontSize: '13px',
  fontFamily: 'var(--font-sans)', outline: 'none', width: '100%', boxSizing: 'border-box',
}
