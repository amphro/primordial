import React, { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { runGame } from '@shared/sim/runGame'
import { validateStrategy } from '@shared/strategy'
import type { Strategy } from '@shared/strategy'
import type { GameResolution } from '@shared/sim/runGame'
import { makeRng } from '@shared/rng'
import { initGrid, simulateTick } from '@shared/sim/simulation'
import { DEFAULT_CONFIG } from '@shared/config'
import type { GameConfig } from '@shared/config'
import GameCanvas from '../components/GameCanvas'
import type { AnimEvent, AnimEffect } from '../components/GameCanvas'
import ScoreBar from '../components/ScoreBar'

const BASE_INTERVAL_MS = 5000
const SPEEDS = [0.5, 1, 2, 4] as const
type Speed = typeof SPEEDS[number]

const DEFAULT_STRAT_JSON = JSON.stringify({
  rules: [],
  fallback: { action: 'GROW', zone: 'ALL', intensity: 'NORMAL' },
}, null, 2)

interface CloneState {
  blueStrategy?: Strategy
  redStrategy?: Strategy
  seed?: number
  config?: Partial<GameConfig>
}

export default function DevRun() {
  const location = useLocation()
  const cloned = (location.state ?? {}) as CloneState

  const [blueJson, setBlueJson]  = useState(() => cloned.blueStrategy ? JSON.stringify(cloned.blueStrategy, null, 2) : DEFAULT_STRAT_JSON)
  const [redJson,  setRedJson]   = useState(() => cloned.redStrategy  ? JSON.stringify(cloned.redStrategy,  null, 2) : DEFAULT_STRAT_JSON)
  const [seedStr,  setSeedStr]   = useState(() => cloned.seed != null ? String(cloned.seed) : '')
  const [roundsStr,setRoundsStr] = useState(() => String(cloned.config?.totalRounds ?? DEFAULT_CONFIG.totalRounds))
  const [parseError, setParseError] = useState('')

  const [resolution,     setResolution]     = useState<GameResolution | null>(null)
  const [animRound,      setAnimRound]       = useState(-1)
  const [animDone,       setAnimDone]        = useState(false)
  const [liveGrid,       setLiveGrid]        = useState<number[]>([])
  const [liveNutrients,  setLiveNutrients]   = useState<number[]>([])
  const [liveArmor,      setLiveArmor]       = useState<number[]>([])
  const [liveStarvation, setLiveStarvation]  = useState<number[]>([])
  const [resolveAnim,    setResolveAnim]     = useState<AnimEvent | null>(null)
  const [liveCaption,    setLiveCaption]     = useState<{ blueTrace: string; redTrace: string } | null>(null)
  const [speed, setSpeed]     = useState<Speed>(2)

  const runIdRef    = useRef(0)
  const speedRef    = useRef<Speed>(2)
  const animRoundRef = useRef(-1)
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clearTimer() {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null }
  }

  useEffect(() => () => clearTimer(), [])

  // Jump to a specific round by replaying from seed — cancels any ongoing animation
  function jumpToRound(target: number) {
    const res = resolution
    if (!res) return
    runIdRef.current++  // cancel ongoing animation
    clearTimer()
    const rng = makeRng(res.seed)
    let state = initGrid(res.config, rng)
    for (let i = 0; i <= target && i < res.rounds.length; i++) {
      const r = res.rounds[i]
      const result = simulateTick(state, r.round, res.config, r.blueSpec, r.redSpec, rng)
      state = result.state
    }
    setLiveGrid(Array.from(state.grid))
    setLiveNutrients(Array.from(state.nutrients))
    setLiveArmor(Array.from(state.armor))
    setLiveStarvation(Array.from(state.starvation))
    animRoundRef.current = target
    setAnimRound(target)
    const r = res.rounds[target]
    if (r) setLiveCaption({ blueTrace: r.blueTrace, redTrace: r.redTrace })
    setAnimDone(true)
  }

  function runSim() {
    setParseError('')
    let blueStrategy: Strategy, redStrategy: Strategy
    const totalRounds = Math.max(1, Math.min(60, parseInt(roundsStr) || DEFAULT_CONFIG.totalRounds))
    try { blueStrategy = validateStrategy(JSON.parse(blueJson), totalRounds) }
    catch { setParseError('Blue strategy: invalid JSON'); return }
    try { redStrategy  = validateStrategy(JSON.parse(redJson),  totalRounds) }
    catch { setParseError('Red strategy: invalid JSON');  return }

    const seed = seedStr.trim() ? (parseInt(seedStr) >>> 0) : (crypto.getRandomValues(new Uint32Array(1))[0])
    setSeedStr(String(seed))
    const config: GameConfig = { ...DEFAULT_CONFIG, totalRounds }
    clearTimer()

    const res = runGame(seed, config, blueStrategy, redStrategy)
    setResolution(res)
    setAnimDone(false)
    setLiveCaption(null)

    const initRng = makeRng(res.seed)
    const startState = initGrid(res.config, initRng)
    setLiveGrid(Array.from(startState.grid))
    setLiveNutrients(Array.from(startState.nutrients))
    setLiveArmor(Array.from(startState.armor))
    setLiveStarvation(Array.from(startState.starvation))
    animRoundRef.current = -1
    setAnimRound(-1)

    // Animate using a local closure — runId guards against stale timers after re-run
    const myId = ++runIdRef.current
    const rng = makeRng(res.seed)
    let state = initGrid(res.config, rng)

    const step = () => {
      if (runIdRef.current !== myId) return
      const next = animRoundRef.current + 1
      if (next >= res.rounds.length) { setAnimDone(true); return }

      const r = res.rounds[next]
      const result = simulateTick(state, r.round, res.config, r.blueSpec, r.redSpec, rng)
      state = result.state

      setLiveGrid(Array.from(result.state.grid))
      setLiveNutrients(Array.from(result.state.nutrients))
      setLiveArmor(Array.from(result.state.armor))
      setLiveStarvation(Array.from(result.state.starvation))
      animRoundRef.current = next
      setAnimRound(next)
      setLiveCaption({ blueTrace: r.blueTrace, redTrace: r.redTrace })

      const effects: AnimEffect[] = [
        { action: r.blueSpec.action, zone: r.blueSpec.zone, color: 'blue' },
        { action: r.redSpec.action,  zone: r.redSpec.zone,  color: 'red'  },
      ]
      setResolveAnim({ effects, startedAt: Date.now() })
      setTimeout(() => setResolveAnim(null), 1200)

      timerRef.current = setTimeout(step, BASE_INTERVAL_MS / speedRef.current)
    }
    timerRef.current = setTimeout(step, BASE_INTERVAL_MS / speedRef.current)
  }

  function skipToEnd() {
    if (!resolution) return
    jumpToRound(resolution.rounds.length - 1)
  }

  const blueCount  = liveGrid.filter(v => v === 1).length
  const redCount   = liveGrid.filter(v => v === 2).length
  const totalCells = blueCount + redCount
  const blueScore  = totalCells === 0 ? 50 : Math.round(blueCount / totalCells * 100)
  const redScore   = 100 - blueScore
  const gridW = resolution?.config.gridWidth  ?? DEFAULT_CONFIG.gridWidth
  const gridH = resolution?.config.gridHeight ?? DEFAULT_CONFIG.gridHeight
  const totalRoundsDisplay = resolution?.rounds.length ?? (parseInt(roundsStr) || DEFAULT_CONFIG.totalRounds)
  const isAnimating = resolution !== null && !animDone

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 16px', gap: 10, minHeight: '100vh', background: '#080c14' }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 960, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#3a5a7a', fontSize: 11, letterSpacing: 2 }}>DEV LAB</span>
        <span style={{ color: '#1a2a3a', fontSize: 10, fontFamily: 'monospace' }}>client-side · deterministic · no server needed</span>
      </div>

      {/* Strategy editors */}
      <div style={{ width: '100%', maxWidth: 960, display: 'flex', gap: 10 }}>
        {([
          { label: 'BLUE STRATEGY', json: blueJson, setJson: setBlueJson, accent: '#4a9eff' },
          { label: 'RED STRATEGY',  json: redJson,  setJson: setRedJson,  accent: '#ff6b4a' },
        ] as const).map(({ label, json, setJson, accent }) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: accent, fontSize: 9, letterSpacing: 2 }}>{label}</span>
              <button onClick={() => void navigator.clipboard.writeText(json)}
                style={{ background: 'none', border: 'none', color: '#2a4a6a', fontSize: 9, cursor: 'pointer', fontFamily: 'inherit' }}>
                copy ⎘
              </button>
            </div>
            <textarea
              value={json}
              onChange={e => setJson(e.target.value)}
              rows={18}
              spellCheck={false}
              style={{
                background: '#06090f', border: `1px solid ${accent}33`, borderRadius: 4,
                color: '#8a9aaa', fontFamily: 'monospace', fontSize: 11.5, padding: 10,
                resize: 'vertical', lineHeight: 1.6, outline: 'none',
                cursor: 'text', userSelect: 'text', WebkitUserSelect: 'text',
              } as React.CSSProperties}
            />
          </div>
        ))}
      </div>

      {/* Run controls */}
      <div style={{ width: '100%', maxWidth: 960, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#2a4a6a', fontSize: 10 }}>Seed</span>
          <input value={seedStr} onChange={e => setSeedStr(e.target.value)} placeholder="random"
            style={{ background: '#06090f', border: '1px solid #1a2a3a', borderRadius: 3, color: '#6a8aaa', fontFamily: 'monospace', fontSize: 11, padding: '4px 8px', width: 110 }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#2a4a6a', fontSize: 10 }}>Rounds</span>
          <input value={roundsStr} onChange={e => setRoundsStr(e.target.value)}
            style={{ background: '#06090f', border: '1px solid #1a2a3a', borderRadius: 3, color: '#6a8aaa', fontFamily: 'monospace', fontSize: 11, padding: '4px 8px', width: 60 }} />
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {SPEEDS.map(s => (
            <button key={s} onClick={() => { speedRef.current = s; setSpeed(s) }}
              style={{ background: speed === s ? '#1a3050' : 'transparent', border: `1px solid ${speed === s ? '#4a9eff' : '#1e3050'}`, color: speed === s ? '#4a9eff' : '#3a5a7a', fontFamily: 'monospace', fontSize: 10, padding: '3px 8px', borderRadius: 3, cursor: 'pointer' }}>
              {s}×
            </button>
          ))}
        </div>
        {isAnimating && (
          <button onClick={skipToEnd}
            style={{ background: 'transparent', border: '1px solid #1e3050', color: '#3a5a7a', fontFamily: 'inherit', fontSize: 10, padding: '3px 10px', borderRadius: 3, cursor: 'pointer' }}>
            skip »
          </button>
        )}
        <button onClick={runSim}
          style={{ background: '#0d2035', border: '1px solid #2a5a8a', color: '#4a9eff', fontFamily: 'inherit', fontSize: 13, padding: '7px 24px', borderRadius: 4, cursor: 'pointer', marginLeft: 'auto', letterSpacing: 1 }}>
          ▶ Run
        </button>
      </div>

      {parseError && <div style={{ color: '#ff6b4a', fontSize: 12, fontFamily: 'monospace' }}>{parseError}</div>}

      {/* Result */}
      {resolution && (
        <div style={{ width: '100%', maxWidth: 960, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {/* Canvas */}
          <div style={{ flex: '0 0 auto' }}>
            <div style={{ marginBottom: 6 }}>
              <ScoreBar blue={blueScore} red={redScore} round={animRound < 0 ? 0 : animRound + 1} totalRounds={totalRoundsDisplay} />
            </div>
            <GameCanvas grid={liveGrid} nutrients={liveNutrients} armor={liveArmor} starvation={liveStarvation}
              anim={resolveAnim} gridW={gridW} gridH={gridH} size={420} />
          </div>

          {/* Right column */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, fontFamily: 'monospace', fontSize: 11, minWidth: 0 }}>

            {/* Winner card */}
            {animDone && (
              <div style={{ background: '#0a1420', border: `1px solid ${resolution.winner === 'blue' ? '#1a4a8a' : '#8a1a1a'}`, borderRadius: 4, padding: '10px 14px' }}>
                <div style={{ color: resolution.winner === 'blue' ? '#4a9eff' : '#ff6b4a', fontSize: 14, letterSpacing: 2 }}>
                  {resolution.winner.toUpperCase()} WINS
                </div>
                <div style={{ color: '#3a5a7a', marginTop: 4 }}>
                  Blue {resolution.finalScores.blue}% · Red {resolution.finalScores.red}%
                </div>
                <div style={{ color: '#2a4a6a', marginTop: 3, fontSize: 10 }}>seed {resolution.seed}</div>
              </div>
            )}

            {/* Round scrubber */}
            <div style={{ background: '#0a1420', border: '1px solid #1a2a3a', borderRadius: 4, padding: '8px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => jumpToRound(Math.max(0, animRound - 1))} disabled={animRound <= 0}
                  style={{ background: 'none', border: '1px solid #1e3050', color: animRound > 0 ? '#4a9eff' : '#1a2a3a', fontSize: 13, padding: '1px 8px', borderRadius: 3, cursor: animRound > 0 ? 'pointer' : 'default', fontFamily: 'monospace' }}>◀</button>
                <span style={{ color: '#4a7aaa', minWidth: 80, textAlign: 'center' }}>
                  R{animRound + 1} / {resolution.rounds.length}
                </span>
                <button onClick={() => jumpToRound(Math.min(resolution.rounds.length - 1, animRound + 1))} disabled={animRound >= resolution.rounds.length - 1}
                  style={{ background: 'none', border: '1px solid #1e3050', color: animRound < resolution.rounds.length - 1 ? '#4a9eff' : '#1a2a3a', fontSize: 13, padding: '1px 8px', borderRadius: 3, cursor: animRound < resolution.rounds.length - 1 ? 'pointer' : 'default', fontFamily: 'monospace' }}>▶</button>
              </div>
              {liveCaption && (
                <div style={{ borderTop: '1px solid #1a2a3a', marginTop: 6, paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ color: '#4a9eff', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>▶ {liveCaption.blueTrace}</div>
                  <div style={{ color: '#ff6b4a', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>▶ {liveCaption.redTrace}</div>
                </div>
              )}
            </div>

            {/* Round log */}
            <div style={{ background: '#0a1420', border: '1px solid #1a2a3a', borderRadius: 4, padding: '8px 0', flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div style={{ color: '#2a4a6a', fontSize: 9, letterSpacing: 2, padding: '0 12px 6px' }}>ROUND LOG — click row to jump</div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                {resolution.rounds.map((r, idx) => {
                  const prev = idx > 0 ? resolution.rounds[idx - 1] : null
                  const blueD = prev ? r.blueCells - prev.blueCells : r.blueCells
                  const redD  = prev ? r.redCells  - prev.redCells  : r.redCells
                  const active = idx === animRound
                  return (
                    <div key={r.round} onClick={() => jumpToRound(idx)}
                      style={{ display: 'flex', gap: 6, padding: '3px 12px', cursor: 'pointer', background: active ? '#0d2035' : 'transparent', borderLeft: active ? '2px solid #2a5a8a' : '2px solid transparent' }}>
                      <span style={{ color: '#2a4a6a', minWidth: 22, flexShrink: 0 }}>R{r.round + 1}</span>
                      <span style={{ color: '#4a9eff', minWidth: 52, flexShrink: 0 }}>{r.blueSpec.action.slice(0,4)}</span>
                      <span style={{ color: blueD >= 0 ? '#2a8a4a' : '#8a2a2a', minWidth: 36, flexShrink: 0, textAlign: 'right' }}>{blueD > 0 ? '+' : ''}{blueD}</span>
                      <span style={{ color: '#2a3a4a', flexShrink: 0 }}>|</span>
                      <span style={{ color: '#ff6b4a', minWidth: 52, flexShrink: 0 }}>{r.redSpec.action.slice(0,4)}</span>
                      <span style={{ color: redD >= 0 ? '#8a2a2a' : '#2a8a4a', minWidth: 36, flexShrink: 0, textAlign: 'right' }}>{redD > 0 ? '+' : ''}{redD}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 24 }} />
    </div>
  )
}
