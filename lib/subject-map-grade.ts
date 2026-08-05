// lib/subject-map-grade.ts
// Açık Uçlu Sorular (AUS) için SINIF BAZINDA (1-12, genel "seviye" değil)
// ders/konu haritası. lib/subject-map.ts'teki SUBJECT_MAP kasıtlı olarak
// DEĞİŞTİRİLMEDİ (quiz/generate-quiz/raporlarda hâlâ kullanılıyor, oraya
// dokunmak başka özellikleri bozabilirdi) — bu, sadece AUS'a özel, daha
// ince taneli (sınıf bazlı) bir kaynak.
//
// Amaç: 7. sınıf bir öğrencinin karşısına "Kimya" (lise dersi) ya da
// 8. sınıfa özel konular (ör. "Madde ve Endüstri", "T.C. İnkılap Tarihi")
// çıkmasın — sadece kendi sınıfının gerçek müfredatındaki ders ve alt
// başlıklar gelsin.
//
// NOT: Bu liste MEB müfredatının genel akışına göre elden hazırlanmıştır.
// Resmi müfredat her yıl küçük revizyonlar geçirebilir — kritik bir
// kullanım öncesi (ör. büyük bir kurumsal lansman) MEB'in güncel ders
// içeriği tablolarıyla karşılaştırılıp gözden geçirilmesi önerilir.

