import type { Entry } from './types'

// Konu adları DB/AI'dan geldiği için kaynakta birebir geçmez (test "used" satırı yok); API hata metinleri ekrana t() ile basılır.
export const planTopicEntries: Entry[] = [
  ['Günlük görev için 10 uygun soru hazırlanamadı.', 'Could not prepare 10 suitable questions for the daily challenge.', 'Für die Tagesaufgabe konnten keine 10 passenden Fragen erstellt werden.', 'Impossible de préparer 10 questions adaptées pour le défi du jour.', 'No se pudieron preparar 10 preguntas adecuadas para el reto diario.', 'تعذّر إعداد 10 أسئلة مناسبة للتحدي اليومي.'],
  ['Tam Sayılar', 'Integers', 'Ganze Zahlen', 'Nombres entiers relatifs', 'Números enteros', 'الأعداد الصحيحة'],
  ['Ondalık Sayılar', 'Decimal Numbers', 'Dezimalzahlen', 'Nombres décimaux', 'Números decimales', 'الأعداد العشرية'],
  ['Denklemler', 'Equations', 'Gleichungen', 'Équations', 'Ecuaciones', 'المعادلات'],
  ['Geometri', 'Geometry', 'Geometrie', 'Géométrie', 'Geometría', 'الهندسة'],
  ['Dosya seç', 'Choose file', 'Datei auswählen', 'Choisir un fichier', 'Elegir archivo', 'اختيار ملف'],
  ['Dosya seçilmedi', 'No file chosen', 'Keine Datei ausgewählt', 'Aucun fichier choisi', 'Ningún archivo seleccionado', 'لم يتم اختيار ملف'],
  ['Son 30 gün', 'Last 30 days', 'Letzte 30 Tage', '30 derniers jours', 'Últimos 30 días', 'آخر 30 يومًا'],
  ['Önceki 30 gün', 'Previous 30 days', 'Vorherige 30 Tage', '30 jours précédents', '30 días anteriores', 'الـ 30 يومًا السابقة'],
]
