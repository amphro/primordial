// Typed helpers for Analytics Engine writes.
// All writes are best-effort — never throw on failure.

export interface TickResolvedEvent {
  gameCode: string
  round: number
  blueAction: string; blueZone: string; blueIntensity: string
  redAction: string;  redZone: string;  redIntensity: string
  bluePct: number;    redPct: number
  blueCells: number;  redCells: number
}

export interface PromptClassifiedEvent {
  gameCode: string
  round: number
  playerColor: 'blue' | 'red'
  action: string; zone: string; intensity: string
  rawPrompt: string
  latencyMs: number
}

export interface GameOverEvent {
  gameCode: string
  winnerColor: 'blue' | 'red'
  winReason: 'threshold' | 'rounds'
  finalBluePct: number
  finalRedPct: number
  totalRounds: number
}

export interface CounterTriggeredEvent {
  gameCode: string
  round: number
  winnerAction: string
  loserAction: string
  zone: string
  reduction: number
}

export function writeTickResolved(ae: AnalyticsEngineDataset, e: TickResolvedEvent): void {
  try {
    ae.writeDataPoint({
      indexes: ['tick_resolved', e.gameCode, String(e.round), e.blueAction, e.blueZone, e.blueIntensity, e.redAction, e.redZone, e.redIntensity],
      doubles: [e.bluePct, e.redPct, e.blueCells, e.redCells],
    })
  } catch { /* non-fatal */ }
}

// Not currently called — if wired in, rawPrompt goes into analytics blobs, which contradicts
// the privacy policy ("no personal identifiers attached"). Remove or redact before enabling.
export function writePromptClassified(ae: AnalyticsEngineDataset, e: PromptClassifiedEvent): void {
  try {
    ae.writeDataPoint({
      indexes: ['prompt_classified', e.gameCode, String(e.round), e.playerColor, e.action, e.zone, e.intensity],
      blobs:   [e.rawPrompt],
      doubles: [e.latencyMs],
    })
  } catch { /* non-fatal */ }
}

export function writeCounterTriggered(ae: AnalyticsEngineDataset, e: CounterTriggeredEvent): void {
  try {
    ae.writeDataPoint({
      indexes: ['counter_triggered', e.gameCode, String(e.round), e.winnerAction, e.loserAction, e.zone],
      doubles: [e.reduction],
    })
  } catch { /* non-fatal */ }
}

export function writeGameOver(ae: AnalyticsEngineDataset, e: GameOverEvent): void {
  try {
    ae.writeDataPoint({
      indexes: ['game_over', e.gameCode, e.winnerColor, e.winReason],
      doubles: [e.finalBluePct, e.finalRedPct, e.totalRounds],
    })
  } catch { /* non-fatal */ }
}
