export type TeacherTrainingModuleId = 'verify' | 'curriculum' | 'pedagogy' | 'safety'
export type TrainingQuestion = { id: string; prompt: string; choices: Record<'A' | 'B' | 'C' | 'D', string> }
export type TrainingModule = {
  id: TeacherTrainingModuleId
  title: string
  summary: string
  lessons: Array<{ heading: string; body: string }>
  questions: TrainingQuestion[]
}

export const TEACHER_AI_TRAINING_VERSION = 'teacher-ai-literacy-pilot-v1'

export const TEACHER_AI_TRAINING_MODULES: TrainingModule[] = [
  {
    id: 'verify', title: 'AI çıktısını doğrulama', summary: 'Akıcı ve ikna edici bir yanıtın neden yine de kontrol edilmesi gerektiğini öğrenin.',
    lessons: [
      { heading: 'Akıcılık, doğruluk kanıtı değildir', body: 'Yapay zekâ bazen emin bir dille yanlış bilgi, işlem veya kaynak sunabilir. Yanıtı doğrudan öğrenciye vermeden önce soruyu bağımsız çözün ve kritik bilgileri güvenilir bir kaynakla karşılaştırın.' },
      { heading: 'Üç adımlı kontrol', body: 'İstenen işi ve sınırlarını belirleyin; cevabı kendiniz ya da güvenilir bir kaynakla kontrol edin; seçenekleri ve açıklamanın soruyla gerçekten uyuştuğunu sınayın. Özellikle cevap anahtarını ayrı doğrulayın.' },
      { heading: 'Öğrenciye kontrol alışkanlığı kazandırın', body: '“AI böyle dedi” yerine “Bunu hangi kanıt destekliyor?” diye sorun. Öğrenciden gerekçe, işlem veya metindeki kanıtı göstermesini isteyin.' },
    ],
    questions: [
      { id: 'v1', prompt: 'AI akıcı ve kendinden emin bir cevap verdi. Öğretmenin en doğru sonraki adımı nedir?', choices: { A: 'Cevabı kontrol etmeden paylaşmak', B: 'Cevabı bağımsız çözüm veya güvenilir kaynakla doğrulamak', C: 'Yalnızca yazımını düzeltmek', D: 'Her zaman yanlış kabul etmek' } },
      { id: 'v2', prompt: 'Bir matematik sorusunun doğru cevabını kontrol etmek için en güçlü yöntem hangisidir?', choices: { A: 'AI cevabının uzun olmasına bakmak', B: 'Aynı yanıtı tekrar sormak', C: 'İşlemi bağımsız yapıp sonucu karşılaştırmak', D: 'İlk seçeneği işaretlemek' } },
      { id: 'v3', prompt: 'Öğrenci, AI’ın verdiği bilgiyi savunuyor. Hangi soru eleştirel düşünmeyi destekler?', choices: { A: 'AI bunu kesin söyledi mi?', B: 'Bu bilgi hangi kanıtla doğrulanabilir?', C: 'Cevabı kopyaladın mı?', D: 'AI’ı kapatalım mı?' } },
      { id: 'v4', prompt: 'Bir test sorusu hazırlanırken hangi iki parça özellikle ayrı ayrı doğrulanmalıdır?', choices: { A: 'Renk ve yazı tipi', B: 'Soru sayısı ve başlık', C: 'Soru-kazanım uyumu ve cevap anahtarı', D: 'Dosya adı ve yükleme tarihi' } },
    ],
  },
  {
    id: 'curriculum', title: 'MEB kazanım uyumunu kontrol etme', summary: 'Sınıf, ders, kazanım ve soru kapsamını aynı çizgide tutun.',
    lessons: [
      { heading: 'Kazanımı açıkça eşleştirin', body: 'Sorunun sınıfını, dersini ve hedef kazanımını önce belirleyin. Bir konu başlığının benzemesi tek başına yeterli değildir; öğrenciden istenen düşünme/işlem kazanımın kapsamına girmelidir.' },
      { heading: 'Resmî müfredatı referans alın', body: 'Kazanım metni ve kapsam için güncel MEB müfredatını esas alın. AI’dan ilgili resmi kaynağa göre üretim isteyin; modelin verdiği kod veya başlığı kaynağa bakmadan doğru kabul etmeyin.' },
      { heading: 'Kapsam dışına taşmayı yakalayın', body: 'Soru hedef sınıfın henüz görmediği kavram, gösterim veya işlem gerektiriyorsa sadeleştirin ya da reddedin. Soru metni ile seçeneklerin aynı kazanımı ölçtüğünü kontrol edin.' },
    ],
    questions: [
      { id: 'c1', prompt: 'Bir sorunun kazanıma uygunluğunu en iyi ne gösterir?', choices: { A: 'Konu adının aynı olması', B: 'Sorunun hedef kazanımın istediği beceriyi ölçmesi', C: 'Sorunun uzun olması', D: 'AI tarafından üretilmesi' } },
      { id: 'c2', prompt: 'Kazanım kodu AI tarafından verildi. Ne yapılmalıdır?', choices: { A: 'Kodu doğrudan kullanmak', B: 'Kodu güncel resmî MEB kaynağından kontrol etmek', C: 'Kodun son rakamını değiştirmek', D: 'Kazanım eşlemesini kaldırmak' } },
      { id: 'c3', prompt: 'Soru 7. sınıf kazanımına bağlanmış ama 8. sınıfta öğretilen bir yöntemi gerektiriyor. Uygun yaklaşım nedir?', choices: { A: 'Zorluk olsun diye bırakmak', B: 'Sınıf/kazanım kapsamına uygun biçimde yeniden yazmak veya reddetmek', C: 'Doğru cevabı açıklamaya eklemek', D: 'Daha çok seçenek eklemek' } },
      { id: 'c4', prompt: 'MEB müfredatıyla ilgili son karar için hangi kaynak önceliklidir?', choices: { A: 'Güncel resmî MEB kaynağı', B: 'Sosyal medya paylaşımı', C: 'Modelin kaynak göstermeyen yorumu', D: 'Eski bir çalışma kâğıdı' } },
    ],
  },
  {
    id: 'pedagogy', title: 'Yaşa uygun anlatım ve geri bildirim', summary: 'Öğrenci düzeyinde, destekleyici ve öğrenmeyi ilerleten AI kullanımı.',
    lessons: [
      { heading: 'Dil ve bilişsel yük', body: 'Açıklamayı öğrencinin sınıf düzeyine göre kısa cümlelerle kurun. Bilinmeyen terimleri açıklayın; aynı anda çok sayıda yeni kavram yüklemeyin.' },
      { heading: 'Cevabı vermek yerine düşünmeyi destekleyin', body: 'Öğrenci çözüm istiyorsa önce küçük bir ipucu veya ara adım sunun. Açık uçlu çalışmada öğrencinin kendi düşüncesini göstermesine alan bırakın.' },
      { heading: 'Yargılamayan geri bildirim', body: 'Yanlış cevabı kişilik özelliği gibi sunmayın. Hatanın hangi adımda olduğunu belirtin, doğru düşünme yolunu örnekleyin ve öğrenciyi yeniden denemeye davet edin.' },
    ],
    questions: [
      { id: 'p1', prompt: 'Ortaokul öğrencisi bir soruda takıldı. Öğrenmeyi en çok hangisi destekler?', choices: { A: 'Tüm cevabı hemen vermek', B: 'Düzeyine uygun küçük bir ipucu verip yeniden denemesini istemek', C: '“Bunu bilmen gerekirdi” demek', D: 'Daha zor bir soru sormak' } },
      { id: 'p2', prompt: 'Yaşa uygun açıklamanın iyi bir özelliği hangisidir?', choices: { A: 'Uzun ve teknik olması', B: 'Kısa, açık cümleler ve gerekli terim açıklamaları içermesi', C: 'Her yaşta aynı kullanılması', D: 'Öğretmen jargonuna dayanması' } },
      { id: 'p3', prompt: 'Yanlış cevap veren öğrenciye verilecek iyi geri bildirim hangisidir?', choices: { A: '“Başarısızsın.”', B: '“Yanlış.” deyip bitirmek', C: 'Hatanın olduğu adımı gösterip yeniden denemeye çağırmak', D: 'Cevabı sınıfa duyurup kıyaslamak' } },
      { id: 'p4', prompt: 'Açık uçlu bir çalışmada AI’dan nasıl yararlanmak daha uygundur?', choices: { A: 'Öğrenci adına tüm yanıtı yazdırmak', B: 'Öğrenciye kendi gerekçesini geliştirecek ipuçları almak', C: 'Öğrenci metnini okumadan puanlatmak', D: 'Öğrencinin düşünmesini devre dışı bırakmak' } },
    ],
  },
  {
    id: 'safety', title: 'Öğrenci verisi ve güvenlik', summary: 'Gereksiz kişisel veriyi paylaşmadan, güvenli ve sorumlu kullanım.',
    lessons: [
      { heading: 'Veriyi en aza indirin', body: 'AI aracına öğrencinin adı, iletişim bilgisi, sağlık bilgisi, fotoğrafı veya tanınmasına yol açacak ayrıntıları girmeyin. Örnek hazırlamak için anonim ve gerekli en az bağlamı kullanın.' },
      { heading: 'Hassas içerikte insan sorumluluğu', body: 'Güvenlik, zorbalık, kendine zarar verme veya hassas kişisel durum içeren bir mesajı otomatik yanıta bırakmayın. Kurumun koruma ve bildirim prosedürünü izleyin; gerekli durumda yetkili insan desteğine yönlendirin.' },
      { heading: 'Son kontrol öğretmendedir', body: 'AI’nın ürettiği içerik, açıklama ve görselleri öğrenciye göstermeden önce yaşa uygunluk, önyargı, doğruluk ve güvenlik açısından gözden geçirin. Şüpheli içeriği kullanmayın ve bildirin.' },
    ],
    questions: [
      { id: 's1', prompt: 'AI’dan örnek soru isterken öğrenci verisini nasıl kullanmalısınız?', choices: { A: 'Ad ve notları eklemek', B: 'Gerekli en az, anonim bağlamı kullanmak', C: 'Fotoğrafını eklemek', D: 'Tüm sınıf listesini yüklemek' } },
      { id: 's2', prompt: 'Öğrencinin hassas güvenlik riski içeren mesajında ne yapılmalıdır?', choices: { A: 'Yalnızca AI’ya yanıtlatmak', B: 'Görmezden gelmek', C: 'Kurum prosedürünü izleyip uygun yetişkin desteğine yönlendirmek', D: 'Sınıf grubuna göndermek' } },
      { id: 's3', prompt: 'AI tarafından üretilmiş bir görsel öğrencilerle paylaşılmadan önce ne gerekir?', choices: { A: 'Yalnızca dosya boyutunu kontrol etmek', B: 'Doğruluk, yaş uygunluğu ve güvenlik açısından insan incelemesi', C: 'Üretim tarihini değiştirmek', D: 'Her koşulda paylaşmak' } },
      { id: 's4', prompt: 'Öğrenci verisi sorusunda temel güvenli tercih hangisidir?', choices: { A: 'Paylaşımı en aza indirmek ve tanımlayıcı bilgileri çıkarmak', B: 'Daha iyi sonuç için her şeyi göndermek', C: 'Veriyi herkese açık bir araca yapıştırmak', D: 'İzin gereksinimlerini önemsememek' } },
    ],
  },
]
