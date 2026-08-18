#!/usr/bin/env python3
"""
scripts/clean_exam_chunks_ocr_noise.py

18 Ağustos 2026 — Madde 10 (pratium-bekleyen-isler-uygulama-plani.md).

exam_chunks tablosunda, dikey/dekoratif PDF başlıklarının OCR sırasında
harf harf ayrılması sorununu (ör. "Ç\\nI\\nK\\nM\\nI\\nŞ\\n...") temizler.
Bu algoritma önceki oturumlarda elle, repo dışında çalıştırılıyordu (288
chunk'ta bulundu, 75'i temizlendi, 213'ü kaldı) — artık versiyon kontrolünde,
tekrar çalıştırılabilir, ve GÜVENLİ (küçük partiler + kontrol-karakteri
ön-temizliği + asla sessiz veri kaybı yok).

Tespit mantığı, lib/content-filters.ts'teki hasOcrLetterSplitNoise() ile
AYNIDIR (ardışık 12+ kısa/≤3 karakter satır = "harf harf ayrılmış" bir
başlık bloğu) — TypeScript ve Python tarafında iki ayrı ama birbirini
doğrulayan uygulama.

⚠️⚠️⚠️ 18 AĞUSTOS 2026 — BU SCRIPT ŞU AN GÜVENLİ DEĞİL, ÇALIŞTIRMAYIN. ⚠️⚠️⚠️
Aşağıdaki tespit mantığı (find_noise_line_ranges / MIN_RUN_DEFAULT=12),
gerçek exam_chunks verisine karşı bir dry-run ile (Supabase MCP üzerinden,
hiçbir satır yazılmadan) doğrulandığında ortaya çıktı ki "ardışık 12+ kısa
satır" kalıbı bu projede dekoratif başlık gürültüsünü DEĞİL, çoğunlukla
GERÇEK sınav içeriğini yakalıyor: kimya formülleri, DNA dizileri, çoktan
seçmeli şık listeleri, açı/derece listeleri, matematik üs kuralları. 57
aday chunk'ın dry-run'ı incelendi, neredeyse hiçbiri gerçek "harf harf
ayrılmış başlık" değildi — --apply ile çalıştırılsaydı bu gerçek içeriği
kalıcı olarak silerdi. Aynı tespit mantığını kullanan lib/content-
filters.ts'teki hasOcrLetterSplitNoise() de bu yüzden meb-search ve
content-quality-scan cron'undan KALDIRILDI (bkz. o dosyadaki yorum).
Bu script YENİDEN TASARLANMADAN ve YENİDEN DOĞRULANMADAN çalıştırılmamalı.

GÜVENLİK KURALLARI (bu oturumda öğrenilen derslerin doğrudan sonucu):
  1. VARSAYILAN ÇALIŞMA MODU DRY-RUN'DIR. Hiçbir şey yazılmaz, sadece
     hangi chunk'ların değişeceği ve NASIL değişeceği (öncesi/sonrası)
     terminale basılır. Gerçek yazma için --apply gerekir.
  2. Küçük partiler halinde çalışır (varsayılan 12 chunk/parti — 30-60'lık
     büyük partiler geçmişte riskli bulunmuştu). Her partiden sonra
     `content IS NULL` kontrolü yapılır; beklenmedik bir NULL görülürse
     script DURUR (kalan partiler işlenmez).
  3. Geçmişte bir SQL hatasına yol açan kontrol karakterleri (\\x00-\\x1f,
     \\x7f gibi) her yazımdan önce TÜM chunk'lardan (sadece gürültülü
     olanlardan değil) temizlenir.
  4. Temizlik sonucu içerik şüpheli derecede kısalırsa (< MIN_CONTENT_AFTER_CLEAN)
     script bu chunk'ı OTOMATİK GÜNCELLEMEZ — "muhtemelen gerçek içerik de
     silindi" diye MANUEL_INCELEME listesine düşürür. "Önce gör sonra sil"
     kontrol listesinin (Madde 5) ruhu: script kendi kendine karar verip
     içerik silmez, sadece işaretler.

Kullanım:
    # Sadece göster, hiçbir şey yazma (varsayılan):
    python3 scripts/clean_exam_chunks_ocr_noise.py

    # İlk 12 chunk'ı gerçekten temizle:
    python3 scripts/clean_exam_chunks_ocr_noise.py --apply --limit 12

    # Partiler halinde tüm 213 kalanı temizlemek için tekrar tekrar çalıştır
    # (her çalıştırma bir sonraki bulunmamış partiyi işler):
    python3 scripts/clean_exam_chunks_ocr_noise.py --apply --batch-size 12

Ortam değişkenleri (proje .env.local ile aynı isimler):
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
from typing import Any

try:
    import requests
except ImportError:
    print("Bu script 'requests' paketine ihtiyaç duyuyor: pip install requests", file=sys.stderr)
    sys.exit(1)

MIN_RUN_DEFAULT = 12          # lib/content-filters.ts'teki hasOcrLetterSplitNoise ile AYNI eşik
MIN_CONTENT_AFTER_CLEAN = 80  # bundan kısa kalırsa otomatik yazma, manuel incelemeye düşür
CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def strip_control_chars(text: str) -> str:
    """Geçmişte bir SQL hatasına yol açan görünmez kontrol karakterlerini
    (ör. \\x1e, \\x1f) temizler — her yazımdan önce, gürültülü olsun olmasın
    TÜM chunk'lara uygulanır."""
    return CONTROL_CHAR_RE.sub("", text)


