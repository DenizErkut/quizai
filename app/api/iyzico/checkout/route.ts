import { NextRequest, NextResponse } from 'next/server'

// 22 Eylül 2026 — Deniz'in kararıyla Iyzico TAMAMEN PASİF edildi, yerine
// PayTR geçti (bkz. app/api/paytr/checkout/route.ts, app/checkout/page.tsx).
//
// Bu route bilerek SİLİNMEDİ (denetim/geçmiş referans amaçlı — orijinal
// mantık git geçmişinde ve burada duruyor) ama artık Iyzico'ya HİÇBİR istek
// atmıyor ve subscriptions'a HİÇBİR satır yazmıyor. Devre dışı bırakılmadan
// önce veritabanında provider='iyzico' AND status='pending' olan sıfır kayıt
// olduğu doğrulandı (22 Eylül 2026), yani bekleyen/tamamlanmamış hiçbir
// Iyzico ödemesi yoktu.
//
// Frontend (app/checkout/page.tsx) zaten sadece /api/paytr/checkout'u
// çağırıyor — bu route'a normal kullanım akışında hiç ulaşılmıyor. Burası
// sadece doğrudan/eski bir istemcinin (bookmarklanmış eski bir istek,
// üçüncü parti bir entegrasyon vb.) bu adrese düşme ihtimaline karşı bir
// güvenlik ağı.
export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: 'Bu ödeme yöntemi artık kullanılmıyor. Lütfen sayfayı yenileyip PayTR ile tekrar deneyin.' },
    { status: 410 }
  )
}
