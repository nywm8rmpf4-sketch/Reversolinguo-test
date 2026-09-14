import { describe, expect, it } from 'vitest'
import { playSound, soundPattern } from '../../src/audio/engine'
import { defaultSoundMode, soundModeFromPersisted } from '../../src/audio/model'

const events = ['cardFlip', 'forgotten', 'hard', 'correct', 'easy', 'sessionComplete'] as const

describe('semantic sound grammar', () => {
  it('defaults new users to the subtle profile while preserving historical intent', () => {
    expect(defaultSoundMode).toBe('subtle')
    expect(soundModeFromPersisted(undefined, true)).toBe('on')
    expect(soundModeFromPersisted(undefined, false)).toBe('off')
    expect(soundModeFromPersisted(undefined, undefined)).toBe('off')
    expect(soundModeFromPersisted('subtle', true)).toBe('subtle')
  })

  it('is completely silent in off mode', () => {
    for (const event of events) expect(soundPattern(event, 'off')).toEqual([])
  })

  it('keeps subtle cues quieter and no richer than enabled cues', () => {
    for (const event of events) {
      const subtle = soundPattern(event, 'subtle')
      const enabled = soundPattern(event, 'on')
      expect(subtle.length).toBeGreaterThan(0)
      expect(subtle.length).toBeLessThanOrEqual(enabled.length)
      expect(Math.max(...subtle.map((voice) => voice.gain))).toBeLessThan(Math.max(...enabled.map((voice) => voice.gain)))
    }
  })

  it('keeps frequent cues under 250 ms and the completion cadence under 500 ms', () => {
    for (const event of events) {
      const pattern = soundPattern(event, 'on')
      const end = Math.max(...pattern.map((voice) => voice.startMs + voice.durationMs))
      expect(end).toBeLessThan(event === 'sessionComplete' ? 500 : 250)
    }
  })

  it('fails silent when Web Audio is unavailable', () => {
    expect(() => playSound('cardFlip', 'on')).not.toThrow()
    expect(() => playSound('sessionComplete', 'off')).not.toThrow()
  })
})
