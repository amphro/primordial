import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useGameSocket, type GameMsg, type StateMsg, type StrategyLockedMsg } from '../hooks/useGameSocket'
import { useSound } from '../hooks/useSound'
import GameCanvas, { type AnimEffect, type AnimEvent } from '../components/GameCanvas'
import StatusBar from '../components/StatusBar'
import ScoreBar from '../components/ScoreBar'
import StrategyInput from '../components/PromptInput'
import StrategyReview from '../components/StrategyReview'
import { makeRng } from '@shared/rng'
import { initGrid, simulateTick } from '@shared/sim/simulation'
import type { GridState } from '@shared/sim/simulation'
import type { GameResolution, RoundRecord } from '@shared/sim/runGame'
import { SIM_VERSION } from '@shared/sim/runGame'
import { applyBoardEvent } from '@shared/sim/events'
import type { Strategy } from '@shared/strategy'
import Logo from '../components/Logo'
import Tooltip from '../components/Tooltip'

const ACTION_DESC: Record<string, string> = {
  GROW:    'GROW — Extra reproduction near nutrients.\nBoosts cell count using nearby nutrient charges.',
  HUNT:    'HUNT — Cells chase and capture enemies.\nOffensive; countered by WALL.',
  ARMOR:   'ARMOR — Cells gain shields absorbing hits.\nDefensive; counters PULSE.',
  PULSE:   'PULSE — Shockwave kills % of enemies in radius.\nCountered by ARMOR.',
  TOXIN:   'TOXIN — Poisons tiles; enemies die on contact.\n3-tick duration. Costs 3 power resources.',
  SCATTER: 'SCATTER — Reproduce ignoring nutrients.\nSpread into starved or isolated zones.',
  WALL:    'WALL — Spawn barriers facing the enemy.\n3-tick duration. Costs 2 power resources.',
  FEAST:   'FEAST — Cells near nutrients reproduce multiple times.\nBurst growth. Costs 2 power resources.',
}

const BASE_INTERVAL_MS = 5000  // 5s per round at 1× speed

const SPEEDS = [0.5, 1, 2, 4] as const
type Speed = typeof SPEEDS[number]
const SPEED_LABEL: Record<Speed, string> = { 0.5: '0.5×', 1: '1×', 2: 'Normal', 4: '2×' }
const DEFAULT_SPEED: Speed = 2

interface GameOverData {
  winner: 'blue' | 'red'
  winReason: string
  scores: { blue: number; red: number }
}

const isLocalhost = typeof window !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')

