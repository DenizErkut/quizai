UPDATE error_reports
SET status = 'confirmed',
    admin_note = 'Onceki commit (6a4fea0, subject backend fix) YETERSIZ kaldi cunku frontend hicbir zaman gercek subject degeri gondermiyordu -- page.tsx''teki "openSubject" state''i hic set edilmeyen olu kod, gercek deger QuizSetup.tsx''in KENDI yerel openSubject''inde tutuluyordu ama konu secildigi anda page.tsx''e aktarilmadan sifirlaniyordu. State-lifting ile duzeltildi (17 Agustos 2026, commit sonraki).'
WHERE id IN ('316c47bc-3e54-4f1d-9b50-e77096ced563', 'c296185c-998e-46a6-9e9c-00f9be2d4c91', '83e11b76-d0f5-4144-bdcf-d11ff8f5fef4', 'e3ba681e-6e32-49ab-9b6c-5b0433d22e93');
