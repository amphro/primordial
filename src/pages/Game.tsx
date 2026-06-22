import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useGameSocket, type GameMsg, type StateMsg, type ResolveMsg } from '../hooks/useGameSocket'
import { useSound } from '../hooks/useSound'
import GameCanvas, { type AnimEffect, type AnimEvent } from '../components/GameCanvas'
import ScoreBar from '../components/ScoreBar'
import PromptInput from '../components/PromptInput'

interface ResolveInfo {
  round: number
  blue: { prompt: string; action: string; zone: string; intensity: string; delta: number } | null
  red:  { prompt: string; action: string; zone: string; intensity: string; delta: number } | null
}

interface RoundEntry {
  round: number
  myAction: string; myZone: string; myDelta: number
  oppAction: string; oppZone: string; oppDelta: number
}

function phaseLabel(round: number, totalRounds: number): string {
  const pct = round / totalRounds
  if (pct < 0.35) return 'Expansion'
  if (pct < 0.70) return 'Contest'
  return 'Final Push'
}

export default function Game() {
  const { code } = useParams<{ code: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { playAction, playRoundStart, playWin, playLose } = useSound()

  const [gameState, setGameState] = useState<StateMsg | null>(null)
  const [resolve, setResolve] = useState<ResolveInfo | null>(null)
  const [resolveAnim, setResolveAnim] = useState<AnimEvent | null>(null)
  const [myLocked, setMyLocked] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const [roundHistory, setRoundHistory] = useState<RoundEntry[]>([])

  // Keep myColor accessible inside the WS callback without stale closures
  const myColorRef = useRef<'blue' | 'red' | undefined>(undefined)
  // Deduplicate round-start chime — only fire once per new round number
  const lastRoundChimeRef = useRef(-1)

  // Countdown timer
  useEffect(() => {
    if (!gameState?.alarmFiresAt) return
    const tick = () => {
      const ms = Math.max(0, gameState.alarmFiresAt - Date.now())
      setTimeLeft(ms)
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [gameState?.alarmFiresAt])

  // Clear resolve overlay after 4s
  useEffect(() => {
    if (!resolve) return
    const id = setTimeout(() => setResolve(null), 4000)
    return () => clearTimeout(id)
  }, [resolve])

  const onMessage = useCallback((msg: GameMsg) => {
    if (msg.type === 'state') {
      const s = msg as StateMsg
      setGameState(s)
      const mc = s.players.find(p => p.userId === user?.userId)?.color
      myColorRef.current = mc
      if (mc) setMyLocked(s.promptStatus[mc] === 'locked')
      // Sound: chime once per new round, delayed so it doesn't overlap the action sound from resolve
      if (s.phase === 'active' && s.round > 0 && s.round !== lastRoundChimeRef.current) {
        lastRoundChimeRef.current = s.round
        setTimeout(() => playRoundStart(), 500)
      }
    }

    if (msg.type === 'resolve') {
      const r = msg as unknown as ResolveMsg
      setResolve({
        round: r.round,
        blue: r.blue ? { ...r.blue, delta: r.blue.delta ?? 0 } : null,
        red:  r.red  ? { ...r.red,  delta: r.red.delta  ?? 0 } : null,
      })

      // Trigger canvas animation
      const effects: AnimEffect[] = []
      if (r.blue) effects.push({ action: r.blue.action, zone: r.blue.zone, color: 'blue' })
      if (r.red)  effects.push({ action: r.red.action,  zone: r.red.zone,  color: 'red'  })
      const animEv: AnimEvent = { effects, startedAt: Date.now() }
      setResolveAnim(animEv)
      setTimeout(() => setResolveAnim(null), 800)

      // Sound for my action
      const mc = myColorRef.current
      if (mc) {
        const myR = mc === 'blue' ? r.blue : r.red
        if (myR) playAction(myR.action)
      }

      // Update round history
      const mc2 = myColorRef.current
      const oc = mc2 === 'blue' ? 'red' : mc2 === 'red' ? 'blue' : undefined
      if (mc2 && oc) {
        const myR = mc2 === 'blue' ? r.blue : r.red
        const oppR = oc === 'blue' ? r.blue : r.red
        if (myR && oppR) {
          setRoundHistory(prev => [...prev.slice(-4), {
            round: r.round,
            myAction: myR.action, myZone: myR.zone, myDelta: myR.delta ?? 0,
            oppAction: oppR.action, oppZone: oppR.zone, oppDelta: oppR.delta ?? 0,
          }])
        }
      }
    }

    if (msg.type === 'game_over') {
      const m = msg as { type: string; winner: 'blue' | 'red'; winReason: string; scores: { blue: number; red: number } }
      const mc = myColorRef.current
      if (mc) {
        if (m.winner === mc) playWin()
        else playLose()
      }
      // Small delay so the sound can start before navigation
      setTimeout(() => {
        navigate(`/game/${code}/over`, {
          state: { winner: m.winner, winReason: m.winReason, scores: m.scores, rounds: roundHistory },
        })
      }, 400)
    }
  }, [code, navigate, user?.userId, playAction, playRoundStart, playWin, playLose, roundHistory])

  const { connected, goneError } = useGameSocket(code, onMessage)

  const myPlayer = gameState?.players.find(p => p.userId === user?.userId)
  const myColor  = myPlayer?.color
  const oppColor: 'blue' | 'red' | undefined = myColor === 'blue' ? 'red' : myColor === 'red' ? 'blue' : undefined

  const scores  = gameState?.scores  ?? { blue: 0, red: 0 }
  const psBlue  = gameState?.promptStatus.blue  ?? 'waiting'
  const psRed   = gameState?.promptStatus.red   ?? 'waiting'
  const oppLocked = oppColor ? (oppColor === 'blue' ? psBlue : psRed) === 'locked' : false
  const myPs      = myColor ? (myColor === 'blue' ? psBlue : psRed) : 'waiting'

  const grid      = gameState?.grid      ?? []
  const nutrients = gameState?.nutrients ?? []
  const armor     = gameState?.armor     ?? []
  const starvation= gameState?.starvation ?? []
  const gridW     = gameState?.gridW     ?? 40
  const gridH     = gameState?.gridH     ?? 40
  const round     = gameState?.round     ?? 0
  const totalRounds = gameState?.totalRounds ?? 20

  const timerMs   = gameState?.promptTimerMs ?? 20000
  const barPct    = Math.min(100, Math.max(0, (timeLeft / timerMs) * 100))
  const barColor  = barPct > 40 ? '#00cc66' : barPct > 15 ? '#ff9a4a' : '#ff4a4a'

  const accentBlue = '#4a9eff'
  const accentRed  = '#ff6b4a'
  const myAccent   = myColor === 'blue' ? accentBlue : myColor === 'red' ? accentRed : '#8a9aaa'
  const phase      = phaseLabel(round, totalRounds)

  async function finishGame() {
    setFinishing(true)
    try {
      await fetch(`/api/games/${code}/finish`, { method: 'POST', credentials: 'include' })
    } catch {
      setFinishing(false)
    }
  }

  function fmtDelta(delta: number): string {
    return delta > 0 ? `+${delta}` : `${delta}`
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '12px 16px',
      gap: 8,
      minHeight: '100vh',
      background: '#080c14',
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#3a5a7a', fontSize: 11, letterSpacing: 2 }}>PRIMORDIAL</span>
        <span style={{ fontSize: 11 }}>
          <span style={{ color: '#3a5a7a' }}>{code} · </span>
          <span style={{ color: connected ? '#00cc66' : '#3a5a7a' }}>{connected ? '● live' : '○ connecting'}</span>
        </span>
        <button
          onClick={() => void finishGame()}
          disabled={finishing}
          style={{
            background: 'transparent',
            border: '1px solid #1e3050',
            color: '#3a5a7a',
            fontFamily: 'inherit',
            fontSize: 11,
            padding: '4px 10px',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {finishing ? '...' : 'End'}
        </button>
      </div>

      {/* Score bar + phase label */}
      <div style={{ width: '100%', maxWidth: 520 }}>
        <ScoreBar
          blue={scores.blue}
          red={scores.red}
          round={round}
          totalRounds={totalRounds}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#2a3a4a' }}>
          <span style={{ color: '#3a5a7a', letterSpacing: 1 }}>{phase.toUpperCase()}</span>
          <span>Round {round}/{totalRounds}</span>
          <span style={{ color: myAccent }}>
            {myPs === 'locked' ? '✓ locked' : myColor ? 'enter prompt' : ''}
          </span>
        </div>
      </div>

      {/* Canvas + resolve overlay */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 520 }}>
        <GameCanvas
          grid={grid}
          nutrients={nutrients}
          armor={armor}
          starvation={starvation}
          anim={resolveAnim}
          gridW={gridW}
          gridH={gridH}
          size={480}
        />

        {resolve && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(8, 12, 20, 0.80)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 14, borderRadius: 4,
            padding: '0 20px',
          }}>
            <p style={{ color: '#3a5a7a', fontSize: 10, letterSpacing: 3, margin: 0 }}>
              ROUND {resolve.round} RESOLVED
            </p>
            <div style={{ display: 'flex', gap: 32, width: '100%', justifyContent: 'center' }}>
              {resolve.blue && (
                <div style={{ flex: 1, textAlign: 'center', maxWidth: 200 }}>
                  <div style={{ color: accentBlue, fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>BLUE</div>
                  <div style={{ color: accentBlue, fontSize: 13, letterSpacing: 1, marginBottom: 4 }}>
                    {resolve.blue.action} · {resolve.blue.zone}
                    {resolve.blue.intensity !== 'NORMAL' && (
                      <span style={{ color: '#5a7a9a', fontSize: 10 }}> · {resolve.blue.intensity}</span>
                    )}
                  </div>
                  <div style={{ color: '#c0d8f0', fontSize: 12, fontStyle: 'italic', marginBottom: 6 }}>
                    "{resolve.blue.prompt.slice(0, 60)}{resolve.blue.prompt.length > 60 ? '…' : ''}"
                  </div>
                  <div style={{
                    color: resolve.blue.delta >= 0 ? '#00cc66' : '#ff6b4a',
                    fontSize: 14, fontWeight: 'bold',
                  }}>
                    {fmtDelta(resolve.blue.delta)} cells
                  </div>
                </div>
              )}
              {resolve.red && (
                <div style={{ flex: 1, textAlign: 'center', maxWidth: 200 }}>
                  <div style={{ color: accentRed, fontSize: 10, letterSpacing: 2, marginBottom: 4 }}>RED</div>
                  <div style={{ color: accentRed, fontSize: 13, letterSpacing: 1, marginBottom: 4 }}>
                    {resolve.red.action} · {resolve.red.zone}
                    {resolve.red.intensity !== 'NORMAL' && (
                      <span style={{ color: '#7a5a5a', fontSize: 10 }}> · {resolve.red.intensity}</span>
                    )}
                  </div>
                  <div style={{ color: '#f0c8b0', fontSize: 12, fontStyle: 'italic', marginBottom: 6 }}>
                    "{resolve.red.prompt.slice(0, 60)}{resolve.red.prompt.length > 60 ? '…' : ''}"
                  </div>
                  <div style={{
                    color: resolve.red.delta >= 0 ? '#00cc66' : '#ff6b4a',
                    fontSize: 14, fontWeight: 'bold',
                  }}>
                    {fmtDelta(resolve.red.delta)} cells
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Timer bar */}
      <div style={{ width: '100%', maxWidth: 520 }}>
        <div style={{ position: 'relative', height: 3, background: '#0d1a2a', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0,
            width: `${barPct}%`,
            background: barColor,
            borderRadius: 2,
            transition: 'width 0.1s linear, background 0.5s',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, fontSize: 10 }}>
          <span style={{ color: psBlue === 'locked' ? accentBlue : '#1e3050' }}>{psBlue === 'locked' ? '✓' : '·'} blue</span>
          <span style={{ color: oppLocked ? '#8a9aaa' : '#1e3050' }}>{oppLocked ? 'opponent ready' : ''}</span>
          <span style={{ color: psRed === 'locked' ? accentRed : '#1e3050' }}>red {psRed === 'locked' ? '✓' : '·'}</span>
        </div>
      </div>

      {/* Round history strip */}
      {roundHistory.length > 0 && myColor && (
        <div style={{ width: '100%', maxWidth: 520, display: 'flex', gap: 6, overflowX: 'auto' }}>
          {roundHistory.map(entry => (
            <div key={entry.round} style={{
              flex: '0 0 auto',
              background: '#0d1a2a',
              border: '1px solid #1e3050',
              borderRadius: 4,
              padding: '5px 10px',
              fontSize: 10,
              color: '#3a5a7a',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ color: '#2a4a6a', marginRight: 4 }}>R{entry.round}</span>
              <span style={{ color: myAccent }}>{entry.myAction}</span>
              <span style={{ color: entry.myDelta >= 0 ? '#00aa44' : '#aa4444', marginLeft: 4 }}>
                {fmtDelta(entry.myDelta)}
              </span>
              <span style={{ color: '#1e3050', margin: '0 4px' }}>vs</span>
              <span style={{ color: oppColor === 'blue' ? accentBlue : accentRed }}>{entry.oppAction}</span>
              <span style={{ color: entry.oppDelta >= 0 ? '#aa4444' : '#00aa44', marginLeft: 4 }}>
                {fmtDelta(entry.oppDelta)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Prompt input */}
      <div style={{ width: '100%', maxWidth: 520 }}>
        {goneError ? (
          <div style={{ color: '#ff6b4a', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
            This game has ended.{' '}
            <button
              style={{ color: '#4a9eff', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }}
              onClick={() => navigate('/')}
            >
              New game →
            </button>
          </div>
        ) : myColor && code ? (
          <PromptInput
            gameCode={code}
            myColor={myColor}
            myLocked={myLocked}
            opponentLocked={oppLocked}
            disabled={gameState?.phase !== 'active'}
            onLocked={() => setMyLocked(true)}
          />
        ) : (
          <div style={{ color: '#2a3a4a', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
            {connected ? 'Joining game…' : 'Connecting…'}
          </div>
        )}
      </div>

      {/* Counter hint (shown after resolve if a counter fired) */}
      <div style={{ height: 16 }} />
    </div>
  )
}
