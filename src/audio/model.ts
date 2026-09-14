export type SoundMode = 'off' | 'subtle' | 'on'

export type SoundEvent = 'cardFlip' | 'forgotten' | 'hard' | 'correct' | 'easy' | 'sessionComplete'

export const defaultSoundMode: SoundMode = 'subtle'

export function isSoundMode(value: unknown): value is SoundMode {
  return value === 'off' || value === 'subtle' || value === 'on'
}

/**
 * Normalizes settings already stored/exported by an earlier Reversolinguo version.
 * Historical users were silent by default, so a missing legacy flag stays off.
 */
export function soundModeFromPersisted(value: unknown, legacySoundEnabled?: unknown): SoundMode {
  if (isSoundMode(value)) return value
  return legacySoundEnabled === true ? 'on' : 'off'
}
