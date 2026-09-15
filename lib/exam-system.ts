export type ExamTrack = 'SAY' | 'EA' | 'SOZ'
export type YdtLanguage = 'İngilizce' | 'Almanca' | 'Fransızca' | 'Arapça' | 'Rusça'

export interface ExamSection {
  id: string
  label: string
  count: number
  subject: string
  grade: string
  netCoef: number
}

export interface ExamSessionPhase {
  id: string
  label: string
  duration: number
  sectionIds: string[]
}

export interface ExamFormat {
  label: string
  fullName: string
  duration: number
  sections: ExamSection[]
  sessions: ExamSessionPhase[]
  scoring: { correct: number; wrong: number; base: number }
  maxScore: number
  description: string
  targetAudience: string
  color: string
  track?: ExamTrack
  language?: YdtLanguage
  examYear: number
  curriculumVersion: string
}

const EXAM_YEAR = 2026

const LGS_SECTIONS: ExamSection[] = [
  { id: 'turkce', label: 'Türkçe', count: 20, subject: 'Türkçe', grade: 'ortaokul 8. sinif', netCoef: 4 },
  { id: 'inkilap', label: 'T.C. İnkılap Tarihi', count: 10, subject: 'T.C. İnkılap Tarihi', grade: 'ortaokul 8. sinif', netCoef: 1 },
  { id: 'din', label: 'Din Kültürü', count: 10, subject: 'Din Kültürü ve Ahlak', grade: 'ortaokul 8. sinif', netCoef: 1 },
  { id: 'ingilizce', label: 'İngilizce', count: 10, subject: 'İngilizce', grade: 'ortaokul 8. sinif', netCoef: 1 },
  { id: 'matematik', label: 'Matematik', count: 20, subject: 'Matematik', grade: 'ortaokul 8. sinif', netCoef: 4 },
  { id: 'fen', label: 'Fen Bilimleri', count: 20, subject: 'Fen Bilimleri', grade: 'ortaokul 8. sinif', netCoef: 4 },
]

const TYT_SECTIONS: ExamSection[] = [
  { id: 'turkce', label: 'Türkçe', count: 40, subject: 'Türkçe', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'sosyal', label: 'Sosyal Bilimler', count: 20, subject: 'Sosyal Bilimler', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'matematik', label: 'Temel Matematik', count: 40, subject: 'Matematik', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'fen', label: 'Fen Bilimleri', count: 20, subject: 'Fen Bilimleri', grade: 'lise 12. sinif', netCoef: 1 },
]

const AYT_SECTIONS: ExamSection[] = [
  { id: 'matematik', label: 'Matematik', count: 40, subject: 'Matematik İleri', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'fizik', label: 'Fizik', count: 14, subject: 'Fizik', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'kimya', label: 'Kimya', count: 13, subject: 'Kimya', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'biyoloji', label: 'Biyoloji', count: 13, subject: 'Biyoloji', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'edebiyat', label: 'Türk Dili ve Edebiyatı', count: 24, subject: 'Türk Dili ve Edebiyatı', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'tarih1', label: 'Tarih-1', count: 10, subject: 'Tarih', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'cografya1', label: 'Coğrafya-1', count: 6, subject: 'Coğrafya', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'tarih2', label: 'Tarih-2', count: 11, subject: 'Tarih', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'cografya2', label: 'Coğrafya-2', count: 11, subject: 'Coğrafya', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'felsefe', label: 'Felsefe Grubu', count: 12, subject: 'Felsefe Grubu', grade: 'lise 12. sinif', netCoef: 1 },
  { id: 'din', label: 'Din Kültürü', count: 6, subject: 'Din Kültürü', grade: 'lise 12. sinif', netCoef: 1 },
]

const AYT_TRACK_SECTIONS: Record<ExamTrack, string[]> = {
  SAY: ['matematik', 'fizik', 'kimya', 'biyoloji'],
  EA: ['matematik', 'edebiyat', 'tarih1', 'cografya1'],
  SOZ: ['edebiyat', 'tarih1', 'cografya1', 'tarih2', 'cografya2', 'felsefe', 'din'],
}

const KPSS_SECTIONS: ExamSection[] = [
  { id: 'turkce', label: 'Türkçe', count: 30, subject: 'Türkçe', grade: 'universite mezun', netCoef: 1 },
  { id: 'matematik', label: 'Matematik', count: 30, subject: 'Matematik', grade: 'universite mezun', netCoef: 1 },
  { id: 'tarih', label: 'Tarih', count: 16, subject: 'Türk Tarihi', grade: 'universite mezun', netCoef: 1 },
  { id: 'cografya', label: 'Coğrafya', count: 7, subject: 'Coğrafya', grade: 'universite mezun', netCoef: 1 },
  { id: 'vatandaslik', label: 'Vatandaşlık', count: 7, subject: 'Vatandaşlık', grade: 'universite mezun', netCoef: 1 },
  { id: 'ataturk', label: 'Atatürk İlkeleri', count: 10, subject: 'Atatürk İlkeleri', grade: 'universite mezun', netCoef: 1 },
]

