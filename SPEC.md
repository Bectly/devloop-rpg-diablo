# DevLoop RPG — Technical Specification

## 1. Architecture Overview

```
                    Local Network (Wi-Fi)
                           |
        +------------------+------------------+
        |                  |                  |
   [Phone 1]          [Phone 2]         [TV Display]
   Controller          Controller        Phaser 3 Client
   (nipplejs)          (nipplejs)        (renders world)
        |                  |                  |
        +--- Socket.io ----+--- Socket.io ----+
                           |
                    [Game Server]
                    Node.js + Express
                    Socket.io + SQLite
                    (authoritative state)
```

### Components

1. **Game Server** (Node.js + Express + Socket.io)
   - Authoritative game state (anti-cheat by design)
   - 20 tick/sec game loop
   - SQLite for persistence (characters, world state, loot tables)
   - Two Socket.io namespaces: `/game` (TV) and `/controller` (phones)

2. **TV Client** (Phaser 3)
   - Renders the full game world: dungeon tiles, players, monsters, items, UI overlays
   - Receives state snapshots from server at 20 Hz
   - Client-side interpolation for smooth rendering
   - Displays shared UI: minimap, party health bars, loot drops, dialogue boxes

3. **Phone Controllers** (HTML + nipplejs + Socket.io)
   - Lightweight mobile-optimized pages
   - Virtual joystick (nipplejs) for movement
   - Action buttons: Attack, Skill 1-3, Use Potion, Inventory, Interact
   - Inventory management screen (drag-and-drop grid)
   - Player stats/equipment view

## 2. Network Protocol

### Server → TV (namespace: `/game`)

| Event | Payload | Frequency |
|-------|---------|-----------|
| `state` | Full game state snapshot | 20/sec |
| `player:joined` | `{ id, name, class }` | On event |
| `player:left` | `{ id }` | On event |
| `combat:hit` | `{ attackerId, targetId, damage, type }` | On event |
| `combat:death` | `{ entityId, killedBy, loot[] }` | On event |
| `loot:drop` | `{ items[], position }` | On event |
| `dialogue:start` | `{ npcId, text, choices[] }` | On event |
| `dialogue:end` | `{ npcId }` | On event |
| `dungeon:enter` | `{ roomId, layout, monsters[], items[] }` | On event |
| `effect:spawn` | `{ type, position, duration }` | On event |

### Phone → Server (namespace: `/controller`)

| Event | Payload | Description |
|-------|---------|-------------|
| `join` | `{ name, characterClass }` | Player joins game |
| `move` | `{ dx, dy }` | Joystick vector (-1 to 1) |
| `move:stop` | `{}` | Joystick released |
| `attack` | `{}` | Basic attack |
| `skill` | `{ skillIndex }` | Use skill (0-2) |
| `use:potion` | `{ type }` | Use health/mana potion |
| `interact` | `{}` | Interact with nearby NPC/object |
| `loot:pickup` | `{ itemId }` | Pick up item |
| `inventory:move` | `{ from, to }` | Move item in grid |
| `inventory:equip` | `{ itemId, slot }` | Equip item |
| `inventory:unequip` | `{ slot }` | Unequip item |
| `inventory:drop` | `{ itemId }` | Drop item |
| `dialogue:choose` | `{ choiceIndex }` | Pick dialogue option |
| `levelup:stat` | `{ stat }` | Allocate stat point |

### Server → Phone (namespace: `/controller`)

| Event | Payload | Description |
|-------|---------|-------------|
| `joined` | `{ playerId, stats, inventory }` | Confirm join |
| `stats:update` | `{ hp, mp, xp, level, stats }` | Player stats changed |
| `inventory:update` | `{ grid[][], equipment{} }` | Inventory changed |
| `notification` | `{ text, type }` | Feedback message |
| `dialogue:prompt` | `{ npcName, text, choices[] }` | Show dialogue |

## 3. Game Systems

### 3.1 Player Stats & Leveling

