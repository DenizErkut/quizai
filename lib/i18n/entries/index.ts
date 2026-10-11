import type { Entry } from './types'
import { navbarEntries } from './navbar'
import { publicEntries } from './public'
import { dashboardPricingEntries } from './dashboard-pricing'
import { profileEntries } from './profile'
import { quizSetupEntries } from './quiz-setup'
import { quizQuestionEntries } from './quiz-question'
import { quizResultEntries } from './quiz-result'
import { quizFlowEntries } from './quiz-flow'

export const ALL_ENTRIES: Entry[] = [...navbarEntries, ...publicEntries, ...dashboardPricingEntries, ...profileEntries, ...quizSetupEntries, ...quizQuestionEntries, ...quizResultEntries, ...quizFlowEntries]
