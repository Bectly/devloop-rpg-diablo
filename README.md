# DevLoop RPG — Diablo-style Co-op Dungeon Crawler

## Overview

2-player real-time Diablo-style RPG in the browser. The TV displays the game (Phaser 3), phones are controllers (touch joystick). Local network only — TV and phones connect via Socket.io. Server-authoritative architecture: all game logic runs server-side.

## Features

### Core
- 3 character classes (Warrior, Ranger, Mage) with unique skills (9 total)
- BSP-generated procedural dungeons (7 floor themes)
- XP/leveling with stat allocation
- 5-rarity loot system (Common → Legendary)
- Grid inventory (10x6) with multi-cell items
- Equipment stat application with set bonuses
- Shop NPC with scaling inventory
- SQLite save/load persistence

### Combat
- Damage formulas with crits, armor, damage types (physical/fire/cold/lightning/poison)
- 12+ monster types with AI state machine (idle/alert/attack/flee/leash)
- Boss fights with 3-phase mechanics
- Elite monsters (Champion/Rare) with affixes (fire enchanted, shielding, teleport, etc.)
- Greater Rifts with scaling difficulty and timers
- Trap system (spike, poison, fire, frost, arcane, lightning)
- Bleed/poison DoT with split damage types
- Defensive talent procs (Shield Wall, Last Stand, Ice Barrier, Caltrops)
- Spirit Wolf summon (on-kill proc, friendly monster AI, 10s duration)

### Talents & Auras
- Talent tree system with passive, proc, and aura talents
- Party auras: STR boost, XP bonus, attack speed, movement speed
- Attack speed aura capped at 75% with 50ms cooldown floor

### UI
- Phaser 3 TV client with procedural sprites per monster type
- Minimap, damage numbers, loot glow effects
- Elite death particles, boss crown sprites, aura glow rings
- Phone: joystick, action buttons, inventory, death overlay, buff indicators
- Reconnect overlay with 30s countdown
- Story/dialogue system with NPC interactions

## Tech Stack

- **Server**: Node.js + Express + Socket.io (20 tick/sec game loop)
- **TV Client**: Phaser 3 (HTML5 game engine)
- **Phone Client**: vanilla JS + nipplejs (touch joystick)
- **Tests**: Vitest — **1220 tests, 26 suites**

## Quick Start

```bash
cd server
npm install
npm start
# TV: open http://<local-ip>:3000 on TV browser
# Phone: open http://<local-ip>:3000/phone on each phone
```

## Project Structure

```
server/
  index.js          — Express + Socket.io server, game loop
  game/
    player.js       — Player class, stats, skills, talents
    combat.js       — Damage formulas, skill effects, procs
    monsters.js     — Monster definitions, AI, spirit wolf factory
    items.js        — Loot generation, rarity, set bonuses
    inventory.js    — Grid inventory system
    world.js        — BSP dungeon generation, rifts
    dungeon.js      — Dungeon utilities
    story.js        — NPC/dialogue system
    damage-types.js — Armor, resistances, damage calculations
    traps.js        — Trap system
  tests/            — 1220 unit tests (26 suites)
client/
  tv/
    index.html      — TV display entry
    game.js         — Phaser 3 scene, input handling
    sprites.js      — Procedural sprite generation (players, monsters, items)
  phone/
    index.html      — Phone controller entry
    controller.js   — Touch input, HUD, inventory, notifications
    reconnect.js    — Reconnect overlay, buff display
    style.css       — Phone UI styling
```

## Development

- Developed by 5 AI agents via DevLoop system (Aria/Bolt/Sage/Trace/Rune)
- Test: `cd server && npm test`
- Dev mode: `cd server && npm run dev` (auto-reload)
- Current phase: Phase 15 (Combat Polish & Talent Completion) — COMPLETE
