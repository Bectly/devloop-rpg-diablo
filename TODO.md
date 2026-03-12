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

### 6.0 Refactoring: hud.js split [Bolt]
**Why:** hud.js at 1284 LOC, controller.js at 1032 LOC — both over 1000 threshold.
- [ ] Extract `hud.js` victory screen code → `client/tv/victory.js` (~200 LOC)
- [ ] Extract `hud.js` dialogue/NPC HUD → `client/tv/dialogue-hud.js` (~150 LOC)
- [ ] Extract `controller.js` reconnect overlay + save toast → `client/phone/reconnect.js` (~100 LOC)
- [ ] Verify all 450 tests still pass after split

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

### Future (not this phase)
- [ ] Multiple dungeon zones (different tilesets, monster pools)
- [ ] Damage types (fire/ice/physical/poison) + resistances
- [ ] Set bonuses (3-4 item sets with 2/3/5-piece bonuses)
- [ ] Unique legendary item effects (special procs)
- [ ] Leaderboard / stats tracking
- [ ] Sprite assets via ComfyUI generation

---

## Architecture Notes (Updated Cycle #46)
**Current LOC:** ~15,249 source JS (test + source). Largest: hud.js 1284, game.js 1073, controller.js 1032, socket-handlers.js 878.
**Tests:** 450/450 PASS, 15 suites (14 test files).
**Split needed:** hud.js 1284 → split victory + dialogue. controller.js 1032 → split reconnect.
**Persistence:** database.js + wiring + session reconnection complete (Cycles #36-45). 0 open bugs.

## Open Bugs

### Found in Cycle #44, Fixed in Cycle #45 (Rune)

- [x] [BUG/HIGH] `socket-handlers.js:handleDisconnect` — **Double disconnect leaks timer, nukes reconnected player's inventory.** **Fixed:** `handleDisconnect` now checks `disconnectedPlayers.has(player.name)` and `clearTimeout()`s the existing timer before creating a new grace entry.
- [x] [BUG/MEDIUM] `socket-handlers.js:handleJoin` reconnect path — **Reconnect bypasses 2-player cap.** **By-design:** The grace period acts as a slot reservation. Reconnecting player had a prior claim; temporarily allowing 3 active players is acceptable. Documented with comments in `handleJoin`.
- [x] [BUG/LOW] `socket-handlers.js:handleJoin` — **Name-only session matching allows session hijacking.** **Documented:** Added comment explaining the design limitation (no auth system) and noting that a session token would prevent accidental hijacking. No code change — auth is out of scope for this game.
- [x] [BUG/LOW] `server/index.js:game:restart` — **Restart does not clear disconnected players or their grace timers.** **Fixed:** `game:restart` handler now iterates `disconnectedPlayers` Map, `clearTimeout()`s each timer, resets `disconnected` flag to `false`, and clears the Map.

### Found in Cycle #49 (Trace — affix QA)

- [ ] [BUG/HIGH] `combat.js:427-429` — **Vampiric double-heal.** `processAffixOnDealDamage()` already heals the monster internally (`AFFIX_DEFS.vampiric.onDealDamage` at affixes.js:99 does `monster.hp = Math.min(maxHp, hp + heal)`). Then `processMonsterAttack()` adds the heal AGAIN on line 429. Monster heals 2x the intended amount. **Fix:** Either remove the internal heal in `onDealDamage` (make it return-only) or remove the `monster.hp` assignment in `processMonsterAttack`. Recommended: remove lines 428-429 in combat.js since the affix already handles it.
- [ ] [BUG/MEDIUM] `combat.js:74-75` + `monsters.js:465` — **Shielding does not fully block damage.** `modifyDamageByAffixes` returns 0 when shield is active, but `Monster.takeDamage(0)` applies `Math.max(1, ...)` so the monster still takes 1 damage per hit. **Fix:** Either short-circuit in `playerAttack`/`playerSkill` when modifiedDamage === 0 (skip takeDamage entirely), or add a `if (amount <= 0) return 0;` guard at the top of `Monster.takeDamage()`.
- [ ] [BUG/MEDIUM] `combat.js:176-195,229-248,279-297,333-352` — **Skill kills missing elite data in death events.** When a skill (AOE/single/multi/dot) kills an elite monster, the `combat:death` event does not include `isElite`, `eliteRank`, or `affixEvents` (fire explosion). Only `playerAttack()` includes these fields. The TV client won't show elite death effects or fire explosions for skill kills. **Fix:** Add `isElite`, `eliteRank`, and `affixEvents` to all skill death event paths, matching the pattern in `playerAttack()`.

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
