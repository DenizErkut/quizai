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
type VoiceMetric = { event: 'session_started' | 'session_ended' | 'turn_completed' | 'recognition_error'; turnCount?: number; recognitionMs?: number; errorCode?: string }

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor
    webkitSpeechRecognition?: RecognitionConstructor
  }
}

const SESSION_SECONDS = 5 * 60

export function useVoiceTutor(onTranscript: (text: string) => void, onMetric?: (metric: VoiceMetric) => void) {
  const [enabled, setEnabled] = useState(false)
  const [consentPending, setConsentPending] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')
  const [secondsLeft, setSecondsLeft] = useState(SESSION_SECONDS)
  const [turnCount, setTurnCount] = useState(0)
  const [lastRecognitionMs, setLastRecognitionMs] = useState<number | null>(null)
  const recognitionRef = useRef<Recognition | null>(null)
  const enabledRef = useRef(false)
  const onTranscriptRef = useRef(onTranscript)
  const onMetricRef = useRef(onMetric)

  const supported = typeof window !== 'undefined'
    && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])
  useEffect(() => { onMetricRef.current = onMetric }, [onMetric])

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
        onMetricRef.current?.({ event: 'session_ended' })
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
    setTurnCount(0)
    setLastRecognitionMs(null)
    setEnabled(true)
    onMetricRef.current?.({ event: 'session_started' })
  }

  function disable() {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    window.speechSynthesis?.cancel()
    setListening(false)
    setEnabled(false)
    setConsentPending(false)
    setSecondsLeft(SESSION_SECONDS)
    onMetricRef.current?.({ event: 'session_ended', turnCount })
  }

  function start() {
    if (!enabled || listening) return
    const RecognitionApi = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!RecognitionApi) return

    window.speechSynthesis?.cancel()
    const recognitionStartedAt = performance.now()
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
      onMetricRef.current?.({ event: 'recognition_error', errorCode: event.error })
      setError(event.error === 'not-allowed'
        ? 'Mikrofon izni verilmedi. Tarayıcı adres çubuğundan mikrofon iznini açabilirsin.'
        : 'Seni anlayamadım. Mikrofon düğmesine basıp tekrar deneyebilirsin.')
    }
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript?.trim()
      if (transcript) {
        const recognitionMs = Math.round(performance.now() - recognitionStartedAt)
        setLastRecognitionMs(recognitionMs)
        setTurnCount(current => {
          const next = current + 1
          onMetricRef.current?.({ event: 'turn_completed', turnCount: next, recognitionMs })
          return next
        })
        onTranscriptRef.current(transcript)
      }
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
    enabled, consentPending, listening, error, secondsLeft, turnCount, lastRecognitionMs,
    requestConsent, acceptConsent, cancelConsent: () => setConsentPending(false),
    disable, start, stop, speak,
  }
}
