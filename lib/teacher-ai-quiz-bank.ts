// Periodic teacher AI-literacy rounds: a question bank with three difficulty levels (four topics x
// three questions per level). Each round asks one question per topic at the teacher's current level,
// avoids questions seen before, and shuffles the options. The correct option is stored FIRST in the
// bank and only the shuffled order is persisted per round — answers never leave the server.

export type QuizTopic = 'verify' | 'curriculum' | 'pedagogy' | 'safety'
export type QuizLevel = 1 | 2 | 3

export type BankQuestion = { id: string; topic: QuizTopic; level: QuizLevel; q: string; options: [string, string, string, string]; explanation: string }

export const QUIZ_TOPICS: QuizTopic[] = ['verify', 'curriculum', 'pedagogy', 'safety']
export const QUIZ_MAX_LEVEL: QuizLevel = 3
export const QUIZ_INTERVAL_DAYS = 10
export const QUIZ_PASS_SCORE = 3
export const QUIZ_TOPIC_LABEL: Record<QuizTopic, string> = {
  verify: 'AI çıktısını doğrulama', curriculum: 'MEB kazanım uyumu', pedagogy: 'Yaşa uygun anlatım ve geri bildirim', safety: 'Öğrenci verisi ve güvenlik',
}

const b = (id: string, level: QuizLevel, q: string, options: [string, string, string, string], explanation: string): BankQuestion =>
  ({ id, topic: ({ v: 'verify', c: 'curriculum', p: 'pedagogy', s: 'safety' } as const)[id[0] as 'v' | 'c' | 'p' | 's'], level, q, options, explanation })

