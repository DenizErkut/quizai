import type { Entry } from './types'

// "Yazılıya Hazırlanıyorum" (/yazili). Soru, senaryo, rubrik ve geri bildirim metinleri yönetici/yapay zekadan geldiği gibi gösterilir.
export const writtenExamEntries: Entry[] = [
  ['Yazılıya Hazırlanıyorum', 'Preparing for the written exam', 'Ich bereite mich auf die Klassenarbeit vor', 'Je me prépare à l’examen écrit', 'Me preparo para el examen escrito', 'أستعد للامتحان الكتابي'],
  ['Sınıfına uygun hazır yazılı soruları çöz, cevapların rubrikle puanlansın', 'Solve ready-made written-exam questions for your grade; your answers are scored with a rubric', 'Löse fertige Klassenarbeitsfragen für deine Klasse; deine Antworten werden mit einem Bewertungsraster bewertet', 'Résous des questions d’examen écrit prêtes pour ta classe ; tes réponses sont notées avec une grille', 'Resuelve preguntas de examen escrito para tu curso; tus respuestas se puntúan con una rúbrica', 'حلّ أسئلة امتحان كتابي جاهزة لصفّك؛ تُقيَّم إجاباتك بسلّم تقدير'],
  ['✍️ Yazılıya Hazırlanıyorum', '✍️ Preparing for the written exam', '✍️ Ich bereite mich auf die Klassenarbeit vor', '✍️ Je me prépare à l’examen écrit', '✍️ Me preparo para el examen escrito', '✍️ أستعد للامتحان الكتابي'],
  ['Sınıfına uygun hazır yazılı sorularını sırayla çöz; cevapların rubrike göre puanlanır', 'Solve the ready-made written-exam questions for your grade in order; your answers are scored against a rubric', 'Löse die fertigen Klassenarbeitsfragen für deine Klasse der Reihe nach; deine Antworten werden nach einem Bewertungsraster bewertet', 'Résous dans l’ordre les questions d’examen écrit prêtes pour ta classe ; tes réponses sont notées selon une grille', 'Resuelve en orden las preguntas de examen escrito para tu curso; tus respuestas se puntúan según una rúbrica', 'حلّ أسئلة الامتحان الكتابي الجاهزة لصفّك بالترتيب؛ تُقيَّم إجاباتك وفق سلّم تقدير'],
  ['Yazılılar yüklenemedi.', 'The written exams could not be loaded.', 'Die Klassenarbeiten konnten nicht geladen werden.', 'Impossible de charger les examens écrits.', 'No se pudieron cargar los exámenes escritos.', 'تعذّر تحميل الامتحانات الكتابية.'],
  ['Yazılı başlatılamadı.', 'The written exam could not be started.', 'Die Klassenarbeit konnte nicht gestartet werden.', 'Impossible de démarrer l’examen écrit.', 'No se pudo iniciar el examen escrito.', 'تعذّر بدء الامتحان الكتابي.'],
  ['Sınıfın profilinde kayıtlı değil. Profilinden sınıfını seç.', 'Your grade is not set in your profile. Choose your grade in your profile.', 'Deine Klasse ist in deinem Profil nicht eingetragen. Wähle deine Klasse im Profil.', 'Ta classe n’est pas renseignée dans ton profil. Choisis ta classe dans ton profil.', 'Tu curso no está en tu perfil. Elige tu curso en tu perfil.', 'صفّك غير محدّد في ملفك الشخصي. اختر صفّك من ملفك الشخصي.'],
  ['Sınıfın için henüz yayınlanmış yazılı yok.', 'No written exam has been published for your grade yet.', 'Für deine Klasse wurde noch keine Klassenarbeit veröffentlicht.', 'Aucun examen écrit n’a encore été publié pour ta classe.', 'Aún no se ha publicado ningún examen escrito para tu curso.', 'لم يُنشر بعد أي امتحان كتابي لصفّك.'],
  ['{term}. dönem · {exam}. yazılı', 'Term {term} · Exam {exam}', '{term}. Halbjahr · {exam}. Klassenarbeit', 'Semestre {term} · Examen {exam}', 'Trimestre {term} · Examen {exam}', 'الفصل {term} · الامتحان {exam}'],
  ['{n} soru · {p} puan', '{n} questions · {p} points', '{n} Fragen · {p} Punkte', '{n} questions · {p} points', '{n} preguntas · {p} puntos', '{n} أسئلة · {p} نقطة'],
  ['Tamamlandı: {earned}/{total} puan', 'Completed: {earned}/{total} points', 'Abgeschlossen: {earned}/{total} Punkte', 'Terminé : {earned}/{total} points', 'Completado: {earned}/{total} puntos', 'اكتمل: {earned}/{total} نقطة'],
  ['Sonucu gör', 'See the result', 'Ergebnis ansehen', 'Voir le résultat', 'Ver el resultado', 'عرض النتيجة'],
  ['Tekrar çöz', 'Solve again', 'Erneut lösen', 'Refaire', 'Resolver de nuevo', 'حلّ مرة أخرى'],
  ['Soru {n} / {total}', 'Question {n} / {total}', 'Frage {n} / {total}', 'Question {n} / {total}', 'Pregunta {n} / {total}', 'السؤال {n} / {total}'],
  ['Cevabını buraya yaz…', 'Write your answer here…', 'Schreibe deine Antwort hier…', 'Écris ta réponse ici…', 'Escribe tu respuesta aquí…', 'اكتب إجابتك هنا…'],
  ['Puanlanıyor…', 'Scoring…', 'Wird bewertet…', 'Notation en cours…', 'Puntuando…', 'جارٍ التقييم…'],
  ['Cevabı gönder', 'Submit answer', 'Antwort senden', 'Envoyer la réponse', 'Enviar respuesta', 'إرسال الإجابة'],
  ['Bu soruda {earned}/{total} puan aldın', 'You scored {earned}/{total} points on this question', 'Du hast bei dieser Frage {earned}/{total} Punkte erreicht', 'Tu as obtenu {earned}/{total} points à cette question', 'Obtuviste {earned}/{total} puntos en esta pregunta', 'حصلت على {earned}/{total} نقطة في هذا السؤال'],
  ['Sonucu göster', 'Show the result', 'Ergebnis anzeigen', 'Afficher le résultat', 'Mostrar el resultado', 'إظهار النتيجة'],
  ['Sonraki soru →', 'Next question →', 'Nächste Frage →', 'Question suivante →', 'Siguiente pregunta →', 'السؤال التالي ←'],
  ['🎉 Yazılı tamamlandı', '🎉 Written exam completed', '🎉 Klassenarbeit abgeschlossen', '🎉 Examen écrit terminé', '🎉 Examen escrito completado', '🎉 اكتمل الامتحان الكتابي'],
  ['Başarı: %{percent}', 'Score: {percent}%', 'Ergebnis: {percent} %', 'Réussite : {percent} %', 'Resultado: {percent} %', 'النتيجة: {percent}٪'],
  ['Soru {n}', 'Question {n}', 'Frage {n}', 'Question {n}', 'Pregunta {n}', 'السؤال {n}'],
  ['Listeye dön', 'Back to the list', 'Zurück zur Liste', 'Retour à la liste', 'Volver a la lista', 'العودة إلى القائمة'],
]
