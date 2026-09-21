export interface RuntimeValidationResult {
  valid: boolean
  errors: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactShape(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const allowed = new Set([...required, ...optional])
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) && Object.keys(value).every((key) => allowed.has(key))
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/u.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[7] === undefined ? 0 : Number(match[7])
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth &&
    hour <= 23 && minute <= 59 && second <= 59 && offsetHour <= 23 && offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
}

function isIntegerIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

function isBoundedString(value: unknown, minLength = 0, maxLength = Number.MAX_SAFE_INTEGER): value is string {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength
}

function isUniqueStringArray(value: unknown, maxItems: number, minItems = 0, maxItemLength = Number.MAX_SAFE_INTEGER): value is string[] {
  return Array.isArray(value) &&
    value.length >= minItems && value.length <= maxItems &&
    value.every((item) => isBoundedString(item, 1, maxItemLength)) &&
    new Set(value).size === value.length
}

function isDirection(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+$/u.test(value) && value.length >= 3 && value.length <= 64
}

const scheduleRequired = ['key', 'entryId', 'direction', 'state', 'intervalDays', 'dueAt', 'updatedAt', 'schedulerVersion'] as const
const scheduleOptional = ['learningStep'] as const
const scheduleStates = new Set(['NEW', 'LEARNING', 'REVIEW', 'RELEARNING', 'SUSPENDED'])

function isSchedule(value: unknown): boolean {
  if (!isRecord(value) || !exactShape(value, scheduleRequired, scheduleOptional)) return false
  return isBoundedString(value.key, 1) &&
    isBoundedString(value.entryId, 1) &&
    isDirection(value.direction) &&
    typeof value.state === 'string' && scheduleStates.has(value.state) &&
    (value.learningStep === undefined || isIntegerIn(value.learningStep, 0, 1)) &&
    isIntegerIn(value.intervalDays, 0, 365) &&
    isDateTime(value.dueAt) &&
    isDateTime(value.updatedAt) &&
    value.schedulerVersion === 'srs-1'
}

const reviewRequired = [
  'id', 'scheduleKey', 'entryId', 'direction', 'rating', 'reviewedAt', 'previousDueAt', 'nextDueAt',
  'appVersion', 'catalogVersion', 'schedulerVersion', 'previousState'
] as const
const reviewOptional = ['canceledAt'] as const

function isReview(value: unknown): boolean {
  if (!isRecord(value) || !exactShape(value, reviewRequired, reviewOptional)) return false
  return isBoundedString(value.id, 1) &&
    isBoundedString(value.scheduleKey, 1) &&
    isBoundedString(value.entryId, 1) &&
    isDirection(value.direction) &&
    isIntegerIn(value.rating, 0, 3) &&
    isDateTime(value.reviewedAt) &&
    isDateTime(value.previousDueAt) &&
    isDateTime(value.nextDueAt) &&
    typeof value.appVersion === 'string' &&
    typeof value.catalogVersion === 'string' &&
    value.schedulerVersion === 'srs-1' &&
    isSchedule(value.previousState) &&
    (value.canceledAt === undefined || isDateTime(value.canceledAt))
}

const settingsRequired = ['id', 'onboarded', 'direction', 'dailyNew'] as const
const settingsOptional = [
  'activePairId', 'dailyGoalMinutes', 'motionEnabled', 'soundMode', 'soundEnabled', 'vibrationEnabled',
  'pathAudience', 'selectedPackIds', 'selectedThemeIds', 'reviewScope',
  'primaryPackId', 'focusThemeIds', 'adultScope'
] as const

function stringEnum(value: unknown, allowed: readonly string[]): boolean {
  return typeof value === 'string' && allowed.includes(value)
}

function isSettings(value: unknown): boolean {
  if (!isRecord(value) || !exactShape(value, settingsRequired, settingsOptional)) return false
  if (value.id !== 'settings' || typeof value.onboarded !== 'boolean' || !isDirection(value.direction) || !isIntegerIn(value.dailyNew, 0, 20)) return false
  if (value.activePairId !== undefined && !isBoundedString(value.activePairId, 1, 64)) return false
  if (value.dailyGoalMinutes !== undefined && !isIntegerIn(value.dailyGoalMinutes, 1, 60)) return false
  if (value.motionEnabled !== undefined && typeof value.motionEnabled !== 'boolean') return false
  if (value.soundMode !== undefined && !stringEnum(value.soundMode, ['off', 'subtle', 'on'])) return false
  if (value.soundEnabled !== undefined && typeof value.soundEnabled !== 'boolean') return false
  if (value.vibrationEnabled !== undefined && typeof value.vibrationEnabled !== 'boolean') return false
  if (value.pathAudience !== undefined && !stringEnum(value.pathAudience, ['school', 'adult', 'theme'])) return false
  if (value.selectedPackIds !== undefined && !isUniqueStringArray(value.selectedPackIds, 20, 1, 200)) return false
  if (value.selectedThemeIds !== undefined && !isUniqueStringArray(value.selectedThemeIds, 20, 0, 80)) return false
  if (value.reviewScope !== undefined && !stringEnum(value.reviewScope, ['all-due', 'selection-only'])) return false
  if (value.primaryPackId !== undefined && !isBoundedString(value.primaryPackId, 1, 200)) return false
  if (value.focusThemeIds !== undefined && !isUniqueStringArray(value.focusThemeIds, 20, 0, 80)) return false
  if (value.adultScope !== undefined && !stringEnum(value.adultScope, ['cumulative', 'new-only'])) return false
  return true
}

export function validateProgressExportRuntime(value: unknown): RuntimeValidationResult {
  const errors: string[] = []
  if (!isRecord(value)) return { valid: false, errors: ['root:not-object'] }
  if (!exactShape(value, ['schemaVersion', 'exportedAt', 'schedules', 'reviews', 'settings'])) errors.push('root:shape')
  if (value.schemaVersion !== 1) errors.push('schemaVersion')
  if (!isDateTime(value.exportedAt)) errors.push('exportedAt')

  if (!Array.isArray(value.schedules) || value.schedules.length > 200_000) errors.push('schedules:shape')
  else if (!value.schedules.every(isSchedule)) errors.push('schedules:item')

  if (!Array.isArray(value.reviews) || value.reviews.length > 1_000_000) errors.push('reviews:shape')
  else if (!value.reviews.every(isReview)) errors.push('reviews:item')

  if (!Array.isArray(value.settings) || value.settings.length > 1) errors.push('settings:shape')
  else if (!value.settings.every(isSettings)) errors.push('settings:item')

  return { valid: errors.length === 0, errors }
}
