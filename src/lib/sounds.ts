let ctx: AudioContext | null = null

function getContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function playTone(freq: number, endFreq: number, duration: number, type: OscillatorType = 'sine', gain = 0.15) {
  const ac = getContext()
  const osc = ac.createOscillator()
  const vol = ac.createGain()

  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime)
  osc.frequency.linearRampToValueAtTime(endFreq, ac.currentTime + duration)

  vol.gain.setValueAtTime(gain, ac.currentTime)
  vol.gain.linearRampToValueAtTime(0, ac.currentTime + duration)

  osc.connect(vol)
  vol.connect(ac.destination)
  osc.start()
  osc.stop(ac.currentTime + duration)
}

/** Ascending chime — agent completed / headless done */
export function playChime() {
  playTone(600, 900, 0.15)
  setTimeout(() => playTone(900, 1100, 0.12, 'sine', 0.1), 120)
}

/** Low descending warble — error */
export function playWarning() {
  playTone(440, 300, 0.22, 'triangle', 0.18)
}

/** Quick pop — agent started */
export function playPop() {
  playTone(800, 600, 0.06, 'sine', 0.12)
}
