# DevLoop RPG — Diablo-style Dungeon Crawler

## Overview

2-player real-time Diablo-style RPG in the browser. The TV displays the game (Phaser 3), phones are controllers (touch joystick). Local network only — TV and phones connect via Socket.io. Server-authoritative architecture: all game logic runs server-side.

## Features

- 3 character classes (Warrior, Ranger, Mage) with unique skills
- BSP-generated procedural dungeons (7 floor themes)
- 6+ monster types with AI state machine (idle/alert/attack/flee/leash)
- Boss fights with 3-phase mechanics
- 5-rarity loot system (Common → Legendary)
- Grid inventory (10x6) with multi-cell items
- Combat: damage formulas, crits, armor, skills, cooldowns
- Death/respawn with gold penalty
- Monster spawn waves per room
- Minimap, damage numbers, loot glow effects
- Phone: joystick, action buttons, inventory, death overlay, notifications

## Tech Stack

- **Server**: Node.js + Express + Socket.io (20 tick/sec game loop)
- **TV Client**: Phaser 3 (HTML5 game engine)
- **Phone Client**: vanilla JS + nipplejs (touch joystick)
- **Tests**: Vitest (237 tests)

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
  index.js          — Express + Socket.io server
  game/
    player.js       — Player class, stats, skills
    combat.js       — Damage formulas, skill effects
    monsters.js     — Monster definitions, AI
    items.js        — Loot generation, rarity
    inventory.js    — Grid inventory system
    world.js        — BSP dungeon generation
    dungeon.js      — Dungeon utilities
    story.js        — NPC/dialogue system
  tests/            — 237 unit tests (vitest)
client/
  tv/
    index.html      — TV display entry
    game.js         — Phaser 3 renderer
  phone/
    index.html      — Phone controller entry
    controller.js   — Touch input, HUD, inventory
    style.css       — Phone UI styling
```

## Development

- Developed by 5 AI agents via DevLoop system
- Test: `cd server && npm test`
- Dev mode: `cd server && npm run dev` (auto-reload)

## Roadmap

- [ ] Equipment stat application
- [ ] XP/leveling with stat allocation
- [ ] Story/dialogue system
- [ ] Quest tracking
- [ ] Boss fight content
- [ ] Shop NPC
- [ ] Class skills (9 total)
- [ ] SQLite save/load
- [ ] ComfyUI sprite generation
