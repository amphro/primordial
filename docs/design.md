---
title: Design — PRIMORDIAL
---

[← Back](index.md)

# Design

## The idea

Most games give you buttons and let you react. This one gives you a text box and makes you commit.

You write one strategy at the start. The AI converts it to rules. The simulation runs in full before you see a single round. Then you watch what happened — every tactical choice, every counter, every comeback — play out as it actually was decided.

The question the game asks: *can you predict the future well enough to win it with words?*

---

## Why it's built this way

**One prompt per game, not per round.** Earlier designs had players submitting prompts every tick. The problem: AI latency made the loop feel broken, and the game became a typing race. The one-shot model removes latency from the critical path entirely and makes the strategy more meaningful — you can't panic-correct.

**The AI is a translator, not a judge.** The LLM doesn't decide who wins. It converts your words to a structured rule set (`{ rules, fallback }`) that a deterministic engine executes. The same seed and strategies always produce the same result. The AI's job ends when the game starts.

**Hidden mechanics.** Players don't see a list of actions before they play. The prompt box just says "tell your cells what to do." Discovery is part of the experience — figuring out the counter chain through play, not a tutorial.

**Short sessions.** Under five minutes from lobby to result. Built for "one more game" — not a commitment.

---

## The tech

The simulation (`shared/sim/simulation.ts`) is pure deterministic code: seeded RNG (mulberry32), no floats that differ across environments. It runs identically on the server (authoritative result) and on the client (animation-only replay). The server result always wins.

Hosted entirely on Cloudflare: Workers for the API, Durable Objects for per-game WebSocket and state, D1 for persistence, Workers AI for strategy generation.

---

## Goal

Ship one finished, playable thing. Not a platform. Not a framework. A game that runs, ends, and is worth playing again.

---

**[How to play](how-to-play.md)** · **[Terms](terms.md)** · **[Privacy](privacy.md)**
