import type { ReviewEvent, ScheduleState } from './model'

const DAY_MS = 86_400_000

export interface ProgressSummary {
  total: number
  newCount: number
  dueCount: number
  learningCount: number
  consolidatedCount: number
  coveragePercent: number
  recallRate30d: number | null
  effortPoints: number
  activeDays7: number
}

function localDayKey(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
}

export function summarizeProgress(states: ScheduleState[], reviews: ReviewEvent[], now = new Date()): ProgressSummary {
  const activeReviews = reviews.filter((review) => !review.canceledAt)
  const recentCutoff = now.getTime() - 30 * DAY_MS
  const recent = activeReviews.filter((review) => new Date(review.reviewedAt).getTime() >= recentCutoff)
  const successful = recent.filter((review) => review.rating >= 2).length
  const sevenDayCutoff = now.getTime() - 7 * DAY_MS
  const activeDays = new Set(activeReviews.filter((review) => new Date(review.reviewedAt).getTime() >= sevenDayCutoff).map((review) => localDayKey(new Date(review.reviewedAt))))
  const studied = states.filter((state) => state.state !== 'NEW').length

  return {
    total: states.length,
    newCount: states.filter((state) => state.state === 'NEW').length,
    dueCount: states.filter((state) => state.state !== 'NEW' && state.state !== 'SUSPENDED' && new Date(state.dueAt) <= now).length,
    learningCount: states.filter((state) => state.state === 'LEARNING' || state.state === 'RELEARNING').length,
    consolidatedCount: states.filter((state) => state.state === 'REVIEW' && state.intervalDays >= 21).length,
    coveragePercent: states.length ? Math.round((studied / states.length) * 100) : 0,
    recallRate30d: recent.length ? Math.round((successful / recent.length) * 100) : null,
    effortPoints: activeReviews.length,
    activeDays7: activeDays.size
  }
}
