# Research: AI-Prompt-Driven Multiplayer Game

## What We're Building

A self-running web game where the simulation ticks forward automatically and player text prompts (interpreted by AI) are the only input. Short sessions (under 5 minutes), 2-player, server-authoritative state, hosted on Cloudflare.

---

## Past Attempts

### resource-rivals (April 2025)
The most developed previous attempt. A turn-based strategy game on a 15x15 grid — players collect Gold and Mana, build Mines and Towns, control Worker units.

**What was built:** Next.js 15 + Firebase Firestore for real-time state + Google Genkit wired up for AI (but not implemented). 6-character game code join system, multiple players, configurable balance values. Grid renderer and action menu components.

**Why it stopped:** Runtime bugs (JSX parsing errors, resource lookup failures), action system not fully wired, AI opponent never implemented.

**Reuse value:** Game logic types and core rules engine are backend-agnostic. UI component patterns (grid, tile, action menu) translate. Everything Firebase-specific gets replaced.

### eco-coin (2021)
Described as "economy and military RPG." Never got past a TypeScript project scaffold. No game code written.

---

## The Landscape: Does This Exist?

**Short answer: No.** The exact pattern — a visual auto-running simulation where natural language prompts are the only player input, playable in a browser as a short multiplayer session — has not been shipped as a product.

**What does exist:**
- **AI Dungeon**: Text-only, world only moves when you type. No simulation engine.
- **Twitch Plays Pokemon**: Raw button voting from chat, no AI interpretation layer.
- **LLM game jam projects (2023-2024)**: Mostly puzzle-shaped ("find the magic words"), not simulation-shaped. Single player, one-off demos.
- **Voyager (2023)**: LLM agents autonomously playing Minecraft — research artifact, not a player-facing game.
- **"Civilization Prompt" Twitter demos**: One person prompting an LLM to simulate a civilization tick-by-tick. Not interactive, not multiplayer.

**The gap this fills:** Idle/simulation game + prompt queue as the only control surface, designed as a short replayable social experience with server-authoritative multiplayer. No one has shipped this.

---

## Key Design Constraints (from game jam postmortems)

1. **Feedback loop is everything.** Players need to see their prompt's effect within 2-3 seconds or interest collapses. This is the hardest constraint given LLM latency.

2. **Latency solutions that work:**
   - **Async queue model** — prompts queue up, effects apply on a game tick (every 10-30s). Removes latency from the critical path entirely. Players feel like they're "betting" on the next tick.
   - **Pre-classification** — LLM classifies prompt intent into a finite set of game actions; fast deterministic engine applies the action instantly. Best of both worlds.
   - **Effect preview** — show a pending-effect indicator while the LLM processes. Wait feels intentional.

3. **Constraint creates creativity.** Freeform "say anything" prompts → chaos → boredom. Games that work let prompts do one clear thing per round.

4. **Visual legibility.** State must be readable at a glance. Things grow, explode, move — not hidden stat changes. This is also what makes it good to watch.

5. **Sub-5-minute multiplayer** (Gartic Phone, skribbl.io) works because each player has a clear role every round and wins/losses are emotionally legible. The design challenge here: "did my prompt fail or did the AI misinterpret it?" must have a clear answer.

---

## Cloudflare Tech Stack

### Workers AI — yes, this is the name
The CLI tool is **Wrangler**. The AI inference product is **Workers AI**.

- 50+ pre-trained models including LLMs
- Native binding from Workers (`env.AI.run(model, input)`)
- Llama 3.1-8b-instruct: good balance of quality and speed (~200 neurons/req)
- Mistral-7b: fastest/cheapest (~50 neurons/req) — good for prompt classification
- Free tier: 10,000 neurons/day. Pay-per-use after that.
- Streaming supported. Function calling supported.
- **Must use `wrangler dev --remote`** — AI models don't run locally

### Durable Objects — the game state engine
This is the right primitive for a multiplayer game:
- Globally unique instances (one DO per game room)
- Single-threaded serial processing — no race conditions on game state
- WebSocket hibernation — clients stay connected at zero cost when idle
- SQLite storage built in — structured game state with transactions
- Alarms — reliable scheduled execution for game ticks
- ~1K req/s per DO; well within game needs

### Other Cloudflare pieces
- **D1** (SQLite): User accounts, game history, leaderboards
- **KV**: Session tokens, config
- **Workers**: API layer, routing, serving the frontend
- **Pages**: Static frontend hosting with Workers Functions backend

### Auth
Google Auth is the ask. Options on Cloudflare:
- **Cloudflare Access** (Zero Trust) — supports Google SSO, free tier exists, handles the JWT/session layer
- **Custom** — Workers-side Google OAuth2 flow, store sessions in KV/D1
- Cloudflare Access is simpler to set up but adds complexity if you need to store user profiles beyond identity. Custom gives full control.

---

## Architecture Sketch

```
Browser (React/Canvas)
    │  WebSocket (game events)
    │  HTTP (prompts, auth)
    ▼
Cloudflare Workers (API layer)
    │
    ├── Durable Object (GameRoom)
    │     ├── Game tick loop (alarm-based)
    │     ├── Prompt queue
    │     ├── WebSocket connections (player clients)
    │     └── SQLite game state
    │
    ├── Workers AI (prompt → game action)
    │     └── Llama 3.1-8b or Mistral-7b
    │
    └── D1 (users, game history)
        KV (sessions)
```

**Latency flow for a prompt:**
1. Player types prompt → POST to Worker → stored in Durable Object prompt queue (fast, <50ms)
2. Worker returns "queued" immediately — no waiting on AI
3. On each game tick (alarm fires every N seconds), DO calls Workers AI to classify pending prompts → applies effects → broadcasts state to all WebSocket clients

This decouples AI latency from the player's input experience entirely.

---

## Next Step: Game Design

With this infrastructure in mind, the right game concept should:
- Have a visually legible auto-running simulation (2D, top-down)
- Have game state that changes meaningfully every 5-15 seconds (tick rate)
- Have a clear "win condition" reachable in under 5 minutes
- Have effects that are interesting to trigger via prompt but bounded enough to be reliable
- Work for 1v1 (one sim each, or shared sim) or 1 player vs AI

The resource-rivals concept (cells/resources on a grid) is a strong starting point.
