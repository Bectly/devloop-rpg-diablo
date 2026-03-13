# DevLoop RPG — Task Board

## Phase 1: Foundation ✅ COMPLETE
## Phase 2: Gameplay Loop ✅ COMPLETE
## Phase 3: Content ✅ COMPLETE
## Phase 4: Polish ✅ COMPLETE (sound, particles, minimap, damage numbers, health bars, camera, haptics, floor transitions, loot sparkles, dialogue sync)

### Completed ✅
- Skills fully wired + visible (phone cooldowns, TV effects, tooltips)
- NPC + Shop system (shop NPC, buy/sell UI, healing shrines)
- Boss announcements + HP bar on TV
- Quest system (QuestManager, 7 types, phone UI, rewards, TV announcements)
- Refactoring: 3 file splits (index→socket-handlers, game→hud, controller→screens)
- Boss loot chest (server spawn, TV visuals, phone LOOT interaction)
- Dialogue system wired end-to-end (phone + TV, typewriter effect, NPC type colors)
- Story NPCs (Old Sage, Shrine Guardian, Dying Adventurer) with distinct sprites + "!" markers
- Sound effects system (13 procedural Web Audio sounds, TV + phone wired)
- Two-player dialogue sync (vote collection, timeout, majority wins)
- All bugs fixed through Cycle #30 (sprite null guards, sound bufSize, TV audio unlock)
- game.js split → sprites.js (1553 → 1057 LOC) — Cycle #32
- Victory condition + endgame screens (server + TV + phone) — Cycle #32
- Procedural loot names (suffixes, legendary unique names) — Cycle #32

---

## 🔥 NEXT PRIORITIES (Phase 5: Persistence & Scale)

### 5.1 SQLite database layer [DONE — Aria, Cycle #36]
- [x] `server/game/database.js` — `GameDatabase` class
- [x] Schema: `characters` table (name PK, class, level, xp, stats JSON, equipment JSON, inventory JSON, gold, floor, kills, potions, free_stat_points)
- [x] `saveCharacter(player, inventory)` — INSERT OR REPLACE
- [x] `loadCharacter(name)` — returns parsed object or null
- [x] WAL mode, prepared statements, auto-create data dir

### 5.2 Wire persistence into server [DONE — Bolt, Cycle #37 / Rune review Cycle #39]
**Files changed:** `server/index.js`, `server/socket-handlers.js`, `server/game/player.js`, `server/game/database.js`, `client/phone/controller.js`

- [x] **Step A:** DB init in index.js + gameDb in ctx
- [x] **Step B:** `Player.restoreFrom(savedData)` — restores level, xp, stats, equipment, gold, kills, potions, freeStatPoints; calls `recalcEquipBonuses()`
- [x] **Step C:** `handleJoin` DB lookup — restores or creates new character
- [x] **Step D:** Auto-save triggers — floor transition, 60s interval, disconnect, victory
- [x] **Step E:** Graceful shutdown — SIGINT/SIGTERM save + db.close()

