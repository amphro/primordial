# Game Concepts

## Core Mechanic (all concepts share this)

**The Sealed Prompt:** Each round, both players type a natural language prompt and lock it in. Once locked, neither can change it. When both have submitted (or the timer expires, with a configurable timeout), the tick resolves: AI interprets both prompts simultaneously, applies effects to the simulation, and the results play out visually. The game ticks forward automatically between rounds — the simulation is always running, prompts just bend what happens next.

**Session structure:** ~10-15 rounds at 20-30 seconds per round = 3-5 minutes per game.

---

## Concept 1: PRIMORDIAL

> *Two colonies of microscopic organisms compete for dominance on a petri dish.*

### What auto-runs
A cellular simulation on a 40x40 grid. Each tick: cells consume nearby nutrients, reproduce into adjacent empty squares, and die if they run out of food. Nutrients slowly replenish. Players' colonies are color-coded (e.g., blue vs red). No player input needed — the organisms live and die on their own rules.

### What the prompt does
Each prompt triggers one evolutionary event or environmental shift for your colony. The AI classifies the prompt intent into one of ~8 bounded actions:

- **GROW** — temporarily boost reproduction rate
- **ARMOR** — cells take two hits before dying this round
- **TOXIN** — your cells poison the tiles they touch, killing red cells that enter
- **HUNT** — your cells actively move toward red cells this tick
- **SCATTER** — spread cells outward, sacrificing density for territory
- **FEAST** — your cells consume nutrients faster but die faster too
- **WALL** — create a cluster of non-reproducing "shell" cells in a direction
- **PULSE** — emit a radial burst that destroys 5-10 red cells near a location

Example prompts: *"make my cells grow fast"*, *"build a wall on the right side"*, *"send a toxic wave at them"*, *"scatter and claim the top half"*

### Win condition
First colony to control 60% of the grid cells, OR whichever colony has more cells when the timer hits 5 minutes.

### Visual
Top-down 2D: colored blobs spreading on a dark background with nutrients as glowing dots. Watching cells collide, die, and spread is naturally satisfying without any input.

### Why it works
- Cellular automata are inherently hypnotic to watch
- Prompt action space is small enough for AI to be reliable
- "Sealed prompt" tension: if you play TOXIN and they play ARMOR, it's a read-your-opponent moment
- Closely mirrors what the user had in mind (cells multiplying/evolving)

### Implementation complexity
Medium-low. The sim is a standard cellular automaton, well-understood. Grid state in a Durable Object. No pathfinding, no physics. Biggest challenge: tuning tick speed so neither colony snowballs too fast.

---

## Concept 2: RIFTWAR

> *Two warlords fight over a fractured island. Your army runs itself — your words decide its soul.*

### What auto-runs
A 2D top-down map (60x40) divided into territories. Each tick: your units automatically march toward the nearest enemy territory, fight on contact (resolved by unit count), and your villages passively generate new soldiers. The map has terrain features — forests slow movement, rivers block unless bridged, mountains are defensible.

### What the prompt does
Each prompt changes your army's strategic posture or triggers one special action. AI classifies into ~8 actions:

- **ADVANCE** — all units push forward aggressively
- **DEFEND** — units pull back and fortify current positions
- **FLANK(direction)** — redirect half your units to attack from a side
- **REINFORCE(location)** — rush units from nearby territories to a named location
- **SIEGE** — focus all units on one enemy stronghold
- **RECRUIT** — spend resources to spawn extra units this tick
- **SABOTAGE** — a raider unit sneaks behind enemy lines and destroys one village
- **TREATY** — (2v2 only) offer temporary alliance with another player

Example prompts: *"defend the forest pass"*, *"flank them from the north"*, *"send raiders to burn their village"*, *"rush everything at their capital"*

### Win condition
Capture the enemy's capital city, OR control 70% of territories when time runs out.

