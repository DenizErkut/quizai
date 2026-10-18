// Sunucu tarafı konum verisi (country-state-city). Şehir listesi büyük olduğundan
// istemciye paketlenmez; /api/locations üzerinden istenen kadar servis edilir.
import { Country, State, City } from 'country-state-city'

export interface CountryOption { code: string; name: string }
export interface StateOption { code: string; name: string }

let countries: CountryOption[] | null = null

export function listCountries(): CountryOption[] {
  countries ??= Country.getAllCountries().map(country => ({ code: country.isoCode, name: country.name }))
  return countries
}

export function listStates(countryCode: string): StateOption[] {
  return State.getStatesOfCountry(countryCode)
    .map(state => ({ code: state.isoCode, name: state.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
}

export function listCities(countryCode: string, stateCode: string): string[] {
  const names = City.getCitiesOfState(countryCode, stateCode).map(city => city.name)
  return [...new Set(names)].sort((a, b) => a.localeCompare(b, 'tr'))
}

export function isKnownCountry(code: string): boolean {
  return Boolean(Country.getCountryByCode(code))
}
