# Contributing

This is a solo hobby project. Contributions are welcome, but expect best-effort responses.

## Running locally

**Prerequisites:** Node.js 20+, a Cloudflare account with Workers, D1, KV, and AI access.

1. Clone the repo and install dependencies:
   ```
   npm install
   ```

2. Copy `.dev.vars.example` to `.dev.vars` and fill in your values. Guest login works without Google credentials.

3. Create your own Cloudflare resources and update `wrangler.jsonc` with your IDs:
   - D1 database: `wrangler d1 create primordial-db`
   - KV namespace: `wrangler kv namespace create primordial-sessions`
   - Update the `database_id` and KV `id` in `wrangler.jsonc`

4. Run migrations:
   ```
   npm run db:migrate:local
   ```

5. Start the worker and UI in separate terminals:
   ```
   npm run dev:worker
   npm run dev:ui
   ```

   Background server logs go to `logs/` (gitignored).

6. Open http://localhost:5173

## Before submitting a PR

- Run `npm run build` and confirm it passes.
- Keep changes focused. I'm unlikely to merge large refactors or unrelated cleanup.
- Open an issue first if you're unsure whether a change is in scope.

## Notes for contributors working with Claude

A corrected sim reference is bundled at `.claude/skills/primordial-sim/SKILL.md`. Load it when working on strategy, balance, or the LLM system prompt. `CLAUDE.md` has architecture invariants you should not work around.