**Base Stats** (each starts at 10, +5 free points per level):
- **STR** (Strength): +2 melee damage per point, +5 carry weight
- **DEX** (Dexterity): +1% crit chance, +1% dodge, +1 ranged damage
- **INT** (Intelligence): +3 spell damage, +2 max MP
- **VIT** (Vitality): +10 max HP, +1 HP regen/sec

**Derived Stats:**
- HP = 100 + (VIT * 10) + (level * 15)
- MP = 50 + (INT * 5) + (level * 8)
- Attack Power = base_weapon_damage + (STR * 2) [melee] or (DEX * 1.5) [ranged]
- Spell Power = base_spell_damage + (INT * 3)
- Armor = sum(equipment_armor) + (VIT * 0.5)
- Crit Chance = 5% + (DEX * 1%)
- Dodge = (DEX * 0.5%)

**XP Formula:** `xp_needed = floor(100 * (1.15 ^ level))`

**Classes:**
- **Warrior**: +3 STR, +2 VIT base. Skills: Whirlwind (spin AoE), Charging Strike (dash+stun), Battle Shout (buff+fear)
- **Ranger**: +3 DEX, +2 STR base. Skills: Arrow Volley (cone), Sniper Shot (piercing), Shadow Step (mobility)
- **Mage**: +3 INT, +2 DEX base. Skills: Meteor Strike (projectile+AOE), Blizzard (multi-hit+slow), Chain Lightning (bouncing)

### 3.2 Combat System

- **Real-time** with attack cooldowns (no turns)
- Attack range depends on weapon type (melee: 48px, ranged: 200px)
- Basic attack: weapon damage + stat bonus, reduced by target armor
- Damage formula: `max(1, (attack_power * weapon_multiplier) - target_armor * 0.4)`
- Critical hits: `damage * 2.0`
- Skills cost MP, have individual cooldowns (1-10 sec)
- **Skill Leveling (1-5):** Spend talent points to level skills. +15% damage, -10% cooldown, -5% MP cost per level. Level 5 unlocks a unique bonus per skill (e.g. Whirlwind +2 hits, Blizzard freezes, Chain Lightning +2 bounces)
- Monster aggro radius: 150px, leash distance: 400px
- Monsters target closest player, switch on threat

### 3.3 Inventory System (Diablo-style Grid)

- **10 columns x 6 rows** grid (60 slots)
- Items occupy 1x1, 1x2, 2x1, 2x2, or 2x3 cells
- Stackable items: potions, gold, materials (max stack: 20)
- Equipment slots: Helmet, Chest, Gloves, Boots, Weapon (main), Shield (off-hand), Ring x2, Amulet

### 3.4 Item & Loot System

**Rarities:**
| Rarity | Color | Stat Bonus Range | Drop Weight |
|--------|-------|-----------------|-------------|
| Common | White | 0-1 bonus | 60% |
| Uncommon | Green | 1-2 bonuses | 25% |
| Rare | Blue | 2-3 bonuses | 10% |
| Epic | Purple | 3-4 bonuses | 4% |
| Legendary | Orange | 4-5 bonuses + unique effect | 1% |

**Weapon Types:**
- Sword (1H): balanced damage, fast
- Axe (2H): high damage, slow
- Bow: ranged, medium speed
- Staff: spell damage boost, ranged
- Dagger: low damage, very fast, high crit

**Armor Types:** Plate (high armor, warrior), Leather (medium, ranger), Cloth (low armor, mage bonus)

**Loot Drops:** Monsters have loot tables. Boss monsters always drop 1 Rare+ item.

### 3.5 Monster AI

**Behaviors:**
- **Idle**: Wander randomly within patrol area
- **Alert**: Player entered aggro radius, move toward player
- **Attack**: In attack range, execute attack pattern
- **Flee**: HP < 20%, move away (only certain types)
- **Leash**: Too far from spawn, return and heal

