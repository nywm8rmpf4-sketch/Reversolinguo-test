export type Direction = 'fr-es' | 'es-fr'
export type Rating = 0 | 1 | 2 | 3
export type LearningState = 'NEW' | 'LEARNING' | 'REVIEW' | 'RELEARNING' | 'SUSPENDED'

export interface LexicalEntry {
  id: string
  es: string
  fr: string[]
  article?: string
  exampleEs: string
  exampleFr: string
  level: 'A1'
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