def find_noise_line_ranges(lines: list[str], min_run: int) -> list[tuple[int, int]]:
    """Ardışık ≥min_run kısa (1-3 karakter) satırlık blokları bulur.
    TypeScript tarafındaki hasOcrLetterSplitNoise() ile birebir aynı mantık."""
    ranges: list[tuple[int, int]] = []
    run_start: int | None = None
    run_len = 0

    def close_run(end_idx: int):
        nonlocal run_start, run_len
        if run_start is not None and run_len >= min_run:
            ranges.append((run_start, end_idx))
        run_start = None
        run_len = 0

    for i, line in enumerate(lines):
        trimmed = line.strip()
        if 0 < len(trimmed) <= 3:
            if run_start is None:
                run_start = i
            run_len += 1
        else:
            close_run(i)
    close_run(len(lines))
    return ranges


def clean_ocr_noise(text: str, min_run: int = MIN_RUN_DEFAULT) -> tuple[str, bool]:
    """Harf-harf-ayrılmış gürültü satırlarını çıkarır. (temiz_metin, degisti_mi) döner."""
    lines = text.split("\n")
    ranges = find_noise_line_ranges(lines, min_run)
    if not ranges:
        return text, False

    removed = set()
    for start, end in ranges:
        removed.update(range(start, end))

    kept = [line for i, line in enumerate(lines) if i not in removed]
    cleaned = "\n".join(kept)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned).strip()
    return cleaned, True


