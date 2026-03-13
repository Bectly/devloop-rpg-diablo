# DevLoop RPG — Diablo-style Co-op Dungeon Crawler

## Overview

2-player real-time Diablo-style RPG in the browser. The TV displays the game (Phaser 3), phones are controllers (touch joystick). Local network — TV and phones connect via Socket.IO. Server-authoritative architecture: all game logic runs server-side.

## Quick Start

```bash
# 1. Clone and install
git clone <repo-url> devloop-rpg
cd devloop-rpg
npm install

# 2. Start the server
npm start

# 3. Play!
# TV:    open http://localhost:3000/tv in a browser (ideally fullscreen on a big screen)
# Phone: open http://<your-local-ip>:3000/phone on each phone (scan QR on TV screen)
```

**Requirements:** Node.js 18+ (tested on 22). No build step, no Docker needed.

The server auto-detects your LAN IP and shows a QR code on the TV screen for phones to scan.

## Features

### Core
- 3 character classes (Warrior, Ranger, Mage) with unique skills (9 total)
- BSP-generated procedural dungeons (7 floor themes, 3 zones)
- XP/leveling with stat allocation + paragon levels
- 5-rarity loot system (Common → Set) with procedural names
- Grid inventory (10x6) with multi-cell items + stash system
- Equipment with set bonuses (3 sets with 2/3/4-piece bonuses)
- Gem socketing system (6 gem types, 3 tiers, combinable)
- Crafting: salvage, reforge, upgrade (+1/+2/+3)
- Loot filter (off/basic/smart auto-pickup with TV visual dimming)
- Shop NPC with scaling inventory
- SQLite save/load persistence with session reconnection

### Combat
- Damage formulas with crits, armor, damage types (physical/fire/cold/lightning/poison)
- 12+ monster types with AI state machine (idle/alert/attack/flee/leash)
- Boss fights with 3-phase mechanics (Infernal Lord, Void Reaper)
- Elite monsters (Champion/Rare) with affixes (fire enchanted, shielding, teleport, etc.)
- Greater Rifts with scaling difficulty and timers
- Trap system (spike, poison, fire, frost, arcane, lightning)
- Combo system (cross-class synergies)
- Spirit Wolf summon, defensive talent procs

### Talents & Auras
- Talent tree system with passive, proc, and aura talents
- Party auras: STR boost, XP bonus, attack speed, movement speed
- 3 difficulty modes: Normal, Nightmare, Hell

### UI
- Phaser 3 TV client with procedural sprites per monster type
- Minimap, damage numbers, loot glow effects, death recap
- Elite death particles, boss crown sprites, set completion announcements
- Phone: joystick, action buttons, inventory, gem socketing, crafting
- Reconnect overlay with 30s grace period
- Story/dialogue system with NPC interactions + quest system

## Tech Stack

- **Server**: Node.js + Express + Socket.IO (20 tick/sec game loop)
- **TV Client**: Phaser 3 (HTML5 game engine)
- **Phone Client**: vanilla JS + nipplejs (touch joystick)
- **Database**: SQLite via better-sqlite3
- **Tests**: Vitest — **1619 tests, 38 suites**

## Project Structure

```
server/
  index.js              — Express + Socket.IO server, game loop
  socket-handlers.js    — Player interaction handlers
  socket-handlers-craft.js — Crafting handlers
  game/
    player.js           — Player class, stats, skills, talents
    combat.js           — Damage formulas, skill effects, procs
    monsters.js         — Monster definitions, AI state machine
    items.js            — Loot generation, rarity, set bonuses
    inventory.js        — Grid inventory system
    world.js            — BSP dungeon generation, zones, rifts
    gems.js             — Gem system (types, tiers, combining)
    crafting.js         — Salvage, reforge, upgrade
    database.js         — SQLite persistence
    story.js            — NPC/dialogue system
    damage-types.js     — Armor, resistances, damage calculations
    traps.js            — Trap system
    skills.js           — Active skill system
    projectiles.js      — Projectile physics
    combos.js           — Cross-class combo detection
    affixes.js          — Elite monster affixes
    shop.js             — Shop pricing
    rifts.js            — Greater Rift rewards
  tests/                — 1619 unit tests (38 suites)
client/
  tv/
    index.html          — TV display entry
    game.js             — Phaser 3 scene, game state rendering
    sprites.js          — Procedural sprite generation
    hud.js              — Boss bars, minimap, zone UI
    effects.js          — Particles, shrines, NPC effects
  phone/
    index.html          — Phone controller entry
    controller.js       — Touch input, HUD, inventory, crafting
    stats-ui.js         — Stat tooltips, gem socketing UI
    reconnect.js        — Reconnect overlay, buff display
    style.css           — Phone UI styling
  shared/
    sound.js            — Procedural Web Audio sound effects
```

## Running Tests

```bash
npm test
```

## Development

Built by 5 AI agents via the DevLoop system:
- **Aria** — architect (planning, API design)
- **Bolt** — builder (core implementation)
- **Sage** — stylist (UI/UX, CSS, frontend polish)
- **Trace** — tester (unit tests, QA)
- **Rune** — reviewer (code review, refactoring, security)

Current phase: Phase 20 (Gems, Enchanting & QoL) — 3/4 features complete.