export default function Game() {
  const { code } = useParams<{ code: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { playAction, playWin, playLose } = useSound()

  const [gameState, setGameState] = useState<StateMsg | null>(null)
  const [resolution, setResolution] = useState<GameResolution | null>(null)
  const [animRound, setAnimRound] = useState(-1)
  const [liveGrid, setLiveGrid] = useState<number[]>([])
  const [liveNutrients, setLiveNutrients] = useState<number[]>([])
  const [liveArmor, setLiveArmor] = useState<number[]>([])
  const [liveStarvation, setLiveStarvation] = useState<number[]>([])
  const [liveToxin, setLiveToxin] = useState<number[]>([])
  const [liveNutrientType, setLiveNutrientType] = useState<number[]>([])
  const [liveBlueResources, setLiveBlueResources] = useState(0)
  const [liveRedResources, setLiveRedResources] = useState(0)
  const [resolveAnim, setResolveAnim] = useState<AnimEvent | null>(null)
  const [liveCaption, setLiveCaption] = useState<{ blueTrace: string; redTrace: string } | null>(null)
  const [roundHistory, setRoundHistory] = useState<RoundRecord[]>([])
  const [speed, setSpeed] = useState<Speed>(DEFAULT_SPEED)
  const [devOpen, setDevOpen] = useState(isLocalhost)
  const [gameFinished, setGameFinished] = useState(false)
  const [gameOverData, setGameOverData] = useState<GameOverData | null>(null)
  const [myStrategy, setMyStrategy] = useState<Strategy | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  // Refs — avoid stale closures inside animation timer
  const myColorRef         = useRef<'blue' | 'red' | undefined>(undefined)
  const animSimRef         = useRef<{ state: GridState; rng: () => number } | null>(null)
  const animTimerRef       = useRef<ReturnType<typeof setTimeout> | null>(null)
  const resolutionRef      = useRef<GameResolution | null>(null)
  const animRoundRef       = useRef(-1)
  const roundHistoryRef    = useRef<RoundRecord[]>([])
  const speedRef           = useRef<Speed>(DEFAULT_SPEED)
  const pendingGameOverRef = useRef<GameOverData | null>(null)
  // Always-fresh navigate/code so animation callbacks don't capture stale values
  const navigateFn = useRef(navigate)
  const codeRef    = useRef(code)
  useEffect(() => { navigateFn.current = navigate }, [navigate])
  useEffect(() => { codeRef.current = code }, [code])

  function clearAnimTimer() {
    if (animTimerRef.current) { clearTimeout(animTimerRef.current); animTimerRef.current = null }
  }

  // Called when animation ends or game_over arrives — stays on the board
  function finishGame() {
    const pgo = pendingGameOverRef.current
    if (!pgo) return
    setGameFinished(true)
    setGameOverData(pgo)
  }

  // Called when user clicks "See Results →"
  function gotoResults() {
    const pgo = pendingGameOverRef.current
    if (!pgo) return
    const mc = myColorRef.current
    const rounds = roundHistoryRef.current.map((r, idx) => {
      const prev = idx > 0 ? roundHistoryRef.current[idx - 1] : null
      const mySpec  = mc === 'blue' ? r.blueSpec  : r.redSpec
      const oppSpec = mc === 'blue' ? r.redSpec   : r.blueSpec
      const myNow   = mc === 'blue' ? r.blueCells : r.redCells
      const oppNow  = mc === 'blue' ? r.redCells  : r.blueCells
      const myPrev  = prev ? (mc === 'blue' ? prev.blueCells : prev.redCells)  : 0
      const oppPrev = prev ? (mc === 'blue' ? prev.redCells  : prev.blueCells) : 0
      return {
        round: r.round + 1,
        myAction: mySpec?.action ?? '?', myZone: mySpec?.zone ?? '?', myDelta: myNow - myPrev,
        oppAction: oppSpec?.action ?? '?', oppZone: oppSpec?.zone ?? '?', oppDelta: oppNow - oppPrev,
      }
    })
    navigateFn.current(`/game/${codeRef.current}/over`, {
      state: { gameCode: codeRef.current, winner: pgo.winner, winReason: pgo.winReason, scores: pgo.scores, rounds },
    })
  }

  // Dev: jump to any round by replaying sim from seed
  function jumpToRound(target: number) {
    const res = resolutionRef.current
    if (!res) return
    clearAnimTimer()
    const rng = makeRng(res.seed)
    const powerRng = makeRng(res.seed ^ 0x4E07)
    let state = initGrid(res.config, rng, powerRng)
    for (let i = 0; i <= target && i < res.rounds.length; i++) {
      const r = res.rounds[i]
      const result = simulateTick(state, r.round, res.config, r.blueSpec, r.redSpec, rng)
      state = result.state
      for (const ev of (res.events ?? [])) {
        if (ev.round === r.round) applyBoardEvent(state, ev, res.config, rng)
      }
    }
    setLiveGrid(Array.from(state.grid))
    setLiveNutrients(Array.from(state.nutrients))
    setLiveArmor(Array.from(state.armor))
    setLiveStarvation(Array.from(state.starvation))
    setLiveToxin(Array.from(state.toxin))
    setLiveNutrientType(Array.from(state.nutrientType))
    setLiveBlueResources(state.blueResources)
    setLiveRedResources(state.redResources)
    animRoundRef.current = target
    setAnimRound(target)
    const r = res.rounds[target]
    if (r) setLiveCaption({ blueTrace: r.blueTrace, redTrace: r.redTrace })
    roundHistoryRef.current = res.rounds.slice(0, target + 1)
    setRoundHistory(res.rounds.slice(0, target + 1))
  }

  async function confirmStrategy() {
    if (!code || confirming) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/games/${code}/confirm`, { method: 'POST', credentials: 'include' })
      if (!res.ok) setConfirming(false)
    } catch {
      setConfirming(false)
    }
  }

  function changeSpeed(s: Speed) {
    speedRef.current = s
    setSpeed(s)
  }

  function skipToEnd() {
    if (!resolutionRef.current || !animSimRef.current) return
    clearAnimTimer()
    const res = resolutionRef.current
    let { state, rng } = animSimRef.current
    for (let i = animRoundRef.current + 1; i < res.rounds.length; i++) {
      const r = res.rounds[i]
      const result = simulateTick(state, r.round, res.config, r.blueSpec, r.redSpec, rng)
      state = result.state
      for (const ev of (res.events ?? [])) {
        if (ev.round === r.round) applyBoardEvent(state, ev, res.config, rng)
      }
    }
    animSimRef.current = { state, rng }
    setLiveGrid(Array.from(state.grid))
    setLiveNutrients(Array.from(state.nutrients))
    setLiveArmor(Array.from(state.armor))
    setLiveStarvation(Array.from(state.starvation))
    setLiveToxin(Array.from(state.toxin))
    setLiveNutrientType(Array.from(state.nutrientType))
    setLiveBlueResources(state.blueResources)
    setLiveRedResources(state.redResources)
    animRoundRef.current = res.rounds.length - 1
    setAnimRound(animRoundRef.current)
    setLiveCaption(null)
    roundHistoryRef.current = res.rounds
    setRoundHistory(res.rounds)
    finishGame()
  }

  // Start animating when resolution arrives — uses recursive setTimeout so speed changes mid-animation
  useEffect(() => {
    if (!resolution) return
    resolutionRef.current = resolution

    if (resolution.simVersion !== SIM_VERSION) {
      console.warn('[Game] simVersion mismatch — showing static result')
      animRoundRef.current = resolution.rounds.length - 1
      setAnimRound(animRoundRef.current)
      roundHistoryRef.current = resolution.rounds
      setRoundHistory(resolution.rounds)
      const last = resolution.rounds[resolution.rounds.length - 1]
      if (last) setLiveCaption({ blueTrace: last.blueTrace, redTrace: last.redTrace })
      finishGame()
      return
    }

    clearAnimTimer()
    const rng = makeRng(resolution.seed)
    const powerRng = makeRng(resolution.seed ^ 0x4E07)
    const startState = initGrid(resolution.config, rng, powerRng)
    animSimRef.current = { state: startState, rng }
    setLiveGrid(Array.from(startState.grid))
    setLiveNutrients(Array.from(startState.nutrients))
    setLiveArmor(Array.from(startState.armor))
    setLiveStarvation(Array.from(startState.starvation))
    setLiveToxin(Array.from(startState.toxin))
    setLiveNutrientType(Array.from(startState.nutrientType))
    setLiveBlueResources(startState.blueResources)
    setLiveRedResources(startState.redResources)
    animRoundRef.current = -1
    setAnimRound(-1)
    roundHistoryRef.current = []
    setRoundHistory([])

    const step = () => {
      const res = resolutionRef.current
      if (!res || !animSimRef.current) return

      const nextRound = animRoundRef.current + 1
      if (nextRound >= res.rounds.length) {
        finishGame()
        return
      }

      const r = res.rounds[nextRound]
      const { state, rng: rngFn } = animSimRef.current
      const result = simulateTick(state, r.round, res.config, r.blueSpec, r.redSpec, rngFn)
      for (const ev of (res.events ?? [])) {
        if (ev.round === r.round) applyBoardEvent(result.state, ev, res.config, rngFn)
      }
      animSimRef.current = { state: result.state, rng: rngFn }

      setLiveGrid(Array.from(result.state.grid))
      setLiveNutrients(Array.from(result.state.nutrients))
      setLiveArmor(Array.from(result.state.armor))
      setLiveStarvation(Array.from(result.state.starvation))
      setLiveToxin(Array.from(result.state.toxin))
      setLiveNutrientType(Array.from(result.state.nutrientType))
      setLiveBlueResources(result.state.blueResources)
      setLiveRedResources(result.state.redResources)
      animRoundRef.current = nextRound
      setAnimRound(nextRound)
      setLiveCaption({ blueTrace: r.blueTrace, redTrace: r.redTrace })

      const newHistory = [...roundHistoryRef.current, r]
      roundHistoryRef.current = newHistory
      setRoundHistory(newHistory)

      const effects: AnimEffect[] = [
        { action: r.blueSpec.action, zone: r.blueSpec.zone, color: 'blue' },
        { action: r.redSpec.action,  zone: r.redSpec.zone,  color: 'red'  },
      ]
      setResolveAnim({ effects, startedAt: Date.now() })
      setTimeout(() => setResolveAnim(null), 1200)

      const mc = myColorRef.current
      if (mc) playAction(mc === 'blue' ? r.blueSpec.action : r.redSpec.action)

      // Recursive: schedule next step — reads speedRef fresh so mid-animation changes work
      animTimerRef.current = setTimeout(step, BASE_INTERVAL_MS / speedRef.current)
    }

    animTimerRef.current = setTimeout(step, BASE_INTERVAL_MS / speedRef.current)
    return () => clearAnimTimer()
  }, [resolution, playAction])

  const onMessage = useCallback((msg: GameMsg) => {
    if (msg.type === 'state') {
      const s = msg as StateMsg
      setGameState(s)
      const mc = s.players.find(p => p.userId === user?.userId)?.color
      myColorRef.current = mc
      // Show initial board while waiting for strategies; don't override once animation started
      if (s.grid.length > 0 && !resolutionRef.current) {
        setLiveGrid(s.grid)
        setLiveNutrients(s.nutrients)
        setLiveArmor(s.armor)
        setLiveStarvation(s.starvation)
        setLiveToxin(s.toxin ?? [])
        setLiveNutrientType(s.nutrientType ?? [])
        setLiveBlueResources(s.blueResources ?? 0)
        setLiveRedResources(s.redResources ?? 0)
      }
      // Restore strategy review state on reconnect
      if (mc && !resolutionRef.current) {
        const strat = mc === 'blue' ? s.blueStrategy : s.redStrategy
        if (strat) setMyStrategy(strat)
      }
    }

    if (msg.type === 'strategy_locked') {
      const m = msg as StrategyLockedMsg
      setGameState(prev => prev ? {
        ...prev,
        strategyStatus:  { ...prev.strategyStatus,  [m.color]: 'locked'   },
        strategyReadback:{ ...prev.strategyReadback, [m.color]: m.readback },
      } : prev)
      // Store parsed strategy for the review gate
      if (m.color === myColorRef.current && m.strategy) {
        setMyStrategy(m.strategy)
        setEditing(false)
      }
    }

    if (msg.type === 'resolution') {
      setResolution(msg as unknown as GameResolution)
    }

    if (msg.type === 'game_over') {
      const m = msg as { type: string; winner: 'blue' | 'red'; winReason: string; scores: { blue: number; red: number } }
      const mc = myColorRef.current
      if (mc) { if (m.winner === mc) playWin(); else playLose() }
      // Store — animation step will trigger navigate when the last round finishes
      pendingGameOverRef.current = { winner: m.winner, winReason: m.winReason, scores: m.scores }
      // If animation is already done (reconnect scenario), show result now
      const res = resolutionRef.current
      if (res && animRoundRef.current >= res.rounds.length - 1) {
        finishGame()
      }
    }
  }, [user?.userId, playWin, playLose])

  const { connected, goneError } = useGameSocket(code, onMessage)

  const myPlayer  = gameState?.players.find(p => p.userId === user?.userId)
  const myColor   = myPlayer?.color
  const oppColor: 'blue' | 'red' | undefined = myColor === 'blue' ? 'red' : myColor === 'red' ? 'blue' : undefined

  const ssBlue = gameState?.strategyStatus?.blue ?? 'waiting'
  const ssRed  = gameState?.strategyStatus?.red  ?? 'waiting'
  const mySubmitted    = myColor ? (myColor === 'blue' ? ssBlue : ssRed) === 'locked' : false
  const opponentLocked = oppColor ? (oppColor === 'blue' ? ssBlue : ssRed) === 'locked' : false
  const myReadback = myColor ? (myColor === 'blue' ? gameState?.strategyReadback?.blue : gameState?.strategyReadback?.red) ?? null : null

  const gridW = gameState?.gridW ?? 40
  const gridH = gameState?.gridH ?? 40
  const totalRounds = gameState?.totalRounds ?? 20

  const blueCount  = liveGrid.filter(v => v === 1).length
  const redCount   = liveGrid.filter(v => v === 2).length
  const totalCells = blueCount + redCount
  const blueScore  = totalCells === 0 ? 50 : Math.round(blueCount / totalCells * 100)
  const redScore   = 100 - blueScore

  const displayRound = animRound < 0 ? 0 : animRound + 1
  const isAnimating  = resolution !== null && animRound < (resolution.rounds.length - 1)

  const accentBlue = '#4a9eff'
  const accentRed  = '#ff6b4a'
  const myAccent   = myColor === 'blue' ? accentBlue : myColor === 'red' ? accentRed : '#8a9aaa'
  const oppAccent  = oppColor === 'blue' ? accentBlue : accentRed

  function fmtDelta(prev: number, next: number): string {
    const d = next - prev
    return d > 0 ? `+${d}` : `${d}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 16px', gap: 8, minHeight: '100vh', background: '#080c14' }}>

      {/* Header */}
      <div style={{ width: '100%', maxWidth: 660, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Logo size={18} />
          <span className="section-label">PRIMORDIAL</span>
        </span>
        <span style={{ fontSize: 11 }}>
          <span className="text-muted">{code} · </span>
          <span style={{ color: connected ? 'var(--clr-green)' : 'var(--clr-text-muted)' }}>{connected ? '● live' : '○ connecting'}</span>
        </span>
        {/* Speed controls — visible during animation */}
        {resolution && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {SPEEDS.map(s => (
              <button
                key={s}
                onClick={() => changeSpeed(s)}
                style={{
                  background: speed === s ? '#1a3050' : 'transparent',
                  border: `1px solid ${speed === s ? '#4a9eff' : '#1e3050'}`,
                  color: speed === s ? '#4a9eff' : 'var(--clr-text-muted)',
                  fontFamily: 'monospace',
                  fontSize: 11,
                  padding: '2px 7px',
                  borderRadius: 3,
                  cursor: 'pointer',
                }}
              >
                {SPEED_LABEL[s]}
              </button>
            ))}
            {isAnimating && (
              <button
                onClick={skipToEnd}
                style={{ background: 'transparent', border: '1px solid #1e3050', color: 'var(--clr-text-muted)', fontFamily: 'inherit', fontSize: 11, padding: '2px 10px', borderRadius: 3, cursor: 'pointer', marginLeft: 4 }}
              >
                skip »
              </button>
            )}
          </div>
        )}
      </div>

      {/* Score bar */}
      <div style={{ width: '100%', maxWidth: 660 }}>
        <ScoreBar blue={blueScore} red={redScore} round={displayRound} totalRounds={totalRounds} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12, color: 'var(--clr-text-muted)' }}>
          <span style={{ color: 'var(--clr-text-secondary)', letterSpacing: 1 }}>
            {resolution ? (displayRound > 0 ? 'BATTLE' : 'READY') : 'STRATEGY PHASE'}
          </span>
          <span>Round {displayRound}/{totalRounds}</span>
          <span style={{ color: myAccent }}>
            {mySubmitted && !resolution ? '✓ ready' : ''}
          </span>
        </div>
      </div>

      {/* Canvas + sidebar */}
      <div style={{ width: '100%', maxWidth: 660, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
          <StatusBar
            current={roundHistory[roundHistory.length - 1] ?? null}
            previous={roundHistory[roundHistory.length - 2] ?? null}
            myColor={myColor ?? null}
            blueResources={liveBlueResources}
            redResources={liveRedResources}
          />
          <GameCanvas
            grid={liveGrid}
            nutrients={liveNutrients}
            armor={liveArmor}
            starvation={liveStarvation}
            toxin={liveToxin}
            nutrientType={liveNutrientType}
            anim={resolveAnim}
            gridW={gridW}
            gridH={gridH}
            size={480}
          />
        </div>

        {roundHistory.length > 0 && myColor && (
          <div style={{ flex: '0 0 156px', display: 'flex', flexDirection: 'column' }}>
            <div className="section-label" style={{ marginBottom: 4 }}>ROUNDS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 452, overflowY: 'auto', paddingRight: 2 }}>
            {[...roundHistory].reverse().map(entry => {
              const mySpec  = myColor  === 'blue' ? entry.blueSpec : entry.redSpec
              const oppSpec = oppColor === 'blue' ? entry.blueSpec : entry.redSpec
              const prevIdx = roundHistory.indexOf(entry) - 1
              const prevEntry = prevIdx >= 0 ? roundHistory[prevIdx] : null
              const myPrev  = prevEntry ? (myColor  === 'blue' ? prevEntry.blueCells : prevEntry.redCells)  : 0
              const oppPrev = prevEntry ? (oppColor === 'blue' ? prevEntry.blueCells : prevEntry.redCells) : 0
              const myNow   = myColor  === 'blue' ? entry.blueCells : entry.redCells
              const oppNow  = oppColor === 'blue' ? entry.blueCells : entry.redCells
              return (
                <div key={entry.round} style={{ background: '#0a1420', border: '1px solid #1a2a3a', borderRadius: 3, padding: '5px 8px' }}>
                  <div className="text-sec" style={{ fontSize: 12, marginBottom: 3 }}>Round {entry.round + 1}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Tooltip text={`${ACTION_DESC[mySpec.action] ?? mySpec.action}\n\nRule: ${myColor === 'blue' ? entry.blueTrace : entry.redTrace}`} delay={300}>
                      <span style={{ color: myAccent, fontSize: 12, cursor: 'help', borderBottom: '1px dotted', borderColor: myAccent + '60' }}>{mySpec.action}</span>
                    </Tooltip>
                    <span style={{ color: (myNow - myPrev) >= 0 ? '#33bb66' : '#dd5555', fontSize: 12, fontWeight: 'bold', marginLeft: 'auto' }}>
                      {prevEntry ? fmtDelta(myPrev, myNow) : `${myNow}`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <span className="text-muted" style={{ fontSize: 11 }}>vs </span>
                    <Tooltip text={`${ACTION_DESC[oppSpec.action] ?? oppSpec.action}\n\nRule: ${oppColor === 'blue' ? entry.blueTrace : entry.redTrace}`} delay={300}>
                      <span style={{ color: oppAccent, fontSize: 11, cursor: 'help', borderBottom: '1px dotted', borderColor: oppAccent + '60' }}>{oppSpec.action}</span>
                    </Tooltip>
                    <span style={{ color: (oppNow - oppPrev) >= 0 ? '#cc5555' : '#55aa55', fontSize: 11, marginLeft: 'auto' }}>
                      {prevEntry ? fmtDelta(oppPrev, oppNow) : `${oppNow}`}
                    </span>
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        )}
      </div>

      {/* Live caption */}
      {liveCaption && resolution && (
        <div style={{ width: '100%', maxWidth: 660, background: '#0a1420', border: '1px solid #1a2a3a', borderRadius: 4, padding: '8px 14px' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1, color: accentBlue, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span className="text-dim" style={{ fontSize: 11, marginRight: 6 }}>BLUE</span>
              {liveCaption.blueTrace}
            </div>
            <div style={{ flex: 1, color: accentRed, fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>
              {liveCaption.redTrace}
              <span className="text-dim" style={{ fontSize: 11, marginLeft: 6 }}>RED</span>
            </div>
          </div>
        </div>
      )}

      {/* Result banner — shown when animation ends, stays on board */}
      {gameFinished && gameOverData && (
        <div style={{ width: '100%', maxWidth: 660, background: '#0a1420', border: `1px solid ${gameOverData.winner === myColor ? '#1a5a2a' : '#5a1a1a'}`, borderRadius: 6, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: gameOverData.winner === myColor ? '#00cc66' : '#ff6b4a', letterSpacing: 2 }}>
              {gameOverData.winner === myColor ? 'YOU WIN' : 'DEFEAT'}
            </div>
            <div className="text-muted" style={{ fontSize: 12, marginTop: 3 }}>
              Blue {gameOverData.scores.blue}% · Red {gameOverData.scores.red}%
            </div>
          </div>
          <button
            onClick={gotoResults}
            style={{ background: '#0d2035', border: '1px solid #2a5a8a', color: '#4a9eff', fontFamily: 'inherit', fontSize: 12, padding: '8px 18px', borderRadius: 4, cursor: 'pointer', letterSpacing: 1 }}
          >
            See Results →
          </button>
        </div>
      )}

      {/* Board events panel — shown during strategy phase */}
      {!resolution && gameState?.events && gameState.events.length > 0 && (
        <div style={{ width: '100%', maxWidth: 660, background: '#06090f', border: '1px solid #1a2a3a', borderRadius: 4, padding: '8px 12px' }}>
          <div className="section-label" style={{ marginBottom: 6 }}>BOARD EVENTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {gameState.events.map((ev, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, fontFamily: 'monospace' }}>
                <span className="text-muted" style={{ minWidth: 26 }}>R{ev.round + 1}</span>
                <span style={{ color: ev.kind === 'nutrient_bloom' ? '#a0c840' : '#c88040' }}>
                  {ev.kind === 'nutrient_bloom' ? '⬡ Nutrient Bloom' : '☀ Drought'}
                </span>
                <span className="text-dim">{ev.zone !== 'ALL' ? ev.zone.toLowerCase() : 'all zones'}</span>
                {ev.period && <span className="text-dim" style={{ fontSize: 11 }}>↻ every {ev.period}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strategy input / review — below the canvas */}
      <div style={{ width: '100%', maxWidth: 660 }}>
        {goneError ? (
          <div style={{ color: '#ff6b4a', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
            This game has ended.{' '}
            <button style={{ color: '#4a9eff', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }} onClick={() => navigate('/')}>
              New game →
            </button>
          </div>
        ) : gameFinished || resolution ? null
        : myColor && code ? (
          !mySubmitted || editing ? (
            <StrategyInput
              gameCode={code}
              myColor={myColor}
              submitted={false}
              myReadback={myReadback}
              opponentLocked={opponentLocked}
            />
          ) : myStrategy ? (
            <StrategyReview
              strategy={myStrategy}
              readback={myReadback}
              myColor={myColor}
              onEdit={() => setEditing(true)}
              onConfirm={() => void confirmStrategy()}
              confirming={confirming}
            />
          ) : (
            <StrategyInput
              gameCode={code}
              myColor={myColor}
              submitted={true}
              myReadback={myReadback}
              opponentLocked={opponentLocked}
            />
          )
        ) : (
          <div style={{ color: '#5a7a9a', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
            {connected ? 'Joining game…' : 'Connecting…'}
          </div>
        )}
      </div>

      {/* Dev panel */}
      <div style={{ width: '100%', maxWidth: 660 }}>
        <button
          onClick={() => setDevOpen(o => !o)}
          style={{ background: 'none', border: 'none', color: '#1a2a3a', fontSize: 9, cursor: 'pointer', padding: '4px 0', fontFamily: 'monospace', letterSpacing: 1 }}
        >
          {devOpen ? '▲' : '▼'} dev
        </button>
        {devOpen && (
          <div style={{ background: '#06090f', border: '1px solid #1a2a3a', borderRadius: 4, padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ color: 'var(--clr-text-dim)' }}>code:</span>
              <button onClick={() => void navigator.clipboard.writeText(code ?? '')} style={{ color: '#4a9eff', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, padding: 0 }}>
                {code} ⎘
              </button>
              <span style={{ color: 'var(--clr-text-dim)' }}>seed: <span style={{ color: 'var(--clr-text-muted)' }}>{gameState?.seed ?? 0}</span></span>
              <span style={{ color: '#2a6a4a' }}>blue: <span style={{ color: '#4a9eff' }}>{blueCount}</span></span>
              <span style={{ color: '#6a2a2a' }}>red: <span style={{ color: '#ff6b4a' }}>{redCount}</span></span>
            </div>
            {resolution && (
              <div style={{ borderTop: '1px solid #1a2a3a', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ color: 'var(--clr-text-dim)' }}>v{resolution.simVersion} · {resolution.rounds.length} rounds · {SPEED_LABEL[speed]}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ color: 'var(--clr-blue-dim)' }}>blue: {resolution.blueStrategy.rules.length} rules</div>
                  <div style={{ color: 'var(--clr-red-dim)' }}>red: {resolution.redStrategy.rules.length} rules</div>
                </div>
                {/* Round scrubber — only when game is finished (all rounds known) */}
                {gameFinished && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, borderTop: '1px solid #1a2a3a', paddingTop: 4 }}>
                    <button
                      onClick={() => jumpToRound(Math.max(0, animRound - 1))}
                      disabled={animRound <= 0}
                      style={{ background: 'none', border: '1px solid #1e3050', color: animRound > 0 ? '#4a9eff' : '#1a2a3a', fontFamily: 'monospace', fontSize: 13, padding: '1px 8px', borderRadius: 3, cursor: animRound > 0 ? 'pointer' : 'default' }}
                    >◀</button>
                    <span style={{ color: '#4a7aaa', fontSize: 10, minWidth: 70, textAlign: 'center' }}>
                      Round {animRound + 1} / {resolution.rounds.length}
                    </span>
                    <button
                      onClick={() => jumpToRound(Math.min(resolution.rounds.length - 1, animRound + 1))}
                      disabled={animRound >= resolution.rounds.length - 1}
                      style={{ background: 'none', border: '1px solid #1e3050', color: animRound < resolution.rounds.length - 1 ? '#4a9eff' : '#1a2a3a', fontFamily: 'monospace', fontSize: 13, padding: '1px 8px', borderRadius: 3, cursor: animRound < resolution.rounds.length - 1 ? 'pointer' : 'default' }}
                    >▶</button>
                    <span style={{ color: 'var(--clr-text-dim)', fontSize: 10, marginLeft: 4 }}>scrub rounds</span>
                  </div>
                )}
                {liveCaption && (
                  <>
                    <div style={{ color: 'var(--clr-blue-dim)', fontSize: 10 }}>↳ {liveCaption.blueTrace}</div>
                    <div style={{ color: 'var(--clr-red-dim)', fontSize: 10 }}>↳ {liveCaption.redTrace}</div>
                  </>
                )}
              </div>
            )}
            {gameState?.strategyReadback?.blue && (
              <div style={{ borderTop: '1px solid #1a2a3a', paddingTop: 6 }}>
                <div style={{ color: 'var(--clr-blue-dim)', fontSize: 10 }}>blue: {gameState.strategyReadback.blue}</div>
                <div style={{ color: 'var(--clr-red-dim)', fontSize: 10 }}>red: {gameState.strategyReadback.red}</div>
              </div>
            )}
            {/* Strategy JSON — collapsible per side */}
            {resolution && (
              <div style={{ borderTop: '1px solid #1a2a3a', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(['blue', 'red'] as const).map(side => {
                  const strat = side === 'blue' ? resolution.blueStrategy : resolution.redStrategy
                  const json  = JSON.stringify(strat, null, 2)
                  return (
                    <details key={side}>
                      <summary style={{ color: side === 'blue' ? 'var(--clr-blue-dim)' : 'var(--clr-red-dim)', fontSize: 10, cursor: 'pointer', userSelect: 'none', listStyle: 'none' }}>
                        ▶ {side} strategy ({strat.rules.length} rules)
                        <button onClick={e => { e.preventDefault(); void navigator.clipboard.writeText(json) }}
                          style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--clr-text-dim)', fontSize: 10, cursor: 'pointer', fontFamily: 'monospace' }}>
                          copy ⎘
                        </button>
                      </summary>
                      <pre style={{ margin: '6px 0 0 8px', color: side === 'blue' ? 'var(--clr-blue-dim)' : 'var(--clr-red-dim)', fontSize: 10, lineHeight: 1.5, overflowX: 'auto', background: '#040810', padding: 8, borderRadius: 3 }}>
                        {json}
                      </pre>
                    </details>
                  )
                })}
                {/* Clone → Dev Lab */}
                <button
                  onClick={() => navigate('/dev/run', { state: {
                    blueStrategy: resolution.blueStrategy,
                    redStrategy:  resolution.redStrategy,
                    seed:         resolution.seed,
                    config:       resolution.config,
                  }})}
                  style={{ alignSelf: 'flex-start', background: '#0a1a2a', border: '1px solid #2a4a6a', color: '#4a9eff', fontFamily: 'inherit', fontSize: 10, padding: '4px 12px', borderRadius: 3, cursor: 'pointer', letterSpacing: 1, marginTop: 2 }}
                >
                  Clone → Dev Lab
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ height: 16 }} />
    </div>
  )
}