function oneSession(label: string, duration: number, sections: ExamSection[]): ExamSessionPhase[] {
  return [{ id: 'main', label, duration, sectionIds: sections.map(section => section.id) }]
}

export const EXAM_FORMATS: Record<string, ExamFormat> = {
  LGS: {
    label: 'LGS', fullName: 'Liselere Geçiş Sınavı', duration: 155, sections: LGS_SECTIONS,
    sessions: [
      { id: 'verbal', label: 'Sözel Oturum', duration: 75, sectionIds: ['turkce', 'inkilap', 'din', 'ingilizce'] },
      { id: 'numeric', label: 'Sayısal Oturum', duration: 80, sectionIds: ['matematik', 'fen'] },
    ],
    scoring: { correct: 1, wrong: -0.333333, base: 0 }, maxScore: 500,
    description: '90 soru · Sözel 75 dk + Sayısal 80 dk', targetAudience: 'ortaokul', color: '#6366f1',
    examYear: EXAM_YEAR, curriculumVersion: 'MEB-2018-8-sinif',
  },
  TYT: {
    label: 'TYT', fullName: 'Temel Yeterlilik Testi', duration: 165, sections: TYT_SECTIONS,
    sessions: oneSession('TYT Oturumu', 165, TYT_SECTIONS),
    scoring: { correct: 1, wrong: -0.25, base: 0 }, maxScore: 500,
    description: '120 soru · 165 dakika · 5 seçenek', targetAudience: 'lise', color: '#0ea5e9',
    examYear: EXAM_YEAR, curriculumVersion: 'MEB-kademeli-2026-12-sinif',
  },
  AYT: {
    label: 'AYT', fullName: 'Alan Yeterlilik Testleri', duration: 180, sections: AYT_SECTIONS,
    sessions: oneSession('AYT Oturumu', 180, AYT_SECTIONS),
    scoring: { correct: 1, wrong: -0.25, base: 0 }, maxScore: 500,
    description: 'Alanını seç · 80 soru · 180 dakika · 5 seçenek', targetAudience: 'lise', color: '#f59e0b',
    examYear: EXAM_YEAR, curriculumVersion: 'MEB-kademeli-2026-12-sinif',
  },
  YDT: {
    label: 'YDT', fullName: 'Yabancı Dil Testi', duration: 120, sections: [], sessions: [],
    scoring: { correct: 1, wrong: -0.25, base: 0 }, maxScore: 500,
    description: 'Dilini seç · 80 soru · 120 dakika · 5 seçenek', targetAudience: 'lise', color: '#8b5cf6',
    examYear: EXAM_YEAR, curriculumVersion: 'OSYM-YDT-2026',
  },
  KPSS_GENEL: {
    label: 'KPSS', fullName: 'KPSS Genel Yetenek / Genel Kültür', duration: 120, sections: KPSS_SECTIONS,
    sessions: oneSession('KPSS Oturumu', 120, KPSS_SECTIONS),
    scoring: { correct: 1, wrong: -0.25, base: 0 }, maxScore: 100,
    description: '100 soru · 120 dakika · 5 seçenek', targetAudience: 'universite', color: '#10b981',
    examYear: EXAM_YEAR, curriculumVersion: 'OSYM-KPSS-2026',
  },
}

export function resolveExamFormat(examType: string, track?: string, language?: string): ExamFormat | null {
  const base = EXAM_FORMATS[examType]
  if (!base) return null
  if (examType === 'AYT') {
    const selectedTrack = (track && track in AYT_TRACK_SECTIONS ? track : 'SAY') as ExamTrack
    const allowed = new Set(AYT_TRACK_SECTIONS[selectedTrack])
    const sections = AYT_SECTIONS.filter(section => allowed.has(section.id))
    return {
      ...base, sections, track: selectedTrack,
      sessions: oneSession(`AYT ${selectedTrack} Oturumu`, 180, sections),
      description: `${selectedTrack} · 80 soru · 180 dakika · 5 seçenek`,
    }
  }
  if (examType === 'YDT') {
    const allowed: YdtLanguage[] = ['İngilizce', 'Almanca', 'Fransızca', 'Arapça', 'Rusça']
    const selectedLanguage = allowed.includes(language as YdtLanguage) ? language as YdtLanguage : 'İngilizce'
    const sections: ExamSection[] = [{ id: 'ydt', label: selectedLanguage, count: 80, subject: selectedLanguage, grade: 'lise 12. sinif', netCoef: 1 }]
    return { ...base, sections, language: selectedLanguage, sessions: oneSession(`YDT ${selectedLanguage}`, 120, sections) }
  }
  return JSON.parse(JSON.stringify(base)) as ExamFormat
}
