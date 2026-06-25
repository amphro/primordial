# PRIMORDIAL — Claude context

## Architecture invariants (do not work around)

- **One-shot resolution:** both strategies go in, `runGame()` runs once, `GameResolution` is stored and broadcast. No per-round server loop.
- **Shared deterministic sim:** `shared/sim/simulation.ts` + `shared/sim/runGame.ts` run identically on server (authoritative) and client (animation replay). The server result always wins.
- **Seeded RNG:** `shared/rng.ts` mulberry32. No `Math.random()`, no `Date.now()`, no floats that differ across environments inside the sim.
- **Strategy schema:** `{ rules: Rule[], fallback: ActionSpec }` — first-match priority, AND conditions, max 6 rules, max 4 conditions each.
- **tsconfig:** `tsconfig.shared.json` with `composite: true`, referenced by both UI and worker configs. Not dual-include.
- **D1 migration 003:** adds `seed`, `blue_strategy`, `red_strategy`, `blue_readback`, `red_readback` to `games`. Run migrations before testing.

## LLM and AI quirks

- Model: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (in `worker/durable-objects/strategist.ts`)
- Wrangler 4.x dev: auto-parses AI JSON output into a plain object in `result.response`. The strategist detects this and `JSON.stringify()`s it back before extraction. Don't remove that defensive path.
- LLM often gets rule ordering wrong — the system prompt reminds it to put highest-urgency rules first.

## Workflow

- **Feature branches and PRs only — do not commit directly to `main`.** Create a branch for each piece of work, push it, and open a PR.
- Background dev servers log to `logs/` (gitignored, not to the terminal).
- Dev panel auto-opens on localhost; collapsed in prod. Uses `location.hostname === 'localhost'` check.

## Sim reference

Load `.claude/skills/primordial-sim` for the full action list, counter chain, config defaults, and metrics. That skill is the canonical sim reference — it is more accurate than notes in `notes/`.

## Writing

For all prose, docs, or markdown: use the `writing-voice` skill, Simple voice.
