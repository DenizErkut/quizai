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
  const [ready, setReady] = useState(false)     // mikrofon gerçekten ses almaya başladı mı (ilk kelimeler kaybolmasın)
  const [heard, setHeard] = useState('')        // anlık duyulan metin
  const silenceRef = useRef<number | null>(null)
  const finalRef = useRef('')
  const [consent, setConsent] = useState(() => { try { return typeof window !== 'undefined' && window.localStorage.getItem(CONSENT_KEY) === '1' } catch { return false } })
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const recognitionRef = useRef<Recognition | null>(null)
  const callbackRef = useRef(onTranscript)
  useEffect(() => { callbackRef.current = onTranscript }, [onTranscript])
  useEffect(() => {
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
    // Sürekli dinleme + ara sonuçlar: kelimeler arası duraklamalarda oturum kapanmaz, ilk kelimeler kaybolmaz;
    // 1,6 sn sessizlikte (ya da en çok 15 sn sonra) biter ve duyulan tüm metin birleştirilir.
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    finalRef.current = ''
    setHeard(''); setReady(false)
    const clearSilence = () => { if (silenceRef.current) { window.clearTimeout(silenceRef.current); silenceRef.current = null } }
    const armSilence = () => { clearSilence(); silenceRef.current = window.setTimeout(() => recognition.stop(), 1600) }
    const maxTimer = window.setTimeout(() => recognition.stop(), 15000)
    recognition.onstart = () => { setError(''); setListening(true) }
    recognition.onaudiostart = () => { setReady(true); armSilence() }
    recognition.onend = () => {
      clearSilence(); window.clearTimeout(maxTimer)
      setListening(false); setReady(false)
      const text = finalRef.current.replace(/\s+/g, ' ').trim()
      setHeard('')
      if (text) callbackRef.current(text)
      else setError(t('Seni anlayamadım. Mikrofon düğmesine basıp tekrar deneyebilirsin.'))
    }
    recognition.onerror = event => {
      clearSilence(); window.clearTimeout(maxTimer)
      setListening(false); setReady(false)
      if (event.error === 'no-speech') { setError(t('Ses duyamadım. Telefonu ağzına yaklaştırıp tekrar dene.')); return }
      if (event.error === 'aborted') return
      setError(event.error === 'not-allowed' ? t('Mikrofon izni verilmedi. Tarayıcı adres çubuğundan mikrofon iznini açabilirsin.') : t('Seni anlayamadım. Mikrofon düğmesine basıp tekrar deneyebilirsin.'))
    }
    recognition.onresult = event => {
      let finals = '', interim = ''
      for (let i = 0; i < event.results.length; i++) {
        const piece = event.results[i]?.[0]?.transcript || ''
        if (event.results[i]?.isFinal) finals += `${piece} `; else interim += piece
      }
      finalRef.current = `${finals}${interim}`
      setHeard(`${finals}${interim}`.trim())
      armSilence()
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
        style={{ width: size, height: size, borderRadius: round ? '50%' : 10, border: listening ? `2px solid ${ready ? '#ff8a80' : '#f0b429'}` : '1.5px solid rgba(0,149,200,0.3)', background: listening ? (ready ? '#fff0ef' : '#fff8df') : 'rgba(0,149,200,0.08)', color: listening ? (ready ? '#c62828' : '#8a6a00') : 'var(--accent)', cursor: disabled ? 'default' : 'pointer', fontSize: 17, animation: listening && ready ? 'voicePulse 1.2s ease-in-out infinite' : 'none' }}>
        {listening ? (ready ? '■' : '…') : '🎙️'}
      </button>
      {listening && (
        <span role="status" style={{ position: 'absolute', bottom: size + 6, right: 0, width: 240, fontSize: 11, color: '#334155', background: '#fff', padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border)', zIndex: 50, lineHeight: 1.4 }}>
          {ready ? (heard ? `“${heard}”` : t('Şimdi konuş…')) : t('Mikrofon hazırlanıyor, bekle…')}
        </span>
      )}
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