export const SUBJECT_MAP_BY_GRADE: Record<string, Record<string, string[]>> = {
  // ── İLKOKUL ──────────────────────────────────────────────────────
  '1': {
    'Matematik': ['Doğal sayılar (1-100)', 'Toplama işlemi', 'Çıkarma işlemi', 'Geometrik şekiller', 'Örüntüler', 'Zaman kavramları'],
    'Türkçe': ['Ses ve harf bilgisi', 'Okumaya geçiş', 'Basit cümleler kurma', 'Dinleme becerileri'],
    'Hayat Bilgisi': ['Okulumu tanıyorum', 'Ailem ve ben', 'Sağlığım', 'Güvenli yaşam'],
  },
  '2': {
    'Matematik': ['Doğal sayılar (1000\'e kadar)', 'Toplama-çıkarma işlemleri', 'Ölçme ve tartma', 'Saat okuma', 'Paramız'],
    'Türkçe': ['Okuduğunu anlama', 'Yazım kurallarına giriş', 'Noktalama işaretlerine giriş', 'Sözcük dağarcığı'],
    'Hayat Bilgisi': ['Dün, bugün, yarın', 'Doğa ve çevremiz', 'Trafik güvenliği'],
    'İngilizce': ['Alphabet and letters', 'Colours and shapes', 'Greetings', 'My family'],
  },
  '3': {
    'Matematik': ['Doğal sayılar (100.000\'e kadar)', 'Çarpma işlemine giriş', 'Bölme işlemine giriş', 'Kesirlere giriş', 'Çevre hesaplama'],
    'Türkçe': ['Paragraf bilgisi', 'Metin türlerine giriş', 'Yazım-noktalama uygulamaları'],
    'Hayat Bilgisi': ['Bireysel farklılıklar', 'Doğal afetler', 'Üretim ve tüketim'],
    'Fen Bilimleri': ['Canlılar dünyası', 'Maddenin halleri', 'Kuvvetin etkileri'],
    'İngilizce': ['Numbers', 'Animals', 'Food and drinks', 'Days and months'],
  },
  '4': {
    'Matematik': ['Büyük doğal sayılar', 'Kesirlerle işlemler', 'Ondalık gösterime giriş', 'Açı ve üçgenler', 'Veri toplama ve grafik'],
    'Türkçe': ['Metin türleri (hikaye, şiir, bilgilendirici)', 'Anlam bilgisi', 'Yazım kuralları ileri'],
    'Fen Bilimleri': ['İnsan vücudu ve duyu organları', 'Işık ve ses', 'Madde ve özellikleri', 'Basit elektrik devreleri'],
    'Sosyal Bilgiler': ['İletişim ve empati', 'Yakın çevremizi tanıyalım (harita okuma)', 'Doğal afetler ve önlemler', 'İhtiyaç ile istek arasındaki fark', 'Atatürk\'ün çocukluğu ve eğitim hayatı', 'Aile tarihimiz ve kültürel mirasımız', 'Haklarım, kurallar ve sorumluluklarım'],
    'Din Kültürü ve Ahlak Bilgisi': ['Allah inancı', 'Peygamberimiz', 'Güzel ahlak'],
    'İngilizce': ['Weather', 'Classroom objects', 'Simple present: I like / I have'],
  },

  // ── ORTAOKUL ─────────────────────────────────────────────────────
  '5': {
    'Matematik': ['Doğal sayılarla işlemler', 'Kesirler', 'Ondalık gösterim', 'Temel geometrik kavramlar (açı, üçgen, dörtgen)', 'Çevre ve alan hesaplamaya giriş', 'Veri toplama'],
    'Fen Bilimleri': ['Güneş, Dünya ve Ay', 'Canlılar dünyasını gezelim tanıyalım', 'Kuvvetin ölçülmesi ve dengelenmesi', 'Işığın yayılması', 'Madde ve değişim (erime, donma, buharlaşma)', 'Elektrik devresi elemanlarına giriş'],
    'Türkçe': ['Sözcükte anlam', 'İsim ve isim çekimi', 'Sıfatlar', 'Cümlede anlam', 'Hikaye edici metinler'],
    'Sosyal Bilgiler': ['Birey ve toplum', 'Kültür ve miras', 'İnsanlar, yerler, çevreler', 'Üretim, dağıtım, tüketim'],
    'İngilizce': ['Greetings and introductions', 'Present simple tense', 'Vocabulary: family', 'Question words'],
    'Din Kültürü ve Ahlak Bilgisi': ['Allah inancı ve evren', 'Kur\'an-ı Kerim\'i tanıyalım', 'Peygamberimizin hayatı'],
  },
  '6': {
    'Matematik': ['Kesirlerle işlemler', 'Oran ve orantı', 'Tam sayılar', 'Cebirsel ifadelere giriş', 'Çember', 'Alan hesaplamaları', 'Veri analizi'],
    'Fen Bilimleri': ['Güneş sistemi ve tutulmalar', 'Vücudumuzdaki sistemler (destek-hareket, sindirim)', 'Kuvvet ve hareket (sürtünme)', 'Işığın madde ile etkileşimi', 'Elektriğin iletimi', 'Madde ve ısı'],
    'Türkçe': ['Zamirler', 'Fiiller ve çekimi', 'Zarflar', 'Cümle çeşitleri', 'Bilgilendirici metinler'],
    'Sosyal Bilgiler': ['Kanıt kullanarak bilgiye ulaşma', 'Empati ve çatışma çözme', 'Türkiye\'de nüfus dağılımı ve göç', 'Yerel yönetimler ve sivil toplum kuruluşları', 'Kaynakların bilinçli kullanımı', 'Bilimsel buluşların hayatımıza etkisi', 'Geleneklerimiz ve kültürel mirasımız'],
    'İngilizce': ['Present continuous', 'Past simple tense', 'Comparatives', 'Vocabulary: food and health'],
    'Din Kültürü ve Ahlak Bilgisi': ['Melekler ve manevi varlıklar', 'Kaza ve kader', 'İbadetlerimiz'],
  },
  '7': {
    'Matematik': ['Tam sayılarla işlemler', 'Rasyonel sayılar', 'Cebirsel ifadeler ve özdeşlikler', 'Doğrusal denklemler', 'Çokgenler', 'Çember ve daire', 'Olasılık'],
    'Fen Bilimleri': ['Güneş sistemi ve ötesi (yıldızlar)', 'Hücre ve bölünmeler', 'Kuvvet ve enerji', 'Elektrik yükleri ve devre elemanları', 'Saf madde ve karışımlar', 'Işığın madde ile etkileşimi (mercekler)'],
    'Türkçe': ['Fiilimsi', 'Cümlenin ögeleri', 'Anlatım bozuklukları (giriş)', 'Şiir bilgisi', 'Metin türleri (deneme, mektup)'],
    'Sosyal Bilgiler': ['İpek Yolu\'nda Türk kültürü (Orta Asya Türk devletleri)', 'Selçuklu ve Türkiye Selçuklu Devleti', 'Osmanlı Devleti\'nin kuruluşu', 'Ülkemizin doğal kaynakları ve ekonomik faaliyetleri', 'Bilim insanlarının katkıları', 'Hak arama yolları ve etkin vatandaşlık', 'Göç ve kültürel etkileşim'],
    'İngilizce': ['Future tense (will/going to)', 'Modals (can/must/should)', 'Prepositions', 'Vocabulary: environment', 'Reading comprehension'],
    'Din Kültürü ve Ahlak Bilgisi': ['Ahiret inancı', 'Hac ve zekat', 'Din ve ahlaki değerler'],
  },
  '8': {
    'Matematik': ['Çarpanlar ve katlar (OBEB-OKEK)', 'Üslü ifadeler', 'Kareköklü ifadeler', 'Veri analizi ve olasılık', 'Dönüşüm geometrisi', 'Eşitsizlikler', 'Denklem sistemleri', 'Koni, silindir, küre'],
    'Fen Bilimleri': ['DNA ve genetik kod', 'Kalıtım', 'Basınç', 'Madde ve endüstri (atom, element, periyodik sistem)', 'Enerji dönüşümleri', 'Basit makineler', 'Sesin farklı ortamlarda yayılması'],
    'Türkçe': ['Cümlenin ögeleri (ileri)', 'Anlatım bozuklukları', 'Paragrafta yapı', 'Yazım ve noktalama (ileri)', 'Metin çözümleme'],
    'T.C. İnkılap Tarihi ve Atatürkçülük': ['Osmanlı Devleti\'nin son dönemi', 'I. Dünya Savaşı ve Mondros', 'Kurtuluş Savaşı hazırlık dönemi ve TBMM', 'Cepheler ve Lozan Antlaşması', 'Cumhuriyetin ilanı', 'Atatürk ilkeleri', 'Siyasi, hukuki ve eğitimde inkılaplar'],
    'İngilizce': ['Comparatives and superlatives', 'Vocabulary: environment and technology', 'Writing paragraphs', 'Listening skills'],
    'Din Kültürü ve Ahlak Bilgisi': ['Kader ve irade ilişkisi', "Kur'an'dan ilkeler", 'Din ve laiklik'],
  },

  // ── LİSE ─────────────────────────────────────────────────────────
  '9': {
    'Matematik': ['Mantık', 'Kümeler', 'Denklemler ve eşitsizlikler', 'Üslü ve köklü sayılar', 'Mutlak değer'],
    'Fizik': ['Fizik bilimine giriş', 'Madde ve özellikleri', 'Kuvvet ve hareket', 'Newton yasaları', 'İş, güç ve enerji'],
    'Kimya': ['Kimyanın temelleri', 'Atom modelleri', 'Periyodik sistem', 'Kimyasal türler arası etkileşimler'],
    'Biyoloji': ['Bilimsel düşünce ve biyoloji', 'Hücre', 'Hücre zarı ve madde geçişi', 'Canlıların temel bileşenleri'],
    'Türk Dili ve Edebiyatı': ['Dil bilgisi: ses bilgisi', 'Dil bilgisi: sözcük yapısı', 'Anlatım türleri', 'Şiir bilgisine giriş'],
    'Tarih': ['Tarih öncesi dönemler', 'İlk uygarlıklar', 'Orta Asya Türk tarihi'],
    'Coğrafya': ['Doğa ve insan', 'Harita bilgisi', 'Dünyanın şekli ve hareketleri'],
    'İngilizce': ['Present tenses review', 'Reading strategies', 'Basic academic vocabulary'],
  },
  '10': {
    'Matematik': ['Polinomlar', 'Rasyonel ifadeler', 'Fonksiyonlara giriş', 'Birinci dereceden fonksiyonlar', 'Trigonometriye giriş'],
    'Fizik': ['İtme ve momentum', 'Elektrostatik', 'Elektrik akımı', 'Manyetizma', 'Dalgalar'],
    'Kimya': ['Maddenin halleri', 'Gaz kanunları', 'Çözeltiler ve derişim', 'Asit ve bazlar'],
    'Biyoloji': ['Hücre bölünmeleri (mitoz-mayoz)', 'Kalıtımın temel ilkeleri', 'Bitki biyolojisi', 'Ekosistem ekolojisi'],
    'Türk Dili ve Edebiyatı': ['Halk edebiyatı', 'Divan edebiyatı', 'Tanzimat edebiyatı', 'Söz sanatları'],
    'Tarih': ['İslamiyet öncesi Türk tarihi', 'İslam medeniyeti', 'Türk-İslam devletleri', 'Osmanlı kuruluş ve yükseliş'],
    'Coğrafya': ['Atmosfer ve iklim', 'İklim tipleri', 'Litosfer ve yer şekilleri', 'Türkiye\'nin yer şekilleri'],
    'İngilizce': ['Conditionals (giriş)', 'Passive voice', 'Writing paragraphs', 'Listening for detail'],
  },
  '11': {
    'Matematik': ['Fonksiyonlar (ileri)', 'Trigonometri', 'Logaritma', 'Diziler (aritmetik ve geometrik)', 'Limit ve sürekliliğe giriş'],
    'Fizik': ['Elektrik alan', 'Manyetik alan', 'Elektromanyetik indüksiyon', 'Basit harmonik hareket'],
    'Kimya': ['Kimyasal tepkimeler ve denkleştirme', 'Mol kavramı ve hesaplamalar', 'Kimyasal denge', 'Asit-baz dengesi'],
    'Biyoloji': ['Sinir sistemi', 'Endokrin sistem', 'Duyu organları', 'Sindirim, dolaşım ve solunum sistemleri'],
    'Türk Dili ve Edebiyatı': ['Servet-i Fünun ve Milli Edebiyat dönemi', 'Cumhuriyet dönemi edebiyatı', 'Roman ve hikaye', 'Tiyatro'],
    'Tarih': ['Osmanlı gerileme ve çöküş dönemi', 'Fransız İhtilali ve Sanayi Devrimi', 'I. Dünya Savaşı'],
    'Coğrafya': ['Türkiye\'nin nüfus ve yerleşme özellikleri', 'Tarım ve sanayi coğrafyası', 'Türkiye ekonomisi'],
    'Felsefe': ['Felsefeye giriş', 'Bilgi felsefesi (epistemoloji)', 'Varlık felsefesi (ontoloji)'],
  },
  '12': {
    'Matematik': ['Türev', 'Türevin uygulamaları', 'İntegral ve uygulamaları', 'Analitik geometri', 'Olasılık ve istatistik'],
    'Fizik': ['Atom fiziği', 'Nükleer fizik', 'Modern fizik', 'Termodinamik'],
    'Kimya': ['Organik kimyaya giriş', 'Hidrokarbonlar', 'Fonksiyonlu organik bileşikler', 'Elektrokimya'],
    'Biyoloji': ['Üreme sistemi', 'Evrim', 'Biyoteknoloji ve genetik mühendisliği', 'Canlı çeşitliliği'],
    'Türk Dili ve Edebiyatı': ['Cumhuriyet sonrası edebi akımlar', 'Deneme ve makale', 'Kompozisyon ve yazma becerileri'],
    'T.C. İnkılap Tarihi ve Atatürkçülük': ['Atatürk dönemi dış politika', 'II. Dünya Savaşı ve sonrası', 'Soğuk Savaş dönemi', 'Günümüz Türkiye ve dünya'],
    'Coğrafya': ['Küresel çevre sorunları', 'Küresel ısınma', 'Jeopolitik konum', 'Bölgesel coğrafya'],
    'Felsefe': ['Ahlak felsefesi (etik)', 'Siyaset felsefesi', 'Estetik', 'Çağdaş felsefe'],
  },
}

