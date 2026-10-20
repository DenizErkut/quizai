
---

## 6. Uygulama durumu (güncelleme)

| Madde | Durum |
|---|---|
| D1, D2, D3, A1, A4 (bot/chat limiti), A5, A6 | **Tamamlandı — 20 Ekim, PR #79** |
| A2 (`report?type=teacher`), A3 (`buildTeacherContext`, `teacher/reports`), A8 (`learning-risk/actions`) | **Tamamlandı — sınıf sahipliği doğrulaması (`lib/teacher-scope.ts`) + negatif testler** |
| A7 canlı sınav (üyelik, aktif durum, açık soru, tek cevap, onaylı öğretmen) | **Tamamlandı** |
| D9 (yeni): `live_quizzes` doğru cevapları oturumsuz okunabiliyordu | **Tamamlandı** (politika yetkili kullanıcıya daraltıldı, anon yetkisi kaldırıldı). Kalan: sınıf arkadaşları `questions.ans` alanını istemciden okuyabilir → öğrenciye `ans`/`exp` içermeyen soru yüklemesi sunan uç nokta gerekli |
| A9–A14, D4–D6, D8 ve düşük maddeler | Bekliyor |