**Monster Types:**
- **Skeleton**: Melee, medium speed, 80 HP. Drops: bones, common weapons
- **Zombie**: Slow, high HP (150), poison attack. Drops: rotten flesh, uncommon items
- **Demon**: Fast, ranged fire attack, 120 HP. Drops: demon core, rare items
- **Boss Knight**: All phases (melee + charge + AoE), 500 HP. Drops: guaranteed epic+

### 3.6 Procedural Dungeons

- Rooms connected by corridors
- Room types: Combat, Treasure, NPC/Shop, Boss, Rest (heal)
- Each floor: 5-8 rooms, difficulty scales per floor
- BSP (Binary Space Partitioning) for room generation
- Tilemap: walls, floors, doors, traps, decorations

### 3.7 Story & Dialogue

- NPCs have dialogue trees (JSON-defined)
- Choices affect reputation and unlock paths
- Quest types: Kill X monsters, Fetch item, Escort NPC, Boss fight
- Two-player decisions: both must agree (majority vote with 2 = both)

### 3.8 AI Asset Generation (ComfyUI)

- Monster sprites: txt2img with pixel-art LoRA
- Equipment icons: txt2img with item-icon LoRA
- Dungeon tiles: txt2img with tileset LoRA
- NPC portraits: txt2img with portrait LoRA
- Pipeline: server calls ComfyUI API → saves to `assets/generated/`

## 4. Tech Stack

| Component | Technology |
|-----------|-----------|
| Server | Node.js 22 + Express |
| Real-time | Socket.io 4.x |
| Database | better-sqlite3 |
| Game Engine | Phaser 3.80 (CDN) |
| Phone Input | nipplejs (CDN) |
| Phone UI | Vanilla HTML/CSS/JS |
| Asset Gen | ComfyUI (GPU, optional) |
| IDs | uuid v4 |

## 5. File Structure

```
devloop-rpg-diablo/
  SPEC.md
  README.md
  TODO.md
  DEVLOG.md
  server/
    index.js          — Express + Socket.io + game loop
    package.json
    game/
      player.js       — Player class, stats, leveling
      world.js        — World/dungeon state manager
      combat.js       — Combat resolution, damage calc
      monsters.js     — Monster definitions + AI
      items.js        — Item/loot generation
      inventory.js    — Grid inventory management
      story.js        — Dialogue/quest system
  client/
    tv/
      index.html      — Phaser 3 game page
      game.js         — Phaser scenes, rendering, socket
    phone/
      index.html      — Phone controller page
      controller.js   — Joystick + buttons + socket
      style.css       — Mobile-optimized dark theme
      inventory.html  — Inventory management screen
      talents-ui.js   — Talent tree UI (IIFE module)
      rift-ui.js      — Rift system UI (IIFE module)
```

## 12. Talent Trees (Phase 13)

Each class (warrior/ranger/mage) has 3 specialization branches, each with 4 tiers of talents.
- **36 total talents** (3 classes × 3 branches × 4 tiers)
- **Tier gates**: 0/3/6/8 points in branch to unlock next tier
- **Max ranks**: T1=3, T2=3, T3=2, T4=1 (capstone)
- **Effect types**: stat_bonus, passive, proc_chance, aura, skill_upgrade
- **1 talent point per level**, respec costs 100 × level gold
- Engine: `server/game/talents.js`, UI: `client/phone/talents-ui.js`

## 13. Endgame Rift System (Phase 14)

Rifts are timed randomized dungeons that provide endgame replayability.

### Rift Flow
1. Player obtains **Keystones** from boss kills (floor 3+)
2. At floor start room, opens **Rift Portal** (costs 1 keystone)
3. Selects **Rift Tier** (1-10, unlocks sequentially)
4. Both players confirm → teleported to randomized rift dungeon
5. Timer starts. Kill monsters, clear rooms, reach **Rift Guardian**
6. Kill Guardian before timer → rift complete, rewards
7. Timer expires → rift failed, no rewards

