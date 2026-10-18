import type { Entry } from './types'

// Konum seçimi (ülke / eyalet-il / şehir-ilçe), kayıt ve profil formları. Ülke adları Intl ile yerelleştirilir.
export const locationEntries: Entry[] = [
  ['Ülke', 'Country', 'Land', 'Pays', 'País', 'الدولة'],
  ['Ülke seçin', 'Select a country', 'Land auswählen', 'Choisir un pays', 'Selecciona un país', 'اختر الدولة'],
  ['İl', 'Province', 'Provinz', 'Province', 'Provincia', 'المحافظة'],
  ['İlçe', 'District', 'Bezirk', 'District', 'Distrito', 'المنطقة'],
  ['Eyalet / Bölge', 'State / Region', 'Bundesland / Region', 'État / Région', 'Estado / Región', 'الولاية / المنطقة'],
  ['Şehir', 'City', 'Stadt', 'Ville', 'Ciudad', 'المدينة'],
  ['Opsiyonel', 'Optional', 'Optional', 'Facultatif', 'Opcional', 'اختياري'],
  ['Tüm ülke', 'Whole country', 'Ganzes Land', 'Tout le pays', 'Todo el país', 'كل الدولة'],
  ['Tüm eyalet', 'Whole state', 'Ganzes Bundesland', 'Toute la région', 'Todo el estado', 'كل الولاية'],
  ['Eyalet seçilmedi', 'No state selected', 'Kein Bundesland ausgewählt', 'Aucune région choisie', 'Sin estado seleccionado', 'لم تُحدَّد ولاية'],
  ['Önce seçim yapın', 'Choose the previous field first', 'Zuerst das vorherige Feld wählen', 'Choisissez d’abord le champ précédent', 'Elige primero el campo anterior', 'اختر الحقل السابق أولاً'],
  ['Seçin', 'Select', 'Auswählen', 'Choisir', 'Seleccionar', 'اختر'],
  ['Listede yok (elle yaz)', 'Not in the list (type it)', 'Nicht in der Liste (eintippen)', 'Absent de la liste (saisir)', 'No está en la lista (escribir)', 'غير موجود في القائمة (اكتب)'],
  ['Listeye dön', 'Back to the list', 'Zurück zur Liste', 'Retour à la liste', 'Volver a la lista', 'العودة إلى القائمة'],
  ['Konum listesi yüklenemedi. Tekrar dene', 'Could not load the location list. Try again', 'Ortsliste konnte nicht geladen werden. Erneut versuchen', 'Impossible de charger la liste. Réessayer', 'No se pudo cargar la lista. Reintentar', 'تعذّر تحميل القائمة. أعد المحاولة'],
  ['Posta kodu (Opsiyonel)', 'ZIP / postal code (Optional)', 'Postleitzahl (optional)', 'Code postal (facultatif)', 'Código postal (opcional)', 'الرمز البريدي (اختياري)'],
  ['Açık adres (Opsiyonel)', 'Street address (Optional)', 'Anschrift (optional)', 'Adresse complète (facultatif)', 'Dirección completa (opcional)', 'العنوان التفصيلي (اختياري)'],
  ['Konum bilgileri', 'Location', 'Standort', 'Localisation', 'Ubicación', 'الموقع'],
  ['Ülke, eyalet/il ve şehir/ilçe zorunludur.', 'Country, state/province and city/district are required.', 'Land, Bundesland/Provinz und Stadt/Bezirk sind erforderlich.', 'Le pays, la région/province et la ville/le district sont obligatoires.', 'País, estado/provincia y ciudad/distrito son obligatorios.', 'الدولة والولاية/المحافظة والمدينة/المنطقة حقول إلزامية.'],
  ['Geçerli bir posta kodu girin.', 'Enter a valid postal code.', 'Gib eine gültige Postleitzahl ein.', 'Saisissez un code postal valide.', 'Introduce un código postal válido.', 'أدخل رمزًا بريديًا صالحًا.'],
  ['Konum kaydedilemedi. Lütfen tekrar deneyin.', 'Location could not be saved. Please try again.', 'Standort konnte nicht gespeichert werden. Bitte erneut versuchen.', 'La localisation n’a pas pu être enregistrée. Réessayez.', 'No se pudo guardar la ubicación. Inténtalo de nuevo.', 'تعذّر حفظ الموقع. حاول مرة أخرى.'],
  ['📍 Konum bilgisi gerekli', '📍 Location required', '📍 Standort erforderlich', '📍 Localisation requise', '📍 Ubicación obligatoria', '📍 الموقع مطلوب'],
  ['Test oluşturmak için profil ayarlarından ülke, eyalet ve şehir bilgini gir.', 'To create a test, enter your country, state and city in your profile settings.', 'Gib für die Testerstellung Land, Bundesland und Stadt in deinen Profileinstellungen an.', 'Pour créer un test, renseigne ton pays, ta région et ta ville dans les paramètres du profil.', 'Para crear una prueba, introduce tu país, estado y ciudad en los ajustes del perfil.', 'لإنشاء اختبار، أدخل الدولة والولاية والمدينة في إعدادات ملفك الشخصي.'],
]