export const QUESTION_BANK: BankQuestion[] = [
  // ── verify
  b('v1', 1, 'AI’ın ürettiği bir sorunun cevap anahtarını sınıfta kullanmadan önce ne yapmalısınız?', ['Soruyu kendiniz çözüp anahtarla karşılaştırmalısınız', 'AI’a “emin misin?” diye sormak yeterlidir', 'Akıcı yazıldıysa doğru kabul etmelisiniz', 'Yalnızca zor soruları kontrol etmelisiniz'], 'Cevabı bağımsız çözmek, anahtarı doğrulamanın en doğrudan yoludur.'),
  b('v2', 1, 'AI bir kaynağa atıf yaptığında en güvenli davranış hangisidir?', ['Kaynağın gerçekten var olduğunu ve söyleneni içerdiğini kontrol etmek', 'Atıf varsa doğru sayıp kullanmak', 'Kaynak adı tanıdık geliyorsa geçmek', 'Atıfları silip metni olduğu gibi kullanmak'], 'AI var olmayan kaynak uydurabilir; atıf, doğruluğun kanıtı değildir.'),
  b('v3', 1, 'AI aynı soruya iki farklı cevap verdi. Ne yapmalısınız?', ['Güvenilir bir kaynakla veya kendi çözümünüzle hangisinin doğru olduğunu belirlemek', 'Daha uzun olanı seçmek', 'İkincisi daha yeni diye onu seçmek', 'İkisini de öğrencilere vermek'], 'Tutarsızlık, kontrol gerektiren bir uyarıdır; seçim kanıta dayanmalıdır.'),
  b('v4', 2, 'AI’ın cevabı çok kendinden emin ve ayrıntılı. Bu neyi gösterir?', ['Hiçbir şeyi; üslup güveni doğruluğun kanıtı değildir', 'Cevabın doğru olduğunu', 'Konunun eğitim verisinde bol olduğunu kesin olarak', 'Cevabın MEB uyumlu olduğunu'], 'Dil modelleri yanlış bilgiyi de ikna edici biçimde yazabilir.'),
  b('v5', 2, 'AI’dan 30 soruluk test istediniz. Makul ve etkili doğrulama yolu hangisidir?', ['Tüm cevap anahtarını yeniden çözerek kontrol etmek, şüpheli soruları ayrıca incelemek', 'İlk 5 soruya bakıp gerisini kabul etmek', 'Yalnızca şıkların dağılımına bakmak', 'Öğrenciler hata bulursa düzeltmek'], 'Hata her soruda olabilir; örnekleme tek başına yetmez.'),
  b('v6', 2, 'Matematik sorusunda AI’ın çözümü adım adım geldi ama son sonuç yanlış. Adımlar doğru görünüyor. Yaklaşımınız?', ['Adımları tek tek yeniden hesaplayıp hatayı bulmak, hatalı çözümü kullanmamak', 'Adımlar doğru görünüyorsa sonucu olduğu gibi bırakmak', 'Sonucu yalnızca cevap anahtarında değiştirmek', 'Soruyu hiç kontrol etmeden öğrencilere vermek'], 'Adımlarla sonuç tutarsızsa çözümün güvenilirliği yoktur; hata kaynağı bulunmalıdır.'),
  b('v7', 3, 'Hangi istek AI’ın uydurma (hallüsinasyon) üretme riskini en çok artırır?', ['Az bilinen yerel bir konuda tarih ve isimlerle dolu ayrıntılı anlatım istemek', 'İki sayıyı topla demek', 'Bilinen bir kelimenin eş anlamlısını sormak', 'Bir cümlenin yazım denetimini yaptırmak'], 'Seyrek veri ve çok somut ayrıntı isteği, uydurma ihtimalini yükseltir.'),
  b('v8', 3, 'Aynı AI aracı hem soruyu üretip hem de “doğrulamayı” yaparsa neden yetersiz olabilir?', ['Aynı hatayı aynı biçimde tekrarlayabilir; bağımsız bir kontrol (insan veya farklı yöntem) gerekir', 'Hiçbir zaman yetersiz olmaz', 'Yalnızca daha yavaş çalışır', 'Doğrulama için ayrı bir API anahtarı gerekir'], 'Kendi çıktısını kontrol eden model, kendi hatalarını görmezden gelebilir.'),
  b('v9', 3, 'Ders kitabındaki bir sorunun AI çözümü kitabın cevap anahtarıyla çelişiyor. En doğru yaklaşım?', ['Soruyu bağımsız çözüp çelişkinin kaynağını bulmak; kitapta basım hatası da AI’da hata da olabilir', 'Kitap her zaman doğrudur', 'AI her zaman doğrudur', 'İkisinin ortalamasını almak'], 'İki kaynak da yanılabilir; karar bağımsız çözüme dayanmalıdır.'),
  // ── curriculum
  b('c1', 1, 'Bir sorunun kazanımla eşleşmesi ne demektir?', ['Sorunun o kazanımda tanımlanan beceriyi gerçekten ölçmesi', 'Soruda kazanımın adının geçmesi', 'Sorunun aynı derse ait olması', 'Sorunun zor olması'], 'Eşleşme, ölçülen becerinin kazanımla örtüşmesiyle kurulur.'),
  b('c2', 1, 'Kazanım kodlarını nereden doğrulamalısınız?', ['Güncel resmî MEB öğretim programından', 'AI’ın verdiği koda güvenerek', 'Eski bir ders notundan', 'Öğrenci defterinden'], 'Birincil kaynak güncel resmî MEB programıdır.'),
  b('c3', 1, '6. sınıf öğrencisi için AI 9. sınıf düzeyinde bir soru üretti. Doğru tepki?', ['Soruyu hedef sınıf kapsamına uygun yeniden ürettirmek veya kullanmamak', 'Zor olduğu için meydan okuma sayıp vermek', 'Sınıf düzeyi önemli değildir', 'Yalnızca şıkları kısaltmak'], 'Soru, hedef sınıfın kazanım kapsamında kalmalıdır.'),
  b('c4', 2, 'AI “Bu soru X kazanımıyla birebir uyumlu” dedi. Ne yaparsınız?', ['Kazanım metnini programdan okuyup sorunun ölçtüğü beceriyle karşılaştırırım', 'AI söylediği için kabul ederim', 'Kod biçimi doğruysa kabul ederim', 'Başlıkları benziyorsa kabul ederim'], 'Uyum iddiası, kazanım metniyle karşılaştırılarak doğrulanır.'),
  b('c5', 2, 'Öğretim programı güncellendi. Eski sorular için en iyi yaklaşım?', ['Eski soruları yeni kazanım listesine göre yeniden eşleyip gerekirse güncellemek', 'Eski eşleşmeleri olduğu gibi kullanmak', 'Tüm soruları silmek', 'Kazanım kodlarını rastgele değiştirmek'], 'Program değişince eşleşmeler de yeniden kontrol edilmelidir.'),
  b('c6', 2, 'Soru kazanımın konusunda ama beceri düzeyi (ezber / yorum) kazanımdan farklı. Sonuç?', ['Kısmen uyumlu; beceri düzeyi de eşleşmeli, soru revize edilmeli', 'Konu aynıysa tam uyumlu', 'Beceri düzeyi önemsizdir', 'Şık sayısı belirler'], 'Kazanım yalnızca konuyu değil, ölçülecek becerinin düzeyini de belirler.'),
  b('c7', 3, 'Sınıfın %90’ı bir AI sorusunu yanlış yaptı. İlk hipotez ne olmalı?', ['Sorunun kendisinde (anahtar, belirsizlik, kapsam dışı) hata olabilir; önce soruyu denetlemek', 'Öğrenciler çalışmamıştır', 'AI soruları hep zordur', 'Süre kısadır'], 'Toplu başarısızlık, madde kalitesi sorununun güçlü bir işaretidir.'),
  b('c8', 3, 'Aynı kazanım için AI’ın ürettiği sorular art arda çok benziyor. Risk nedir?', ['Kazanımın farklı boyutları (bağlam, işlem, yorum) ölçülmeyebilir; çeşitlilik istemek gerekir', 'Risk yok, benzerlik iyidir', 'Öğrenci ezber yapamaz', 'Kazanım silinir'], 'Dar bir soru kümesi, kazanımın kapsamını temsil etmeyebilir.'),
  b('c9', 3, 'AI, kazanım kapsamında olmayan bir ön koşul bilgisi gerektiren soru yazdı. Doğru karar?', ['Ön koşulu belirleyip soruyu sadeleştirmek veya önce ön koşulu tekrar ettirip öyle kullanmak', 'Öğrenciler zaten bilmeli diye aynen vermek', 'Sorunun öğrenciden kaynaklandığını varsaymak', 'Soruyu hiç incelemeden kullanmak'], 'Gizli ön koşul, yanlışın nedenini belirsizleştirir ve ölçmeyi bozar.'),
  // ── pedagogy
  b('p1', 1, 'Öğrenci yanlış yaptığında AI geri bildirimi nasıl olmalı?', ['Hatanın nedenini açıklayan, sonraki adımı gösteren kısa geri bildirim', 'Yalnızca “Yanlış” demek', 'Her zaman doğru cevabı hemen vermek', 'Öğrenciyi eleştirmek'], 'Neden + sonraki adım, öğrenmeyi destekler.'),
  b('p2', 1, 'Küçük yaştaki öğrenciler için AI açıklamaları nasıl yazılmalı?', ['Kısa cümle, günlük örnek, tanıdık sözcüklerle', 'Akademik terimlerle', 'Mümkün olduğunca uzun', 'Yalnızca formüllerle'], 'Dil düzeyi yaşa uygun olmalıdır.'),
  b('p3', 1, 'Ödevlerde AI kullanımı için öğrenciye ne öğretmelisiniz?', ['AI’ı düşünmeyi desteklemek için kullanmayı, cevabı kopyalamamayı', 'Cevabı kopyalamayı', 'AI’ı hiç kullanmamayı', 'En hızlı aracı seçmeyi'], 'AI, öğrencinin kendi düşünmesinin yerine geçmemelidir.'),
  b('p4', 2, 'Öğrenci AI’dan hep doğrudan çözüm istiyor. Önerilen strateji?', ['Önce kendi denemesini yapmasını, AI’dan ipucu ve adım sorusu istemesini sağlamak', 'Çözüm istemeyi yasaklamak', 'Çözümü her zaman vermek', 'Hiç müdahale etmemek'], 'Kademeli ipucu, öğrencinin çabasını korur.'),
  b('p5', 2, 'Hangi geri bildirim öğrenmeyi daha çok destekler?', ['“Farklı bir yöntem denemen çok iyiydi” (süreç odaklı)', '“Çok zekisin” (kişi odaklı)', '“Herkesten iyisin”', 'Yalnızca puan'], 'Süreç odaklı geri bildirim, yeniden denemeyi teşvik eder.'),
  b('p6', 2, 'Okuma güçlüğü olan bir öğrenci için AI materyalini nasıl uyarlarsınız?', ['Sade yazı, kısa paragraflar, görsel destek ve sesli okuma seçeneği', 'Daha uzun ve yoğun metin', 'Süreyi kısaltmak', 'Materyali hiç değiştirmemek'], 'Erişilebilirlik uyarlamaları bilişsel yükü azaltır.'),
  b('p7', 3, 'AI’ın “kişiselleştirilmiş” önerileri için temel pedagojik risk nedir?', ['Öğrenciyi yalnızca kolay görevlere kilitleyip zorlanma alanını daraltabilir; öğretmen gözetimi gerekir', 'Hiçbir risk yoktur', 'Öğrenci çok hızlı öğrenir', 'Öğretmen gereksizleşir'], 'Uyarlama, uygun düzeyde zorlanmayı ortadan kaldırmamalıdır.'),
  b('p8', 3, 'Bir öğrencinin ödevinde üslup aniden değişti, AI kullanımı şüphesi var. İlk adım?', ['Suçlamadan konuşup süreci nasıl yürüttüğünü anlamak ve beklentiyi netleştirmek', 'Hemen sıfır vermek', 'Hiçbir şey yapmamak', 'Sınıfta ifşa etmek'], 'Önce süreci anlamak, adil ve öğretici bir yaklaşımdır.'),
  b('p9', 3, 'Çok sayıda doğru-yanlış bilgisi ile “neden” açıklaması arasında hangisi kalıcı öğrenmeyi daha çok destekler?', ['Neden açıklamaları ve yanlış cevap örüntüsüne dayalı hedefli yönlendirme', 'Yalnızca skor', 'Daha fazla soru her zaman daha iyidir', 'Açıklama süreyi uzattığı için gereksizdir'], 'Hatanın nedenini anlamak, aynı hatanın tekrarını azaltır.'),
  // ── safety
  b('s1', 1, 'AI aracına öğrenci bilgisi yazarken ne yapmalısınız?', ['Ad, soyad, numara gibi tanımlayıcıları çıkarıp anonim özetle çalışmak', 'Tam isim ve numarayı yazmak', 'Veli telefonunu eklemek', 'Öğrenci fotoğrafı yüklemek'], 'Asgari ve anonim veri, riski azaltır.'),
  b('s2', 1, 'Bir öğrenci AI sohbetinde kendine zarar verme düşüncesi paylaştı. Doğru adım?', ['Kurum prosedürüne göre rehber öğretmene/yetkiliye hemen bildirmek', 'Konuyu AI’a bırakmak', 'Görmezden gelmek', 'Sınıfta paylaşmak'], 'Hassas risklerde insan desteği ve kurum prosedürü esastır.'),
  b('s3', 1, 'AI’ın ürettiği bir görseli sınıfta kullanmadan önce ne yapmalısınız?', ['Doğruluk, yaşa uygunluk ve içerik güvenliği için incelemek', 'Güzelse kullanmak', 'Yalnızca boyutuna bakmak', 'Öğrencilere bırakmak'], 'AI görselleri de incelenmelidir.'),
  b('s4', 2, 'Sınıf listesini AI’a özet için yüklemek istiyorsunuz. En uygun yaklaşım?', ['Kişisel verileri çıkarıp anonimleştirmek; politika izin vermiyorsa hiç yüklememek', 'Listeyi olduğu gibi yüklemek', 'Yalnızca telefonları silmek', 'Adı bırakıp numarayı silmek'], 'Anonimleştirme ve kurum politikasına uyum birlikte gerekir.'),
  b('s5', 2, 'Hangi bilgi en yüksek gizlilik riskini taşır?', ['Sağlık veya aile durumu gibi hassas bilgilerle birleşmiş kimlik bilgisi', 'Ders adı', 'Sınıf düzeyi', 'Konu başlığı'], 'Kimlik ile hassas bilginin birleşimi en büyük risktir.'),
  b('s6', 2, 'Bir AI aracının veri politikasını bilmiyorsunuz. Öğrenci çalışmaları için ne yaparsınız?', ['Politikayı okuyup kurumca onaylı araçları kullanmak; emin değilsem kişisel veri girmemek', 'Önce kullanıp sonra bakmak', 'Herkes kullanıyor, sorun yok demek', 'Ücretliyse güvenli saymak'], 'Politikası bilinmeyen araca kişisel veri girilmez.'),
  b('s7', 3, 'Prompt injection (komut enjeksiyonu) nedir ve öğretmen için riski nedir?', ['Metne veya dosyaya gizlenmiş talimatla AI’ı yönlendirmedir; yüklenen içeriğe körü körüne güvenilmemelidir', 'AI’ın hızının artmasıdır', 'Bir şifreleme türüdür', 'Öğrencinin sınav kopyasıdır'], 'Dış içerik, AI’ın davranışını gizlice değiştirmeye çalışabilir.'),
  b('s8', 3, 'AI ile hazırlanan not raporunda bir öğrenci hakkında yanlış ve olumsuz bir iddia var. Önce ne yaparsınız?', ['Paylaşmadan düzeltmek ve kaynaktan doğrulamak; sorumluluğun size ait olduğunu bilmek', 'AI yazdı diye paylaşmak', 'Veliye “AI yazdı” demek', 'Olduğu gibi bırakmak'], 'Öğrenci hakkındaki içerikten öğretmen sorumludur.'),
  b('s9', 3, 'Kurumunuz öğrenci verisi için açık rıza istiyor. Onayı olmayan öğrencinin çalışmasını AI’a vermek?', ['Yapılmamalı; onaysız veriyle çalışılmaz veya anonimleştirilip izin kapsamına alınır', 'Serbesttir', 'Yalnızca adı silmek her zaman yeter', 'Öğrenci kabul ederse yeterlidir'], 'Rıza ve anonimleştirme birlikte değerlendirilir; tek başına ad silmek yetmeyebilir.'),
]

