import type { Entry } from './types'

// Teacher bulk notification page (/teacher/notify) plus the headers of the teacher reports/import pages
// (their inner report widgets are shared components that stay as provided).
export const teacherNotifyEntries: Entry[] = [
  ['Lütfen mesaj girin.', 'Please enter a message.', 'Bitte gib eine Nachricht ein.', 'Saisis un message.', 'Escribe un mensaje.', 'يرجى إدخال رسالة.'],
  ['Lütfen bir sınıf seçin.', 'Please choose a class.', 'Bitte wähle eine Klasse.', 'Choisis une classe.', 'Elige una clase.', 'يرجى اختيار صف.'],
  ['Oturum bulunamadı', 'Session not found', 'Sitzung nicht gefunden', 'Session introuvable', 'No se encontró la sesión', 'لم يتم العثور على الجلسة'],
  ['Gönderilemedi', 'Could not be sent', 'Konnte nicht gesendet werden', 'Envoi impossible', 'No se pudo enviar', 'تعذّر الإرسال'],
  ['Toplu Bildirim', 'Bulk notification', 'Sammelbenachrichtigung', 'Notification groupée', 'Notificación masiva', 'إشعار جماعي'],
  ['Bildirim Gönder', 'Send notification', 'Benachrichtigung senden', 'Envoyer une notification', 'Enviar notificación', 'إرسال إشعار'],
  ['— Sınıf seçin —', '— Choose a class —', '— Klasse wählen —', '— Choisis une classe —', '— Elige una clase —', '— اختر صفًا —'],
  ['Hızlı şablonlar', 'Quick templates', 'Schnellvorlagen', 'Modèles rapides', 'Plantillas rápidas', 'قوالب سريعة'],
  ['Öğrencilere göndermek istediğin mesajı yaz...', 'Write the message you want to send to the students...', 'Schreibe die Nachricht, die du an die Schüler senden möchtest...', 'Écris le message que tu veux envoyer aux élèves...', 'Escribe el mensaje que quieres enviar a los estudiantes...', 'اكتب الرسالة التي تريد إرسالها إلى الطلاب...'],
  ['✓ Gönderildi!', '✓ Sent!', '✓ Gesendet!', '✓ Envoyé !', '✓ ¡Enviado!', '✓ تم الإرسال!'],
  ['🔔 {name} Sınıfına Gönder', '🔔 Send to {name}', '🔔 An {name} senden', '🔔 Envoyer à {name}', '🔔 Enviar a {name}', '🔔 إرسال إلى {name}'],
  ['✅ {n} öğrenciye uygulama bildirimi gönderildi', '✅ App notification sent to {n} students', '✅ App-Benachrichtigung an {n} Schüler gesendet', '✅ Notification d’appli envoyée à {n} élèves', '✅ Notificación de la app enviada a {n} estudiantes', '✅ تم إرسال إشعار التطبيق إلى {n} طالبًا'],
  ['{n} push bildirimi iletildi', '{n} push notifications delivered', '{n} Push-Benachrichtigungen zugestellt', '{n} notifications push remises', '{n} notificaciones push entregadas', 'تم تسليم {n} إشعار فوري'],
  ['Gönderim Geçmişi', 'Send history', 'Sendeverlauf', 'Historique des envois', 'Historial de envíos', 'سجل الإرسال'],
  ['{a}/{b} iletildi', '{a}/{b} delivered', '{a}/{b} zugestellt', '{a}/{b} remis', '{a}/{b} entregados', 'تم تسليم {a}/{b}'],
  // Teacher reports / grade import headers
  ['Raporlar', 'Reports', 'Berichte', 'Rapports', 'Informes', 'التقارير'],
  ['Sınıflarındaki öğrencilerin notları, ilerlemesi ve Pratium sonuçları', 'Grades, progress and Pratium results of the students in your classes', 'Noten, Fortschritt und Pratium-Ergebnisse der Schüler in deinen Klassen', 'Notes, progression et résultats Pratium des élèves de tes classes', 'Notas, progreso y resultados de Pratium de los estudiantes de tus clases', 'درجات وتقدم ونتائج Pratium للطلاب في صفوفك'],
  ['Öğretmen paneli', 'Teacher dashboard', 'Lehrer-Dashboard', 'Tableau de bord enseignant', 'Panel docente', 'لوحة المعلّم'],
  ['Not İçe Aktar', 'Import grades', 'Noten importieren', 'Importer des notes', 'Importar notas', 'استيراد الدرجات'],
  ["Excel/PDF'den öğrenci notu içeri aktar", 'Import student grades from Excel/PDF', 'Schülernoten aus Excel/PDF importieren', 'Importer les notes des élèves depuis Excel/PDF', 'Importar notas de estudiantes desde Excel/PDF', 'استيراد درجات الطلاب من Excel/PDF'],
  ['MOZAİK, e-Okul veya kendi hazırladığın Excel/CSV dosyalarındaki öğrenci numarası, sınıf, isim ve ders notlarını sınıflarındaki öğrencilerle eşleştirip içeri aktar.', 'Match the student numbers, classes, names and course grades in MOZAİK, e-Okul or your own Excel/CSV files with the students in your classes and import them.', 'Gleiche die Schülernummern, Klassen, Namen und Fachnoten aus MOZAİK, e-Okul oder deinen eigenen Excel/CSV-Dateien mit den Schülern deiner Klassen ab und importiere sie.', 'Associe les numéros d’élèves, classes, noms et notes de MOZAİK, e-Okul ou de tes propres fichiers Excel/CSV aux élèves de tes classes, puis importe-les.', 'Relaciona los números de estudiante, clases, nombres y notas de MOZAİK, e-Okul o tus propios archivos Excel/CSV con los estudiantes de tus clases e impórtalos.', 'طابق أرقام الطلاب والصفوف والأسماء ودرجات المواد في MOZAİK أو e-Okul أو ملفات Excel/CSV الخاصة بك مع طلاب صفوفك ثم استوردها.'],
]