class SupabaseRest:
    """Minimal PostgREST istemcisi — supabase-py bağımlılığı eklemeden,
    projenin zaten .env.local'de tuttuğu aynı iki değişkenle çalışır."""

    def __init__(self):
        self.url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").rstrip("/")
        self.key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not self.url or not self.key:
            print(
                "HATA: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY ortam "
                "değişkenleri gerekli (proje .env.local dosyasındakiyle aynı).",
                file=sys.stderr,
            )
            sys.exit(1)
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }

    def fetch_batch(self, offset: int, limit: int) -> list[dict[str, Any]]:
        res = requests.get(
            f"{self.url}/rest/v1/exam_chunks",
            headers=self.headers,
            params={
                "select": "id,content,exam_resource_id,chunk_index",
                "order": "id.asc",
                "offset": str(offset),
                "limit": str(limit),
            },
            timeout=30,
        )
        res.raise_for_status()
        return res.json()

    def update_content(self, chunk_id: str, new_content: str) -> None:
        res = requests.patch(
            f"{self.url}/rest/v1/exam_chunks",
            headers=self.headers,
            params={"id": f"eq.{chunk_id}"},
            json={"content": new_content},
            timeout=30,
        )
        res.raise_for_status()

    def count_null_content(self) -> int:
        res = requests.get(
            f"{self.url}/rest/v1/exam_chunks",
            headers={**self.headers, "Prefer": "count=exact"},
            params={"select": "id", "content": "is.null", "limit": "1"},
            timeout=30,
        )
        res.raise_for_status()
        content_range = res.headers.get("content-range", "")
        # PostgREST format: "0-0/5" ya da "*/5"
        return int(content_range.split("/")[-1]) if "/" in content_range else 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Gerçekten yaz (varsayılan: dry-run, sadece göster)")
    parser.add_argument("--batch-size", type=int, default=12, help="Parti başına chunk sayısı (varsayılan 12 — büyük partiler riskli)")
    parser.add_argument("--limit", type=int, default=None, help="Bu çalıştırmada işlenecek TOPLAM chunk sayısı üst sınırı (varsayılan: hepsi, parti parti)")
    parser.add_argument("--offset", type=int, default=0, help="Nereden başlanacağı (kaldığın yerden devam etmek için)")
    parser.add_argument("--min-run", type=int, default=MIN_RUN_DEFAULT, help="Gürültü sayılacak ardışık kısa satır eşiği")
    parser.add_argument("--i-have-redesigned-the-heuristic", action="store_true",
                         help="Bu bayrak olmadan --apply çalışmaz — bkz. dosya başındaki 18 Ağustos uyarısı.")
    args = parser.parse_args()

    if args.apply and not args.i_have_redesigned_the_heuristic:
        print(
            "\n🛑 DURDURULDU: Bu script'in tespit mantığı 18 Ağustos 2026'da gerçek "
            "exam_chunks verisine karşı dry-run ile test edildiğinde GERÇEK sınav "
            "içeriğini (kimya formülleri, DNA dizileri, çoktan seçmeli şıklar) "
            "yanlış 'gürültü' olarak işaretlediği görüldü. Dosya başındaki uyarıyı "
            "okuyun. Heuristik yeniden tasarlanıp yeniden doğrulanmadan --apply "
            "çalıştırılamaz. (Bilerek geçmek için: --i-have-redesigned-the-heuristic)",
            file=sys.stderr,
        )
        sys.exit(1)

    db = SupabaseRest()
    mode = "APPLY (gerçekten yazılacak)" if args.apply else "DRY-RUN (hiçbir şey yazılmayacak)"
    print(f"[clean_exam_chunks_ocr_noise] mod: {mode}, parti-boyutu: {args.batch_size}\n")

    processed = 0
    changed = 0
    manual_review: list[dict[str, Any]] = []
    offset = args.offset

    while True:
        if args.limit is not None and processed >= args.limit:
            break

        batch_limit = args.batch_size
        if args.limit is not None:
            batch_limit = min(batch_limit, args.limit - processed)

        batch = db.fetch_batch(offset, batch_limit)
        if not batch:
            break

        for row in batch:
            raw = row.get("content") or ""
            processed += 1

            # Kontrol karakterleri HER ZAMAN temizlenir (gürültülü olsun olmasın) —
            # geçmişteki SQL hatasının kök nedeni buydu.
            safe = strip_control_chars(raw)
            cleaned, has_noise = clean_ocr_noise(safe, args.min_run)

            if not has_noise and safe == raw:
                continue  # bu chunk zaten temiz, dokunma

            label = f"chunk id={row['id']} (exam_resource_id={row.get('exam_resource_id')}, idx={row.get('chunk_index')})"

            if len(cleaned.strip()) < MIN_CONTENT_AFTER_CLEAN:
                # Temizlik sonucu içerik şüpheli derecede kısaldı — otomatik
                # yazma, manuel incelemeye düşür (Madde 5 ruhu: sessiz veri kaybı yok).
                manual_review.append({"id": row["id"], "before": raw, "after": cleaned})
                print(f"  ⚠️  MANUEL İNCELEME GEREKİYOR — {label}: temizlik sonrası içerik çok kısa kaldı ({len(cleaned.strip())} karakter), otomatik yazılmadı.")
                continue

            changed += 1
            print(f"  ✏️  {label}: {len(raw)} → {len(cleaned)} karakter" + (" [kontrol karakteri temizlendi]" if safe != raw and not has_noise else ""))

            if args.apply:
                db.update_content(row["id"], cleaned)

        if args.apply:
            null_count = db.count_null_content()
            if null_count > 0:
                print(f"\n🛑 DURDURULDU: {null_count} chunk'ta content NULL görüldü (beklenmiyor) — kalan partiler işlenmedi. Elle kontrol et.")
                break
            time.sleep(0.3)  # Supabase'e nazik davran

        offset += len(batch)
        if len(batch) < batch_limit:
            break  # son parti

    print(f"\n[clean_exam_chunks_ocr_noise] Tamamlandı. İşlenen: {processed}, değişen: {changed}, manuel inceleme gereken: {len(manual_review)}.")
    if manual_review:
        print("Manuel inceleme gereken chunk id'leri:", ", ".join(str(m["id"]) for m in manual_review))
    if not args.apply:
        print("Bu bir DRY-RUN'dı — gerçekten yazmak için --apply ekleyerek tekrar çalıştır.")


if __name__ == "__main__":
    main()
