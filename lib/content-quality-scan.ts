// lib/content-quality-scan.ts
// Sistematik içerik kalite örneklemesi (Faz sonrası öneri #4). Bu
// oturumda öğretmen geri bildirimiyle bulunan hatalar (görünmeyen metne
// atıf, ders kitabı ön sayfası/İçindekiler sızıntısı, isimlendirilmiş
// ama verilmeyen bir tarihi metne kaçış) hep REAKTİFTİ — öğretmen
// bildirmeden önce sistem kendi başına fark etmiyordu.
//
// Bu modül, ÜRETİLMİŞ (öğrenciye zaten gösterilmiş, quiz_sessions'a
// kaydedilmiş) soruların bir örneklemini, GPT-4o ile (Claude'un ürettiği
// içeriği yine Claude'a kontrol ettirmemek için BAĞIMSIZ bir model)
// bilinen kural ihlallerine karşı otomatik tarar.
//
// Not: Bu, ÜRETIM ANINDAKI filtrelerin (bookMetadataPattern,
// unseenPassagePattern — generate-quiz/route.ts) YERİNE geçmez, onlara
// EK bir güvenlik ağıdır — filtreler bir şeyi kaçırırsa, ya da AI yeni
// bir şekilde konudan saparsa (Gençliğe Hitabesi örneğinde olduğu gibi,
// regex'in önceden bilmediği bir kaçış deseni) bu tarama onu yakalar.

const OPENAI_API_KEY = process.env.OPENAI_API_KEY

export interface QualityIssue {
  questionIndex: number
  issueType: 'unseen_passage' | 'book_metadata' | 'offtopic_drift' | 'chained_reference' | 'vocabulary_level' | 'answer_inconsistent'
  severity: 'high' | 'medium'
  reason: string
}

interface QuestionForScan {
  index: number
  q: string
  opts?: string[]
  ans?: number
  exp?: string
  type: string
}

const RULES_PROMPT = `Sen Pratium eğitim platformunun ürettiği soruları denetleyen bağımsız bir kalite kontrolcüsün. Aşağıdaki sorular, gerçek öğrencilere gösterilmiş MEB müfredatı sorularıdır. Her soruyu şu 6 bilinen kural ihlaline karşı kontrol et:

1. unseen_passage: Soru "metinde anlatılan X'e göre", "verilen metne göre", "parçada anlatılan" gibi bir ifade kullanıyor AMA o metnin/örneğin özetini/içeriğini sorunun kendi metnine hiç dahil etmiyor — öğrenci için cevaplanamaz.
2. book_metadata: Soru, kaynağın kendisi hakkında (kitabın yazarı, ISBN'i, İçindekiler sayfası, kaç sayfa olduğu vb.) — ders içeriği değil, kitabın idari bilgisi.
3. offtopic_drift: Soru, verilen konu/kazanımla İLGİSİZ, İSİMLENDİRİLMİŞ bir tarihi metne/esere/konuşmaya (ör. konu "demokrasi" iken soru "Gençliğe Hitabesi" veya "İstiklal Marşı"ndan alıntı yapıyor) kaçıyor — AI'ın kendi genel bilgisine düşüp konudan sapması.
4. chained_reference: Soru, öğrencinin görmediği BAŞKA bir soruya/örneğe/tabloya atıfta bulunuyor (ör. "Soru 39'a göre", "yukarıdaki tabloya göre" ama tablo hiç verilmemiş).
5. vocabulary_level: Sorunun dili, belirtilen sınıf seviyesindeki bir öğrencinin bilemeyeceği kadar akademik/soyut/üniversite düzeyinde kelimeler içeriyor.
6. answer_inconsistent: "ans" (doğru cevap indeksi) ile "exp" (açıklama) birbiriyle çelişiyor, ya da açıklama sorunun kendi mantığıyla tutarsız.

SADECE gerçekten belirgin bir ihlal varsa bildir — şüpheli/sınırda durumları atla (yanlış pozitif üretmek, gerçek sorunları gözden kaçırmaktan daha maliyetlidir). Yalnızca geçerli JSON döndür:
{"issues": [{"questionIndex": 0, "issueType": "unseen_passage", "severity": "high", "reason": "kısa açıklama (1 cümle)"}]}
Hiç ihlal yoksa: {"issues": []}`

async function callOpenAIJudge(topic: string, grade: string, questions: QuestionForScan[]): Promise<QualityIssue[]> {
  if (!OPENAI_API_KEY) return []

  const questionsText = questions.map(q =>
    `[${q.index}] (${q.type}) Soru: ${q.q}${q.opts ? `\nSeçenekler: ${q.opts.join(' | ')}` : ''}${q.exp ? `\nAçıklama: ${q.exp}` : ''}`
  ).join('\n\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 1500,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: RULES_PROMPT },
          { role: 'user', content: `Konu: ${topic}\nSınıf seviyesi: ${grade}\n\nSorular:\n${questionsText}` },
        ],
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      console.warn('[content-quality-scan] OpenAI hatası:', res.status)
      return []
    }
    const data = await res.json()
    const text = data?.choices?.[0]?.message?.content || '{}'
    const parsed = JSON.parse(text)
    return Array.isArray(parsed.issues) ? parsed.issues : []
  } catch (e) {
    console.warn('[content-quality-scan] Judge çağrısı başarısız:', e)
    return []
  }
}

// Bir quiz oturumunun sorularını tara, bulunan ihlalleri döndür.
// Maliyeti sınırlamak için tek çağrıda en fazla 10 soru gönderilir.
export async function scanQuestionsForQualityIssues(
  topic: string,
  grade: string,
  questions: QuestionForScan[]
): Promise<QualityIssue[]> {
  if (!questions.length) return []
  const batch = questions.slice(0, 10)
  return callOpenAIJudge(topic, grade, batch)
}
