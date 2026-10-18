// Herkese açık konum listeleri (kayıt formu oturumsuz kullanılır). Yalnızca coğrafi
// referans verisi döner; kullanıcı verisi içermez.
import { NextRequest, NextResponse } from 'next/server'
import { listCities, listCountries, listStates, isKnownCountry } from '@/lib/location/data'

export const runtime = 'nodejs'

const CACHE = { 'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800' }

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get('type')
  const country = (req.nextUrl.searchParams.get('country') || '').toUpperCase()
  const state = (req.nextUrl.searchParams.get('state') || '').toUpperCase()

  if (type === 'countries') return NextResponse.json({ countries: listCountries() }, { headers: CACHE })
  if (!/^[A-Z]{2}$/.test(country) || !isKnownCountry(country)) return NextResponse.json({ error: 'Geçersiz ülke.' }, { status: 400 })
  if (type === 'states') return NextResponse.json({ states: listStates(country) }, { headers: CACHE })
  if (type === 'cities') {
    if (!/^[A-Z0-9-]{1,10}$/.test(state)) return NextResponse.json({ error: 'Geçersiz eyalet.' }, { status: 400 })
    return NextResponse.json({ cities: listCities(country, state) }, { headers: CACHE })
  }
  return NextResponse.json({ error: 'Geçersiz istek.' }, { status: 400 })
}