### Rift Modifiers
Each rift has 1 + floor(tier/3) random modifiers that affect the entire dungeon:
- deadly (monsters +50% dmg), fortified (+40% HP), hasty (+30% speed)
- burning (periodic fire), vampiric (monster lifesteal), cursed (reduced healing)
- chaotic (double spawns), armored (+30% DR), empowered (+1 affix), shielded (elite shields)

### Paragon System
After max level, XP overflows into Paragon XP. Each Paragon level costs `paragonLevel * 1000` XP and grants 1 free stat point. Paragon levels are uncapped and displayed on leaderboard.

### Key Files
- `server/game/rifts.js` — Rift creation, modifiers, guardian, rewards
- `server/game/world.js` — `generateRiftFloor()` method
- `client/phone/rift-ui.js` — Tier selector, timer, rewards overlay

## 14. Cross-Class Combo System (Phase 17)

When two players combine specific skill effects, a **combo bonus** triggers with unique visual effects and bonus damage/effects.

### Combo Definitions

| Combo | Trigger | Effect |
|-------|---------|--------|
| **Shatter Blast** | Frozen (Blizzard L5) + Physical hit | 2x damage ice explosion (AOE 100px) |
| **Chain Reaction** | Chain Lightning + Arrow Volley (within 2s) | Lightning arcs to all nearby (120px) |
| **Battle Fury** | Whirlwind + Battle Shout buff active | Vortex pulls enemies in (140px) |
| **Shadow Barrage** | Sniper Shot + Shadow Decoy alive | Duplicate projectile from decoy |
| **Firestorm** | Blizzard + Burning Ground (Meteor L5) | Steam cloud blinds enemies 3s |

### System Design
- **Server-side detection**: `ComboTracker` class scans combat events each tick
- **Per-combo cooldowns**: 5-8s cooldown per combo type
- **One combo per event**: First matching combo wins
- **TV visual effects**: Big callout text + unique particle bursts per combo (`combat-fx.js`)
- **Phone notifications**: Purple-gold gradient toast on combo trigger

### Key Files
- `server/game/combos.js` — ComboTracker, COMBO_DEFS, check/execute logic
- `client/tv/combat-fx.js` — `spawnComboEffect()` with per-combo particles
- `server/tests/phase17-combos.test.js` — 33 tests covering all combos

## 15. Hardcore Mode (Phase 19)

Permanent death mode. Character is deleted on death. Higher risk = better rewards.

### Rules
- `player.hardcore = true` — set at character creation, immutable
- Death = character deleted from DB (no respawn, no grace period)
- +25% magic find bonus (multiplicative with existing MF)
- Separate leaderboard (Normal vs Hardcore tabs)
- HC players visible on TV with red skull badge

### Death Flow
1. HP ≤ 0 → check `player.hardcore`
2. If true: emit `hardcore:death` to phone + TV
3. Delete character from `characters` table
4. Remove from `players` Map, disconnect controller
5. TV: red explosion particles + "HARDCORE DEATH" callout

### Integration Points
- `database.js`: `hardcore` column, filtered leaderboard queries
- `player.js`: `hardcore` flag in constructor, serialize, restoreFrom
- `index.js`: permadeath check in respawn handler
- `socket-handlers.js`: HC flag in join payload

## 16. Shared Stash (Phase 19)

Persistent cross-character storage. 20 slots, accessible from phone UI.

### Database Schema
```sql
CREATE TABLE IF NOT EXISTS stash (
  slot INTEGER PRIMARY KEY,
  item_json TEXT NOT NULL,
  stored_at TEXT DEFAULT (datetime('now'))
);
```

### Socket Events
- `stash:store` (slot, inventoryIndex) → move item to stash
- `stash:retrieve` (slot) → move item to inventory
- `stash:list` → return all stash contents

### Design Decisions
- Stash is per-device (SQLite is local), not per-character
- Always accessible from phone (no town-only restriction — couch co-op UX)
- Stash survives hardcore death (items are cross-character)
- 20 slots max (4×5 grid on phone UI)
