'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useT } from '@/lib/i18n/I18nProvider'
import { intlLocale } from '@/lib/i18n/core'
import { countryDisplayName, placeLabels, type LocationDetails, type LocationValue } from '@/lib/location/validate'

interface CountryOption { code: string; name: string }
interface StateOption { code: string; name: string }

const OTHER = '__other__'
let countriesCache: CountryOption[] | null = null
const statesCache = new Map<string, StateOption[]>()
const citiesCache = new Map<string, string[]>()

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(String(response.status))
  return response.json() as Promise<T>
}

/**
 * Ülke → eyalet/il → şehir/ilçe seçimi. Ülke ISO kodu olarak, eyalet ve şehir ad olarak döner.
 * Listede karşılığı olmayan ülke/eyalet için ad elle yazılabilir (alan boş bırakılamaz).
 * `optionalPlaces`: müfredat gibi ülke geneli kayıtlarda eyalet/şehir boş bırakılabilir.
 */
export default function LocationSelect({ value, onChange, disabled, optionalPlaces }: {
  value: LocationValue
  onChange: (next: LocationValue) => void
  disabled?: boolean
  optionalPlaces?: boolean
}) {
  const { t, locale } = useT()
  const [countries, setCountries] = useState<CountryOption[]>(countriesCache || [])
  const [statesData, setStatesData] = useState<{ country: string; list: StateOption[] } | null>(null)
  const [citiesData, setCitiesData] = useState<{ key: string; list: string[] } | null>(null)
  // Kullanıcı "Listede yok" dediğinde elle yazma kipi; ülke/eyalet değişince sıfırlanır (olay işleyicilerinde).
  const [manualState, setManualState] = useState(false)
  const [manualCity, setManualCity] = useState(false)
  const [failed, setFailed] = useState(false)

  const loadCountries = useCallback(() => {
    getJson<{ countries: CountryOption[] }>('/api/locations?type=countries')
      .then(data => { countriesCache = data.countries; setCountries(data.countries); setFailed(false) })
      .catch(() => setFailed(true))
  }, [])
  useEffect(() => { if (!countriesCache) loadCountries() }, [loadCountries])

  const country = value.country
  useEffect(() => {
    if (!country || statesCache.has(country)) return
    let live = true
    getJson<{ states: StateOption[] }>(`/api/locations?type=states&country=${country}`)
      .then(data => { statesCache.set(country, data.states); if (live) setStatesData({ country, list: data.states }) })
      .catch(() => { if (live) setStatesData({ country, list: [] }) })
    return () => { live = false }
  }, [country])
  const states: StateOption[] | null = !country ? null
    : statesCache.get(country) ?? (statesData?.country === country ? statesData.list : null)

  const stateCode = states?.find(option => option.name === value.state)?.code || ''
  useEffect(() => {
    if (!country || !stateCode) return
    const key = `${country}:${stateCode}`
    if (citiesCache.has(key)) return
    let live = true
    getJson<{ cities: string[] }>(`/api/locations?type=cities&country=${country}&state=${encodeURIComponent(stateCode)}`)
      .then(data => { citiesCache.set(key, data.cities); if (live) setCitiesData({ key, list: data.cities }) })
      .catch(() => { if (live) setCitiesData({ key, list: [] }) })
    return () => { live = false }
  }, [country, stateCode])
  const cityKey = `${country}:${stateCode}`
  const cities: string[] | null = !stateCode ? null
    : citiesCache.get(cityKey) ?? (citiesData?.key === cityKey ? citiesData.list : null)

  // Listede olmayan (ör. eski/elle yazılmış) değerler ya da boş listeler otomatik metin kutusu gösterir.
  const stateIsText = manualState || (states !== null && (states.length === 0 || Boolean(value.state && !stateCode)))
  const cityIsText = manualCity || !stateCode || (cities !== null && (cities.length === 0 || Boolean(value.city && !cities.includes(value.city))))

  const labels = placeLabels(country)
  const intl = intlLocale(locale)
  const sortedCountries = useMemo(() => countries
    .map(option => ({ code: option.code, label: countryDisplayName(option.code, intl, option.name) }))
    .sort((a, b) => a.label.localeCompare(b.label, intl)), [countries, intl])
  const star = optionalPlaces ? '' : ' *'
  const optional = optionalPlaces ? ` (${t('Opsiyonel')})` : ''

  return <div style={{ display: 'grid', gap: '10px' }}>
    <div>
      <label className="field-label">{t('Ülke')} *</label>
      <select className="input" aria-label={t('Ülke')} value={country} disabled={disabled || (failed && !countries.length)}
        onChange={event => { setManualState(false); setManualCity(false); onChange({ country: event.target.value, state: '', city: '' }) }}>
        <option value="">{t('Ülke seçin')}</option>
        {sortedCountries.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select>
      {failed && !countries.length && <button type="button" className="btn btn-sm" style={{ marginTop: 6 }} onClick={loadCountries}>{t('Konum listesi yüklenemedi. Tekrar dene')}</button>}
    </div>
    {country && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
      <div>
        <label className="field-label">{t(labels.state)}{star}{optional}</label>
        {stateIsText || states === null ? (
          <div style={{ display: 'grid', gap: 4 }}>
            <input className="input" aria-label={t(labels.state)} value={value.state} disabled={disabled || states === null}
              placeholder={states === null ? t('Yükleniyor...') : t(labels.state)} maxLength={120}
              onChange={event => { setManualCity(false); onChange({ ...value, state: event.target.value, city: '' }) }} />
            {states !== null && states.length > 0 && <button type="button" className="btn btn-sm" onClick={() => { setManualState(false); setManualCity(false); onChange({ ...value, state: '', city: '' }) }}>{t('Listeye dön')}</button>}
          </div>
        ) : (
          <select className="input" aria-label={t(labels.state)} value={value.state} disabled={disabled}
            onChange={event => {
              setManualCity(false)
              if (event.target.value === OTHER) { setManualState(true); onChange({ ...value, state: '', city: '' }); return }
              onChange({ ...value, state: event.target.value, city: '' })
            }}>
            <option value="">{optionalPlaces ? t('Tüm ülke') : t('Seçin')}</option>
            {states.map(option => <option key={option.code} value={option.name}>{option.name}</option>)}
            <option value={OTHER}>{t('Listede yok (elle yaz)')}</option>
          </select>
        )}
      </div>
      <div>
        <label className="field-label">{t(labels.city)}{star}{optional}</label>
        {!value.state ? (
          <input className="input" aria-label={t(labels.city)} disabled placeholder={optionalPlaces ? t('Eyalet seçilmedi') : t('Önce seçim yapın')} />
        ) : cityIsText || cities === null ? (
          <div style={{ display: 'grid', gap: 4 }}>
            <input className="input" aria-label={t(labels.city)} value={value.city} disabled={disabled || (Boolean(stateCode) && cities === null)}
              placeholder={stateCode && cities === null ? t('Yükleniyor...') : t(labels.city)} maxLength={120}
              onChange={event => onChange({ ...value, city: event.target.value })} />
            {cities !== null && cities.length > 0 && <button type="button" className="btn btn-sm" onClick={() => { setManualCity(false); onChange({ ...value, city: '' }) }}>{t('Listeye dön')}</button>}
          </div>
        ) : (
          <select className="input" aria-label={t(labels.city)} value={value.city} disabled={disabled}
            onChange={event => {
              if (event.target.value === OTHER) { setManualCity(true); onChange({ ...value, city: '' }); return }
              onChange({ ...value, city: event.target.value })
            }}>
            <option value="">{optionalPlaces ? t('Tüm eyalet') : t('Seçin')}</option>
            {cities.map(name => <option key={name} value={name}>{name}</option>)}
            <option value={OTHER}>{t('Listede yok (elle yaz)')}</option>
          </select>
        )}
      </div>
    </div>}
  </div>
}

/** Konum seçimine ek olarak opsiyonel posta kodu ve açık adres (kimlik verisi → TR-PG). */
export function LocationFields({ value, onChange, disabled }: {
  value: LocationDetails
  onChange: (next: LocationDetails) => void
  disabled?: boolean
}) {
  const { t } = useT()
  return <div style={{ display: 'grid', gap: '10px' }}>
    <LocationSelect value={value} disabled={disabled} onChange={next => onChange({ ...value, ...next })} />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
      <div>
        <label className="field-label">{t('Posta kodu (Opsiyonel)')}</label>
        <input className="input" inputMode="text" autoComplete="postal-code" maxLength={20} value={value.postalCode} disabled={disabled}
          onChange={event => onChange({ ...value, postalCode: event.target.value })} />
      </div>
      <div>
        <label className="field-label">{t('Açık adres (Opsiyonel)')}</label>
        <textarea className="input" rows={2} maxLength={300} autoComplete="street-address" value={value.addressLine} disabled={disabled}
          onChange={event => onChange({ ...value, addressLine: event.target.value })} style={{ resize: 'vertical' }} />
      </div>
    </div>
  </div>
}
