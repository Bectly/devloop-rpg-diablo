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
- [ ] Leaderboard / stats tracking
- [ ] Sprite assets via ComfyUI generation
- [ ] Skill synergies / cross-class combos
- [ ] Crafting / enchant system

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

### 9.5 Zone Visuals — TV Client
**File:** `client/tv/game.js` (modify floor rendering)

Currently TV renders all floors with same colors. Add zone-based tile coloring:

- Catacombs: Gray stone (#8a7a6a floor, #5a4a3a walls)
- Inferno: Dark red (#6a2a1a floor, #4a1a0a walls), occasional lava tile (orange glow)
- Abyss: Dark purple (#2a1a3a floor, #1a0a2a walls), void particles

Server sends `zoneId` in `dungeon:enter` event. TV reads `zoneId` to pick tile palette.

### 9.6 Boss UI — TV + Phone
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

Steps 1-2 can run in parallel. Steps 3-4 depend on 1-2. Steps 5-7 are Sage's domain.

---

## Architecture Notes (Updated Cycle #60)
**Current LOC:** ~18,500 source JS (34 files). Largest: game.js 1074, controller.js 1061, player.test.js 1233, socket-handlers.js 878.
**Tests:** 680/680 PASS, 17 suites.
**Splits done (Cycle #52):** hud.js 1284→827 (victory.js 339, dialogue-hud.js 153), controller.js 1084→1058 (reconnect.js 119). All clean, no dead code.
**Persistence:** complete (Cycles #36-45). **Affixes:** complete (Cycles #46-50). **Damage types:** complete (Cycles #52-55). **Item sets:** complete (Cycles #56-60). 0 open bugs.

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

## Notes
- Server is authoritative: all game logic runs server-side
- Phones send inputs, receive feedback — never compute game state
- TV renders state snapshots — no game logic in client
- Sound module shared between TV + phone (client/shared/sound.js)
- 7 floors defined (Dusty Catacombs → Throne of Ruin), floor 7 = final
- Boss Knight has 3-phase AI (melee → charge → aoe_frenzy)
- 3 classes × 3 skills = 9 total skills with cooldowns
