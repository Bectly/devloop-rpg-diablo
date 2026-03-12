# DevLoop RPG — Development Log

## 2026-03-12 — Aria (System Architect)

### Session: Initial Scaffold

Built the full project foundation from scratch. Every file is real, working code — not stubs.

**What was created:**
- Full technical spec (SPEC.md) covering all game systems: combat, inventory, loot, monster AI, networking, procedural dungeons, story/dialogue
- Game server (Node.js + Express + Socket.io) with 20 tick/sec authoritative game loop
- Player class with full stat system (STR/DEX/INT/VIT), derived stats, leveling, 3 character classes
- Combat system with damage formulas, crit hits, armor reduction, attack cooldowns
- Monster definitions (4 types) with AI state machine (idle/alert/attack/flee/leash)
- Item/loot system with 5 rarity tiers, procedural stat generation, weapon and armor types
- Grid inventory (10x6) with multi-cell items, stacking, equip/unequip
- TV client (Phaser 3) rendering players, monsters, items, dungeon floor, and HUD
- Phone controller with nipplejs joystick, action buttons, inventory screen
- Socket.io protocol with separate namespaces for TV and phone controllers

**Architecture decisions:**
- Server-authoritative: all game logic on server, clients are dumb renderers/input senders. This prevents cheating and keeps state consistent.
- Two Socket.io namespaces (`/game` for TV, `/controller` for phones) to cleanly separate concerns.
- 20 tick/sec broadcast — fast enough for action combat, light enough for local Wi-Fi.
- Diablo-style grid inventory with multi-cell items because it adds a satisfying tetris-like element to loot management.
- Monster AI as a simple state machine — easy to debug, easy to extend with new behaviors.

**Next priorities:**
1. Test with actual phones on local network
2. Implement dungeon room generation
3. Add Phaser tilemap rendering for proper dungeon visuals
4. Wire up the skill system with cooldowns

---

### Cycle #2 — Bolt (builder)
**Čas:** 2026-03-12 ~15:50
**Co jsem udělal:**
- BSP dungeon generation (60x40 grid, recursive split, L-shaped corridors, room types)
- Monster spawn waves per room (1-3 waves, trigger on room entry)
- 2 nové monster typy: archer (ranged kiting AI) a slime (splits on death)
- Difficulty scaling per floor (HP/damage/armor/count)
- Loot drop + pickup flow (proximity check, gold + equipment, rarity scaling with floor)
- Death/respawn system (5s timer, 50% HP, gold penalty, dual-death = floor restart)
- Tilemap rendering (7 floor themes, wall/floor/door/corridor tiles, locked/unlocked exits)
- Minimap v top-right (discovered rooms, player/monster dots)
- Loot glow rings s rarity barvami
- Phone: loot button, floor indicator, damage flash, death overlay s countdown
**Stav:** Gameplay loop funkční — dungeons, combat, loot, death. Chybí: skill system, story, save/load.
---
