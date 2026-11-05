'use client'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/I18nProvider'
import '@/lib/use-voice-tutor'   // SpeechRecognition için global tür tanımları

type Recognition = InstanceType<NonNullable<Window['SpeechRecognition']>>
const CONSENT_KEY = 'pratium_voice_consent_v1'

// Öğrenci konuşması için mikrofon düğmesi: bir kez onay alınır, sonra bas-konuş. Konuşma metne çevrilir ve onTranscript'e verilir.
// Ham ses kaydedilmez; metne çevirme tarayıcının konuşma servisiyle yapılır.
export default function VoiceMicButton({ onTranscript, disabled, size = 40, round = false }: { onTranscript: (text: string) => void; disabled?: boolean; size?: number; round?: boolean }) {
  const { t } = useT()
  const [listening, setListening] = useState(false)
  const [consent, setConsent] = useState(false)
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef<Recognition | null>(null)
  const callbackRef = useRef(onTranscript)
  useEffect(() => { callbackRef.current = onTranscript }, [onTranscript])
  useEffect(() => {
    try { setConsent(window.localStorage.getItem(CONSENT_KEY) === '1') } catch { /* gizli sekme */ }
    return () => recognitionRef.current?.abort()
  }, [])

  const supported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  if (!supported) return null

  function begin() {
    const Api = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Api) return
    window.speechSynthesis?.cancel()
    const recognition = new Api()
    recognition.lang = 'tr-TR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => { setError(''); setListening(true) }
    recognition.onend = () => setListening(false)
    recognition.onerror = event => {
      setListening(false)
      setError(event.error === 'not-allowed' ? t('Mikrofon izni verilmedi. Tarayıcı adres çubuğundan mikrofon iznini açabilirsin.') : t('Seni anlayamadım. Mikrofon düğmesine basıp tekrar deneyebilirsin.'))
    }
    recognition.onresult = event => {
      const text = event.results[0]?.[0]?.transcript?.trim()
      if (text) callbackRef.current(text)
    }
    recognitionRef.current = recognition
    try { recognition.start() } catch { setListening(false); setError(t('Mikrofon başlatılamadı. Birkaç saniye sonra tekrar deneyebilirsin.')) }
  }

  function press() {
    if (listening) { recognitionRef.current?.stop(); return }
    if (!consent) { setAsking(true); return }
    begin()
  }

  function accept() {
    try { window.localStorage.setItem(CONSENT_KEY, '1') } catch { /* sessizce geç */ }
    setConsent(true); setAsking(false); begin()
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0 }}>
      <button type="button" onClick={press} disabled={disabled} aria-label={listening ? t('Dinlemeyi durdur') : t('Konuşmaya başla')} title={listening ? t('Dinleniyor — durdurmak için tıkla') : t('Bas ve konuş')}
        style={{ width: size, height: size, borderRadius: round ? '50%' : 10, border: listening ? '2px solid #ff8a80' : '1.5px solid rgba(0,149,200,0.3)', background: listening ? '#fff0ef' : 'rgba(0,149,200,0.08)', color: listening ? '#c62828' : 'var(--accent)', cursor: disabled ? 'default' : 'pointer', fontSize: 17, animation: listening ? 'voicePulse 1.2s ease-in-out infinite' : 'none' }}>
        {listening ? '■' : '🎙️'}
      </button>
      {asking && (
        <div role="dialog" style={{ position: 'absolute', bottom: size + 8, right: 0, width: 260, zIndex: 50, padding: 10, borderRadius: 10, background: '#fff8df', border: '1px solid #f6df8b', fontSize: 11, color: '#6b5420', lineHeight: 1.5 }}>
          {t('Konuşman yazıya çevrilmek üzere tarayıcının konuşma servisine gönderilebilir. Pratium ham ses kaydetmez; koça yalnızca oluşan metin gönderilir. Sesli komut da verebilirsin: örn. “açık uçlu soruları aç”, “ana sayfaya git”, “sesi durdur”.')}
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="button" onClick={accept} style={{ border: 0, borderRadius: 12, padding: '5px 10px', background: '#087c70', color: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 700 }}>{t('Kabul et ve aç')}</button>
            <button type="button" onClick={() => setAsking(false)} style={{ border: '1px solid #d9c778', borderRadius: 12, padding: '5px 10px', background: '#fff', color: '#6b5420', cursor: 'pointer', fontSize: 11 }}>{t('Vazgeç')}</button>
          </div>
        </div>
      )}
      {error && <span role="status" style={{ position: 'absolute', bottom: size + 6, right: 0, width: 240, fontSize: 10.5, color: '#b42318', background: '#fff', padding: '4px 6px', borderRadius: 6, border: '1px solid #f3c2bd', zIndex: 50 }}>{error}</span>}
    </span>
  )
}