// "ortaokul 7. sınıf", "7. Sınıf", "lise 10.sinif" gibi çeşitli yazımlardan
// sınıf NUMARASINI çıkarır. Bulamazsa null döner (fallback için).
export function extractGradeNumber(grade: string | null | undefined): number | null {
  if (!grade) return null
  const m = grade.match(/(\d{1,2})\s*\.?\s*s[ıi]n[ıi]f/i)
  if (m) {
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= 12) return n
  }
  return null
}

// Sınıf numarası hiç çıkarılamazsa (ör. 'universite' gibi bir değer),
// en yakın makul varsayılana düşer.
export function getSubjectsForGrade(grade: string | null | undefined): Record<string, string[]> {
  const n = extractGradeNumber(grade)
  if (n && SUBJECT_MAP_BY_GRADE[String(n)]) return SUBJECT_MAP_BY_GRADE[String(n)]

  const g = (grade || '').toLowerCase()
  if (g.includes('universite') || g.includes('üniversite')) return SUBJECT_MAP_BY_GRADE['12']
  if (g.includes('lise')) return SUBJECT_MAP_BY_GRADE['9']
  if (g.includes('ilkokul')) return SUBJECT_MAP_BY_GRADE['4']
  return SUBJECT_MAP_BY_GRADE['6'] // en genel/orta varsayılan
}
