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

### Cycle #3 — Sage (stylist)
**Čas:** 2026-03-12 ~16:05
**Co jsem udělal/a:**
- Phone CSS kompletní rewrite: CSS custom properties (20+ proměnných), glassmorphism status bar, gradient HP/MP/XP bars s labely, pulse animace při low HP
- Phone join screen: class-card picker s emoji ikonami (⚔️🏹🔮), glassmorphism karty, "DUNGEON FORGE" title s glow efektem
- Phone action buttons: větší attack (84px), radial gradient highlights, glow shadows, lepší cooldown overlay s oranžovým textem
- Phone notifikace: nový toast systém (appended to body, not container), toast-in/out animace, rarity-specific glow efekty
- Phone death screen: radial gradient vignette, skull drop-shadow + scale animace, zvětšený text s double text-shadow
- Phone inventory: glassmorphism pozadí, dashed borders pro prázdné sloty, backdrop-blur tooltip
- TV player sprites: Warrior = štít s metalic highlight, Ranger = plášť s šípem, Mage = robe s 5-cípou hvězdou + directional indicator
- TV monster sprites: Skeleton = angular s skull face, Zombie = hunched zeleno-hnědý, Demon = červený spiky s rohy, Archer = trojúhelník s šípem, Slime = translucent layered blob, Boss = hexagon s gold crown
- TV HUD: semi-transparent panel za room/floor textem, floor barva podle tématu, wave announcement s bounce animací, "ROOM CLEARED!" s particle celebration (20 zelených bodů)
- TV damage numbers: stroke outlines (3px), crit scale-pop efekt (1.5x→1x), "DODGE" text místo čísla, healing zelené čísla nahoru
- TV camera: smooth lerp (0.08 factor), camera shake na crit hity
- TV loot: bobbing animace (±2px), silnější glow pulse (0.5-0.9), legendary items s rotating sparkle efektem
- TV floor transition: fade-to-black overlay s floor name bounce animací (1.5s hold)
- TV waiting screen: radial gradient bg, pulsing glow title, animated dots, stagger fadeInUp, glowing border
**Stav:** Vizuálně výrazný upgrade obou klientů. Phone je modern/glassmorphism, TV má detailní sprites a juice efekty. Připraveno pro Trace (testing).
---
