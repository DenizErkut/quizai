// lib/subject-map.ts
// Seviye (ilkokul/ortaokul/lise/universite) -> ders -> konu listesi.
// Quiz oluşturma ekranı (app/quiz/page.tsx) VE öğrenci raporlarındaki
// (lib/student-report-topics.ts) "hangi konu hangi derse ait" eşleştirmesi
// için tek, paylaşılan kaynak. Burada değişiklik yapılırsa her iki yer de
// otomatik güncellenir.

export const SUBJECT_MAP: Record<string, Record<string, string[]>> = {
  ilkokul: {
    'Matematik': [
      'Doğal sayılar', 'Toplama işlemi', 'Çıkarma işlemi', 'Çarpma işlemi', 'Bölme işlemi',
      'Çarpım tablosu', 'Kesirler', 'Ondalık gösterim', 'Ölçme ve ölçü birimleri',
      'Geometrik şekiller', 'Simetri', 'Örüntüler', 'Problem çözme', 'Zaman ölçme',
    ],
    'Türkçe': [
      'Okuma ve anlama', 'Dinleme becerileri', 'Konuşma becerileri', 'Yazma becerileri',
      'Sözcük ve anlam', 'Cümle bilgisi', 'Yazım kuralları', 'Noktalama işaretleri',
      'Metin türleri', 'Şiir ve duygu', 'Atasözleri ve deyimler',
    ],
    'Fen Bilimleri': [
      'Canlılar dünyası', 'Bitkiler ve hayvanlar', 'İnsan vücudu', 'Duyu organları',
      'Madde ve özellikleri', 'Kuvvet ve hareket', 'Işık ve ses', 'Hava ve iklim',
      'Mevsimler', 'Çevre ve doğa', 'Geri dönüşüm', 'Sağlıklı yaşam',
    ],
    'Sosyal Bilgiler': [
      'Aile ve toplum', 'Yakın çevre', 'Türkiye haritası', 'Ülkemizin güzellikleri',
      'Milli değerler', 'Atatürk ve Kurtuluş Savaşı', 'Haklar ve sorumluluklar',
      'Üretim ve tüketim', 'Doğal kaynaklar', 'Kültürel miras',
    ],
    'Din Kültürü ve Ahlak Bilgisi': [
      'Allah inancı', 'Peygamberler', 'Namaz ve ibadet', 'Ahlaki değerler',
      'Dini bayramlar', 'Kuran-ı Kerim', 'Dua ve zihin',
    ],
    'Hayat Bilgisi': [
      'Okul heyecanım', 'Benim eşsiz yuvam', 'Dün bugün yarın',
      'Sağlıklı yaşam', 'Güvenli yaşam', 'Doğa ve çevre',
    ],
  },

  ortaokul: {
    'Matematik': [
      'Tam sayılar ve işlemler', 'Ondalık sayılar', 'Kesirler ve işlemler',
      'Oran ve orantı', 'Yüzdeler', 'Asal çarpanlara ayırma', 'OBEB ve OKEK',
      'Denklemler ve eşitsizlikler', 'Cebirsel ifadeler', 'Koordinat sistemi',
      'Üçgenler ve özellikler', 'Dörtgenler', 'Çember ve daire',
      'Alan ve çevre hesaplama', 'Hacim', 'Veri analizi ve grafik', 'Olasılık',
      'Örüntü ve ilişkiler', 'Rasyonel sayılar', 'Üslü ifadeler', 'Kareköklü ifadeler',
    ],
    'Fen Bilimleri': [
      'Hücre ve yapısı', 'Hücre organelleri', 'Canlıların sınıflandırılması',
      'Fotosentez', 'Solunum', 'Sindirim sistemi', 'Dolaşım sistemi',
      'Boşaltım sistemi', 'Destek ve hareket sistemi', 'Sinir sistemi',
      'Üreme ve gelişme', 'Kalıtım', 'Ekosistem ve biyoçeşitlilik',
      'Madde ve atom', 'Elementler ve bileşikler', 'Kimyasal tepkimeler',
      'Asit ve bazlar', 'Kuvvet ve enerji', 'Basınç', 'Elektrik',
      'Manyetizma', 'Işık ve ses', 'Dalgalar', 'Güneş sistemi',
    ],
    'Türkçe': [
      'Sözcük türleri', 'İsim ve isim çekimi', 'Sıfatlar', 'Zarflar', 'Zamirler',
      'Fiiller ve çekimi', 'Cümle çeşitleri', 'Cümle ögeleri',
      'Anlam bilgisi', 'Sözcükte anlam', 'Paragraf', 'Metin türleri',
      'Hikaye edici metin', 'Bilgilendirici metin', 'Şiir bilgisi',
      'Yazım kuralları', 'Noktalama işaretleri', 'Anlatım bozukluğu',
    ],
    'T.C. İnkılap Tarihi ve Atatürkçülük': [
      'Osmanlı Devleti son dönem', 'I. Dünya Savaşı', 'Mondros Ateşkesi',
      'Kurtuluş Savaşı hazırlık dönemi', 'Misak-ı Millî', 'TBMM açılışı',
      'Cepheler ve savaşlar', 'Mudanya Ateşkesi', 'Lozan Antlaşması',
      'Cumhuriyetin ilanı', 'Atatürk ilkeleri', 'İnkılaplar',
      'Siyasi alanda yenilikler', 'Eğitimde yenilikler', 'Ekonomik yenilikler',
    ],
    'Sosyal Bilgiler': [
      'Birey ve kimlik', 'Kültür ve miras', 'İnsanlar yerler çevreler',
      'Üretim dağıtım tüketim', 'Bilim teknoloji toplum',
      'Gruplar kurumlar sosyal örgütler', 'Küresel bağlantılar',
      'Türkiye coğrafyası', 'Nüfus ve yerleşme', 'Ekonomik faaliyetler',
      'Türk tarihinde yolculuk', 'Demokrasi ve insan hakları',
    ],
    'İngilizce': [
      'Greetings and introductions', 'Present simple tense', 'Present continuous',
      'Past simple tense', 'Future tense (will/going to)', 'Modals (can/must/should)',
      'Comparatives and superlatives', 'Prepositions', 'Question words',
      'Vocabulary: family', 'Vocabulary: food and health', 'Vocabulary: environment',
      'Reading comprehension', 'Listening skills', 'Writing paragraphs',
    ],
    'Din Kültürü ve Ahlak Bilgisi': [
      'Allah ve sıfatları', 'Melekler', 'Kitaplar', 'Peygamberler', 'Ahiret inancı',
      'Kader', 'İbadetler', 'Namaz', 'Oruç', 'Zekat', 'Hac',
      'Kuran-ı Kerim', 'Hz. Muhammed', 'Ahlaki değerler', 'Dini bayramlar',
    ],
    'Görsel Sanatlar': [
      'Renk teorisi', 'Perspektif', 'Sanat akımları', 'Türk sanatı', 'Heykel ve seramik',
    ],
    'Müzik': [
      'Nota bilgisi', 'Ritim', 'Türk halk müziği', 'Türk sanat müziği', 'Evrensel müzik',
    ],
    'Beden Eğitimi': [
      'Atletizm', 'Jimnastik', 'Takım sporları', 'Sağlıklı yaşam', 'Oyun ve spor',
    ],
  },

  lise: {
    'Matematik': [
      'Mantık', 'Kümeler', 'Denklemler ve eşitsizlikler', 'Üslü ve köklü sayılar',
      'Mutlak değer', 'Polinomlar', 'Rasyonel ifadeler', 'Fonksiyonlar',
      'Birinci ve ikinci dereceden fonksiyonlar', 'Trigonometri', 'Logaritma',
      'Diziler (aritmetik ve geometrik)', 'Limit ve süreklilik', 'Türev',
      'Türevin uygulamaları', 'İntegral', 'İntegralin uygulamaları',
      'Analitik geometri', 'Vektörler', 'Matrisler', 'Kombinasyon ve permütasyon',
      'Binom açılımı', 'Olasılık', 'İstatistik', 'Karmaşık sayılar',
    ],
    'Fizik': [
      'Fizik bilimine giriş', 'Madde ve özellikleri', 'Kuvvet ve hareket',
      'Newton yasaları', 'İş güç enerji', 'İtme ve momentum', 'Tork ve açısal hareket',
      'Basit harmonik hareket', 'Dalgalar', 'Ses dalgaları', 'Işık ve optik',
      'Elektrostatik', 'Elektrik akımı', 'Manyetizma', 'Elektromanyetik indüksiyon',
      'Atom fiziği', 'Nükleer fizik', 'Modern fizik', 'Termodinamik',
    ],
    'Kimya': [
      'Kimyanın temelleri', 'Atom modelleri', 'Periyodik sistem', 'Kimyasal bağlar',
      'Maddenin halleri', 'Gaz kanunları', 'Çözeltiler ve derişim', 'Asit ve bazlar',
      'Kimyasal tepkimeler ve denkleştirme', 'Mol kavramı ve hesaplamalar',
      'Kimyasal denge', 'Organik kimyaya giriş', 'Hidrokarbonlar',
      'Fonksiyonlu organik bileşikler', 'Polimer ve plastikler', 'Elektrokimya',
    ],
    'Biyoloji': [
      'Bilimsel düşünce ve biyoloji', 'Hücre', 'Hücre zarı ve transportu',
      'Hücre bölünmeleri (mitoz-mayoz)', 'Kalıtım ve Mendel genetiği',
      'DNA ve gen teknolojisi', 'Protein sentezi', 'Evrim', 'Canlı çeşitliliği',
      'Bitki biyolojisi', 'Hayvan fizyolojisi', 'Sindirim sistemi',
      'Dolaşım sistemi', 'Solunum sistemi', 'Boşaltım sistemi',
      'Sinir sistemi', 'Endokrin sistem', 'Üreme sistemi', 'Ekosistem ekolojisi',
      'Biyoteknoloji ve genetik mühendisliği',
    ],
    'Türk Dili ve Edebiyatı': [
      'Dil bilgisi: Ses bilgisi', 'Dil bilgisi: Sözcük yapısı', 'Dil bilgisi: Cümle',
      'Anlatım türleri', 'Şiir türleri ve özellikleri', 'Şiir dönemleri',
      'Halk edebiyatı', 'Divan edebiyatı', 'Tanzimat edebiyatı',
      'Servet-i Fünun dönemi', 'Milli edebiyat dönemi', 'Cumhuriyet dönemi edebiyatı',
      'Roman ve hikaye', 'Tiyatro', 'Deneme ve makale', 'Söz sanatları',
    ],
    'T.C. İnkılap Tarihi ve Atatürkçülük': [
      'Osmanlı Devleti çöküş dönemi', 'Kurtuluş Savaşı', 'Lozan Antlaşması',
      'Cumhuriyetin ilanı', 'Halifeliğin kaldırılması', 'Çok partili hayat',
      'Atatürk ilkeleri (Cumhuriyetçilik, Milliyetçilik, Halkçılık)',
      'Atatürk ilkeleri (Devletçilik, Laiklik, Devrimcilik)',
      'Hukuk alanında inkılaplar', 'Eğitim ve kültür inkılapları',
      'Ekonomik kalkınma', 'Atatürk dönemi dış politika', 'İkinci Dünya Savaşı',
    ],
    'Tarih': [
      'Tarih öncesi dönemler', 'İlk uygarlıklar', 'Orta Asya Türk tarihi',
      'İslamiyet öncesi Türk tarihi', 'İslam medeniyeti', 'Türk-İslam devletleri',
      'Osmanlı kuruluş dönemi', 'Osmanlı yükseliş dönemi', 'Osmanlı duraklama',
      'Osmanlı gerileme ve çöküş', 'Fransız İhtilali', 'Sanayi Devrimi',
      'I. Dünya Savaşı', 'Komünizm ve Faşizm', 'II. Dünya Savaşı', 'Soğuk Savaş',
      'Günümüz Türkiye ve dünya', 'Medeniyetler tarihi',
    ],
    'Coğrafya': [
      'Coğrafyanın konusu ve önemi', 'Harita bilgisi', 'Atmosfer ve iklim',
      'İklim tipleri', 'Türkiye iklimi', 'Litosfer ve yer şekilleri',
      'Türkiye yer şekilleri', 'Hidrosfer (sular)', 'Türkiye su kaynakları',
      'Nüfus ve nüfus artışı', 'Göç', 'Yerleşme', 'Türkiye nüfusu',
      'Tarım coğrafyası', 'Sanayi coğrafyası', 'Enerji kaynakları',
      'Türkiye ekonomisi', 'Bölgesel coğrafya', 'Çevre sorunları', 'Küresel ısınma',
    ],
    'Felsefe': [
      'Felsefeye giriş', 'Bilgi felsefesi (epistemoloji)', 'Varlık felsefesi (ontoloji)',
      'Ahlak felsefesi (etik)', 'Siyaset felsefesi', 'Estetik',
      'Din felsefesi', 'Antik Yunan felsefesi', 'Orta Çağ felsefesi',
      'Modern felsefe', 'Çağdaş felsefe', 'Türk İslam düşüncesi',
    ],
    'Din Kültürü ve Ahlak Bilgisi': [
      'İslam düşüncesinde inanç', 'Ahlak ve değerler', 'İbadet',
      'Hz. Muhammed ve örnek ahlakı', 'Kuran mesajı',
      'Dünya dinleri', 'Din ve laiklik', 'Güncel dini meseleler',
    ],
    'İngilizce': [
      'Advanced grammar', 'Reading strategies', 'Writing essays',
      'Listening for detail', 'Speaking fluency', 'Academic vocabulary',
      'Conditionals', 'Passive voice', 'Reported speech',
      'Phrasal verbs', 'Idioms', 'YDS/YÖKDİL hazırlık',
    ],
    'Sağlık Bilgisi': [
      'Sağlıklı beslenme', 'Fiziksel aktivite', 'Ruh sağlığı',
      'Bulaşıcı hastalıklar', 'Bağımlılık', 'İlk yardım',
    ],
  },

  universite: {
    'Matematik': [
      'Diferansiyel ve integral hesap', 'Diferansiyel denklemler', 'Lineer cebir',
      'Sayısal analiz', 'İstatistik ve olasılık', 'Kompleks analiz',
      'Topoloji', 'Ayrık matematik', 'Fonksiyonel analiz',
    ],
    'Fizik': [
      'Klasik mekanik', 'Elektromanyetizma', 'Termodinamik ve istatistik mekanik',
      'Kuantum mekaniği', 'Optik', 'Nükleer ve parçacık fiziği',
      'Katıhal fiziği', 'Görelilik teorisi',
    ],
    'Kimya': [
      'Genel kimya', 'Organik kimya', 'Anorganik kimya', 'Fiziksel kimya',
      'Analitik kimya', 'Biyokimya', 'Polimer kimyası',
    ],
    'Biyoloji': [
      'Moleküler biyoloji', 'Genetik', 'Hücre biyolojisi', 'Mikrobiyoloji',
      'Fizyoloji', 'Ekoloji', 'Evrimsel biyoloji', 'Biyoteknoloji',
    ],
    'İktisat': [
      'Mikroekonomi', 'Makroekonomi', 'Uluslararası iktisat', 'Para teorisi',
      'Kalkınma ekonomisi', 'Oyun teorisi', 'Ekonometri',
    ],
    'Bilişim ve Yazılım': [
      'Veri yapıları ve algoritmalar', 'Nesne yönelimli programlama',
      'Veritabanı yönetimi', 'İşletim sistemleri', 'Bilgisayar ağları',
      'Yazılım mühendisliği', 'Yapay zeka ve makine öğrenmesi',
      'Siber güvenlik', 'Mobil uygulama geliştirme',
    ],
    'Havacılık': [
      'Uçak yapısı ve sistemleri', 'Aerodinamik', 'Uçuş mekaniği',
      'Navigasyon ve seyrüsefer', 'Meteoroloji', 'Hava trafik kontrolü',
      'Havacılık güvenliği', 'Uçuş kuralları (VFR/IFR)', 'Aviyonik sistemler',
      'Uçak motoru (piston/jet)', 'Hidrolik ve pnömatik sistemler',
    ],
    'Hukuk': [
      'Medeni hukuk', 'Borçlar hukuku', 'Ticaret hukuku', 'Ceza hukuku',
      'İdare hukuku', 'Anayasa hukuku', 'Uluslararası hukuk', 'İş hukuku',
    ],
    'İşletme': [
      'Muhasebe', 'Finansman', 'Pazarlama', 'Yönetim ve organizasyon',
      'İnsan kaynakları', 'Girişimcilik', 'Stratejik yönetim',
    ],
    'İngilizce': [
      'Academic writing', 'Reading comprehension', 'Listening skills',
      'Grammar and syntax', 'Vocabulary building', 'Presentation skills',
      'Business English', 'Research writing', 'IELTS / TOEFL hazırlık',
      'YDS / YÖKDİL hazırlık', 'Conversational English',
    ],
    'Türk Dili ve Edebiyatı': [
      'Türkçe yazım kuralları', 'Akademik yazım', 'Metin analizi',
      'Türk edebiyatı tarihi', 'Dilbilgisi', 'İletişim becerileri',
    ],
    'Atatürk İlkeleri ve İnkılap Tarihi': [
      'Osmanlı son dönemi', 'Kurtuluş Savaşı', 'Cumhuriyetin ilanı',
      'Atatürk ilkeleri', 'Türkiye Cumhuriyeti tarihi',
    ],
    'Sosyoloji': [
      'Sosyolojiye giriş', 'Toplumsal yapı', 'Kültür ve toplum',
      'Sosyal değişme', 'Araştırma yöntemleri',
    ],
    'Psikoloji': [
      'Psikolojiye giriş', 'Gelişim psikolojisi', 'Sosyal psikoloji',
      'Klinik psikoloji', 'Bilişsel psikoloji', 'Araştırma yöntemleri',
    ],
  },
}