**Bugs fixed in Rune review (Cycle #39):**
- `saveCharacter()` hardcoded `floor: 0` — added `floor` param (default 0)
- `saveAllPlayers()` bypassed public API via `gameDb._stmtSave` directly — now uses `gameDb.saveCharacter(player, inv, currentFloor)`
- `handleDisconnect` saved floor as 0 — now passes `world.currentFloor`
- `loadCharacter()` called `JSON.parse()` on stats/equipment/inventory with no try/catch — each field now wrapped in individual try/catch with safe fallback
- Reconnect flow (`controller.js`) re-read `name-input` DOM value instead of cached name — introduced `joinedName` variable set at join time, used on reconnect

### 5.3 Session reconnection [DONE — Bolt, Cycle #40]
**Files changed:** `server/socket-handlers.js`, `server/index.js`, `server/game/player.js`, `client/tv/sprites.js`

- [x] **Step A:** Grace period in handleDisconnect — `disconnectedPlayers` Map (name → { player, inventory, socketId, timer }), 30s timeout, `player.disconnected = true`, no immediate `player:left` emit
- [x] **Step B:** Reconnect in handleJoin — checks grace Map first, clearTimeout, re-keys player to new socket.id, restores inventory, emits `player:reconnected` to TV, sends stats/inventory/joined to phone
- [x] **Step C:** Game loop skip — disconnected players freeze input (inputDx/inputDy zeroed during update) but still take damage from monsters; also excluded from floor exit trigger
- [x] **Step D:** TV ghost sprite — alpha 0.4 with pulse, red "DC" label above name, `[DC]` suffix on nameText; on reconnect: alpha restored, DC label hidden
- [x] **Step E:** Export `disconnectedPlayers` from socket-handlers; gracefulShutdown saves + clears grace Map; player.serialize() includes `disconnected` field
- [x] **Edge case:** `players.size >= 2` cap now counts only non-disconnected players

---

## 🔥 NEXT PRIORITIES (Phase 6: Monster Affixes & Refactoring)

### 6.0 Refactoring: hud.js split [DONE — Bolt, Cycle #52]
**Why:** hud.js at 1284 LOC, controller.js at 1032 LOC — both over 1000 threshold.
- [x] Extract `hud.js` victory screen code → `client/tv/victory.js` (~339 LOC)
- [x] Extract `hud.js` dialogue/NPC HUD → `client/tv/dialogue-hud.js` (~153 LOC)
- [x] Extract `controller.js` reconnect overlay + save toast → `client/phone/reconnect.js` (~119 LOC)
- [x] Verify all tests still pass after split (516/516)

### 6.1 Monster Affix System — Server [DONE — Bolt, Cycle #47]
**New file:** `server/game/affixes.js` (314 LOC)
Affixes are random modifiers applied to elite/champion monsters (Diablo-style "blue" and "yellow" packs).

- [x] **Affix definitions** — 8 affixes:
  | Affix | Effect | Visual (color tint) |
  |-------|--------|---------------------|
  | Fast | +50% speed | Yellow tint |
  | Extra Strong | +60% damage | Red tint |
  | Fire Enchanted | Deals fire DoT on hit, explodes on death | Orange glow |
  | Cold Enchanted | Slows player 30% on hit for 3s | Blue tint |
  | Teleporter | Blinks to random nearby position every 5s | Purple flash |
  | Vampiric | Heals 15% of damage dealt | Green tint |
  | Shielding | Immune to damage for 3s every 10s | White pulse |
  | Extra Health | +100% HP | Larger size |

- [x] **Elite spawn rules:**
  - Floor 1-2: no elites
  - Floor 3-4: 15% chance per monster → "Champion" (1 affix, blue name)
  - Floor 5-6: 25% chance → "Champion" (1-2 affixes)
  - Floor 7: 30% chance → "Rare" (2-3 affixes, yellow name)
  - Boss never gets affixes

- [x] **Affix application** in `Monster` constructor or a `Monster.applyAffixes(affixList)` method:
  - Modifies monster stats (hp, damage, speed)
  - Stores `monster.affixes = ['fast', 'vampiric']`
  - Stores `monster.isElite = true`, `monster.eliteRank = 'champion'|'rare'`

- [x] **Affix behavior hooks** in combat.js / world.js update loop:
  - `onMonsterHit(monster, player)` — fire DoT, cold slow
  - `onMonsterDeath(monster)` — fire explosion
  - `onMonsterUpdate(monster, dt)` — teleporter blink, shielding cycle
  - `onMonsterDealDamage(monster, player, damage)` — vampiric heal

### 6.2 Monster Affix System — Client TV [DONE — Sage, Cycle #48]
- [x] **Elite name colors** in sprites.js: Champion = blue (#4488ff), Rare = yellow (#ffcc00)
- [x] **Affix label** below monster name (small text, e.g. "Fast · Vampiric")
- [x] **Visual effects per affix:**
  - Fire: orange glow (layered circles)
  - Shielding: white dome pulse when active (alpha 0.15-0.35)
  - Elite size scaling: Champions ×1.15, Rares ×1.3
- [x] **Elite death effect** — Champions: 10 blue particles, Rares: 16 gold particles + screen shake

### 6.3 Monster Affix System — Client Phone [DONE — Sage, Cycle #48]
- [x] **Elite encounter notification** — first hit from elite shows toast (Champion blue, Rare gold)
- [x] **Debuff indicators** — fire 🔥 and slow ❄ pills near HP bar with remaining seconds
- [x] **Debuffs in phone serialization** — player.serializeForPhone() includes debuff data

### 6.4 Loot bonus for elites [DONE — Bolt, Cycle #47]
- [x] Champions: +1 loot tier, guaranteed uncommon+
- [x] Rares: +2 loot tier, guaranteed rare+, 2x gold
- [x] XP bonus: Champion ×1.5, Rare ×2.5

---

## 🔥 NEXT PRIORITIES (Phase 7: Damage Types & Resistances)

### 7.0 Refactoring: file splits [DONE — Bolt, Cycle #52]
- [x] `hud.js` 1284 → 807 LOC. Extracted `victory.js` (339 LOC) + `dialogue-hud.js` (153 LOC)
- [x] `controller.js` 1084 → 1015 LOC. Extracted `reconnect.js` (119 LOC)
- [x] HTML script tags updated (TV + phone)
- [x] 516/516 tests PASS

### 7.1 Damage type system — Server [DONE — Bolt, Cycle #52]
**New file:** `server/game/damage-types.js` (90 LOC)
Four damage types that affect all combat. Builds on existing fire/cold affix system.

- [x] **Damage type definitions:**
  | Type | Color | Effect |
  |------|-------|--------|
  | Physical | white | Default, reduced by armor |
  | Fire | orange | DoT (burning), reduced by fire resist |
  | Cold | blue | Slows target, reduced by cold resist |
  | Poison | green | Stacking DoT, reduced by poison resist |

- [x] **Resistance system:**
  - Player resistances: `player.resistances = { fire: 0, cold: 0, poison: 0 }` (0-75%, capped)
  - Monster resistances: defined per monster type in MONSTER_DEFS
  - Resistance reduces incoming damage of that type: `finalDmg = dmg * (1 - resist/100)`
  - Equipment can grant resistances (new bonus type in items.js)

- [x] **Skill damage types:**
  - Warrior: skills deal physical
  - Mage: fireball = fire, ice shard = cold, arcane blast = physical
  - Rogue: poison blade = poison, others = physical

- [x] **Monster damage types:**
  - Skeleton/Zombie: physical
  - Demon: fire (ranged attacks)
  - Slime: poison
  - Boss phases: physical → fire → mixed

### 7.2 Items — resistance bonuses [DONE — Bolt, Cycle #52]
- [x] New bonus types: `fire_resist` (5-20), `cold_resist` (5-20), `poison_resist` (5-20), `all_resist` (3-10)
- [x] Resistance suffixes: Flame Ward, Frost Ward, Venom Ward, Protection
- [x] ~55% of armor drops roll at least one resist bonus
- [x] Display in item tooltips on phone (Sage, Cycle #53)

### 7.3 UI — resistance display [DONE — Sage, Cycle #53]
- [x] **Phone stats screen:** fire/cold/poison resistance % with color-coded icons
- [x] **TV HUD:** damage numbers colored by type (physical=white, fire=orange, cold=blue, poison=green)
- [x] **Phone:** resistance bonuses in equipment tooltips (colored labels)
- [x] **TV crits:** type-colored with matching stroke

### Found in Cycle #54 (Trace — damage types QA), Fixed in Cycle #55 (Rune)

- [x] [BUG/LOW] `monsters.js:514-540` — **`Monster.serialize()` does not include `damageType`.** **Fixed:** Added `damageType: this.damageType` to `serialize()` return object. Test updated from asserting absence to asserting presence + added coverage for all monster types.

---

## 🔥 NEXT PRIORITIES (Phase 8: Item Sets & Legendaries)

### 8.1 Set Item System — Server [DONE — Bolt, Cycle #57]
**New file:** `server/game/sets.js`
Diablo-style item sets — wear multiple pieces for escalating bonuses.

- [x] **4 item sets** (3 pieces each, one per class + one universal):
  | Set | Class | Pieces (slots) | 2pc Bonus | 3pc Bonus |
  |-----|-------|----------------|-----------|-----------|
  | Ironwall | Warrior | weapon(sword), chest(plate), boots(plate) | +30 armor, +15% HP | +25% damage, shield bash stuns 2s |
  | Shadowweave | Rogue | weapon(dagger), gloves(leather), boots(leather) | +20% crit chance, +15% speed | poison_blade DoT ×2, +30% crit damage |
  | Arcane Codex | Mage | weapon(staff), helmet(cloth), chest(cloth) | +25% spell damage, +20 mana | fireball chains to 1 extra target, -20% cooldowns |
  | Bones of the Fallen | Any | helmet, gloves, amulet | +10 all resist, +100 HP | 5% lifesteal on hit, +50% XP |

- [x] **Set item generation:**
  - Set items are a new rarity tier: `set` (green, `#00cc66`)
  - Drop from rare elites (100%), champion elites (25%), floor 5+ bosses
  - Each drop picks a random set, then a random unfilled slot from that set
  - Set items have fixed names (e.g. "Ironwall Greatsword", "Shadowweave Stiletto")
  - Set items have good base stats (between epic and legendary)

- [x] **Set bonus calculation** in `player.js`:
  - `recalcSetBonuses()` — count equipped set pieces, apply 2pc/3pc bonuses
  - Called after `recalcEquipBonuses()`
  - Bonuses stack with regular bonuses (additive)
  - `player.activeSets = [{ setId, piecesEquipped, bonusesActive }]`

- [x] **Set item identification:**
  - Items have `item.setId` field (e.g. 'ironwall', 'shadowweave')
  - `item.isSetItem = true`

### 8.2 Set UI — Phone [DONE — Sage, Cycle #58]
- [x] **Set item tooltip:** green text, set name, piece checklist, bonus thresholds (active/inactive)
- [x] **Set bonus display:** "Sets" section in stats screen with active bonuses
- [x] **Set piece tracker:** checkmarks for owned pieces, gray for missing
- [x] **Set bonus notification:** green toast on new set bonus activation

### 8.3 Set UI — TV [DONE — Sage, Cycle #58]
- [x] **Green sparkle** for set items on ground (6 green sparkles)
- [x] **Set announcement:** "Ironwall Set (2/3)" or "Complete! (3/3)" with green text + particles

### Future (not this phase)
- [x] Crafting / enchant system — DONE Phase 10
- [ ] Sprite assets via ComfyUI generation
- [ ] Skill synergies / cross-class combos
- [ ] PvP arena mode

---

## 🔥 NEXT PRIORITIES (Phase 9: Dungeon Zones & Unique Bosses)

**Goal:** Transform 7 same-feel floors into 3 distinct dungeon zones with unique bosses. This is the single highest-impact change for replayability and gameplay variety.

### 9.1 Zone Definitions — Server [DONE — Bolt, Cycle #62]
**File:** `server/game/world.js` (modify `FLOOR_NAMES`, `getMonsterPoolForFloor()`, add `ZONE_DEFS`)

Define 3 zones, each spanning 2-3 floors:

| Zone | Floors | Theme | Color Palette | Monster Pool |
|------|--------|-------|---------------|-------------|
| **Catacombs** | 1-2 | Dusty undead crypts | Gray/bone (#ccccaa) | skeleton, zombie, slime, archer |
| **Inferno** | 3-4 | Burning lava halls | Red/orange (#cc3333) | demon, fire_imp (NEW), hell_hound (NEW), archer |
| **Abyss** | 5-7 | Dark void/shadow realm | Purple/dark (#6633aa) | shadow_stalker (NEW), demon, wraith (NEW), zombie |

**New data structure:**
```javascript
const ZONE_DEFS = {
  catacombs: {
    floors: [0, 1],       // indices in FLOOR_NAMES
    tileColor: 0x8a7a6a,  // warm stone
    wallColor: 0x5a4a3a,
    monsterPool: ['skeleton', 'zombie', 'slime', 'archer'],
    boss: 'boss_knight',  // existing
    bossFloor: 1,         // 0-indexed: floor 2 is index 1
  },
  inferno: {
    floors: [2, 3],
    tileColor: 0x6a2a1a,  // dark red stone
    wallColor: 0x4a1a0a,
    monsterPool: ['demon', 'fire_imp', 'hell_hound', 'archer'],
    boss: 'boss_infernal',
    bossFloor: 3,
  },
  abyss: {
    floors: [4, 5, 6],
    tileColor: 0x2a1a3a,  // dark purple
    wallColor: 0x1a0a2a,
    monsterPool: ['shadow_stalker', 'demon', 'wraith', 'zombie'],
    boss: 'boss_void',    // final boss
    bossFloor: 6,
  },
};
```

**Key change:** `getMonsterPoolForFloor(floor)` reads from `ZONE_DEFS` instead of hardcoded if-else chain.

### 9.2 New Monster Types — Server [DONE — Bolt, Cycle #62]
**File:** `server/game/monsters.js` (add to MONSTER_DEFS)

4 new monster types (1 existing behavior + 3 new):

| Monster | Zone | HP | DMG | Behavior | Damage Type | Special |
|---------|------|-----|-----|----------|-------------|---------|
| **Fire Imp** | Inferno | 45 | 14 | `ranged` | fire | Low HP, fast attack speed (900ms), small size |
| **Hell Hound** | Inferno | 100 | 20 | `melee_charge` (NEW) | fire | Charges at player from distance, brief stun on hit |
| **Shadow Stalker** | Abyss | 90 | 25 | `melee_stealth` (NEW) | physical | Invisible until close range (aggroRadius 80), first hit bonus ×2 |
| **Wraith** | Abyss | 70 | 18 | `ranged_teleport` (NEW) | cold | Teleports after every 2 attacks, 50% physical resist |

**New behaviors to implement in combat/monster update:**
- `melee_charge`: If player in range 100-250, dash at 3× speed for 0.5s → if collision = stun 0.5s. Then melee normally. Cooldown 8s.
- `melee_stealth`: Invisible (alpha 0.1) until player within aggroRadius 80. First attack deals 2× damage. After first attack, visible permanently for that encounter.
- `ranged_teleport`: Ranged attack. After every 2nd attack, teleport to random position 100-200 units away. 50% physical resistance built-in.

### 9.3 Zone Bosses — Server [DONE — Bolt, Cycle #62]
**File:** `server/game/monsters.js` (add boss defs) + `server/game/combat.js` (boss AI)

Currently only `boss_knight` exists (3-phase melee AI). Add 2 new bosses:

**Boss: Infernal Lord** (floor 4 boss)
- HP: 800 (knight=600), Armor: 8, Speed: 90, Damage: 30, DamageType: fire
- **Phase 1** (100-60% HP): Ranged fireball barrage (3 rapid projectiles, 120° spread)
- **Phase 2** (60-30% HP): Summons 2 fire_imps every 15s. Ground fire patches (DoT zones, 3s duration)
- **Phase 3** (<30% HP): Enrage — attack speed ×2, all attacks leave fire trails
- Visual: Large red/orange sprite (size 28)

**Boss: Void Reaper** (floor 7 final boss, replaces knight on floor 7)
- HP: 1200, Armor: 10, Speed: 100, Damage: 35, DamageType: cold
- **Phase 1** (100-70% HP): Teleport-slash — teleports behind player, slashes. 4s cooldown.
- **Phase 2** (70-40% HP): Shadow clones — spawns 2 decoys (30% HP, deal 50% damage, no loot). Clones die when boss takes hit.
- **Phase 3** (<40% HP): Void storm — AOE cold damage pulse every 5s (150 radius). Players must dodge. Summons 1 wraith every 20s.
- Visual: Large purple/black sprite (size 30)

**Floor 2 boss remains `boss_knight`** — Bolt already implements the 3-phase knight, it serves as the "tutorial boss" for Zone 1.

### 9.4 Zone Boss Spawning — Server [DONE — Bolt, Cycle #62]
**File:** `server/game/world.js` (modify `generateWaveMonsters`)

Currently boss spawning is: `roomData.type === 'boss' → 'boss_knight'`. Change to:
```javascript
// In generateWaveMonsters:
const zone = getZoneForFloor(floor);
const bossType = zone.boss;
const type = roomData.type === 'boss' && waveIndex === 0 && i === 0
  ? bossType  // zone-specific boss
  : monsterPool[...];
```

**Boss placement rules:**
- Floor 2 (index 1): boss_knight (Catacombs zone boss)
- Floor 4 (index 3): boss_infernal (Inferno zone boss)
- Floor 7 (index 6): boss_void (Abyss zone boss, final)
- Floors 1, 3, 5: No boss room — just monster rooms + treasure
- Floor 6: Elite-heavy floor (30% elite chance, prep for final boss)

**Room type per floor:**
```javascript
function getRoomLayout(floor) {
  const isBossFloor = [1, 3, 6].includes(floor); // 0-indexed
  if (isBossFloor) return ['start', 'monster', 'monster', 'treasure', 'boss'];
  return ['start', 'monster', 'monster', 'treasure', 'monster']; // no boss room
}
```

### 9.5 Zone Visuals — TV Client [DONE — Sage, Cycle #63]
**File:** `client/tv/game.js` (modify floor rendering)

Currently TV renders all floors with same colors. Add zone-based tile coloring:

- Catacombs: Gray stone (#8a7a6a floor, #5a4a3a walls)
- Inferno: Dark red (#6a2a1a floor, #4a1a0a walls), occasional lava tile (orange glow)
- Abyss: Dark purple (#2a1a3a floor, #1a0a2a walls), void particles

Server sends `zoneId` in `dungeon:enter` event. TV reads `zoneId` to pick tile palette.

### 9.6 Boss UI — TV + Phone [DONE — Sage, Cycle #63]
**Files:** `client/tv/hud.js`, `client/phone/controller.js`

- Boss HP bar already exists (Phase 4). Update boss name display from zone-specific boss names.
- Add boss phase indicator (Phase 1/2/3 marker below HP bar)
- Zone transition screen: "Entering the Inferno..." with zone-colored flash

### 9.7 Zone Music Hints — Sound
**File:** `client/shared/sound.js`

Add 3 ambient tone generators (procedural, no audio files):
- Catacombs: Low reverb drone
- Inferno: Crackling fire + deep bass
- Abyss: Eerie high-pitched whisper + void hum

### Implementation Order for Bolt:
1. **9.1** Zone definitions in world.js (data-only, refactor getMonsterPoolForFloor)
2. **9.2** New monster types in monsters.js (4 new defs + 3 new behaviors in combat loop)
3. **9.3** Boss defs + AI (Infernal Lord + Void Reaper)
4. **9.4** Zone boss spawning (world.js room layout per floor)
5. **9.5** Zone visuals (TV tile palette)
6. **9.6** Boss UI updates
7. **9.7** Zone ambient sounds

---

## 🔍 Review Findings — Rune, Cycle #65

### FIXED (this cycle):
- [x] [BUG] Server missing zoneId/zoneName in dungeon:enter, floor:change, joined events — zone-themed visuals were dead code
- [x] [BUG] Armor reducing ALL damage types (fire/cold/poison) — now only reduces physical
- [x] [BUG] Charge hit detection used stale closestDist from before dash movement

### Open Items (for Bolt):
- [x] [BUG] Wraith teleport ignores map boundaries/leash — FIXED: 5-attempt leash-check teleport (Bolt #67)
- [x] boss_infernal phase AI: ranged_barrage (3-projectile spread), summoner (fire_imp spawn), enrage (1.5x dmg, 2x speed) — DONE (Bolt #67)
- [x] boss_void phase AI: teleport_slash (teleport behind + 1.5x), shadow_clones (spawn event), void_storm (AoE pulse) — DONE (Bolt #67)
- [x] Archer + slime custom sprites (bow+quiver, blob+shine) — DONE (Sage #68)
- [x] chargeCooldown only decrements in ALERT state — FIXED: now also ticks in ATTACK (Bolt #67)
- [x] Stealth-to-charge visual: nameText/affixText restored on charging — FIXED (Sage #68)
- [x] Wire boss_summon → spawn fire_imp minions in world.monsters — DONE (Sage #68)
- [x] Wire void_pulse → AoE cold damage to all players in radius + TV visual — DONE (Sage #68)
- [x] Wire boss_shadow_clones + boss_phase + teleport + stealth_reveal → forward to TV — DONE (Sage #68)

### Nice-to-have:
- [ ] FLOOR_NAMES disconnected from ZONE_DEFS — embed floor names in zone definitions
- [ ] monsters.js constructor has ~50 fields, most unused per monster type — consider composition
- [ ] getMonsterPoolForFloor() is trivial wrapper called once — inline it
- [ ] Duplicate ZONE_COLORS in hud.js + controller.js — extract to shared constants
- [ ] hud.js ZONE_ACCENT_COLORS.glow defined but never used

Steps 1-2 can run in parallel. Steps 3-4 depend on 1-2. Steps 5-7 are Sage's domain.

---

## Architecture Notes (Updated Cycle #91)
**Current LOC:** ~14,200 source JS (35 files). All files under 1000 LOC. controller.js 1102→911 (+ chat-ui.js 83, death-victory.js 145).
**Tests:** 925/925 PASS, 21 suites.
**Approaching 1K:** hud.js (971), monsters.js (952), socket-handlers.js (925), screens.js (923).
**Phases 1-11 COMPLETE.** 0 open bugs, 0 security issues.
**Socket events:** 26 registered (gameplay 5, inventory 5, interact 4, NPC 5, crafting 5, social 3, admin+lifecycle 3).

---

## 🔥 NEXT PRIORITIES (Phase 9.5: Boss AI + Bug Fixes)

**Goal:** Make boss_infernal and boss_void actually fight differently than boss_knight. Fix remaining Phase 9 bugs. This is Bolt's TOP PRIORITY.

### 9.5A Boss Infernal — Phase AI [for Bolt]
**File:** `server/game/monsters.js` update() ATTACK state

Currently boss phases only affect `charge` and `aoe_frenzy` modes. Add handling for Infernal Lord's 3 phases:

**Phase 1 — `ranged_barrage` (100-60% HP):**
- Boss stays at range (preferredRange ~180), fires 3 rapid projectiles in 120° spread
- Each projectile: `{fromX, fromY, toX, toY, speed: 320}` with angle offset -20°, 0°, +20°
- Use existing projectile system (same as archer/wraith)

**Phase 2 — `summoner` (60-30% HP):**
- Every `summonCooldownMax` (15s): emit `boss_summon` event with `{type: 'fire_imp', count: 2, positions: [{x,y}, {x,y}]}`
- Socket handler must catch `boss_summon` and call `world.addMonster()` (or similar) to actually spawn minions
- Continue ranged attacks normally

**Phase 3 — `enrage` (<30% HP):**
- `attackSpeed` halved (1200 → 600ms, 2x attack rate)
- `damage` increased by 1.5x
- Emit `boss_enrage` event once on phase transition

### 9.5B Boss Void Reaper — Phase AI [for Bolt]
**File:** `server/game/monsters.js` update() ATTACK state

**Phase 1 — `teleport_slash` (100-70% HP):**
- Every `teleportCooldownMax` (4s): teleport behind closest player (player.x + 40*facing_offset)
- Emit `teleport` event, then immediate melee attack with 1.5x damage
- Track `bossTeleportCooldown`, decrement in ATTACK state

**Phase 2 — `shadow_clones` (70-40% HP):**
- On phase transition: emit `boss_shadow_clones` event with `{count: 2}`
- Clones are regular monsters with 30% of boss HP, 50% damage, type `void_clone`
- Clones die when boss takes a hit (emit `clone_death` after boss `takeDamage`)
- Re-spawn clones every 20s

**Phase 3 — `void_storm` (<40% HP):**
- Every `voidPulseCooldownMax` (5s): emit `void_pulse` event with `{x, y, radius: 150, damage: 40}`
- Socket handler applies AoE damage to all players in radius
- Also summon 1 wraith every 20s (similar to summoner phase)

### 9.5C Bug Fixes [for Bolt]
- [ ] Wraith teleport: clamp to room boundaries (`world.isWalkable()` check, retry up to 5x)
- [ ] chargeCooldown: also decrement in ATTACK state when `behavior === 'melee_charge'`

### 9.5D Sprite Fixes [for Sage]
- [ ] Archer custom sprite in createMonsterSprite() — bow + quiver visual
- [ ] Slime custom sprite — blob shape with eyes
- [ ] Stealth→charge: restore nameText/affixText alpha when stealthed→charging

### Architecture Notes:
- **monsters.js is 823 lines** — boss phase AI will push it past 900. Consider extracting `class BossAI` or a `behaviors/` directory in a future cycle if it crosses 1000 LOC.
- **Boss summon events** require socket-handlers.js to handle `boss_summon` → `world.monsters.push()`. This is a new event flow.
- **Void pulse AoE** requires socket-handlers or index.js game loop to check player distances and apply damage. Similar to existing shrine/trap patterns if any.

### Implementation Order for Bolt:
1. **9.5C** Bug fixes first (quick wins, 15 min)
2. **9.5A** Boss Infernal AI (ranged_barrage → summoner → enrage)
3. **9.5B** Boss Void Reaper AI (teleport_slash → shadow_clones → void_storm)
4. Wire boss events in socket-handlers.js / game loop

---

## 🔥 NEXT PRIORITIES (Phase 10: Crafting & Enchanting)

**Goal:** Gold sink + item customization. Players salvage unwanted items into materials, then use materials to reforge or upgrade gear. Integrates with existing shop/inventory system.

### 10.1 Salvage System — Server [DONE — Bolt, Cycle #72]
**File:** `server/game/crafting.js` (NEW)

New module with salvage logic:

```javascript
// Material types (stackable consumables in inventory)
const MATERIALS = {
  arcane_dust:   { name: 'Arcane Dust',   subType: 'arcane_dust',   gridW: 1, gridH: 1 },
  magic_essence: { name: 'Magic Essence',  subType: 'magic_essence', gridW: 1, gridH: 1 },
  rare_crystal:  { name: 'Rare Crystal',   subType: 'rare_crystal',  gridW: 1, gridH: 1 },
};

// Salvage yields by rarity
const SALVAGE_YIELDS = {
  common:    { arcane_dust: 1 },
  uncommon:  { arcane_dust: 2 },
  rare:      { arcane_dust: 3, magic_essence: 1 },
  epic:      { arcane_dust: 5, magic_essence: 2 },
  legendary: { arcane_dust: 8, magic_essence: 3, rare_crystal: 1 },
  set:       { arcane_dust: 3, magic_essence: 2, rare_crystal: 1 },
};
```

Functions:
- `salvageItem(item)` → returns `{ materials: {arcane_dust: N, ...}, gold: sellPrice/2 }`
- `generateMaterial(subType, quantity)` → returns stackable item for inventory
- Cannot salvage consumables/currency/materials themselves

### 10.2 Reforge System — Server [DONE — Bolt, Cycle #72]
**File:** `server/game/crafting.js`

Re-roll ONE random bonus on an item. Player picks the item, system re-rolls one bonus, player keeps original OR new.

```javascript
const REFORGE_COST = {
  base: { arcane_dust: 3, gold: 50 },
  perReroll: { arcane_dust: 1, gold: 25 }, // cost increases per reroll on same item
};
```

Functions:
- `reforgeItem(item, rerollCount)` → returns `{ newItem, cost }` (new item = clone with 1 bonus changed)
- `getReforgeCost(item, rerollCount)` → returns `{ arcane_dust: N, gold: N }`
- Track reroll count per item: `item.reforgeCount = 0` (increment on accept)
- Bonus pool: same as items.js `BONUS_POOL` for the item type

### 10.3 Upgrade System — Server [DONE — Bolt, Cycle #72]
**File:** `server/game/crafting.js`

Upgrade an item +1/+2/+3. Each level increases primary stat by 15%.

```javascript
const UPGRADE_COSTS = {
  1: { magic_essence: 2, gold: 100 },
  2: { magic_essence: 4, rare_crystal: 1, gold: 250 },
  3: { magic_essence: 8, rare_crystal: 3, gold: 500 },
};
```

Functions:
- `upgradeItem(item, currentLevel)` → returns `{ upgradedItem, cost }`
- `getUpgradeCost(currentLevel)` → returns cost object
- Item gains `item.upgradeLevel = 0|1|2|3` and `item.name = "+N Original Name"`
- Primary stat: weapons → damage +15%/level, armor → armor +15%/level, accessories → biggest bonus +15%/level
- Max level: 3

### 10.4 Socket Events — Server [DONE — Bolt, Cycle #72]
**File:** `server/socket-handlers.js` (add to existing)

New controller events:
- `craft:salvage` → `{ itemId }` — salvage item from inventory → materials + gold
- `craft:reforge` → `{ itemId }` — start reforge → server sends `{ original, reforged, cost }`
- `craft:reforge_accept` → `{ itemId, accept: true/false }` — keep or discard reforged version
- `craft:upgrade` → `{ itemId }` — upgrade item +1 → server validates materials/gold, applies upgrade
- `craft:info` → `{ itemId }` — get costs for reforge/upgrade on this item

Pattern: same as `handleShopBuy`/`handleShopSell` — check resources, mutate inventory, emit response.

### 10.5 Crafting UI — Phone Controller [DONE — Sage, Cycle #73]
**File:** `client/phone/controller.js`

Add "Craft" tab/section to the NPC shop interaction (merchant already has shop):
- **Salvage mode**: tap item in inventory → shows material yield → confirm → item destroyed, materials added
- **Reforge mode**: tap item → shows current stats + cost → confirm → shows original vs new → accept/reject
- **Upgrade mode**: tap item → shows +N preview + cost → confirm → item upgraded
- Material count display in inventory (like gold counter)

### 10.6 TV Crafting Visuals [for Sage]
**File:** `client/tv/hud.js`

- Notification when player crafts: "🔨 PlayerName upgraded Flame Sword to +2"
- Material pickup sparkle effect (different from gold/item sparkles)

### Architecture Notes:
- **No new server files except `crafting.js`** — all socket events go in existing socket-handlers.js
- **Materials are items** — stored in inventory grid as stackable consumables (like potions but new subTypes)
- **Database**: `crafting.js` doesn't need DB — materials are regular inventory items persisted with the character
- **Item mutation**: reforge/upgrade modify item in-place (same uuid) → `player.recalcEquipBonuses()` if equipped
- **Inventory space**: materials are 1×1 stackable, max stack 99 — same as potions

### Implementation Order for Bolt:
1. **10.1** `crafting.js` — MATERIALS, SALVAGE_YIELDS, `salvageItem()`, `generateMaterial()` (30 min)
2. **10.2** `crafting.js` — `reforgeItem()`, `getReforgeCost()` (20 min)
3. **10.3** `crafting.js` — `upgradeItem()`, `getUpgradeCost()` (20 min)
4. **10.4** Socket events in socket-handlers.js — wire all 5 events (30 min)
5. **10.5-10.6** Sage: phone UI + TV visuals (separate cycle)

---

## 🔥 NEXT PRIORITIES (Phase 11: Traps, Chat & Leaderboard)

**Goal:** Three quick-win features that add gameplay depth (traps), social layer (chat), and replayability (leaderboard). Plus refactoring to keep code healthy.

### 11.0 Refactoring: socket-handlers.js split [DONE — Bolt, Cycle #77]
**Why:** socket-handlers.js hit 1100 LOC. Extract crafting handlers.
- [x] Extract crafting handlers → `server/socket-handlers-craft.js` (230 LOC)
- [x] Update imports in index.js (craftHandlers separate from handlers)
- [x] Verify 830/830 tests still pass
- socket-handlers.js: 1110 → 886 LOC

### 11.1 Environmental Traps — Server [DONE — Bolt, Cycle #77]
**File:** `server/game/world.js` (modify room generation) + `server/game/traps.js` (NEW)

Traps are floor hazards placed during dungeon generation. Step on them → take damage or get debuffed.

- [x] `server/game/traps.js` (138 LOC) — TRAP_DEFS, Trap class, generateTrapsForRoom()
- [x] 4 trap types: spike (15 phys + stun), fire (20 fire + burning), poison (10 poison + DoT), void (25 cold + slow)
- [x] ZONE_TRAP_POOLS: catacombs→spike/poison, inferno→fire/spike, abyss→void/poison
- [x] 2-4 traps per room (monster/treasure rooms only, not start/boss)
- [x] Per-player cooldown tracking (5s), radius-based trigger (20px)
- [x] World.traps[] integrated — generation in generateFloor(), serialized for TV
- [x] Game loop trap check — damage + debuff + phone notification + death handling
- [x] player.applyDebuff() method added for stun/burning/poison/slow effects


### 11.2 Multiplayer Chat — Server + Client [DONE — Sage, Cycle #83]
- [x] **Server**: `handleChat()` — validate (max 100, trim, non-empty), rate limit 1/sec, broadcast to game+controller
- [x] **Phone**: MSG button, collapsible input, Enter/send, last 3 messages floating, 5s auto-fade
- [x] **TV**: Speech bubbles above players (4s fade), chat log bottom-left (5 msgs, 15s fade)
- [x] **CSS**: Chat wrapper, focus glow, slide-in animation, MSG button styling

### 11.3 Leaderboard — Server + Client [DONE — Bolt, Cycle #87]

Track run stats and show top players. Drives replayability.

**A) Database — `server/game/database.js`**

Add to `_createTables()` (after line 58):
```sql
CREATE TABLE IF NOT EXISTS leaderboard (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player_name TEXT NOT NULL,
  character_class TEXT NOT NULL,
  level INTEGER NOT NULL,
  floor_reached INTEGER NOT NULL,
  kills INTEGER NOT NULL,
  gold_earned INTEGER NOT NULL,
  time_seconds INTEGER NOT NULL,
  victory INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Add to `_prepareStatements()` (after line 82):
```javascript
this._stmtLeaderboardInsert = this.db.prepare(`
  INSERT INTO leaderboard (player_name, character_class, level, floor_reached, kills, gold_earned, time_seconds, victory)
  VALUES (@player_name, @character_class, @level, @floor_reached, @kills, @gold_earned, @time_seconds, @victory)
`);
this._stmtLeaderboardTop = this.db.prepare(`
  SELECT * FROM leaderboard ORDER BY victory DESC, floor_reached DESC, time_seconds ASC LIMIT 10
`);
this._stmtLeaderboardPersonal = this.db.prepare(`
  SELECT * FROM leaderboard WHERE player_name = ? ORDER BY victory DESC, floor_reached DESC, time_seconds ASC LIMIT 5
`);
```

Add 3 public methods (same pattern as `saveCharacter`/`loadCharacter`):
- `recordRun(playerName, characterClass, level, floorReached, kills, goldEarned, timeSeconds, victory)` — insert
- `getTopRuns()` → returns array of top 10 runs
- `getPersonalRuns(playerName)` → returns array of player's top 5

**B) Victory recording — `server/index.js` (line 661)**

After `saveAllPlayers()` at line 661, insert leaderboard recording:
```javascript
// Record leaderboard entry for each player
for (const ps of playerStats) {
  gameDb.recordRun(ps.name, ps.characterClass, ps.level, FLOOR_NAMES.length, ps.kills, ps.gold, Math.floor(elapsed / 1000), 1);
}
```

Data available in scope: `playerStats` (array with name, characterClass, level, kills, gold), `elapsed` (ms), `FLOOR_NAMES.length`.

**C) Socket events — `server/socket-handlers.js`**

Add 2 new exports:
```javascript
exports.handleLeaderboardGet = function(socket, data, ctx) {
  const entries = ctx.gameDb.getTopRuns();
  socket.emit('leaderboard:data', { entries, type: 'top' });
};

exports.handleLeaderboardPersonal = function(socket, data, ctx) {
  const player = ctx.players.get(socket.id);
  if (!player) return;
  const entries = ctx.gameDb.getPersonalRuns(player.name);
  socket.emit('leaderboard:data', { entries, type: 'personal' });
};
```

Wire in `index.js` (around line 137, with other handlers):
```javascript
socket.on('leaderboard:get', (data) => handlers.handleLeaderboardGet(socket, data, ctx));
socket.on('leaderboard:personal', (data) => handlers.handleLeaderboardPersonal(socket, data, ctx));
```

**D) Phone UI — `client/phone/screens.js`**

Follow quest/shop/craft pattern (create + toggle + render):
- `createLeaderboardScreen()` — fixed HTML structure with 2 tabs (Top 10 / My Runs)
- `toggleLeaderboard()` — show/hide overlay
- `renderLeaderboard(entries, type)` — populate rows from server data

Add to public API (line 743+):
```javascript
createLeaderboardScreen,
toggleLeaderboard,
renderLeaderboard,
```

**E) Phone button — `client/phone/index.html`**

Add LDB button in util-row (next to MSG button):
```html
<button id="btn-leaderboard" class="action-btn ldb-btn">LDB</button>
```

Wire in `controller.js`:
```javascript
document.getElementById('btn-leaderboard').addEventListener('click', () => {
  socket.emit('leaderboard:get');
  Screens.toggleLeaderboard();
});
socket.on('leaderboard:data', (data) => {
  Screens.renderLeaderboard(data.entries, data.type);
});
```

**F) Phone CSS — `client/phone/style.css`**

Leaderboard overlay + table styles. Follow craft/shop pattern. Gold/green accent for victories.

**Columns:** Rank | Name | Class | Lvl | Floor | Kills | Time | Victory badge

**Implementation order for Bolt:**
1. **A** — database.js: table + statements + methods (~30 LOC)
2. **B** — index.js: victory recording (~5 LOC)
3. **C** — socket-handlers.js: 2 handlers (~15 LOC)
4. **D** — screens.js: leaderboard screen (~120 LOC)
5. **E** — controller.js + index.html: button + events (~15 LOC)
6. **F** — style.css: table styles (~40 LOC)

### 11.4 Trap Visuals — TV [DONE — Sage, Cycle #78]
- [x] 4 procedural trap textures: spike (gray grate), fire (red glow), poison (green bubbles), void (purple swirl)
- [x] Persistent trap sprites with per-type animation (fire flickers, poison bobs, void pulses, spike shines)
- [x] trap:trigger event → AOE burst (type-colored), camera shake, damage/dodge text
- [x] Floor transition cleanup (trap sprites destroyed on dungeon:enter)

### 11.5 Trap Indicators — Phone [DONE — Sage, Cycle #78]
- [x] Stun debuff indicator (⚡ with yellow styling) added to reconnect.js
- [x] `.debuff-stun` CSS (yellow background/border)
- [x] `.notification-toast.trap` CSS (purple accent)
- [x] Existing fire_dot/slow debuff display covers burning/poison/slow trap effects

### 11.6 Refactoring: game.js + controller.js splits [DONE — Bolt, Cycle #82]
**Why:** game.js (1231 LOC) and controller.js (1183 LOC) both exceed 1000. Chat will add LOC to both → split first.

**A) game.js (1231 → ~878 LOC) — extract 2 modules:**

1. **`client/tv/effects.js`** (~166 LOC) — environment rendering:
   - Healing shrine rendering (lines 446-537, 92 LOC): sprite creation, orbit dots, active animation, cracked appearance, cleanup
   - Environmental trap rendering (lines 539-580, 42 LOC): per-type animations (fire flicker, poison bob, void pulse, spike shine), cleanup
   - Shop NPC rendering (lines 389-418, 30 LOC): sprite, label, bobbing animation
   - Each section is self-contained, receives `scene` as arg, manages own sprite maps
   - Pattern: `updateShrines(scene, state)`, `updateTraps(scene, state)`, `updateShopNpc(scene, state)`

2. **`client/tv/combat-fx.js`** (~187 LOC) — combat visual effects:
   - Combat event processor (lines 582-701, 120 LOC): damage numbers, 6 skill FX, dodge, heal, levelup, buff, teleport, trap trigger
   - Skill FX methods (lines 728-794, 67 LOC): `spawnAoeEffect()`, `spawnProjectile()`, `spawnBuffEffect()`, `spawnTeleportEffect()`
   - Pattern: `processCombatEvents(scene, events)` + exported FX spawners

**B) controller.js (1183 → ~973 LOC) — extract 1 module:**

1. **`client/phone/stats-ui.js`** (~210 LOC) — stats & tooltip:
   - `renderStats()` (lines 798-914, 117 LOC): core stats, resistance display, set bonuses, stat allocation buttons
   - `showTooltip()` / `hideTooltip()` (lines 916-1007, 92 LOC): item details, rarity colors, equip/unequip/drop actions
   - Self-contained UI rendering, no event listeners on global state
   - Expose via `window.StatsUI = { renderStats, showTooltip, hideTooltip }`

**C) Update HTML script tags:** `client/tv/index.html` (add effects.js + combat-fx.js), `client/phone/index.html` (add stats-ui.js)

### Implementation Order (updated):
1. ~~**11.0** Refactoring~~ ✅ DONE
2. ~~**11.1** Traps~~ ✅ DONE
3. ~~**11.4-11.5** Visuals~~ ✅ DONE
4. ~~**11.6** Refactoring~~ ✅ DONE
5. ~~**11.2** Chat~~ ✅ DONE
6. ~~**11.3** Leaderboard~~ ✅ DONE
7. ~~**11.7** Leaderboard polish~~ ✅ DONE (Sage Cycle #88)

---

## 🔥 NEXT PRIORITIES (Phase 12: Difficulty & New Game Plus)

**Goal:** Endgame content loop. After beating the dungeon, players can restart at higher difficulty with scaling rewards. Drives replayability beyond the first victory.

### 12.0 Refactoring: controller.js split [DONE — Bolt, Cycle #92]
**Why:** controller.js at 1102 LOC — only file over 1000 threshold.

Extract `client/phone/chat-ui.js` (~80 LOC):
- `showChatMessage()`, `renderChatMessages()`, `sendChat()`, `toggleChatInput()`, chatMessages array, MAX_CHAT_DISPLAY
- Pattern: IIFE module, `ChatUI.init(socket)` for deferred binding
- controller.js drops to ~1020 LOC

Extract `client/phone/death-victory.js` (~120 LOC):
- `showDeathScreen()`, `hideDeathScreen()`, death countdown logic
- `showVictoryScreen()`, `hideVictoryScreen()`, victory button wiring
- Pattern: IIFE module, `DeathVictory.init(socket)` for socket binding
- controller.js drops to ~900 LOC

Update phone index.html script tags (before controller.js).

### 12.1 Difficulty System — Server [DONE — Sage, Cycle #93]
**File:** `server/game/world.js` (add difficulty scaling)

**Difficulty levels:**
| Difficulty | Monster HP | Monster DMG | Elite % | XP Mult | Gold Mult | Loot Tier | Unlock |
|-----------|-----------|------------|---------|---------|-----------|-----------|--------|
| Normal | 1.0x | 1.0x | base | 1.0x | 1.0x | base | Default |
| Nightmare | 1.5x | 1.3x | +10% | 1.5x | 1.5x | +1 | Beat Normal |
| Hell | 2.5x | 1.8x | +20% | 2.5x | 2.0x | +2 | Beat Nightmare |

**Implementation:**
- `ctx.difficulty = 'normal'|'nightmare'|'hell'` — stored in game state
- `world.generateFloor()` receives difficulty → scales monster stats
- Monster constructor: `hp *= difficultyScale.hp`, `damage *= difficultyScale.dmg`
- Elite spawn chance: `baseChance + difficultyBonus`
- Loot generation: `effectiveFloor = floor + difficultyTierBonus`
- Player unlock tracking: `player.unlockedDifficulties = ['normal']` persisted in DB

### 12.2 New Game Plus — Server [Steps A-C DONE — Bolt, Cycle #97]
**Files:** `server/index.js`, `server/game/database.js`, `client/phone/death-victory.js`

**Architecture decision:** Use leaderboard-based unlock detection (simplest, no DB migration needed).
- If player has a `victory=1` entry at difficulty X → they can play X+1.
- Query: `SELECT DISTINCT difficulty FROM leaderboard WHERE player_name=? AND victory=1`

**Step A — Add `difficulty` column to leaderboard** (`server/game/database.js`)
1. In `_createTables()` line 63-74: add `difficulty TEXT DEFAULT 'normal'` after `victory INTEGER`
2. In `_stmtLeaderboardInsert` line 100-105: add `difficulty` as 9th positional param
3. In `_stmtLeaderboardTop` line 107-111: change ORDER to `difficulty DESC, victory DESC, floor_reached DESC, time_seconds ASC`
4. In `recordRun()` (line ~160): add `difficulty` param (9th), pass to `_stmtLeaderboardInsert.run()`
5. Add new method:
```javascript
getUnlockedDifficulties(playerName) {
  // Returns array like ['normal'] or ['normal','nightmare']
  const rows = this.db.prepare(
    "SELECT DISTINCT difficulty FROM leaderboard WHERE player_name = ? AND victory = 1"
  ).all(playerName);
  const unlocked = ['normal']; // always available
  const won = rows.map(r => r.difficulty);
  if (won.includes('normal')) unlocked.push('nightmare');
  if (won.includes('nightmare')) unlocked.push('hell');
  return [...new Set(unlocked)];
}
```

**Step B — Record difficulty in victory flow** (`server/index.js`)
1. Line 673 `gameDb.recordRun(...)`: add `gameDifficulty` as 9th arg
2. Line 660-664 `victoryData`: add `difficulty: gameDifficulty` and `unlockedNext` (the newly unlocked tier name or null)

**Step C — game:restart accepts difficulty** (`server/index.js`)
1. Line 148: change `socket.on('game:restart', () => {` to `socket.on('game:restart', (data) => {`
2. After line 148, add validation:
```javascript
const requestedDiff = (data && data.difficulty) || 'normal';
const player = players.get(socket.id);
if (player) {
  const unlocked = gameDb.getUnlockedDifficulties(player.name);
  if (!unlocked.includes(requestedDiff)) {
    socket.emit('notification', { text: 'Difficulty locked!', type: 'error' });
    return;
  }
}
gameDifficulty = requestedDiff;
```
3. Line 152 already uses `gameDifficulty` — no change needed after setting it above

**Step D — Victory screen sends difficulty** (`client/phone/death-victory.js`)
1. Line 109: change `_socket.emit('game:restart')` to `_socket.emit('game:restart', { difficulty: _selectedDifficulty || 'normal' })`
2. In `showVictoryScreen(data)`: store `data.difficulty` and `data.unlockedNext`, show difficulty badge
3. Replace single NEW GAME button with difficulty selector (3 buttons: Normal/Nightmare/Hell with lock state)

**Step E — Leaderboard shows difficulty** (`client/phone/screens.js`)
1. In `renderLeaderboard()`: add difficulty badge/icon per entry

**Bolt should do Steps A-C (server). Sage will handle D-E (UI) in her cycle.**

**Note from Rune (Cycle #95):** `goldMult` in DIFFICULTY_SCALES is defined but unused. Apply it to chest loot gold in `world.js:spawnChestLoot()` and monster gold drops.

### 12.3 Difficulty UI — Phone [DONE — Sage, Cycle #98]
**Files:** `death-victory.js`, `controller.js`, `screens.js`, `index.html`, `style.css`

- [x] Victory screen: 3 difficulty buttons (Normal/Nightmare/Hell) with lock state + unlock animation
- [x] HUD difficulty badge (NM/HELL) on status bar
- [x] Leaderboard difficulty badges per entry
- [x] Full CSS for all difficulty UI elements

### 12.4 Difficulty Visual Scaling — TV [for Sage — low priority, cosmetic]
**Files:** `client/tv/game.js`, `client/tv/hud.js`

- Nightmare: Darker ambient, red-tinted monsters, "Nightmare" zone subtitle
- Hell: Black ambient, fire particles everywhere, "Hell" zone subtitle, boss HP bars red
- Difficulty badge on TV HUD (top-right corner)

**Phase 12 Status:** ✅ FUNCTIONALLY COMPLETE (12.0-12.3, 12.5 done, 972 tests). 12.4 is cosmetic polish — can be done anytime.

---

## 🔥 Phase 13: Talent Trees & Passive Skills

### Overview
Each class (warrior, ranger, mage) gets a unique talent tree with 3 branches (12 talents per class, 36 total). Players spend talent points (1 per level, earned on level-up). Talents provide passive bonuses, skill upgrades, and unique class mechanics. Respec available at town NPC for gold cost.

### 13.0 Talent Data & Engine [DONE — Bolt, Cycle #102]
**File:** `server/game/talents.js`

Define talent tree structure per class:
```
warrior: { branch1: "Berserker" (offense), branch2: "Sentinel" (defense), branch3: "Warlord" (party) }
ranger:  { branch1: "Marksman" (ranged),  branch2: "Trapper" (utility),  branch3: "Beastmaster" (summon) }
mage:    { branch1: "Pyromancer" (fire),   branch2: "Frost" (control),    branch3: "Arcane" (mana) }
```

Each talent: `{ id, name, desc, branch, tier (1-4), maxRank (1-3), requires: [talentId], effects: [...] }`
Tier gates: tier 2 needs 3 points in branch, tier 3 needs 6, tier 4 needs 9.

Effect types:
- `stat_bonus`: `{ stat: 'strength', value: 2, per_rank: true }`
- `skill_upgrade`: `{ skill: 'whirlwind', property: 'damage_mult', value: 0.15 }`
- `proc_chance`: `{ trigger: 'on_hit', effect: 'bleed', chance: 0.10, duration: 3000 }`
- `aura`: `{ stat: 'damage', value: 0.05, radius: 3, party: true }`

Engine functions:
- `getTalentTree(characterClass)` — returns full tree structure
- `canAllocate(playerTalents, talentId)` — checks tier gate + prereqs + available points
- `allocateTalent(playerTalents, talentId)` — returns updated talent map
- `computeTalentBonuses(playerTalents, characterClass)` — aggregate all effects into stat bonuses
- `getAvailablePoints(level, playerTalents)` — level minus total allocated points

### 13.1 Player Integration [DONE — Bolt, Cycle #102]
**Files:** `server/game/player.js`, `server/socket-handlers.js`, `server/index.js`

1. `player.talents` — Map of `{ talentId: rank }` (persisted in DB characters table as JSON)
2. `player.recalcTalentBonuses()` — called on level-up and talent allocation, merges talent bonuses into player stats
3. Socket events:
   - `talent:allocate` (phone → server): `{ talentId }` → validates + applies + broadcasts update
   - `talent:respec` (phone → server): clears all talents, costs gold (100 * level)
   - `talent:tree` (server → phone): sends full tree + current allocation on connect/update
4. Talent bonuses apply to:
   - Base stats (str/dex/int/vit) — additive
   - Skill damage — multiplicative
   - Proc effects — registered in combat.js hit handler
   - Party auras — checked in combat.js `getPartyBuffs()`

### 13.2 Database Persistence [DONE — Bolt, Cycle #102]
**File:** `server/game/database.js`

1. Add `talents TEXT DEFAULT '{}'` to characters table (JSON string of `{ talentId: rank }`)
2. Save/load talents in `saveCharacter()` / `loadCharacter()`
3. No migration needed — SQLite `DEFAULT '{}'` handles new column gracefully

### 13.3 Talent UI — Phone [DONE — Sage, Cycle #103]
**Files:** `client/phone/talents-ui.js` (NEW), `client/phone/index.html`, `client/phone/style.css`

1. New screen accessible from stats panel ("Talents" tab/button)
2. Tree visualization: 3 columns (branches), 4 rows (tiers), connecting lines
3. Each talent node: icon + name + rank (e.g., "2/3"), tap to allocate
4. Locked nodes: grayed out with lock icon + requirement tooltip
5. Available points counter at top
6. Respec button at bottom (shows gold cost)
7. Branch headers with class-specific colors

### 13.4 Talent Visual Feedback — TV [for Sage]
**Files:** `client/tv/hud.js`, `client/tv/effects.js`

1. Level-up popup: "Talent point available!" notification
2. Talent proc visual effects (e.g., bleed → red ticks, frost → blue slow aura)
3. Party aura visual radius indicator around player sprite

### 13.5 Talent Balance & Testing [for Trace]
**File:** `server/tests/talents.test.js` (NEW)

Test categories:
- Tree structure validation (all 36 talents, tier gates, prereqs)
- Allocation logic (canAllocate, max rank, point budget)
- Respec (clears all, refunds points, charges gold)
- Stat computation (bonuses aggregate correctly)
- Integration: talents affect combat damage calculations
- Persistence: save/load round-trip

### Implementation Order for Phase 13:
1. **13.0** Talent data + engine (Aria designs, Bolt implements)
2. **13.2** DB persistence (Bolt, quick — 1 column + JSON)
3. **13.1** Player + combat integration (Bolt, core work)
4. **13.3** Phone talent UI (Sage)
5. **13.4** TV visuals (Sage)
6. **13.5** Tests (Trace, can start after 13.0)

---

### 12.5 Leaderboard — Difficulty Tracking [DONE — Bolt, Cycle #97]
**File:** `server/game/database.js`
- [x] `difficulty` column in leaderboard CREATE TABLE (not ALTER — clean schema)
- [x] CASE-based sort: hell > nightmare > normal (alphabetical DESC was wrong)
- [x] `recordRun()` accepts difficulty as 9th param, defaults to 'normal'
- [x] `getUnlockedDifficulties()` — victory-based unlock detection
- [x] `getPersonalRuns()` — same CASE-based difficulty sort
- [x] 22 tests in `new-game-plus.test.js` covering all DB difficulty logic

---

### Phase 11 Review Notes (Cycle #85 — Rune)
- **CRITICAL XSS FIXED**: `controller.js:renderChatMessages()` used `innerHTML` with unsanitized user text — replaced with `createElement` + `textContent` DOM construction.
- **Injection hardened**: `stats-ui.js` tooltip action buttons used `onclick="StatsUI.equipItem('${item.id}')"` string interpolation — replaced with `addEventListener('click', ...)` closures to prevent potential ID injection.
- **effects.js**: CLEAN — no issues, proper sprite lifecycle, all cleanup paths verified.
- **combat-fx.js**: CLEAN — all 6 skill FX properly scoped, no memory leaks.
- **stats-ui.js**: Resistance display, set bonuses, stat allocation — all correct DOM construction.
- **Chat server handler**: Validation solid (type check, trim, length cap, rate limit). Name comes from server `player.name`, not client data — prevents spoofing.

### Phase 7 Review Notes (Cycle #55 — Rune)
- `damage-types.js`: `calcResistance()` exported+tested but never imported by game code. `player.js` caps resistances inline in `recalcEquipBonuses()`. Harmless but could be consolidated.
- `monsters.js`: `Monster.takeDamage()` duplicates the armor formula from `applyArmor()` in damage-types.js. Same formula, DRY concern for future maintenance.
- Resistance items: only armor pieces roll resist bonuses (by design). Weapons/accessories cannot roll resist.
- Boss phase `damageType` overrides work correctly in attack event emission.

### Phase 8 Review Notes (Cycle #60 — Rune)
- **3 bugs fixed**: Missing null guards on `as.bonuses` iteration in game.js:826, controller.js:108, controller.js:870. Would crash if server sent set data with null bonuses array. Added `if (!as.bonuses) continue;` guards.
- **1 defensive fix**: controller.js tooltip `activeBonuses` fallback now checks for explicit null (`(setInfo && setInfo.bonuses) ? ... : []`).
- `spellDamagePercent` is stored in setBonuses but never applied to `spellPower` stat — works because combat.js reads setBonuses directly. Consistent with damagePercent/critDamagePercent pattern.
- `maxMana` naming in set defs vs `maxMp` property in Player — works but inconsistent naming. Low priority.
- Crit damage stacking is multiplicative (base 2x × dagger 1.2x × set 1.3x = 3.12x for Shadowweave rogue). Intentional power curve.
- Cross-class set equipping has no validation — any class can wear any set. Could be a feature or a bug depending on design intent.
- No validation prevents calling `recalcSetBonuses()` independently of `recalcStats()`, but in practice it's always called via `recalcEquipBonuses()` chain. Safe by convention.

## Open Bugs

### Found in Cycle #44, Fixed in Cycle #45 (Rune)

- [x] [BUG/HIGH] `socket-handlers.js:handleDisconnect` — **Double disconnect leaks timer, nukes reconnected player's inventory.** **Fixed:** `handleDisconnect` now checks `disconnectedPlayers.has(player.name)` and `clearTimeout()`s the existing timer before creating a new grace entry.
- [x] [BUG/MEDIUM] `socket-handlers.js:handleJoin` reconnect path — **Reconnect bypasses 2-player cap.** **By-design:** The grace period acts as a slot reservation. Reconnecting player had a prior claim; temporarily allowing 3 active players is acceptable. Documented with comments in `handleJoin`.
- [x] [BUG/LOW] `socket-handlers.js:handleJoin` — **Name-only session matching allows session hijacking.** **Documented:** Added comment explaining the design limitation (no auth system) and noting that a session token would prevent accidental hijacking. No code change — auth is out of scope for this game.
- [x] [BUG/LOW] `server/index.js:game:restart` — **Restart does not clear disconnected players or their grace timers.** **Fixed:** `game:restart` handler now iterates `disconnectedPlayers` Map, `clearTimeout()`s each timer, resets `disconnected` flag to `false`, and clears the Map.

### Found in Cycle #49 (Trace — affix QA)

- [x] [BUG/HIGH] `combat.js:427-429` — **Vampiric double-heal.** `processAffixOnDealDamage()` already heals the monster internally (`AFFIX_DEFS.vampiric.onDealDamage` at affixes.js:99 does `monster.hp = Math.min(maxHp, hp + heal)`). Then `processMonsterAttack()` adds the heal AGAIN on line 429. Monster heals 2x the intended amount. **Fixed (Rune, Cycle #50):** Removed the redundant `monster.hp` assignment in `processMonsterAttack()` — the affix's `onDealDamage` already handles healing internally.
- [x] [BUG/MEDIUM] `combat.js:74-75` + `monsters.js:465` — **Shielding does not fully block damage.** `modifyDamageByAffixes` returns 0 when shield is active, but `Monster.takeDamage(0)` applies `Math.max(1, ...)` so the monster still takes 1 damage per hit. **Fixed (Rune, Cycle #50):** Added `if (amount <= 0) return 0;` early return at the top of `Monster.takeDamage()`, before the `Math.max(1, ...)` armor reduction.
- [x] [BUG/MEDIUM] `combat.js:176-195,229-248,279-297,333-352` — **Skill kills missing elite data in death events.** When a skill (AOE/single/multi/dot) kills an elite monster, the `combat:death` event does not include `isElite`, `eliteRank`, or `affixEvents` (fire explosion). Only `playerAttack()` includes these fields. The TV client won't show elite death effects or fire explosions for skill kills. **Fixed (Rune, Cycle #50):** Added `isElite`, `eliteRank`, and `affixEvents` (via `processAffixOnDeath`) to all 4 skill death event paths (aoe, single, multi, dot).

### Fixed (Cycle #35)
- [x] ~~[BUG/HIGH] sprites.js:88-89 — Missing null guards on partial player cleanup~~ FIXED
- [x] ~~[BUG/HIGH] hud.js — _destroyVictoryScreen() infinite tween leak~~ FIXED (killTweensOf)
- [x] ~~[BUG/HIGH] server/index.js — Victory race condition~~ FIXED (synchronous gameWon flag)
- [x] ~~[BUG/MEDIUM] sprites.js — Monster type string matching~~ FIXED (uses m.type field now)
- [x] ~~[BUG/MEDIUM] controller.js — Victory/dialogue overlay~~ FIXED (dismisses dialogue first)

### Phase 11 Review Notes (Cycle #80 — Rune)
- **3 bugs fixed**: `combat:player_death` events from void_pulse, affix_debuff, and trap sources were missing `targetId` field. The phone death handler (index.js:561-563) matches on `event.targetId` — without it, deaths from these sources silently failed (no "You died!" notification, no gold drop, no `player:death` event). All three fixed by adding `targetId: player.id`.
- void_pulse and affix_debuff bugs were **pre-existing** (before Phase 11). Trap death bug was introduced in Cycle #77.
- Crafting extraction (socket-handlers → socket-handlers-craft) is clean. `pendingReforges` Map correctly shared via module export.
- Trap system review: well-structured, per-player cooldowns prevent exploit, zone-specific pools create thematic variety.
- `applyDebuff()` mapping (stun→slow/0, burning→fire_dot/3, poison→fire_dot/2, slow→slow/0.5) reuses existing debuff system cleanly.

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
- Sound module shared between TV + phone (client/shared/sound.js)
- 7 floors defined (Dusty Catacombs → Throne of Ruin), floor 7 = final
- Boss Knight has 3-phase AI (melee → charge → aoe_frenzy)
- 3 classes × 3 skills = 9 total skills with cooldowns
