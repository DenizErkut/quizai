import type { Entry } from './types'
import { navbarEntries } from './navbar'
import { publicEntries } from './public'

export const ALL_ENTRIES: Entry[] = [...navbarEntries, ...publicEntries]
