# PRIMORDIAL

A cellular automaton game where your only weapon is a plain-English strategy.

Two colonies of cells fight for control of a petri dish. Before the battle starts, each player writes a strategy — the AI converts it to rules — and then the entire game resolves in one shot. You watch it play out round by round.

> **Experimental hobby project — use at your own risk.**

**[Play](https://primordial.thomasdvornik.com)** · **[How to play](docs/how-to-play.md)** · **[Design notes](docs/design.md)**

---

## Tech stack

- **Frontend:** React + Vite, HTML Canvas
- **Runtime:** Cloudflare Workers
- **Game state:** Cloudflare Durable Objects (one per room, WebSocket hub)
- **Database:** Cloudflare D1 (users, games)
- **Sessions/KV:** Cloudflare KV
- **AI:** Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`)

---

## Running locally

**Prerequisites:** Node.js 20+, a Cloudflare account with Workers, D1, KV, and AI access.

```sh
npm install
```

Copy `.dev.vars.example` to `.dev.vars` and fill in your values. Guest login works without Google credentials.

Create your own Cloudflare resources and update `wrangler.jsonc` with your IDs:

```sh
wrangler d1 create primordial-db
wrangler kv namespace create primordial-sessions
# Then update database_id and kv id in wrangler.jsonc
```

Apply migrations and start:

```sh
npm run db:migrate:local
npm run dev:worker    # terminal 1 — worker on :8787
npm run dev:ui        # terminal 2 — Vite on :5173
```

Background server logs go to `logs/` (gitignored).

---

## Project structure

```
shared/        Deterministic sim — runs identically on server and client
worker/        Cloudflare Worker: API, auth, Durable Object (GameRoom)
src/           React client
migrations/    D1 SQL migrations
docs/          GitHub Pages site
notes/         Internal design docs and history (not published)
.claude/       Skills and settings for Claude Code contributors
```

---

## Design docs and history

Internal notes live in `notes/` — these are historical and may describe earlier designs:

- [Game Design Document](notes/GAME-DESIGN.md)
- [Game Concepts](notes/GAME-CONCEPTS.md)
- [Features](notes/FEATURES.md)
- [Research](notes/RESEARCH.md)
- [Original implementation plan](notes/PLAN.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This is a solo project — best-effort responses.

**For Claude Code contributors:** `CLAUDE.md` has architecture invariants. Load `.claude/skills/primordial-sim` for the sim reference.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) — Thomas Dvornik, 2026
