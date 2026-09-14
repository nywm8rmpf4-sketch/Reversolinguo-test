import type { SoundEvent, SoundMode } from './model'

export interface SoundVoice {
  kind: 'tone' | 'noise'
  frequency: number
  startMs: number
  durationMs: number
  gain: number
  wave?: OscillatorType
  fullOnly?: boolean
}

const cues: Record<SoundEvent, readonly SoundVoice[]> = {
  cardFlip: [
    { kind: 'noise', frequency: 1050, startMs: 0, durationMs: 42, gain: 0.032 },
    { kind: 'tone', frequency: 145, startMs: 8, durationMs: 68, gain: 0.025, wave: 'triangle', fullOnly: true }
  ],
  forgotten: [
    { kind: 'tone', frequency: 196, startMs: 0, durationMs: 120, gain: 0.026, wave: 'triangle' },
    { kind: 'tone', frequency: 175, startMs: 62, durationMs: 115, gain: 0.018, wave: 'sine', fullOnly: true }
  ],
  hard: [
    { kind: 'tone', frequency: 220, startMs: 0, durationMs: 110, gain: 0.025, wave: 'triangle' },
    { kind: 'tone', frequency: 247, startMs: 55, durationMs: 105, gain: 0.017, wave: 'sine', fullOnly: true }
  ],
  correct: [
    { kind: 'tone', frequency: 330, startMs: 0, durationMs: 115, gain: 0.027, wave: 'triangle' },
    { kind: 'tone', frequency: 392, startMs: 62, durationMs: 115, gain: 0.019, wave: 'sine', fullOnly: true }
  ],
  easy: [
    { kind: 'tone', frequency: 392, startMs: 0, durationMs: 105, gain: 0.027, wave: 'triangle' },
    { kind: 'tone', frequency: 494, startMs: 58, durationMs: 120, gain: 0.021, wave: 'sine' },
    { kind: 'tone', frequency: 587, startMs: 105, durationMs: 105, gain: 0.014, wave: 'sine', fullOnly: true }
  ],
  sessionComplete: [
    { kind: 'tone', frequency: 330, startMs: 0, durationMs: 145, gain: 0.026, wave: 'triangle' },
    { kind: 'tone', frequency: 415, startMs: 105, durationMs: 160, gain: 0.024, wave: 'triangle' },
    { kind: 'tone', frequency: 494, startMs: 215, durationMs: 180, gain: 0.021, wave: 'sine', fullOnly: true }
  ]
}

const gainScale: Record<Exclude<SoundMode, 'off'>, number> = { subtle: 0.45, on: 1 }

export function soundPattern(event: SoundEvent, mode: SoundMode): SoundVoice[] {
  if (mode === 'off') return []
  return cues[event]
    .filter((voice) => mode === 'on' || !voice.fullOnly)
    .map((voice) => ({ ...voice, gain: voice.gain * gainScale[mode] }))
}

let audioContext: AudioContext | null = null
let activeSources: AudioScheduledSourceNode[] = []

function stopActiveSources() {
  for (const source of activeSources) {
    try { source.stop() } catch { /* source may already have ended */ }
  }
  activeSources = []
}

function track(source: AudioScheduledSourceNode) {
  activeSources.push(source)
  source.addEventListener('ended', () => {
    activeSources = activeSources.filter((item) => item !== source)
  }, { once: true })
}

function scheduleTone(context: AudioContext, voice: SoundVoice, origin: number) {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const start = origin + voice.startMs / 1000
  const end = start + voice.durationMs / 1000

  oscillator.type = voice.wave ?? 'sine'
  oscillator.frequency.setValueAtTime(voice.frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, voice.gain), start + Math.min(0.018, voice.durationMs / 4000))
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  oscillator.connect(gain)
  gain.connect(context.destination)
  track(oscillator)
  oscillator.start(start)
  oscillator.stop(end + 0.01)
}

function scheduleNoise(context: AudioContext, voice: SoundVoice, origin: number) {
  const frames = Math.max(1, Math.ceil(context.sampleRate * voice.durationMs / 1000))
  const buffer = context.createBuffer(1, frames, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1

  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  const start = origin + voice.startMs / 1000
  const end = start + voice.durationMs / 1000

  source.buffer = buffer
  filter.type = 'bandpass'
  filter.frequency.setValueAtTime(voice.frequency, start)
  filter.Q.setValueAtTime(0.7, start)
  gain.gain.setValueAtTime(Math.max(0.0002, voice.gain), start)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  track(source)
  source.start(start)
  source.stop(end + 0.01)
}

function schedule(event: SoundEvent, mode: SoundMode, context: AudioContext) {
  const pattern = soundPattern(event, mode)
  if (!pattern.length) return
  stopActiveSources()
  const origin = context.currentTime + 0.008
  for (const voice of pattern) {
    if (voice.kind === 'noise') scheduleNoise(context, voice, origin)
    else scheduleTone(context, voice, origin)
  }
}

/** Best-effort UI feedback. Audio failures must never affect learning state. */
export function playSound(event: SoundEvent, mode: SoundMode): void {
  if (mode === 'off' || typeof window === 'undefined' || !('AudioContext' in window)) return
  try {
    audioContext ??= new window.AudioContext()
    const context = audioContext
    if (context.state === 'suspended') {
      void context.resume().then(() => schedule(event, mode, context)).catch(() => undefined)
      return
    }
    schedule(event, mode, context)
  } catch {
    // Sound is optional and deliberately fails silent.
  }
}

export function disposeSoundEngine(): void {
  stopActiveSources()
  const context = audioContext
  audioContext = null
  if (context && context.state !== 'closed') void context.close().catch(() => undefined)
}