export const QUESTION_BY_ID = new Map(QUESTION_BANK.map(question => [question.id, question]))

export type RoundQuestion = { id: string; order: number[] } // order[i] = index into the bank options shown at position i

function shuffled(rng: () => number): number[] {
  const order = [0, 1, 2, 3]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
}

/** One question per topic at `level`, preferring questions the teacher has not seen yet. */
export function pickRound(level: QuizLevel, seenIds: Iterable<string>, rng: () => number = Math.random): RoundQuestion[] {
  const seen = new Set(seenIds)
  return QUIZ_TOPICS.map(topic => {
    const atLevel = QUESTION_BANK.filter(question => question.topic === topic && question.level === level)
    const unseen = atLevel.filter(question => !seen.has(question.id))
    // Once a level is exhausted, fall back to the whole topic pool (unseen first) before repeating.
    const pool = unseen.length ? unseen : QUESTION_BANK.filter(question => question.topic === topic && !seen.has(question.id)).length
      ? QUESTION_BANK.filter(question => question.topic === topic && !seen.has(question.id) && question.level <= level)
      : atLevel
    const candidates = pool.length ? pool : atLevel
    const picked = candidates[Math.floor(rng() * candidates.length)]
    return { id: picked.id, order: shuffled(rng) }
  })
}

