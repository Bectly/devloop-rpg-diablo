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

## Architecture Notes (Updated Cycle #136)
**Current LOC:** index.js 1114, world.js 1037, phone/controller.js 1005, monsters.js 982, tv/sprites.js 893, combat.js 872, player.js 821, tv/game.js 903.
**Tests:** 1220/1220 PASS, 26 suites.
**Over 1K:** index.js (1114), world.js (1037), controller.js (1005) — candidates for Phase 16.0 refactoring.
**Phases 1-15 COMPLETE.** 0 open bugs. Spirit wolf reviewed + hardened (Cycle #135).
**Next:** Phase 16 (Skill Rework & Active Abilities) — extract skills.js, projectile system, tactical skill redesign.

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

### [BUG] 13.0b Tier 4 capstone unreachable — FIXED (Rune, Cycle #105)
~~Tier 4 gate requires 9 points in branch, but T1(3)+T2(3)+T3(2)=8 max.~~
**Fix:** T4 gate lowered from 9→8 in server + client. Tests updated.

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
1. **13.0** Talent data + engine (Aria designs, Bolt implements) ✅
2. **13.2** DB persistence (Bolt, quick — 1 column + JSON) ✅
3. **13.1** Player + combat integration (Bolt, core work) ✅
4. **13.3** Phone talent UI (Sage) ✅
5. **13.5** Tests (Trace, 69 tests) ✅
6. **13.0b** Bug fixes (Rune — T4 gate, data shape) ✅

### 13.6 Talent Combat Bonuses [DONE — Bolt, Cycle #107]
**File:** `server/game/combat.js`

Rune noted (Cycle #105): talent passives are computed by `computeTalentBonuses()` but **never applied in combat.js**. Three critical gaps:

1. **`damage_percent`** in `calcPlayerDamage()` (after line 58, after set bonus):
   ```js
   if (player.talentBonuses?.passives?.damage_percent) {
     baseDamage = Math.floor(baseDamage * (1 + player.talentBonuses.passives.damage_percent / 100));
   }
   ```
   Talents affected: Rampage (warrior_berserker_t2: +10%/rank)

2. **`spell_damage_percent`** in skill damage (after line 199, after set spell bonus):
   ```js
   if (isSpell && player.talentBonuses?.passives?.spell_damage_percent) {
     baseDmg = Math.floor(baseDmg * (1 + player.talentBonuses.passives.spell_damage_percent / 100));
   }
   ```
   Talents affected: Combustion (mage_pyromancer_t2: +12%/rank), Fire Mastery (mage_pyromancer_t3)

3. **`crit_damage_percent`** in crit multiplier (after line 52, after set crit bonus):
   ```js
   if (isCrit && player.talentBonuses?.passives?.crit_damage_percent) {
     baseDamage = Math.floor(baseDamage * (1 + player.talentBonuses.passives.crit_damage_percent / 100));
   }
   ```
   Talents affected: Eagle Eye (ranger_marksman_t3: +15%/rank)

4. **Proc system** — `procs` array from talents (bleed on_hit, etc.) not checked during combat hit events
5. **Party auras** — `auras` from Warlord branch not aggregated for co-op buff

### 13.7 TV Talent Visuals [DONE — Sage, Cycle #108]
- Level-up "Talent point available!" notification on TV HUD
- Proc VFX (bleed=red particles, frost=blue slow aura)
- Party aura radius glow around player sprite

---

## Phase 14: Endgame — Rift System & Paragon ⚔️

The game has 13 phases of content. What keeps players playing after clearing Hell difficulty? Rifts — randomized endgame dungeons with modifiers and leaderboard integration.

### Architecture Overview

**Rift = modified floor generation with:**
- Random zone theme (not tied to floor progression)
- Rift modifiers (affixes that apply to entire dungeon)
- Timer (beat the rift before time runs out)
- Rift guardian (mega-boss spawns at the end)
- Keystones (currency to open rifts, dropped by bosses)

**Paragon = post-level-cap progression:**
- After reaching max level (currently level-based, ~30ish), XP goes to Paragon levels
- Each Paragon level gives 1 stat point (any stat, no cap)
- Paragon levels shown on leaderboard

### 14.0 Rift Data & Engine [DONE — Bolt, Cycle #107]
**File:** `server/game/rifts.js` (NEW)

```
Rift structure:
{
  id: uuid,
  tier: 1-10,
  modifiers: ['deadly', 'hasty', 'fortified'],
  zone: random zone from existing zones,
  timeLimit: 180 - (tier * 5),  // seconds
  monsterMultiplier: 1.0 + tier * 0.3,
  guardianType: random boss template,
  rewards: { xp: tier*500, gold: tier*200, keystones: tier>=5 ? 1 : 0 }
}
```

Rift modifiers (10 total):
| Modifier | Effect |
|----------|--------|
| deadly | Monsters +50% damage |
| fortified | Monsters +40% HP |
| hasty | Monsters +30% move speed |
| shielded | All elites get Shielding affix |
| burning | Periodic fire damage to players (5% HP/5s) |
| vampiric | Monsters heal 10% on hit |
| cursed | Player healing reduced 50% |
| chaotic | Double monster spawn count |
| armored | Monsters +30% damage reduction |
| empowered | Monsters have +1 affix |

Engine functions:
- `createRift(tier, playerLevel)` — generates rift config
- `getRiftModifiers(tier)` — picks 1 + floor(tier/3) random modifiers
- `createRiftGuardian(tier, zone)` — beefed-up boss monster
- `getRiftRewards(tier, timeRemaining)` — bonus loot for fast clear
- `RIFT_TIERS` — tier definitions with scaling

### 14.1 Rift Floor Generation [DONE — Bolt, Cycle #112]
**File:** `server/game/world.js` (MODIFY)

New method `generateRiftFloor(riftConfig)`:
- Reuses `generateBSPDungeon()` with rift overrides
- Room count: `6 + rift.tier` (7-16 rooms)
- Monster waves scaled by `rift.monsterHpMult` and `rift.monsterDmgMult`
- **Skip** `spawnShopNpc()` and `placeStoryNpcs()` — no shopping in rifts
- Last room type forced to `boss` → spawn Rift Guardian from `createRiftGuardian()`
- Apply rift modifier effects to spawned monsters:
  - `deadly`: monster.damage *= modifier.value
  - `fortified`: monster.maxHp *= modifier.value, monster.hp = monster.maxHp
  - `hasty`: monster.speed *= modifier.value
  - `chaotic`: double spawn count per room
  - `armored`: monster.armor += floor(monster.maxHp * modifier.value)
  - `empowered`: call `rollAffixes()` with eliteBonus +1
- New state fields: `this.riftActive = false`, `this.riftConfig = null`, `this.riftTimer = 0`, `this.riftStartTime = 0`
- Method `startRiftTimer()` and `updateRiftTimer(dt)` — counts down, returns false when expired

### 14.2 Rift Socket Events [DONE — Bolt, Cycle #117]
**Files:** `server/socket-handlers.js`, `server/index.js`, `server/game/player.js`

**BOLT: Follow this step-by-step. Each step is one atomic change.**

#### Step 1: socket-handlers.js — new handlers + state
- Add `require('./game/rifts')` at top (after line 9)
- Add `let pendingRift = null;` module-level state (line ~18)
- Add `handleRiftOpen(socket, data, ctx)`:
  - Get player, validate alive, validate tier 1-10
  - Guard: `world.riftActive` → "Already in a rift"
  - Guard: `pendingRift !== null` → "A rift is already being opened"
  - Guard: `!player.spendKeystone()` → "No keystones!"
  - `createRift(tier, player.level)` → pendingRift
  - Emit `rift:status { state:'pending', tier, modifiers, zone, timeLimit, readyCount, totalPlayers }`
  - If solo (players.size === 1) → auto-call `_enterRift(ctx)`
- Add `handleRiftEnter(socket, data, ctx)`:
  - Add to readySet, emit updated rift:status
  - When all ready → call `_enterRift(ctx)`
- Add internal `_enterRift(ctx)`:
  - `world.generateRiftFloor(riftConfig)`
  - Reposition all players to spawn, revive dead
  - Apply cursed modifier: `p.healReduction = hasCursed ? 0.5 : 1.0`
  - Emit `dungeon:enter` + `floor:change` + `rift:status { state:'active' }` + `stats:update`
- Add `handleRiftCancel(socket, data, ctx)`:
  - Only opener can cancel, refund keystone, clear pendingRift
- Add `handleRiftLeaderboard(socket, data, ctx)`:
  - Rate limit 500ms, `gameDb.getRiftLeaderboard(tier)`, emit response
- Export: `handleRiftOpen`, `handleRiftEnter`, `handleRiftCancel`, `handleRiftLeaderboard`, `clearPendingRift`

#### Step 2: index.js — socket bindings
After `socket.on('leaderboard:personal', ...)` (line ~148):
```
socket.on('rift:open', (data) => handlers.handleRiftOpen(socket, data, ctx));
socket.on('rift:enter', () => handlers.handleRiftEnter(socket, null, ctx));
socket.on('rift:cancel', () => handlers.handleRiftCancel(socket, null, ctx));
socket.on('rift:leaderboard', (data) => handlers.handleRiftLeaderboard(socket, data, ctx));
```

#### Step 3: index.js — game loop: rift timer + burning + expiry
After trap processing, before `combat.clearEvents()`:
- If `world.riftActive`:
  - `world.updateRiftTimer(dt)` every tick
  - Every 1s: emit `rift:timer { remaining, timeLimit }` to both namespaces
  - **Burning modifier**: every 5s, all alive players take 5% maxHp fire damage
  - **Timer expired**: emit `rift:failed`, reset `healReduction`, generate floor 0, reposition players

#### Step 4: index.js — game loop: vampiric modifier
After monster AI update, before player debuffs:
- If `world.riftActive` and has `monster_leech` modifier:
  - Check combat events for monster hits, heal monster 10% of damage dealt

#### Step 5: index.js — rift guardian kill detection
Inside `combat:death` processing, after boss loot chest:
- If `deadMonster.isRiftGuardian && world.riftActive`:
  - `getRiftRewards(tier, remaining, timeLimit)` → distribute gold/xp/keystones
  - `gameDb.recordRiftClear(...)` for leaderboard
  - Emit `rift:complete` to both namespaces
  - `world.endRift()`, reset `healReduction`, generate floor 0, `saveAllPlayers()`

#### Step 6: player.js — healReduction field
- Constructor: `this.healReduction = 1.0;`
- `useHealthPotion()`: multiply heal by `this.healReduction`

#### Step 7: socket-handlers.js — shrine heal reduction
- `handleShrineUse`: apply `healReduction` to HP heal
- `handleInteract` shrine path: same

#### Step 8: index.js — clear rift state on restart
In `game:restart` handler: `handlers.clearPendingRift()`, reset `healReduction`

**Socket Event Reference:**
| Event | Direction | Payload |
|-------|-----------|---------|
| `rift:open` | Phone→Server | `{ tier }` |
| `rift:enter` | Phone→Server | (none) |
| `rift:cancel` | Phone→Server | (none) |
| `rift:leaderboard` | Phone↔Server | `{ tier }` / `{ tier, entries }` |
| `rift:status` | Server→Both | `{ state, tier, modifiers, zone, timeLimit, readyCount?, totalPlayers? }` |
| `rift:timer` | Server→Both | `{ remaining, timeLimit }` |
| `rift:complete` | Server→Both | `{ tier, timeElapsed, timeRemaining, rewards, modifiers }` |
| `rift:failed` | Server→Both | `{ tier, reason:'timeout' }` |

### 14.4 Paragon System [DONE — Bolt, Cycle #112]
**File:** `server/game/player.js` (MODIFY)

Add constants:
```js
const MAX_LEVEL = 30;
```

Modify `gainXp()`:
```js
gainXp(amount) {
  if (!this.alive) return null;
  if (this.level >= MAX_LEVEL) {
    // Paragon XP
    this.paragonXp = (this.paragonXp || 0) + amount;
    const paragonCost = (this.paragonLevel || 0) * 1000 + 1000;
    if (this.paragonXp >= paragonCost) {
      this.paragonXp -= paragonCost;
      this.paragonLevel = (this.paragonLevel || 0) + 1;
      this.freeStatPoints += 1;
      return { level: this.level, paragonLevel: this.paragonLevel, isParagon: true };
    }
    return null;
  }
  this.xp += amount;
  if (this.xp >= this.xpToNext) return this.levelUp();
  return null;
}
```

Add fields to constructor: `this.paragonLevel = 0; this.paragonXp = 0;`
Add to `serializeForPhone()`: `paragonLevel, paragonXp, paragonXpToNext`
Add to `restoreFrom()`: load paragonLevel and paragonXp
Add to `database.js`: `paragon_level INTEGER DEFAULT 0, paragon_xp INTEGER DEFAULT 0`

### 14.7 Leaderboard — Rift Tier Tracking [DONE — Bolt, Cycle #112]
**File:** `server/game/database.js` (MODIFY)

New table in constructor:
```sql
CREATE TABLE IF NOT EXISTS rift_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  player1 TEXT NOT NULL,
  player2 TEXT,
  tier INTEGER NOT NULL,
  time_seconds REAL NOT NULL,
  modifiers TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL DEFAULT 'normal',
  date TEXT NOT NULL DEFAULT (datetime('now'))
)
```

Methods:
- `recordRiftClear(tier, players, timeSeconds, modifiers, difficulty)` — INSERT
- `getRiftLeaderboard(tier)` — SELECT top 20 fastest by tier, ORDER BY time_seconds ASC
- `getPersonalRiftRecords(playerName)` — player's best times per tier

### Implementation Order for Bolt (Cycle #112):
1. **14.4 Paragon** — quick, self-contained, no deps (parallel-safe)
2. **14.1 Rift Floor Gen** — core rift gameplay
3. **14.7 Rift Leaderboard** — DB table + methods (quick)
4. **14.2 Socket Events** — wires everything together (depends on 14.1 + 14.7)

**Bolt should run 14.4 + 14.1 in parallel, then 14.7 + 14.2.**

### 14.3 Keystone System [DONE — Bolt, Cycle #107]
**File:** `server/game/player.js` (MODIFY), `server/game/database.js` (MODIFY)

- `player.keystones` — integer, stored in DB
- Bosses drop keystones (floor 3+ boss kill = 1 keystone, Hell boss = 2)
- Opening a rift costs 1 keystone
- Tier 5+ rifts award 1 keystone on completion (self-sustaining at high tier)

### 14.4 Paragon System [for Bolt]
**File:** `server/game/player.js` (MODIFY)

- After max level, XP accumulates to `player.paragonXp`
- Each Paragon level: `paragonXp >= paragonLevel * 1000`
- Paragon level up → `player.freeStatPoints += 1`
- Paragon levels uncapped (but diminishing returns via cost)
- Display: "Lv.30 (P12)" = level 30, Paragon 12

### 14.5 Rift UI — Phone [DONE — Sage, Cycle #108]
**Files:** `client/phone/rift-ui.js` (NEW), `client/phone/index.html`, `client/phone/style.css`

- Rift portal button (appears when player has keystones, at any floor start room)
- Tier selector (1-10, locked tiers grayed out — unlock by beating previous)
- Modifier preview before entering
- In-rift timer bar at top of phone screen (red when <30s)
- Rift complete/failed overlay with rewards

### 14.6 Rift UI — TV [DONE — Sage, Cycle #108]
**Files:** `client/tv/hud.js` (MODIFY), `client/tv/effects.js` (MODIFY)

- Rift timer bar at top of TV screen (large, visible)
- Rift modifier icons in HUD corner
- Rift portal opening animation (purple vortex)
- Rift Guardian spawn: dramatic entrance (screen shake, purple flash, name reveal)
- Rift complete: victory splash with timer and rewards

### 14.7 Leaderboard — Rift Tier Tracking [for Bolt]
**File:** `server/game/database.js` (MODIFY)

- New table `rift_records`: `(id, player1, player2, tier, time_seconds, modifiers, date)`
- `recordRiftClear(tier, players, time)` — save rift completion
- `getRiftLeaderboard(tier)` — fastest clears per tier
- Phone leaderboard tab: "Rifts" sub-tab showing fastest clears

### 14.8 Tests [DONE — Trace, Cycle #109]
**File:** `server/tests/rifts.test.js` (NEW)

Test categories:
- Rift creation (tier scaling, modifier count, guardian)
- Keystone economy (cost, drops, self-sustaining at tier 5+)
- Timer mechanics (start, tick, expire, complete)
- Modifier effects (deadly damage, fortified HP, etc.)
- Paragon XP (overflow from max level, level-up cost, stat point grant)
- Rift rewards (time bonus, tier scaling)
- Leaderboard integration (record, query, sort)

### Implementation Order for Phase 14:
1. **13.6** Talent combat bonuses (Bolt) — prerequisite gap fix
2. **14.0** Rift engine + data (Bolt)
3. **14.3** Keystones (Bolt, quick — 1 field + drop logic)
4. **14.1** Rift floor generation (Bolt)
5. **14.2** Socket events (Bolt)
6. **14.4** Paragon system (Bolt)
7. **14.5** Rift phone UI (Sage)
8. **14.6** Rift TV visuals (Sage)
9. **14.7** Leaderboard (Bolt)
10. **14.8** Tests (Trace)

---

## Fixed Bugs (Rune review, Cycle #120)
- [x] [BUG/HIGH] `handleInteract` shrine bypass `healReduction` — cursed rift had no effect via interact path
- [x] [BUG/HIGH] `pendingRift` dangling on opener disconnect — blocked all future rift opens
- [x] [BUG/HIGH] Guardian kill `setTimeout` races with new rift open — overwrites new rift floor
- [x] [BUG/MEDIUM] Rift readySet counts disconnected players — stalls rift entry
- [x] [BUG/MEDIUM] `gainXp` single `if` skips level-ups on large XP — changed to `while` loop

## Known Bugs (from Rune review, Cycle #115)

### [BUG] Defensive talent procs never fire [Medium]
**File:** `server/game/combat.js` → `processMonsterAttack()` (line ~644-689)
- Shield Wall (Warrior): 10%/rank block 50% damage — never checked
- Last Stand (Warrior): below 20% HP → 50% DR for 5s — never checked
- Caltrops (Ranger): on dodge slow attacker — never checked
- Ice Barrier (Mage): on hit freeze attacker — never checked
**Fix:** Add `on_take_damage` + `on_dodge` proc loop after `takeDamage` in `processMonsterAttack`

### [BUG] shatter_bonus passive unused [Medium]
**File:** `server/game/combat.js`
- Frost Mage "Shatter" gives +15%/rank damage to frozen targets
- `talentBonuses.passives.shatter_bonus` computed but never read in damage calc
**Fix:** Check in `playerSkill()`/`playerAttack()`: if target frozen, multiply by `(1 + shatter_bonus/100)`

### [BUG] Bleed and poison share one slot [Medium]
**File:** `server/game/combat.js` lines 149-151, 536-537
- Both use `monster.poisonTick`/`poisonDamage`
- Poison Arrow hard-overwrites active bleed
**Fix:** Give bleed own fields (`bleedTick`/`bleedDamage`) + separate `processBleed()` tick

### [BUG] Party aura stats unused [Low] → FIX PLANNED in 15.3
- `getPartyBuffs()` computes `xp_percent`, `attack_speed`, `move_speed` but only `str` is used
- These aura values from Warlord/Beastmaster talents are dead
**Fix:** Detailed plan in Phase 15.3 below — 5 XP locations, attack cooldown reduction, speedMultiplier addition

---

## 🔥 Phase 15: Combat Polish & Talent Completion

### 15.0 Defensive Talent Procs [TOP PRIORITY — Bolt]
**File:** `server/game/combat.js` → `processMonsterAttack()` (line ~691)

Currently defensive procs are defined in talents.js but **never checked** in combat.

**Step A:** In `processMonsterAttack()`, AFTER `target.takeDamage()` (line 691), add defensive proc loop:
```javascript
// After line 691: const dealt = target.takeDamage(event.damage, damageType);
if (target.talentBonuses && target.talentBonuses.procs) {
  const dodged = dealt === -1;
  for (const proc of target.talentBonuses.procs) {
    if (proc.trigger === 'on_take_damage' && !dodged && Math.random() < (proc.chance || 1)) {
      // Shield Wall: block — reduce dealt damage by 50%
      if (proc.effect === 'block') {
        const blocked = Math.floor(dealt * 0.5);
        target.hp = Math.min(target.maxHp, target.hp + blocked); // refund blocked damage
        this.events.push({ type: 'combat:proc', targetId: target.id, effect: 'block', value: blocked });
      }
      // Last Stand: below 20% HP → 50% DR for 5s
      if (proc.effect === 'last_stand') {
        if (target.hp / target.maxHp <= 0.2) {
          target.lastStandTimer = (proc.duration || 5000);
          this.events.push({ type: 'combat:proc', targetId: target.id, effect: 'last_stand' });
        }
      }
      // Ice Barrier: freeze attacker
      if (proc.effect === 'freeze') {
        monster.stunned = Math.max(monster.stunned || 0, proc.duration || 2000);
        this.events.push({ type: 'combat:proc', targetId: target.id, attackerId: monster.id, effect: 'freeze' });
      }
    }
    if (proc.trigger === 'on_dodge' && dodged && Math.random() < (proc.chance || 1)) {
      // Caltrops: slow attacker
      if (proc.effect === 'slow') {
        monster.slowed = Math.max(monster.slowed || 0, proc.duration || 3000);
        this.events.push({ type: 'combat:proc', targetId: target.id, attackerId: monster.id, effect: 'caltrops' });
      }
    }
  }
}
```

**Step B:** Add `lastStandTimer` to Player constructor (default 0). In game loop player update: decrement by dt, apply 50% DR while > 0.

### 15.1 Shatter Bonus (Frozen Target Damage) [Bolt]
**File:** `server/game/combat.js`

`talentBonuses.passives.shatter_bonus` is computed but never consumed.

**Step A:** In `playerAttack()` at line ~118 (after party buffs, before affix mods):
```javascript
if (nearest.stunned > 0 && player.talentBonuses?.passives?.shatter_bonus) {
  damage = Math.floor(damage * (1 + player.talentBonuses.passives.shatter_bonus / 100));
}
```
Note: Use `stunned > 0` as frozen proxy (Ice Barrier freeze sets `monster.stunned`).

**Step B:** Same check in `playerSkill()` for all 4 paths: AOE (~line 310), single (~line 403), multi (~line 487), dot (~line 571).

### 15.2 Separate Bleed/Poison System [Bolt]
**Files:** `server/game/combat.js`, `server/game/monsters.js`, `server/index.js`

Currently bleed (line 149-151) overwrites `poisonTick`/`poisonDamage` — both DoTs share one slot.

**Step A:** Add to Monster class (`monsters.js` constructor):
```javascript
this.bleedTick = 0;
this.bleedDamage = 0;
```

**Step B:** New function in `combat.js` (copy `processPoison` pattern at line 730-745):
```javascript
processBleed(monster, dt) {
  if (monster.bleedTick > 0 && monster.alive) {
    monster.bleedTick -= dt;
    // Tick damage every second (same pattern as processPoison)
    if (/* 1 second elapsed */) {
      monster.takeDamage(monster.bleedDamage || 5);
      this.events.push({ type: 'combat:hit', damageType: 'physical', ... });
    }
  }
}
```

**Step C:** Change bleed proc in `playerAttack()` (line 149-151):
```javascript
// OLD: nearest.poisonTick = ...
// NEW:
nearest.bleedTick = Math.max(nearest.bleedTick || 0, proc.duration || 3000);
nearest.bleedDamage = Math.max(nearest.bleedDamage || 0, bleedDmg);
```

**Step D:** Add `combat.processBleed(monster, dt)` call in game loop (`index.js:371`), right after `processPoison`.

### 15.3 Party Aura Full Implementation [Bolt] ✅ 15.0-15.2 DONE
**Files:** `server/game/combat.js`, `server/game/player.js`
**Status:** `getPartyBuffs()` (line 822-835) aggregates `str`, `xp_percent`, `attack_speed`, `move_speed`. Only `str` is consumed (line 122-125). The other 3 are DEAD CODE.

**Step A — XP aura bonus:** XP is awarded in 5 kill paths in combat.js. Each has this pattern:
```javascript
let xpReward = nearest.xpReward;
if (player.setBonuses && player.setBonuses.xpPercent) {
  xpReward = Math.floor(xpReward * (1 + player.setBonuses.xpPercent / 100));
}
const levelResult = player.gainXp(xpReward);
```
**All 5 locations** (search `let xpReward =`):
- Line 245 — `playerAttack()` basic kill
- Line 376 — `playerSkill()` AOE kill
- Line 463 — `playerSkill()` single kill
- Line 547 — `playerSkill()` multi kill
- Line 636 — `playerSkill()` dot kill

**Insert AFTER setBonuses XP line, BEFORE gainXp, at each location:**
```javascript
// Party aura: XP bonus (Warlord Inspire talent)
if (allPlayers) {
  const partyBuffs = this.getPartyBuffs(allPlayers);
  if (partyBuffs.xp_percent > 0) {
    xpReward = Math.floor(xpReward * (1 + partyBuffs.xp_percent / 100));
  }
}
```
NOTE: `allPlayers` is already available at line 245 (passed to `playerAttack`). For skill kills (lines 376, 463, 547, 636), verify `allPlayers` is in scope — it's passed to `playerSkill()` as parameter.

**Step B — Attack speed aura:** In `playerAttack()` at line 117, `player.startAttackCooldown()` is called. The party aura for attack speed should reduce the cooldown:
```javascript
// AFTER line 117: player.startAttackCooldown();
// AFTER line 126: } (end of party str buff block)
// Add:
if (allPlayers) {
  const partyBuffs = this.getPartyBuffs(allPlayers); // already computed above, reuse variable
  if (partyBuffs.attack_speed > 0) {
    // Reduce attack cooldown by aura % (Warlord Commanding Presence)
    player.attackCooldown = Math.floor(player.attackCooldown * (1 - partyBuffs.attack_speed / 100));
  }
}
```
OPTIMIZATION: `getPartyBuffs()` is already called at line 122. Hoist the result and reuse:
```javascript
const partyBuffs = allPlayers ? this.getPartyBuffs(allPlayers) : null;
if (partyBuffs && partyBuffs.str > 0) damage += partyBuffs.str;
// ... after startAttackCooldown:
if (partyBuffs && partyBuffs.attack_speed > 0) {
  player.attackCooldown = Math.floor(player.attackCooldown * (1 - partyBuffs.attack_speed / 100));
}
```

**Step C — Move speed aura:** In `player.js` `get speedMultiplier()` (line 649-658):
```javascript
get speedMultiplier() {
  let mult = 1.0;
  const slow = this.debuffs.find(d => d.effect === 'slow');
  if (slow) mult = slow.speedMult;
  if (this.setBonuses && this.setBonuses.speedPercent) {
    mult *= (1 + this.setBonuses.speedPercent / 100);
  }
  // NEW: Party aura move speed (Beastmaster Pack Leader)
  if (this.auraMoveBuff > 0) {
    mult *= (1 + this.auraMoveBuff / 100);
  }
  return mult;
}
```
This requires `player.auraMoveBuff` field. Set it periodically in game loop:
```javascript
// In index.js game loop, player update section (~line 270):
const partyBuffs = combat.getPartyBuffs(Array.from(players.values()));
for (const player of players.values()) {
  player.auraMoveBuff = partyBuffs.move_speed || 0;
}
```
Add `this.auraMoveBuff = 0;` to Player constructor.

### 15.4 Spirit Wolf Summon (Ranger T4) [Bolt] ✅ 15.3 DONE
**Files:** `server/game/monsters.js`, `server/game/combat.js`, `server/index.js`, `server/game/player.js`

Talent def in `talents.js:287-294`: `{ type: 'proc_chance', trigger: 'on_kill', effect: 'summon_spirit_wolf', chance: 0.25, damage_percent: 80, radius: 60, duration: 3000 }`

**Step A — Wolf definition + constructor fields:** In `monsters.js`:

A1. Add to `MONSTER_DEFS` (line ~270):
```javascript
spirit_wolf: {
  name: 'Spirit Wolf',
  hp: 60, damage: 14, armor: 2, speed: 200,
  attackRange: 35, attackSpeed: 1000,
  aggroRadius: 150, leashDistance: 300,
  xpReward: 0, lootTier: 0,
  behavior: 'melee',
  damageType: 'physical',
  color: 0xaabbff, size: 12,
}
```

A2. Add fields to `Monster` constructor (line ~290-391):
```javascript
this.friendly = false;   // after this.alive = true;
this.ownerId = null;     // owner player ID for summons
this.expireTimer = 0;    // despawn timer in ms (0 = permanent)
```

A3. Add `createSpiritWolf()` factory (before exports, line ~950):
```javascript
function createSpiritWolf(x, y, ownerPlayer) {
  const wolf = new Monster('spirit_wolf', x, y, 0);
  wolf.friendly = true;
  wolf.ownerId = ownerPlayer.id;
  wolf.maxHp = Math.floor(ownerPlayer.maxHp * 0.3);
  wolf.hp = wolf.maxHp;
  wolf.damage = Math.floor(ownerPlayer.attackPower * 0.8);
  wolf.speed = 200;
  wolf.expireTimer = 10000; // 10s duration
  wolf.aiState = AI_STATES.ALERT;
  return wolf;
}
```
Export: add `createSpiritWolf` to `module.exports`.

**Step B — On-kill proc handler:** In `combat.js` on-kill proc loop (line ~259), add new effect:
```javascript
if (proc.effect === 'summon_spirit_wolf') {
  this.events.push({
    type: 'summon:spirit_wolf',
    playerId: player.id,
    x: nearest.x,
    y: nearest.y,
  });
}
```

**Step C — Game loop: handle summon event + spawn:** In `index.js`, in the combat events processing section (after line ~408, next to `boss_summon` handler):
```javascript
// Handle spirit wolf summon from on-kill proc
for (const event of combatEvents) {
  if (event.type === 'summon:spirit_wolf') {
    const owner = findPlayer(event.playerId); // or players.get(socketId)
    if (owner && !owner.summonedWolf) {
      const wolf = createSpiritWolf(event.x, event.y, owner);
      world.monsters.push(wolf);
      owner.summonedWolf = wolf.id; // store ID, not reference
    }
  }
}
```
Import `createSpiritWolf` from monsters.js at the top.
Add `this.summonedWolf = null;` to Player constructor (player.js, near line 48).

**Step D — Wolf AI: friendly monster update in game loop.** In `index.js` monster update loop (line ~375), BEFORE calling `monster.update(dt, allPlayers)`:
```javascript
// Friendly summon logic (spirit wolf)
if (monster.friendly) {
  // Expire timer
  monster.expireTimer -= dt;
  if (monster.expireTimer <= 0 || !monster.alive) {
    monster.alive = false;
    // Clean up owner reference
    for (const p of allPlayers) {
      if (p.summonedWolf === monster.id) p.summonedWolf = null;
    }
    continue;
  }
  // Simple melee AI: find nearest hostile monster, move toward it, attack
  let nearestEnemy = null;
  let nearestDist = Infinity;
  for (const m of world.monsters) {
    if (m === monster || !m.alive || m.friendly) continue;
    const dx = m.x - monster.x;
    const dy = m.y - monster.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < nearestDist) { nearestDist = d; nearestEnemy = m; }
  }
  if (nearestEnemy && nearestDist <= monster.attackRange) {
    // Attack
    monster.attackCooldown -= dt;
    if (monster.attackCooldown <= 0) {
      monster.attackCooldown = monster.attackSpeed;
      const dealt = nearestEnemy.takeDamage(monster.damage);
      combat.events.push({
        type: 'combat:hit', attackerId: monster.id, targetId: nearestEnemy.id,
        damage: dealt, attackType: 'wolf_bite',
      });
    }
  } else if (nearestEnemy) {
    // Move toward enemy
    const dx = nearestEnemy.x - monster.x;
    const dy = nearestEnemy.y - monster.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
      monster.x += (dx / len) * monster.speed * (dt / 1000);
      monster.y += (dy / len) * monster.speed * (dt / 1000);
    }
  }
  continue; // skip normal hostile monster AI
}
```

**Step E — Owner death cleanup.** In `index.js` player update section (line ~287), after `player.update(dt)`:
```javascript
// Despawn spirit wolf when owner dies
if (player.isDying && player.summonedWolf) {
  for (const m of world.monsters) {
    if (m.id === player.summonedWolf) { m.alive = false; m.expireTimer = 0; }
  }
  player.summonedWolf = null;
}
```

**Step F — serialize() include friendly fields.** In monsters.js `serialize()` method, add:
```javascript
friendly: this.friendly || false,
ownerId: this.ownerId || null,
```
This lets TV client differentiate friendly wolves visually.

**Step G (Sage):** TV sprite — ghostly blue tint for `friendly` monsters. In `sprites.js` monster sprite update, check `m.friendly` → set alpha 0.7 + blue tint. Nameplate in light blue.

### Implementation Order for Bolt:
1. ~~**15.0** Defensive procs~~ ✅ DONE (Cycle #122)
2. ~~**15.1** Shatter bonus~~ ✅ DONE (Cycle #122)
3. ~~**15.2** Bleed/poison split~~ ✅ DONE (Cycle #122)
4. ~~**15.3** Party auras~~ ✅ DONE (Cycle #127)
5. ~~**15.4** Spirit wolf~~ ✅ DONE (Cycle #132, reviewed #135)

---

## 🔥 Phase 16: Skill Rework & Active Abilities

**Goal:** Transform the 9 existing skills from simple buff/damage into tactical abilities with targeting, projectiles, and area effects. Add skill leveling via talent points. Make combat feel like Diablo — active, positioning-based, satisfying.

**Current state:** 3 classes × 3 skills = 9 skills. Most are instant (buff self, deal damage to nearest). No projectiles, no ground targeting, no skill synergies.

### 16.0 Refactoring: Extract Skill Engine [DONE — Bolt, Cycle #137 / Rune Cycle #140]
- [x] `server/game/skills.js` (413 LOC) — 3 shared helpers + 6 per-type handlers
- [x] `combat.js` reduced from 872 → 433 LOC (50% reduction)
- [x] `applyShatter()` deduplicated (skills.js exports, combat.js imports)
- [x] 6 bugs fixed by Rune: keystone rewards, on-kill procs, death/levelup event fields

### 16.1 Projectile System [DONE — Sage, Cycle #138 / Rune Cycle #140]
- [x] `server/game/projectiles.js` (209 LOC) — Projectile class, createProjectile, createProjectileAngled, updateProjectiles
- [x] world.js integration: projectiles array + serialize
- [x] index.js game loop: projectile update before clearEvents
- [x] Bounds fixed to 1970x1330 (world 1920x1280 + 50px margin)
- [x] damageType passed to takeDamage() for elemental projectiles
- [x] 21 tests in projectiles.test.js

### 16.2 Warrior Skill Rework ✅ DONE (Bolt #142, Sage #143, Trace #144, Rune #145)
- [x] 3 new skill types: `spin` (Whirlwind), `charge` (Charging Strike), `buff_debuff` (Battle Shout)
- [x] Fear mechanic: `applyFear()`, FLEE state timer, serialize
- [x] TV visuals: whirlwind particles, charge trail, shockwave, fear purple tint
- [x] 30 tests (phase16-warrior.test.js), 1271/1271 PASS
- [x] Review: talents.js, sets.js, reconnect.js stale refs fixed

### 16.3 Ranger Skill Rework ✅ DONE (Bolt #147, Sage #148, Trace #149, Rune #150)
- [x] 3 new skill types: `volley` (Arrow Volley), `sniper` (Sniper Shot), `shadow_step` (Shadow Step)
- [x] `projectile:create` event bridge (skills.js → index.js → projectiles.js)
- [x] Shadow decoy system (friendly monster with expireTimer)
- [x] dodge_up buff wired in player.takeDamage()
- [x] TV visuals: arrow volley fan, sniper trail, shadow step smoke/decoy sprite
- [x] 27 tests (phase16-ranger.test.js), 1298/1298 PASS
- [x] Review: 2 critical bugs fixed (decoy despawn, dodge buff), stale refs cleaned

### 16.4 Mage Skill Rework [DONE ✓]
- [x] Fireball → **Meteor Strike** (projectile+AOE r80, 2.5x spellPower, fire)
- [x] Frost Nova → **Blizzard** (3-hit AOE r120, 1.2x spellPower, cold, slow 3s)
- [x] Teleport → **Chain Lightning** (4 bounces, 2.0x spellPower, 50% falloff, fire)
- [x] `useSpellPower: true` flag replaces hardcoded isSpell name checks
- [x] TV visuals: meteor cast, blizzard ring+shards, jagged lightning arcs
- [x] 31 tests (phase16-mage.test.js), 1329/1329 PASS
- [x] Review: dead teleport code removed, stale SPEC.md fixed

### 16.5 Skill Leveling [DONE ✓]

**Design:** Each skill levels 1→5 using **talent points** (shared pool with passive talents). Players choose between passive talents and raw skill power. Cost: 1 talent point per level (4 pts to max one skill, 12 pts for all 3).

**Scaling per level:**
| Level | Damage | Cooldown | MP Cost | Special |
|-------|--------|----------|---------|---------|
| 1 | 1.0x (base) | 100% | 100% | — |
| 2 | 1.15x | 90% | 95% | — |
| 3 | 1.30x | 80% | 90% | — |
| 4 | 1.45x | 70% | 85% | — |
| 5 | 1.60x | 60% | 80% | **Unique bonus** |

**Level 5 unique bonuses:**
| Skill | Bonus |
|-------|-------|
| Whirlwind | +2 hits (3→5) |
| Charging Strike | 1s stun on impact |
| Battle Shout | +5% crit to party |
| Arrow Volley | +2 arrows (5→7) |
| Sniper Shot | Guaranteed crit |
| Shadow Step | 2 decoys instead of 1 |
| Meteor Strike | Burning ground DOT (3s, 0.5x spellPower/tick) |
| Blizzard | Freeze instead of slow (2s) |
| Chain Lightning | +2 max bounces (4→6) |

**Implementation order for Bolt:**

1. **`server/game/skill-levels.js`** — NEW file (~80 LOC):
   ```javascript
   const SKILL_LEVEL_SCALING = { damage: 0.15, cooldown: -0.10, mpCost: -0.05 };
   const MAX_SKILL_LEVEL = 5;
   const LEVEL_5_BONUSES = { /* per skill name */ };

   function getScaledSkill(skill, level) {
     // Returns copy of skill with damage/cooldown/mpCost scaled
     // At level 5, merges LEVEL_5_BONUSES properties
   }

   function canLevelUp(player, skillIndex) {
     // Check: level < 5, has available talent points
     // Available = player.level - totalTalentPoints - totalSkillPoints
   }

   function getSkillPointsSpent(skillLevels) {
     // Sum of (level - 1) for each skill (base level 1 costs nothing)
     return skillLevels.reduce((sum, lv) => sum + (lv - 1), 0);
   }

   module.exports = { getScaledSkill, canLevelUp, getSkillPointsSpent, MAX_SKILL_LEVEL, LEVEL_5_BONUSES };
   ```

2. **`server/game/player.js`** — Add skillLevels:
   - Constructor: `this.skillLevels = [1, 1, 1];`
   - New method `levelUpSkill(skillIndex)` — validates, increments, returns true/false
   - `serializeForPhone()` — add `skillLevels` to output
   - `serialize()` — add `skillLevels` to output
   - **IMPORTANT:** `getAvailablePoints()` in talents.js must account for skill point spend

3. **`server/game/talents.js`** — Modify `getAvailablePoints()`:
   ```javascript
   // Currently: level - Object.values(talents).reduce(...)
   // New: level - talentPointsSpent - skillPointsSpent
   function getAvailablePoints(level, talents, skillLevels = [1, 1, 1]) {
     const talentSpent = Object.values(talents).reduce((s, r) => s + r, 0);
     const skillSpent = getSkillPointsSpent(skillLevels);
     return Math.max(0, level - talentSpent - skillSpent);
   }
   ```
   - `respec()` must ALSO reset skillLevels → return `{ talents: {}, skillLevels: [1, 1, 1] }`

4. **`server/game/skills.js`** — Apply level scaling in damage + execution:
   - `calcSkillDamage()` — multiply baseDmg by `1 + (level - 1) * 0.15`
   - `executeSkill()` — compute effective cooldown/mpCost from level:
     ```javascript
     const level = player.skillLevels[skillIndex] || 1;
     const effectiveMP = Math.floor(skill.mpCost * (1 - (level - 1) * 0.05));
     const effectiveCD = Math.floor(skill.cooldown * (1 - (level - 1) * 0.10));
     ```
   - Each handler checks Level 5 bonus:
     - `executeSpin`: `if (level >= 5) skill.hits += 2;`
     - `executeCharge`: `if (level >= 5) results.push(stunEvent);`
     - `executeVolley`: `if (level >= 5) projectileCount += 2;`
     - etc.

5. **`server/socket-handlers.js`** — New handler:
   ```javascript
   handleSkillLevelUp(socket, { skillIndex }, { players }) {
     const player = players.get(socket.id);
     // Validate: 0 <= skillIndex <= 2, level < 5, has available points
     // Increment player.skillLevels[skillIndex]
     // Send updated stats + talent tree (available points changed)
   }
   ```
   - Register: `socket.on('skill:level-up', ...)`
   - Modify `handleTalentRespec`: also reset `player.skillLevels = [1, 1, 1]`
   - Modify `handleTalentAllocate`: pass `player.skillLevels` to `getAvailablePoints()`
   - Modify `handleTalentTree`: include `skillLevels` in response

6. **`server/index.js`** — Wire socket event:
   ```javascript
   socket.on('skill:level-up', (data) => handleSkillLevelUp(socket, data, context));
   ```

7. **`client/phone/screens.js`** — Update serialization display:
   - `showSkillTooltip()` — show current level, damage at current level vs next
   - Skill buttons — small level badge (L1-L5)

8. **Update existing tests** — `player.test.js`, `talents.test.js`, `skills.js` tests

**Key architecture decisions:**
- Skill levels stored as array `[1, 1, 1]` matching skill slot indices (not by name — simpler, no lookup needed)
- Talent points and skill points share ONE pool (`player.level` = total budget)
- `skill-levels.js` is a pure utility (no state) — scaling formulas + validation
- Level 5 bonuses modify skill behavior in handlers, NOT skill definitions (definitions stay static)
- Respec resets BOTH talents AND skill levels (same gold cost)
- `getScaledSkill()` returns a modified copy — never mutate CLASS_SKILLS originals

### 16.6 Skill Visuals — TV [for Sage]
- Projectile sprites: arrow (triangle), fireball (circle + trail), lightning (jagged line)
- AOE indicators: ground circles for Blizzard/Meteor
- Charging Strike dash trail
- Shadow Step teleport particles
- Chain Lightning arcs (line between targets with glow)

### 16.7 Skill UI — Phone [for Sage]
- Skill level display on buttons (small number badge)
- Skill tooltip rework: show damage scaling, cooldown, mana at current level
- "Level Up" button in talent screen for each skill
- Channel/casting bar for Blizzard

### Architecture Notes:
- `skills.js` keeps combat.js under 800 LOC
- `projectiles.js` is a self-contained system (like traps.js)
- Projectile state sent in `state` snapshot to TV (like monsters/players)
- Phone doesn't need projectile data — just cooldown feedback
- Shadow decoy uses `monster.friendly = true` pattern from spirit wolf
- Skill leveling shares talent point pool (don't add new currency)

### Implementation Order:
1. ~~**16.0** Extract skill engine → `skills.js`~~ DONE
2. ~~**16.1** Projectile system → `projectiles.js`~~ DONE
3. ~~**16.2** Warrior skills~~ DONE
4. ~~**16.3** Ranger skills~~ DONE
5. ~~**16.4** Mage skills~~ DONE
6. ~~**16.5** Skill leveling~~ DONE
7. ~~**16.6** Skill visuals — TV~~ DONE (Sage, Cycles #148, #153)
8. ~~**16.7** Skill UI — Phone~~ DONE (Sage, Cycle #158)

**Phase 16 COMPLETE.** 1382 tests, 31 suites.

---

## Phase 17: Co-op Synergies & Endgame ✅ COMPLETE

### 17.1 Cross-Class Combo System ✅ DONE (Cycles #162-165)
- `server/game/combos.js` — ComboTracker + 5 combo definitions (Shatter Blast, Chain Reaction, Battle Fury, Shadow Barrage, Firestorm)
- `client/tv/combat-fx.js` — `spawnComboEffect()` with per-combo particles + callout text
- `server/index.js` — combo detection in game loop + phone notification forwarding
- `client/phone/style.css` — combo notification CSS (purple-gold gradient)
- `server/tests/phase17-combos.test.js` — 33 tests
- **Bugs found & fixed:** Shatter Blast NaN damage, Shadow Barrage event ordering

### 17.2 Greater Rifts ✅ ALREADY DONE (Phase 14)
- `server/game/rifts.js` — createRift, getRiftModifiers, createRiftGuardian, getRiftRewards
- `server/game/world.js` — generateRiftFloor, rift timer, modifier application
- `server/socket-handlers.js` — rift:open, rift:enter, rift:cancel, rift:leaderboard
- `client/phone/rift-ui.js` — tier selector, timer overlay, results screen (21KB)
- `client/tv/hud.js` — rift timer bar, tier indicator
- `server/game/database.js` — rift_records table, recordRiftClear, leaderboard queries
- Full game loop integration: burning/vampiric modifiers, guardian kill → completion

### 17.3 Battle Shout L5 Fix ✅ DONE (Cycle #162)
- `crit_up` buff pushed to party, checked in combat.js crit roll

---

## ✅ Phase 18: Polish & Missing Pieces — COMPLETE

**Goal:** Fix remaining TODOs, add missing features, polish gameplay balance.

### 18.1 Player Debuff System ✅ ALREADY DONE
Player debuff system already exists: `addDebuff()`, `processDebuffs()`, `applyDebuff()`, `speedMultiplier` getter — all in player.js.
Stale TODOs in affixes.js removed (Cycle #167).

### 18.2 Combo Damage Application ✅ DONE (Cycle #167, hardened Cycle #170)
- [x] Shatter Blast: AOE cold damage to monsters in 100px radius
- [x] Battle Fury: pull monsters 40px toward vortex center
- [x] Firestorm: 3s stun (blind) to monsters in 100px radius
- [x] Chain Reaction: 30 lightning damage to monsters in 120px radius
- [x] Combo kills → combat:death events for XP/loot (fixed Cycle #170)
- [x] Math.floor on all combo damage (fixed Cycle #170)
- [~] Shadow Barrage: DEFERRED — needs deep projectile system integration, low priority

### 18.3 Quest System ✅ REVIEWED — NO ACTION NEEDED (Cycle #171)
`quests.js` (209 LOC) is clean — no stale TODOs, 7 quest types working, reward scaling correct.
Quest chaining would be nice but is a Phase 20+ feature (needs NPC dialogue rework).

### 18.4 index.js Size ✅ ASSESSED (Cycle #171)
`server/index.js` is 1239 LOC. Structure is well-organized with 14 clear subsections.
Projectiles + combos already extracted to modules. Not urgent — game loop is cohesive.
Extraction candidates noted for future refactoring if needed.

---

## 🔥 Phase 19: Hardcore Mode + Stash System

**Goal:** Two classic Diablo features — permadeath mode and shared stash. High replayability impact, moderate code changes.

### 19.1 Hardcore Mode ✅ DONE (Cycle #172 — Bolt)
**Permanent death mode that resets character on death. Risk/reward: better loot but one life.**

- [x] **Step A: Player flag + database** — `player.hardcore` in constructor/serialize/restoreFrom/serializeForPhone. DB migration + save/load with `hardcore` column.
- [x] **Step B: Mode selection on join** — `data.hardcore` flag in handleJoin. Phone join screen UI pending (Sage).
- [x] **Step C: Permadeath logic** — index.js respawn handler: HC death → record run, delete character, remove from players Map, emit `hardcore:death` to phone+TV.
- [x] **Step D: Hardcore leaderboard** — `getHardcoreLeaderboard()` in database.js with LEFT JOIN filter. Phone UI tabs pending (Sage).
- [x] **Step E: Loot bonus** — HC players get +1 loot tier in combat.js and skills.js kill handlers.

**Files changed:** `server/game/player.js`, `server/game/database.js`, `server/index.js`, `server/socket-handlers.js`, `server/game/combat.js`, `server/game/skills.js`
**Remaining for Sage:** Phone join screen HC toggle, TV HC skull badge, HC death animation, leaderboard tabs

### 19.2 Shared Stash — BACKEND DONE (Cycle #177 — Bolt), UI pending (Sage)
**Persistent storage shared across all characters. 20 flat slots (no grid), items survive character death.**

**Step A: Database table + methods** (`server/game/database.js`)
Add in `_createTables()`:
```sql
CREATE TABLE IF NOT EXISTS stash (
  slot INTEGER PRIMARY KEY CHECK(slot >= 0 AND slot < 20),
  item_json TEXT NOT NULL,
  stored_at TEXT DEFAULT (datetime('now'))
);
```
Add prepared statements + methods:
- `stashItem(slot, item)` — INSERT OR REPLACE `slot`, `JSON.stringify(item)`
- `unstashItem(slot)` — SELECT item_json, then DELETE. Return parsed item or null
- `getStash()` — SELECT all, return `Map<slot, item>` (or array of {slot, item})
- `getStashCount()` — SELECT COUNT(*)

**Step B: Socket handlers** (`server/socket-handlers.js`)
Wire 3 events in the controller namespace:
- `stash:store` `{ inventoryIndex }` — find next empty stash slot, remove item from inventory, insert to stash. Emit `stash:update` + `inventory:update`.
- `stash:retrieve` `{ slot }` — get item from stash, check inventory has space (`inv.findSpace(1,1)`), add to inventory, delete from stash. Emit both updates.
- `stash:list` — emit `stash:update` with current stash contents.
Validation: slot range 0-19, inventory item exists, stash not full (20 max), inventory not full on retrieve.

**Step C: Phone UI** (`client/phone/controller.js` + `style.css`)
- Add `socket.on('stash:update', ...)` handler
- New screen/tab accessible from inventory: "STASH" button
- 20-slot grid (4×5), each slot shows item icon + name or empty
- Tap item in inventory → "Store" button → `socket.emit('stash:store', { inventoryIndex })`
- Tap item in stash → "Retrieve" button → `socket.emit('stash:retrieve', { slot })`
- Gold border, treasure chest icon in header

**Step D: Wire in index.js**
- Bind `stash:store`, `stash:retrieve`, `stash:list` in controller socket event bindings
- Pass `gameDb` in ctx so handlers can call stash methods

**Files:** `server/game/database.js`, `server/socket-handlers.js`, `server/index.js`, `client/phone/controller.js`, `client/phone/style.css`, `client/phone/index.html`
**Tests:** store/retrieve/list, slot limits, persistence, full stash rejection, item integrity after store+retrieve

### 19.3 Hardcore Visual Polish ✅ DONE (Cycle #173 — Sage)
- [x] TV: red skull "☠ HC" badge next to HC player names
- [x] TV: "HARDCORE DEATH" dramatic screen (camera shake, red flash, fade text)
- [x] Phone: HC toggle on join screen (skull + red glow)
- [x] Phone: HC badge in HUD
- [x] Phone: HC death overlay with stats

### 19.4 Stash + Integration Tests ✅ DONE (Cycle #179 — Trace)
- [x] Stash CRUD operations (store, retrieve, list, full rejection)
- [x] Stash persistence across DB open/close
- [x] Stash survives HC death (stash is cross-character)
- [x] Item integrity: store item, retrieve it, compare fields
- [x] Edge cases: retrieve to full inventory, store from empty inventory, invalid slot
- [x] Socket handler tests (handleStashList, handleStashStore, handleStashRetrieve)
- **41 tests in `phase19-stash.test.js`**, full suite 1514/1514 PASS

### Implementation Order:
1. ~~**19.1** Hardcore mode~~ ✅ DONE (Cycles #172-175)
2. ~~**19.2** Shared stash~~ ✅ DONE (Cycles #177-178)
3. ~~**19.3** Visual polish~~ ✅ DONE (Cycle #173)
4. ~~**19.4** Testing~~ ✅ DONE (Cycle #179)

**Phase 19 COMPLETE** — Hardcore Mode + Shared Stash fully implemented and tested.

---

## 🔥 Phase 20: Gems, Enchanting & Quality of Life

**Goal:** Deepen itemization with gems/sockets + enchanting. Add QoL with loot filter + death recap. All features leverage existing systems.

### 20.1 Gems & Socketing ✅ DONE (Cycles #182-189)
**Classic Diablo gem system — items have sockets, gems provide stat bonuses.**

**Step A: Gem data model** ✅ DONE (Cycle #182) (`server/game/gems.js`)
- `GEM_TYPES` constant: ruby/sapphire/emerald/topaz/diamond/amethyst
- `GEM_TIERS`: chipped (tier 1), flawed (tier 2), perfect (tier 3)
- Each gem has: `{ type, tier, bonuses }` — e.g. ruby tier 1 = `{ str: 3 }`
- Gems are inventory items with `stackable: true`

**Step B: Socket generation** ✅ DONE (Cycle #182) (`server/game/items.js`)
- When generating loot, roll sockets: weapon 0-2, armor 0-1
- Legendary: +1 max socket, set items: +1 max socket
- Add `sockets: []` array to item schema (empty = available socket)

**Step C: Socket/unsocket handlers** ✅ DONE (Cycle #187) (`server/socket-handlers.js`)
- `gem:socket` `{ itemId, gemId }` — insert gem into first empty socket, remove gem from inventory
- `gem:unsocket` `{ itemId, socketIndex }` — remove gem (costs 50 × item level gold), return gem to inventory
- Recalc player stats after socket change via `player.recalcStats()`
- Validation: item exists in equipped/inventory, has empty sockets, gem exists in inventory
- Wire both events in `server/index.js` controller bindings

**Step D: Phone socket UI** ✅ DONE (Cycle #183 — Sage + JARVIS Cycle #32)
- ✅ Socket display in tooltips: `○ Empty Socket` / `◆ Gem Name` (Sage, Cycle #183)
- ✅ "Socket Gem" button in tooltip + gem selection popup (Sage, Cycle #183)
- ✅ "Unsocket" button on filled sockets with gold cost (Sage, Cycle #183)
- ✅ No-gems toast notification (JARVIS Cycle #32)

**Step E: Gem drops in combat** ✅ DONE (Cycle #187) (`server/game/combat.js`, `server/game/skills.js`)
- After monster kill: call `rollGemDrop(floorNumber)`, if gem → add to loot drops
- Same flow as existing item drops — add to `droppedItems`, emit `loot:dropped`
- Both combat.js kill handler AND skills.js kill handler need gem drop call

**Step F: Gem combining** ✅ DONE (Cycle #187) (new `gem:combine` handler)
- New socket event: `gem:combine` `{ gemIds: [id, id, id] }` — validate same type+tier, deduct gold (100/500), return upgraded gem
- OR add to existing `crafting:execute` handler as a new recipe type
- 3 chipped → 1 flawed (100 gold), 3 flawed → 1 perfect (500 gold)

**Files:** `server/game/gems.js` (NEW), `server/game/items.js`, `server/game/combat.js`, `server/game/skills.js`, `server/socket-handlers.js`, `client/phone/stats-ui.js`

### 20.2 Enchanting [for Bolt]
**Reroll one specific stat bonus on an item at Enchant NPC. Player chooses which stat to reroll.**

**Step A: Enchant NPC spawn** (`server/game/world.js`)
- Add `enchanter` NPC type to `world.enchantNpc` (similar to `world.shopNpc`)
- Spawn in boss room AFTER boss killed — hook into the boss death flow in `index.js` (line ~795)
- When `deadMonster.isBoss` → call `world.spawnEnchantNpc(bossRoom)` → places NPC at room center offset
- Structure: `{ id: 'enchanter', name: 'Mystic', x, y, type: 'enchanter' }`
- Serialize in `world.serialize()` so TV can render it
- Forward to TV via `state.world.enchantNpc` in game loop broadcast

**Step B: Enchant interaction in handleInteract** (`server/socket-handlers.js`)
- In `handleInteract()` (line ~500), add enchanter check before story NPC check:
  - If `world.enchantNpc` exists AND distance < 80 → emit `enchant:open` with player's equipped + inventory items that have bonuses
  - Filter: only items with `bonuses` object that has at least 1 key. Exclude gems, potions, currency.
  - Send: `{ items: [{id, name, rarity, bonuses, level, enchantCount}...] }`

**Step C: Enchant handlers** (`server/socket-handlers.js`)
- `enchant:preview` `{ itemId, bonusKey }`:
  - Validate item exists in player's equipment or inventory
  - Validate `bonusKey` exists in `item.bonuses`
  - Calculate cost: `Math.floor(100 × (item.level || 1) × (1 + (item.enchantCount || 0) * 0.5))` gold
  - Get possible replacement values from BONUS_POOL (+ RESIST_BONUS_POOL for armor)
  - Emit `enchant:preview` `{ itemId, bonusKey, currentValue, cost, possibleStats: [{stat, label, min, max}] }`

- `enchant:execute` `{ itemId, bonusKey }`:
  - Re-validate everything from preview
  - Deduct gold (if insufficient → error)
  - Roll new value for the stat using `BONUS_POOL` min/max × rarity multiplier
  - Bad luck protection: track `item._enchantHistory = []`. If same stat rerolled 3× in a row → guaranteed different value (outside ±10% of current)
  - Update `item.bonuses[bonusKey]` with new value
  - Set `item.enchantCount = (item.enchantCount || 0) + 1`
  - Set `item.enchanted = true` (for `✧` display)
  - If item is equipped → `player.recalcEquipBonuses()` + `player.recalcStats()`
  - Emit `enchant:result` `{ itemId, bonusKey, oldValue, newValue, cost }`
  - Emit `player:stats` + `inventory:update` (or equipment update)

**Step D: Phone enchant UI** (`client/phone/controller.js`)
- Listen for `enchant:open` → show enchant overlay (fullscreen, similar to gem combine panel)
- Display grid of enchantable items with name + rarity color
- Tap item → show its bonuses as selectable rows
- Tap bonus row → emit `enchant:preview` → show cost + possible range
- "ENCHANT" button → emit `enchant:execute` → show result (old → new value, green if better, red if worse)
- Items with `enchanted: true` show `✧` prefix in name
- Close button returns to game

**Step E: TV enchant NPC sprite** (`client/tv/sprites.js`)
- Render `world.enchantNpc` as a purple-robed NPC sprite (reuse story NPC pattern)
- Floating `✧` particle effect around NPC

**Files:** `server/game/world.js`, `server/game/items.js` (BONUS_POOL export), `server/socket-handlers.js`, `server/index.js`, `client/phone/controller.js`, `client/phone/style.css`, `client/tv/sprites.js`

**Bolt's parallel plan:**
1. Agent 1: Step A (world.js NPC spawn) + Step B (handleInteract enchanter check)
2. Agent 2: Step C (enchant:preview + enchant:execute handlers)
3. Agent 3: Step D (phone UI) — can start after Step C's event names are defined

**Cost formula:**
- Base: `100 × itemLevel` gold
- Escalation: `× (1 + enchantCount × 0.5)` — first enchant 100g×lvl, second 150g×lvl, third 200g×lvl
- No material cost (gold-only sink, different from crafting reforge which uses arcane_dust)

**Key difference from crafting reforge:**
- Reforge picks a RANDOM bonus to change. Enchanting lets player CHOOSE which stat.
- Reforge generates a completely new item. Enchanting modifies in-place.
- Reforge costs materials. Enchanting costs only gold (escalating).
- Enchanting has bad luck protection. Reforge does not.

### 20.3 Loot Filter ✅ DONE [Bolt, Cycle #192]
**Auto-pickup and visual filtering — reduces phone tedium.**

**Step A: Player preference** (`server/game/player.js`)
- Add `this.lootFilter = 'off'` to constructor (line ~170)
- Values: `'off'` | `'basic'` | `'smart'`
- Include in `serialize()` and `restoreFrom()` for DB persistence
- Include in `serializeForPhone()` for client display
- DB: add `loot_filter` column to players table (ALTER TABLE or in save)

**Step B: Auto-pickup in game loop** (`server/index.js`)
- In the game loop tick (after combat events, around line 780-820), add auto-pickup logic:
  - For each player with `lootFilter !== 'off'`:
    - Scan `world.groundItems` within 1.5 tile radius (72px)
    - `basic`: auto-pickup gold (currency) + potions only
    - `smart`: also auto-pickup rare+ items (skip common/uncommon)
    - Use same pickup logic as `handleLootPickup` (check inv space, add gold, emit notification)
  - Rate limit: only check every 500ms per player (avoid performance hit)

**Step C: Loot filter socket handler** (`server/socket-handlers.js`)
- `loot:filter` `{ mode: 'off'|'basic'|'smart' }` — validate and set `player.lootFilter`
- Emit `player:stats` update

**Step D: Phone UI toggle** (`client/phone/controller.js`)
- Button in inventory header (next to GEMS/STASH): cycles Off → Basic → Smart
- Visual: text shows current mode with color (grey/yellow/green)

**Step E: TV visual dimming** (`client/tv/game.js`)
- When rendering ground items, if player has `smart` filter:
  - Common items: alpha 0.2
  - Uncommon items: alpha 0.4
  - Rare+: full alpha

**Files:** `server/game/player.js`, `server/index.js`, `server/socket-handlers.js`, `client/phone/controller.js`, `client/tv/game.js`

**Bolt's plan for Cycle #192 (parallel):**
1. Agent 1: Steps A+C — player.lootFilter field + socket handler
2. Agent 2: Step B — auto-pickup in game loop
3. Agent 3: Step D — phone UI toggle

### 20.4 Death Recap ✅ COMPLETE (Cycles #182-183)
**Show damage breakdown when player dies.**

- ✅ **Step A: Damage log** — `player.damageLog` circular buffer (10 max), `getDeathRecap()` returns last 5 + killer
- ✅ **Step B: Death event enrichment** — `player:death` event includes `damageLog` array
- ✅ **Step C: Phone death screen** — "Killed by [Monster]" header, damage type icons (⚔🔥❄🧪⚡⚠), last 5 entries
- ✅ **Step D: Source tracking** — combat.js, traps.js, index.js (cold enchanted) all pass source names
- ✅ **Tested** — 7 tests in phase20-gems.test.js covering log, cap, dodge, recap, killer, serialization

### Implementation Order:
1. ~~**20.1 A+B**~~ ✅ Gem data + sockets (Cycle #182)
2. ~~**20.4**~~ ✅ Death Recap COMPLETE (Cycles #182-183)
3. ~~**20.1 C+E+F**~~ ✅ Socket handlers + gem drops + gem combining (Bolt, Cycle #187)
4. ~~**20.1 D**~~ ✅ Socket UI — tooltip, gem picker, unsocket (Sage #183 + JARVIS #32)
5. ~~**20.1 Testing**~~ ✅ 43 handler tests (Trace, Cycle #189) — 1603 total
6. ~~**20.3**~~ ✅ Loot Filter — Bolt (Cycle #192)
7. ~~**20.2 A+B**~~ ✅ Enchant NPC spawn + interact hook — Bolt (Cycle #197)
8. ~~**20.2 C**~~ ✅ Enchant handlers (preview + execute) — Bolt (Cycle #197)
9. ~~**20.2 D**~~ ✅ Enchant phone UI — Bolt (Cycle #197)
10. ~~**20.2 E**~~ ✅ TV enchant NPC sprite — Sage (Cycle #198)
11. ~~Testing~~ ✅ 27 enchanting tests — Trace (Cycle #199)
12. ~~Review~~ ✅ Enchanting review, stale gold fix — Rune (Cycle #200)

---

## 🔥 Phase 21: World Events & Gambling

**Goal:** Add dynamic gameplay variety with random events during dungeon runs + a gold sink gambling system. Refactor large files that crossed 1500 LOC.

### 21.1 Treasure Goblins [for Bolt]
**Rare fleeing monster that drops massive loot if killed before escaping. Classic Diablo feature.**

**Step A: Goblin monster type** (`server/game/monsters.js`)
- New monster type: `treasure_goblin`
- Stats: 200 HP, 0 damage, FAST speed (3.5, faster than players at 3.0)
- Behavior: **FLEE** — always runs away from nearest player, never attacks
- Spawn chance: 8% per room entered (non-boss, non-start rooms)
- Despawn: escapes after 15 seconds if not killed → teleport particle + gone
- Drop table: 3-5 items (rare+ guaranteed), 200-500 gold, 50% chance gem, 10% chance legendary

**Step B: Goblin AI** (`server/game/monsters.js` + `server/index.js`)
- Override `updateBehavior()` for goblin type:
  - Always in FLEE state — find nearest player, move in opposite direction
  - Zigzag: every 2s, add random perpendicular offset to flee vector
  - If cornered (wall collision): pick random open direction
  - `escapeTimer`: 15s countdown from spawn. Timer expires → `goblin:escaped` event
- On death: emit `goblin:killed` event, drop loot with bonus multiplier (2x normal)
- Sound cue: jingling coins on spawn (high-pitched, distinct)

**Step C: TV goblin visuals** (`client/tv/sprites.js`, `client/tv/effects.js`)
- Sprite: small green creature with oversized sack (gold sparkles trailing behind)
- Gold particle trail while running
- "TREASURE GOBLIN!" announcement text on spawn (gold color)
- Escape animation: purple portal opens, goblin jumps in, sparkle burst

**Step D: Phone notification** (`client/phone/controller.js`)
- On `goblin:spawned`: gold toast "Treasure Goblin spotted!" with coin icon
- On `goblin:killed`: "Treasure Goblin slain! Massive loot dropped!"
- On `goblin:escaped`: "The Goblin escaped..." (red, sad)
- Escape timer bar on HUD (gold bar, 15s countdown)

**Files:** `server/game/monsters.js`, `server/index.js`, `client/tv/sprites.js`, `client/tv/effects.js`, `client/phone/controller.js`

### 21.2 Cursed Events [for Bolt]
**Random room events that challenge players for bonus rewards.**

**Step A: Event system** (`server/game/events.js` — NEW)
- `CursedEvent` class: `{ type, room, active, timer, wavesRemaining, reward }`
- Event types:
  - **Cursed Chest**: chest appears, opening spawns 3 waves of monsters. Survive all → epic+ item
  - **Cursed Shrine**: shrine appears, activating spawns elite pack. Kill all in 20s → permanent stat buff (+2 random stat for floor)
- Trigger: 15% chance when entering a new combat room (not boss, not start)
- Only one active event at a time
- Event serialized in world state for TV display

**Step B: Cursed Chest implementation** (`server/game/events.js`, `server/index.js`)
- Interact with cursed chest → starts event
- Wave 1: 4 normal monsters. Wave 2: 6 monsters. Wave 3: 2 elites
- 30s total timer. All killed in time → chest opens with epic+ loot
- Timer expires → chest vanishes, no reward
- Emit `event:start`, `event:wave`, `event:complete`, `event:failed`

**Step C: Cursed Shrine implementation** (`server/game/events.js`, `server/index.js`)
- Interact with cursed shrine → spawns elite pack (3 elites with 2 affixes each)
- 20s timer. Kill all → `event:complete` → +2 to random stat for rest of floor
- Buff shown on phone HUD as "Cursed Blessing: +2 STR" (or whatever stat)

**Step D: TV event visuals** (`client/tv/effects.js`, `client/tv/hud.js`)
- Cursed chest: dark purple glow, skull icon floating above
- Cursed shrine: red pulsing aura
- Event timer bar at top of screen (red, counting down)
- Wave counter: "Wave 2/3"
- Completion: golden explosion particles + "EVENT COMPLETE!" text

**Step E: Phone event UI** (`client/phone/controller.js`)
- Event notification on start: "Cursed Chest activated! Survive the waves!"
- Timer display in HUD area
- Wave progress: "Wave 2/3 — 4 enemies remaining"
- Reward notification on completion

**Files:** `server/game/events.js` (NEW), `server/index.js`, `client/tv/effects.js`, `client/tv/hud.js`, `client/phone/controller.js`

### 21.3 Gambling NPC [for Bolt]
**Kadala-style gambling — spend gold for mystery items. Major gold sink.**

**Step A: Gambling handler** (`server/socket-handlers.js`)
- New handler: `handleGamble` `{ slot }` — slot is 'weapon', 'chest', 'helmet', etc.
- Cost: 50 × currentFloor gold per gamble
- Generate random item for that slot:
  - Common: 60%, Uncommon: 25%, Rare: 10%, Epic: 4%, Legendary: 1%
  - Item level = current floor
  - Same generation as monster drops but player-chosen slot
- Deduct gold, add item to inventory
- Emit `gamble:result` with item data + `inventory:update`
- Validation: enough gold, inventory has space

**Step B: Gambling UI on Shop NPC** (`client/phone/controller.js`)
- Add "GAMBLE" tab to existing shop panel (alongside BUY/SELL)
- Show equipment slot grid: Weapon, Helmet, Chest, Gloves, Boots, Ring, Amulet
- Each slot shows cost (50 × floor gold)
- Tap slot → emit `gamble` → show result item with rarity reveal animation
- Result: item name + rarity color flash, "Add to inventory" implicit

**Step C: TV gambling visual** (`client/tv/effects.js`)
- When player gambles: brief sparkle effect on shop NPC
- Legendary result: big golden burst + "LEGENDARY!" callout (TV-wide)

**Files:** `server/socket-handlers.js`, `server/index.js`, `client/phone/controller.js`, `client/phone/style.css`, `client/tv/effects.js`

### 21.4 Refactoring: controller.js split [for Bolt]
**controller.js at 1527 LOC — extract enchant + gem UI to separate module.**

- [ ] Extract enchant panel (showEnchantPanel, showEnchantPreview, showEnchantResult) → `client/phone/enchant-ui.js`
- [ ] Extract gem socket/combine UI → `client/phone/gem-ui.js` (if not already extracted)
- [ ] Wire imports in controller.js (IIFE pattern like rift-ui.js)
- [ ] Verify all functionality still works

**Files:** `client/phone/controller.js`, `client/phone/enchant-ui.js` (NEW), `client/phone/gem-ui.js` (NEW)

### Implementation Order:
1. **21.1 A+B** — Treasure Goblin monster + AI (Bolt)
2. **21.1 C+D** — TV + phone goblin visuals (Sage)
3. **21.3 A** — Gambling handler (Bolt)
4. **21.3 B** — Gambling shop tab (Bolt/Sage)
5. **21.2 A+B+C** — Cursed events system + implementations (Bolt)
6. **21.2 D+E** — TV + phone event UI (Sage)
7. **21.4** — Refactoring (Bolt)
8. Testing — Trace
9. Review — Rune

**Bolt's parallel plan for Cycle #202:**
1. Agent 1: 21.1 A+B (Treasure Goblin monster type + AI)
2. Agent 2: 21.3 A+B (Gambling handler + UI)
3. Agent 3: 21.2 A+B+C (Cursed events system)

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

### Found in Cycle #159 (Trace — skill leveling QA)

- [x] [BUG/MEDIUM] `skills.js` — **Projectile skill damage not level-scaled.** `executeMeteor`, `executeVolley`, `executeSniper` compute `projDamage = floor(attackPower/spellPower * skill.damage)` without applying `getDamageMult(skillLevel)`. **Fixed (Rune, Cycle #160):** Added `* getDamageMult(skillLevel)` to projDamage computation in all 3 handlers.
- [x] [BUG/LOW] `skills.js` — **Battle Shout L5 partyCrit bonus emitted but never consumed.** `executeBuffDebuff` emits `partyCritBonus: 5` in `buff:apply` event at Level 5, but nothing in `combat.js` reads or applies this value. Needs: store partyCrit in player buff, apply in crit roll. **Fixed (Bolt, Cycle #162):** Added `crit_up` buff to party members in `executeBuffDebuff`; updated crit roll in `combat.js` to check `crit_up` buff effect.

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
