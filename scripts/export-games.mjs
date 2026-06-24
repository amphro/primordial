#!/usr/bin/env node
// Exports all game logs from local D1 to games/{CODE}.json
// Run: npm run export:games
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'

const DB = 'primordial-db'

function query(sql) {
  const out = execSync(
    `npx wrangler d1 execute ${DB} --local --command ${JSON.stringify(sql)} --json`,
    { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
  )
  return JSON.parse(out)[0]?.results ?? []
}

const codes = query('SELECT DISTINCT game_code FROM rounds ORDER BY game_code')

if (codes.length === 0) {
  console.log('No games found in local D1. Play a game first.')
  process.exit(0)
}

mkdirSync('games', { recursive: true })

for (const { game_code } of codes) {
  const [game] = query(`SELECT * FROM games WHERE code = '${game_code}'`)
  const players = query(`SELECT u.display_name, gp.color, gp.user_id FROM game_players gp LEFT JOIN users u ON u.id = gp.user_id WHERE gp.game_code = '${game_code}'`)
  const rounds = query(`SELECT * FROM rounds WHERE game_code = '${game_code}' ORDER BY round_number`)
  const errors = query(`SELECT * FROM game_errors WHERE game_code = '${game_code}' ORDER BY ts`)

  // Parse counters JSON string back to objects for readability
  for (const r of rounds) {
    try { r.counters = JSON.parse(r.counters ?? '[]') } catch { r.counters = [] }
  }

  writeFileSync(
    `games/${game_code}.json`,
    JSON.stringify({ game: game ?? null, players, rounds, errors }, null, 2),
  )
  console.log(`games/${game_code}.json  (${rounds.length} rounds, ${errors.length} errors)`)
}
