import { useState, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useGameSocket, type GameMsg, type StateMsg, type ResolveMsg } from '../hooks/useGameSocket'
import GameCanvas from '../components/GameCanvas'
import ScoreBar from '../components/ScoreBar'
import PromptInput from '../components/PromptInput'

interface ResolveInfo {
  round: number
  blue: { prompt: string; action: string; zone: string; intensity: string } | null
  red:  { prompt: string; action: string; zone: string; intensity: string } | null
}

export default function Game() {
  const { code } = useParams<{ code: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [gameState, setGameState] = useState<StateMsg | null>(null)
  const [resolve, setResolve] = useState<ResolveInfo | null>(null)
  const [myLocked, setMyLocked]   = useState(false)
  const [timeLeft, setTimeLeft]   = useState(0)
  const [finishing, setFinishing] = useState(false)

  // Countdown timer
  useEffect(() => {
    if (!gameState?.alarmFiresAt) return
    const tick = () => {
      const ms = Math.max(0, gameState.alarmFiresAt - Date.now())
      setTimeLeft(Math.ceil(ms / 1000))
    }
    tick()
    const id = setInterval(tick, 500)
    return () => clearInterval(id)
  }, [gameState?.alarmFiresAt])

  // Clear resolve overlay after 3s
  useEffect(() => {
    if (!resolve) return
    const id = setTimeout(() => setResolve(null), 3000)
    return () => clearTimeout(id)
  }, [resolve])

  const onMessage = useCallback((msg: GameMsg) => {
    if (msg.type === 'state') {
      const s = msg as StateMsg
      setGameState(s)
      // Reset my locked state at start of new round (prompted by state update)
      const myColor = s.players.find(p => p.userId === user?.userId)?.color
      if (myColor) {
        setMyLocked(s.promptStatus[myColor] === 'locked')
      }
    }
    if (msg.type === 'resolve') {
      const r = msg as unknown as ResolveMsg
      setResolve({ round: r.round, blue: r.blue, red: r.red })
    }
    if (msg.type === 'game_over') {
      const m = msg as { type: string; winner: 'blue' | 'red'; winReason: string; scores: { blue: number; red: number } }
      navigate(`/game/${code}/over`, {
        state: { winner: m.winner, winReason: m.winReason, scores: m.scores },
      })
    }
  }, [code, navigate, user?.userId])

  const { connected, goneError } = useGameSocket(code, onMessage)

  const myPlayer = gameState?.players.find(p => p.userId === user?.userId)
  const myColor  = myPlayer?.color
  const oppColor: 'blue' | 'red' | undefined = myColor === 'blue' ? 'red' : myColor === 'red' ? 'blue' : undefined

  const scores  = gameState?.scores  ?? { blue: 0, red: 0 }
  const psBlue  = gameState?.promptStatus.blue  ?? 'waiting'
  const psRed   = gameState?.promptStatus.red   ?? 'waiting'
  const oppLocked = oppColor ? (oppColor === 'blue' ? psBlue : psRed) === 'locked' : false

  const grid      = gameState?.grid      ?? []
  const nutrients = gameState?.nutrients ?? []

  async function finishGame() {
    setFinishing(true)
    try {
      const res = await fetch(`/api/games/${code}/finish`, { method: 'POST', credentials: 'include' })
      if (res.ok) {
        navigate(`/game/${code}/over`, { state: { winner: null, scores } })
      } else {
        setFinishing(false)
      }
    } catch {
      setFinishing(false)
    }
  }

  const accentBlue = '#4a9eff'
  const accentRed  = '#ff6b4a'
  const myAccent   = myColor === 'blue' ? accentBlue : myColor === 'red' ? accentRed : '#8a9aaa'

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '16px 20px',
      gap: 12,
      minHeight: '100vh',
      background: '#080c14',
    }}>
      {/* Header */}
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: '#3a5a7a', fontSize: 11, letterSpacing: 2 }}>PRIMORDIAL</span>
        <span style={{ color: '#1e3050', fontSize: 11 }}>{code} · {connected ? '● live' : '○ connecting'}</span>
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

      {/* Score bar */}
      <div style={{ width: '100%', maxWidth: 520 }}>
        <ScoreBar
          blue={scores.blue}
          red={scores.red}
          round={gameState?.round ?? 0}
          totalRounds={gameState?.totalRounds ?? 15}
        />
      </div>

      {/* Canvas */}
      <div style={{ position: 'relative' }}>
        <GameCanvas grid={grid} nutrients={nutrients} size={480} />

        {/* Resolve overlay */}
        {resolve && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(8, 12, 20, 0.88)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 20, borderRadius: 4,
          }}>
            <p style={{ color: '#3a5a7a', fontSize: 11, letterSpacing: 3, margin: 0 }}>
              ROUND {resolve.round} RESOLVED
            </p>
            {resolve.blue && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: accentBlue, fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>BLUE</div>
                <div style={{ color: '#c0d8f0', fontSize: 15, fontStyle: 'italic', maxWidth: 300 }}>
                  "{resolve.blue.prompt}"
                </div>
              </div>
            )}
            {resolve.red && (
              <div style={{ textAlign: 'center' }}>
                <div style={{ color: accentRed, fontSize: 11, letterSpacing: 2, marginBottom: 4 }}>RED</div>
                <div style={{ color: '#f0c8b0', fontSize: 15, fontStyle: 'italic', maxWidth: 300 }}>
                  "{resolve.red.prompt}"
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timer + prompt status */}
      <div style={{ width: '100%', maxWidth: 520, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        <span style={{ color: psBlue === 'locked' ? accentBlue : '#2a3a4a' }}>
          {psBlue === 'locked' ? '✓' : '·'} blue
        </span>
        <span style={{ color: timeLeft <= 5 && timeLeft > 0 ? '#ff9a4a' : '#3a5a7a', fontSize: timeLeft <= 5 ? 16 : 13, fontWeight: timeLeft <= 5 ? 700 : 400 }}>
          {timeLeft > 0 ? `${timeLeft}s` : gameState?.phase === 'active' ? '…' : ''}
        </span>
        <span style={{ color: psRed === 'locked' ? accentRed : '#2a3a4a' }}>
          red {psRed === 'locked' ? '✓' : '·'}
        </span>
      </div>

      {/* Prompt input */}
      <div style={{ width: '100%', maxWidth: 520 }}>
        {goneError ? (
          <div style={{ color: '#ff6b4a', fontSize: 12, textAlign: 'center', padding: '16px 0' }}>
            This game has ended. <button style={{ color: '#4a9eff', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12 }} onClick={() => navigate('/')}>New game →</button>
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

      {/* My color indicator */}
      {myColor && (
        <div style={{ color: '#2a3a4a', fontSize: 11, letterSpacing: 1 }}>
          You are <span style={{ color: myAccent }}>{myColor}</span>
        </div>
      )}
    </div>
  )
}
