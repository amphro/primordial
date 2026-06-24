---
title: How to Play — PRIMORDIAL
---

[← Back](index.md)

# How to Play

## The flow

1. **Write your strategy.** Type a plain-English description of what your cells should do — "be aggressive early, switch to defense if I fall behind," or "wall them off then overwhelm." There are no keywords to memorize.

2. **Review the AI readback.** The AI converts your strategy into a structured rule set and shows you what it understood. If it missed the intent, edit and try again.

3. **Start the battle.** Once you confirm, the game resolves all 20 rounds in one shot using your rules.

4. **Watch it play out.** The board animates round by round. You can scrub back and forth after it finishes.

---

## The board

A 40×40 grid. Blue starts on the left, red on the right. Each side begins with 6 cells scattered in their starting quarter.

Nutrients are scattered across the board in clusters. Cells near a nutrient can reproduce — cells without nutrients starve and die after a couple of ticks.

**If you fall below 25% of occupied cells**, a nutrient burst spawns near your remaining cells to give you a fighting chance.

---

## Actions

Your strategy tells your cells what to do each round. There are eight actions:

| Action | What it does |
|--------|-------------|
| **GROW** | Extra reproduction near nutrients. Boosts cell count. |
| **HUNT** | Cells chase and capture the nearest enemy. |
| **ARMOR** | Cells gain shields that absorb hits before dying. |
| **PULSE** | Shockwave from the enemy cluster — kills a percentage of unarmored enemies in radius. |
| **TOXIN** | Poisons the tiles around your cells. Enemies that enter poisoned tiles die. Lasts 3 rounds. Costs power resources. |
| **SCATTER** | Cells reproduce without needing a nearby nutrient. Useful for spreading into starved zones. |
| **WALL** | Spawns barrier cells between you and the enemy. Lasts 3 rounds. Costs power resources. |
| **FEAST** | Cells near nutrients reproduce several times in one round. Burst growth. Costs power resources. |

**Power resources** are accumulated from special nutrient tiles scattered on the board. TOXIN costs 3, WALL and FEAST cost 2 each.

---

## Zones

Each rule can apply to a region of the board:

- **ALL** — the entire grid
- **NORTH / SOUTH** — top or bottom half
- **EAST / WEST** — right or left half

For most actions, the zone controls which of *your* cells activate. For PULSE and TOXIN, it controls which part of the board is targeted.

---

## Intensity

Each action has an intensity:

- **CAUTIOUS** — 0.7× effect, no risk
- **NORMAL** — full effect, no risk
- **AGGRESSIVE** — 1.5× effect, but 30% chance of friendly fire

---

## The counter chain

Actions counter each other when both players choose overlapping zones:

| If you play... | It counters... | Effect |
|---------------|---------------|--------|
| ARMOR | PULSE | Reduces kill% by 50% |
| HUNT | ARMOR | Bypasses shields entirely |
| HUNT | TOXIN | Reduces toxin kill chance by 50% |
| PULSE | SCATTER | Reduces scatter effectiveness by 50% |
| TOXIN | GROW | Reduces GROW reproduction by 50% |
| WALL | HUNT | Reduces HUNT scan radius by 50% |
| SCATTER | WALL | Reduces walls placed by 50% |
| FEAST | ARMOR | Reduces armor hits granted by 1 |
| GROW | FEAST | Reduces FEAST reproduction by 50% |

Counters only apply when zones overlap.

---

## Winning

- **Eliminate all enemy cells** to win immediately.
- **At the end of round 20**, whoever has more cells wins. Ties go to blue (the first player).

---

## Strategy tips

- **Rule order matters.** The AI evaluates your rules in order and fires the first one that matches. Put your most urgent conditions first — otherwise a broad "always grow" rule will fire every round and block the rest.
- **HUNT beats ARMOR, ARMOR beats PULSE, PULSE beats SCATTER** — think two moves ahead.
- **TOXIN, WALL, and FEAST cost power resources.** Don't plan around them if your power reserves are depleted.
- **SCATTER doesn't need nutrients.** It's the best way to cover ground in starved areas — but it's countered by PULSE.
- **Watch the readback carefully.** The AI might interpret "attack" as PULSE when you meant HUNT, or sort your rules in the wrong order. Edit before you confirm.
