import type { Entry } from './types'
import { navbarEntries } from './navbar'
import { publicEntries } from './public'
import { dashboardPricingEntries } from './dashboard-pricing'
import { profileEntries } from './profile'

export const ALL_ENTRIES: Entry[] = [...navbarEntries, ...publicEntries, ...dashboardPricingEntries, ...profileEntries]
