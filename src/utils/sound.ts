let audioCtx: AudioContext | null = null

function ctx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  if (!audioCtx) audioCtx = new AC()
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  return audioCtx
}

function tone(c: AudioContext, freq: number, start: number, dur: number, vol = 0.18, type: OscillatorType = 'sine') {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + start)
  gain.gain.setValueAtTime(0.0001, c.currentTime + start)
  gain.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  osc.connect(gain)
  gain.connect(c.destination)
  osc.start(c.currentTime + start)
  osc.stop(c.currentTime + start + dur + 0.05)
}

export function playSuccessSound() {
  const c = ctx()
  if (!c) return
  // Two-note ascending chime: C5 -> E5 -> G5 (C major arpeggio)
  tone(c, 523.25, 0, 0.18)
  tone(c, 659.25, 0.16, 0.18)
  tone(c, 783.99, 0.32, 0.34, 0.22)
}

let ringTimer: ReturnType<typeof setInterval> | null = null

// Incoming-call ringtone: a repeating two-tone "ring-pulse" (A5 -> E5 -> A5
// -> E5) until stopRingtone() is called. Uses the same WebAudio synth as the
// success chime, so it plays anywhere without audio files.
export function startRingtone() {
  const c = ctx()
  if (!c) return
  stopRingtone()
  const ring = () => {
    const t = c.currentTime
    tone(c, 880, t, 0.3, 0.16)
    tone(c, 659.25, t + 0.38, 0.3, 0.16)
    tone(c, 880, t + 0.76, 0.3, 0.16)
    tone(c, 659.25, t + 1.14, 0.3, 0.16)
  }
  ring()
  ringTimer = setInterval(ring, 2400)
}

export function stopRingtone() {
  if (ringTimer !== null) {
    clearInterval(ringTimer)
    ringTimer = null
  }
}