export function nextLevel(level: QuizLevel, passed: boolean): QuizLevel {
  return passed ? (Math.min(QUIZ_MAX_LEVEL, level + 1) as QuizLevel) : level
}

export function isQuizDue(lastEventIso: string | null, now: Date, days = QUIZ_INTERVAL_DAYS): boolean {
  if (!lastEventIso) return true
  return now.getTime() - new Date(lastEventIso).getTime() >= days * 86_400_000
}

/** Questions as shown to the teacher (shuffled options, no answers). */
export function presentRound(round: RoundQuestion[]) {
  return round.map(({ id, order }) => {
    const question = QUESTION_BY_ID.get(id)!
    return { id, topic: question.topic, topicLabel: QUIZ_TOPIC_LABEL[question.topic], q: question.q, options: order.map(index => question.options[index]) }
  })
}

export function scoreRound(round: RoundQuestion[], answers: unknown) {
  if (!Array.isArray(answers) || answers.length !== round.length || answers.some(value => !Number.isInteger(value) || value < 0 || value > 3)) return null
  const results = round.map(({ id, order }, position) => {
    const question = QUESTION_BY_ID.get(id)!
    const correctPosition = order.indexOf(0)
    return { id, selected: answers[position] as number, correct: correctPosition, isCorrect: answers[position] === correctPosition, explanation: question.explanation }
  })
  const score = results.filter(result => result.isCorrect).length
  return { score, passed: score >= QUIZ_PASS_SCORE, results }
}
