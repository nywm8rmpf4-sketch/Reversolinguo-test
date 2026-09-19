export type Direction = string
export type Rating = 0 | 1 | 2 | 3
export type LearningState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING' | 'SUSPENDED'
export type CefrLevel = 'PRE-A1' | 'A1' | 'A2' | 'B1' | 'B2'

export interface LexicalEntry {
  id: string
  source: string
  sourceAliases?: string[]
  targets: string[]
  sourceLanguage: string
  targetLanguage: string
  article?: string
  exampleSource: string
  exampleTarget: string
  sourceContext?: string
  targetContext?: string
  level: CefrLevel
  theme: string
}

export interface ScheduleState {
  key: string
  entryId: string
  direction: Direction
  state: LearningState
  learningStep?: 0 | 1
  intervalDays: number
  dueAt: string
  updatedAt: string
  schedulerVersion: 'srs-1'
}

export interface ReviewEvent {
  id: string
  scheduleKey: string
  entryId: string
  direction: Direction
  rating: Rating
  reviewedAt: string
  previousDueAt: string
  nextDueAt: string
  appVersion: string
  catalogVersion: string
  schedulerVersion: 'srs-1'
  previousState: ScheduleState
  canceledAt?: string
}

export const scheduleKey = (entryId: string, direction: Direction) => `${entryId}:${direction}`
