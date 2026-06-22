import { useRef, useCallback } from 'react'

function note(ac: AudioContext, freq: number, duration: number, gain = 0.3, type: OscillatorType = 'sine'): void {
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.connect(g)
  g.connect(ac.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, ac.currentTime)
  g.gain.setValueAtTime(gain, ac.currentTime)
  g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration)
  osc.start()
  osc.stop(ac.currentTime + duration)
}

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null)

  async function getCtx(): Promise<AudioContext | null> {
    try {
      if (!ctxRef.current) ctxRef.current = new AudioContext()
      if (ctxRef.current.state === 'suspended') await ctxRef.current.resume()
      return ctxRef.current
    } catch { return null }
  }

  const playAction = useCallback((action: string) => {
    void getCtx().then(ac => {
      if (!ac) return
      try {
        switch (action) {
          case 'GROW':
            note(ac, 261, 0.15)
            setTimeout(() => note(ac, 329, 0.15), 80)
            setTimeout(() => note(ac, 392, 0.2), 160)
            break
          case 'HUNT':
            note(ac, 220, 0.1, 0.35, 'sawtooth')
            setTimeout(() => note(ac, 196, 0.12, 0.35, 'sawtooth'), 80)
            setTimeout(() => note(ac, 165, 0.2, 0.25, 'sawtooth'), 160)
            break
          case 'PULSE':
            note(ac, 80, 0.35, 0.5, 'triangle')
            setTimeout(() => note(ac, 880, 0.12, 0.25, 'square'), 40)
            setTimeout(() => note(ac, 440, 0.2, 0.15), 120)
            break
          case 'ARMOR':
            note(ac, 523, 0.08, 0.25)
            setTimeout(() => note(ac, 659, 0.12, 0.2), 60)
            setTimeout(() => note(ac, 784, 0.25, 0.15), 120)
            break
        }
      } catch { /* audio context may be closed */ }
    })
  }, [])

  const playRoundStart = useCallback(() => {
    void getCtx().then(ac => {
      if (!ac) return
      try {
        note(ac, 440, 0.08, 0.15)
        setTimeout(() => note(ac, 554, 0.12, 0.12), 90)
      } catch { /* */ }
    })
  }, [])

  const playWin = useCallback(() => {
    void getCtx().then(ac => {
      if (!ac) return
      try {
        ;([261, 329, 392, 523] as number[]).forEach((f, i) => setTimeout(() => note(ac, f, 0.3, 0.25), i * 100))
      } catch { /* */ }
    })
  }, [])

  const playLose = useCallback(() => {
    void getCtx().then(ac => {
      if (!ac) return
      try {
        ;([392, 329, 261, 196] as number[]).forEach((f, i) => setTimeout(() => note(ac, f, 0.3, 0.2), i * 110))
      } catch { /* */ }
    })
  }, [])

  return { playAction, playRoundStart, playWin, playLose }
}
