'use client'

import { useEffect, useRef, useState } from 'react'

type RecognitionEvent = { results: ArrayLike<{ 0: { transcript: string } }> }
type RecognitionErrorEvent = { error: string }
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: RecognitionErrorEvent) => void) | null
  onresult: ((event: RecognitionEvent) => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}
type RecognitionConstructor = new () => Recognition

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
}

const SESSION_SECONDS = 5 * 60

export function useVoiceTutor(onTranscript: (text: string) => void) {
  const [enabled, setEnabled] = useState(false)
  const [consentPending, setConsentPending] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS)
  const recognitionRef = useRef<Recognition | null>(null)
  const enabledRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)

  const supported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => () => {
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])

  useEffect(() => {
    enabledRef.current = enabled
    if (!enabled) return
    const timer = window.setInterval(() => {
      setSecondsLeft(current => {
        if (current > 1) return current - 1
        recognitionRef.current?.abort()
        window.speechSynthesis?.cancel()
        setListening(false)
        setEnabled(false)
        setError('5 dakikalık pilot oturumu tamamlandı. Yeniden başlatabilirsin.')
        return SESSION_SECONDS
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [enabled])

  function requestConsent() {
    if (!supported) {
      setError('Bu tarayıcı sesli konuşmayı desteklemiyor. Chrome veya Edge ile deneyebilirsin.')
      return
    }
    setError('')
    setConsentPending(true)
  }

  function acceptConsent() {
    if (!supported) return
    setConsentPending(false)
    setError('')
    setSecondsLeft(SESSION_SECONDS)
    setEnabled(true)
  }

  function disable() {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    window.speechSynthesis?.cancel()
    setListening(false)
    setEnabled(false)
    setConsentPending(false)
    setSecondsLeft(SESSION_SECONDS)
  }

  function start() {
    if (!enabled || listening) return
    const RecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!RecognitionApi) return

    window.speechSynthesis?.cancel()
    const recognition = new RecognitionApi()
    recognition.lang = 'tr-TR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onstart = () => {
      setError('')
      setListening(true)
    }
    recognition.onend = () => setListening(false)
    recognition.onerror = event => {
      setListening(false)
      setError(event.error === 'not-allowed'
        ? 'Mikrofon izni verilmedi. Tarayıcı adres çubuğundan mikrofon iznini açabilirsin.'
        : 'Seni anlayamadım. Mikrofon düğmesine basıp tekrar deneyebilirsin.')
    }
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      if (transcript) onTranscriptRef.current(transcript)
    }
    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      setListening(false)
      setError('Mikrofon başlatılamadı. Birkaç saniye sonra tekrar deneyebilirsin.')
    }
  }

  function stop() {
    recognitionRef.current?.stop()
  }

  function speak(text: string) {
    if (!enabledRef.current || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'tr-TR'
    utterance.rate = 0.96
    window.speechSynthesis.speak(utterance)
  }

  return {
    enabled, consentPending, listening, error, secondsLeft,
    requestConsent, acceptConsent, cancelConsent: () => setConsentPending(false),
    disable, start, stop, speak,
  }
}