### Visual
Top-down map with colored territory blobs. Armies shown as clusters of dots marching across terrain. Territory flips color as it's captured. Simple but legible from across a room.

### Why it works
- Familiar strategic vocabulary — even non-gamers understand "attack", "defend", "flank"
- Auto-advancing units mean there's always visible action, even with no prompts
- Sealed prompt creates "bait and counter" meta: did they play FLANK or ADVANCE?
- Scales naturally to 4-player (4 warlords, last territory standing)

### Implementation complexity
Medium. Requires pathfinding (A*) for unit movement, territory ownership tracking. More complex than Primordial but still achievable. Biggest challenge: balancing auto-advancement so games don't end too fast.

---

## Concept 3: VERDANT

> *Two rival nature spirits tend a shared wilderness. Bend the ecosystem in your favor — subtly.*

### What auto-runs
A shared 2D map (50x50) with a living ecosystem: prey animals graze on grass, predators hunt prey, grass grows back slowly, weather drifts across the map. Both players share the same map — there are no "sides" spatially. Instead, each player has a spirit color, and creatures they've influenced carry a faint tint. The ecosystem runs itself and would reach equilibrium on its own.

### What the prompt does
Each prompt lets you nudge one aspect of the ecosystem toward or away from something. The AI interprets intent and applies one of ~8 influences:

- **BLOOM(area)** — cause lush grass growth in a region, drawing prey there
- **DROUGHT(area)** — kill grass in a region, starving prey
- **SPAWN(creature, area)** — add 5-10 of a creature type to an area
- **CULL(creature, area)** — cause a disease that kills some creatures in an area
- **EVOLVE(trait)** — your influenced creatures gain a trait (faster, tougher, more fertile)
- **LIGHTNING** — strike a random cluster of the opponent's influenced creatures
- **MIGRATE** — cause all creatures in an area to move toward a location
- **MARK** — claim a cluster of neutral creatures as yours

Example prompts: *"make the northern meadow bloom with grass"*, *"send a plague to their wolves"*, *"help my deer evolve to run faster"*, *"strike lightning at the enemy herd"*

### Win condition
First player to have their influence (creature count) exceed 65% of all living creatures on the map.

### Visual
Top-down nature scene: grass, trees, small animals moving around. Creatures carry subtle color auras. Watching a flock of "your" deer get picked off by a rival lightning strike feels dramatic despite being gentle visually.

### Why it works
- Unique tone — feels nothing like existing games, memorable
- Shared map means both players are always interacting, never isolated on "their side"
- High prompt expressiveness: "send a plague", "cause a flood", "evolve my wolves to hunt bears" — all of these parse naturally
- The indirection (you influence, not control) makes AI interpretation failures feel thematic, not broken

### Implementation complexity
Medium-high. Ecosystem simulation requires more entities and behavioral rules than a grid automaton. Each animal needs simple AI (graze, hunt, flee). Performance concern at scale — needs object pooling or spatial partitioning. Biggest challenge: the ecosystem must stay interesting (not collapse into equilibrium too fast or go extinct).

---

## Comparison Table

| | PRIMORDIAL | RIFTWAR | VERDANT |
|---|---|---|---|
| **Visual style** | Abstract (cells on grid) | Strategic (map + armies) | Nature sim (animals + terrain) |
| **Prompt vocabulary** | Biology (grow, mutate, armor) | Military (attack, defend, flank) | Nature magic (bloom, drought, evolve) |
| **Shared map** | Yes | No (two sides) | Yes |
| **Learning curve** | Low | Low | Medium |
| **Tone** | Competitive, tense | Competitive, familiar | Strategic, whimsical |
| **Impl. complexity** | Low-Medium | Medium | Medium-High |
| **AI reliability** | High (small action set) | High (familiar vocab) | Medium-High (wider vocab) |
| **Wow factor** | Hypnotic visuals | Familiar but satisfying | Most original |
| **Finish-line risk** | Lowest | Medium | Highest |
