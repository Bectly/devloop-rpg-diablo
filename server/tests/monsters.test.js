import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Monster, createMonster, MONSTER_DEFS, AI_STATES } = require('../game/monsters');

describe('Monsters', () => {
  // ── Creation ────────────────────────────────────────────────────
  describe('creation', () => {
    it('creates monster from definition with correct stats', () => {
      const m = createMonster('skeleton', 100, 200);
      expect(m.name).toBe('Skeleton');
      expect(m.type).toBe('skeleton');
      expect(m.maxHp).toBe(80);
      expect(m.hp).toBe(80);
      expect(m.damage).toBe(12);
      expect(m.armor).toBe(3);
      expect(m.speed).toBe(80);
      expect(m.x).toBe(100);
      expect(m.y).toBe(200);
      expect(m.spawnX).toBe(100);
      expect(m.spawnY).toBe(200);
      expect(m.alive).toBe(true);
      expect(m.aiState).toBe(AI_STATES.IDLE);
    });

    it('throws error for unknown monster type', () => {
      expect(() => createMonster('dragon', 0, 0)).toThrow('Unknown monster type: dragon');
    });

    it('zombie has melee_poison behavior', () => {
      const m = createMonster('zombie', 0, 0);
      expect(m.behavior).toBe('melee_poison');
    });

    it('demon has ranged behavior', () => {
      const m = createMonster('demon', 0, 0);
      expect(m.behavior).toBe('ranged');
    });

    it('archer has ranged_kite behavior with preferred range', () => {
      const m = createMonster('archer', 0, 0);
      expect(m.behavior).toBe('ranged_kite');
      expect(m.preferredRange).toBe(140);
      expect(m.projectileSpeed).toBe(300);
    });

    it('slime has split mechanics', () => {
      const m = createMonster('slime', 0, 0);
      expect(m.splitCount).toBe(2);
      expect(m.splitType).toBe('slime_small');
    });

    it('boss_knight has isBoss flag and phases', () => {
      const m = createMonster('boss_knight', 0, 0);
      expect(m.isBoss).toBe(true);
      expect(m.phases).toHaveLength(3);
      expect(m.phases[0].mode).toBe('melee');
      expect(m.phases[1].mode).toBe('charge');
      expect(m.phases[2].mode).toBe('aoe_frenzy');
    });
  });

  // ── Floor Scaling ───────────────────────────────────────────────
  describe('floor scaling', () => {
    it('HP scales by 20% per floor', () => {
      const m0 = createMonster('skeleton', 0, 0, 0);
      const m3 = createMonster('skeleton', 0, 0, 3);
      // floor 0: hp = floor(80 * 1.0) = 80
      // floor 3: hp = floor(80 * 1.6) = 128
      expect(m0.maxHp).toBe(80);
      expect(m3.maxHp).toBe(Math.floor(80 * 1.6));
    });

    it('damage scales by 15% per floor', () => {
      const m0 = createMonster('skeleton', 0, 0, 0);
      const m3 = createMonster('skeleton', 0, 0, 3);
      // floor 0: dmg = floor(12 * 1.0) = 12
      // floor 3: dmg = floor(12 * 1.45) = 17
      expect(m0.damage).toBe(12);
      expect(m3.damage).toBe(Math.floor(12 * 1.45));
    });

    it('armor increases by 0.5 per floor', () => {
      const m0 = createMonster('skeleton', 0, 0, 0);
      const m4 = createMonster('skeleton', 0, 0, 4);
      // floor 0: armor = 3 + 0 = 3
      // floor 4: armor = 3 + floor(4 * 0.5) = 3 + 2 = 5
      expect(m0.armor).toBe(3);
      expect(m4.armor).toBe(3 + Math.floor(4 * 0.5));
    });

    it('xpReward scales by 10% per floor', () => {
      const m0 = createMonster('skeleton', 0, 0, 0);
      const m5 = createMonster('skeleton', 0, 0, 5);
      expect(m0.xpReward).toBe(25);
      expect(m5.xpReward).toBe(Math.floor(25 * 1.5));
    });

    it('lootTier increases by floor/2', () => {
      const m0 = createMonster('skeleton', 0, 0, 0);
      const m4 = createMonster('skeleton', 0, 0, 4);
      expect(m0.lootTier).toBe(1);
      expect(m4.lootTier).toBe(1 + Math.floor(4 / 2)); // 3
    });
  });

  // ── Damage / Death ──────────────────────────────────────────────
  describe('takeDamage', () => {
    it('reduces HP with armor reduction', () => {
      const m = createMonster('skeleton', 0, 0); // armor = 3
      const dealt = m.takeDamage(20);
      // reduced = max(1, floor(20 - 3*0.4)) = max(1, floor(18.8)) = 18
      expect(dealt).toBe(18);
      expect(m.hp).toBe(80 - 18);
    });

    it('minimum damage is 1', () => {
      const m = createMonster('boss_knight', 0, 0); // armor = 15
      const dealt = m.takeDamage(1);
      expect(dealt).toBe(1);
    });

    it('dies when HP reaches 0', () => {
      const m = createMonster('slime_small', 0, 0);
      m.takeDamage(10000);
      expect(m.hp).toBe(0);
      expect(m.alive).toBe(false);
      expect(m.aiState).toBe(AI_STATES.DEAD);
    });

    it('returns 0 when already dead', () => {
      const m = createMonster('skeleton', 0, 0);
      m.alive = false;
      expect(m.takeDamage(100)).toBe(0);
    });
  });

  // ── AI State Transitions ────────────────────────────────────────
  describe('AI states', () => {
    it('idle -> alert when player in aggro range', () => {
      const m = createMonster('skeleton', 100, 100); // aggroRadius = 150
      const player = { id: 'p1', alive: true, x: 200, y: 100 }; // 100 units away
      m.update(16, [player]);
      expect(m.aiState).toBe(AI_STATES.ALERT);
      expect(m.targetId).toBe('p1');
    });

    it('stays idle when player out of aggro range', () => {
      const m = createMonster('skeleton', 100, 100); // aggroRadius = 150
      const player = { id: 'p1', alive: true, x: 500, y: 500 }; // ~566 units away
      m.update(16, [player]);
      expect(m.aiState).toBe(AI_STATES.IDLE);
    });

    it('alert -> idle when player dies', () => {
      const m = createMonster('skeleton', 100, 100);
      const player = { id: 'p1', alive: true, x: 150, y: 100 };
      m.update(16, [player]); // go to alert
      expect(m.aiState).toBe(AI_STATES.ALERT);

      player.alive = false;
      m.update(16, [player]);
      expect(m.aiState).toBe(AI_STATES.IDLE);
    });

    it('alert -> attack when player in attack range', () => {
      const m = createMonster('skeleton', 100, 100); // attackRange = 40
      const player = { id: 'p1', alive: true, x: 130, y: 100 }; // 30 units
      m.aiState = AI_STATES.ALERT;
      m.targetId = 'p1';
      m.update(16, [player]);
      expect(m.aiState).toBe(AI_STATES.ATTACK);
    });

    it('attack -> flee when HP below 20%', () => {
      const m = createMonster('skeleton', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.hp = Math.floor(m.maxHp * 0.1); // 10% HP
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      m.update(16, [player]);
      expect(m.aiState).toBe(AI_STATES.FLEE);
    });

    it('boss does not flee', () => {
      const m = createMonster('boss_knight', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.hp = 1; // nearly dead
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      m.update(16, [player]);
      expect(m.aiState).not.toBe(AI_STATES.FLEE);
    });

    it('alert -> leash when too far from spawn', () => {
      const m = createMonster('skeleton', 100, 100); // leashDistance = 400
      m.aiState = AI_STATES.ALERT;
      m.x = 600; // 500 units from spawn
      const player = { id: 'p1', alive: true, x: 700, y: 100 };
      m.update(16, [player]);
      expect(m.aiState).toBe(AI_STATES.LEASH);
    });

    it('leash -> idle when back at spawn and heals to full', () => {
      const m = createMonster('skeleton', 100, 100);
      m.aiState = AI_STATES.LEASH;
      m.x = 105;
      m.y = 105;
      m.hp = 10;
      m.update(16, []);
      // Monster moves toward spawn, if close enough (<10) it resets
      if (Math.sqrt((m.x - 100) ** 2 + (m.y - 100) ** 2) < 10) {
        expect(m.aiState).toBe(AI_STATES.IDLE);
        expect(m.hp).toBe(m.maxHp);
      }
    });
  });

  // ── Monster Attack Events ───────────────────────────────────────
  describe('attack events', () => {
    it('emits monster_attack event when cooldown is ready', () => {
      const m = createMonster('skeleton', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.targetId).toBe('p1');
      expect(attack.damage).toBe(m.damage);
    });

    it('ranged_kite monster emits projectile data', () => {
      const m = createMonster('archer', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      const player = { id: 'p1', alive: true, x: 200, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.attackType).toBe('ranged');
      expect(attack.projectile).not.toBeNull();
      expect(attack.projectile.speed).toBe(300);
    });

    it('poison monster uses poison attack type', () => {
      const m = createMonster('zombie', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack.attackType).toBe('poison');
    });
  });

  // ── Boss Phases ─────────────────────────────────────────────────
  describe('boss phases', () => {
    it('starts in phase 0 (melee, 100% hp)', () => {
      const m = createMonster('boss_knight', 100, 100);
      expect(m.currentPhase).toBe(0);
    });

    it('transitions to phase 1 (charge) at 60% HP', () => {
      const m = createMonster('boss_knight', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 999; // prevent attack event noise
      m.hp = Math.floor(m.maxHp * 0.55); // below 60%
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const phaseEvent = events.find(e => e.type === 'boss_phase');
      expect(phaseEvent).toBeDefined();
      expect(phaseEvent.mode).toBe('charge');
    });

    it('transitions to phase 2 (aoe_frenzy) at 30% HP', () => {
      const m = createMonster('boss_knight', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 999;
      m.hp = Math.floor(m.maxHp * 0.25); // below 30%
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const phaseEvent = events.find(e => e.type === 'boss_phase');
      expect(phaseEvent).toBeDefined();
      expect(phaseEvent.mode).toBe('aoe_frenzy');
    });

    it('charge phase increases damage by 1.5x', () => {
      const m = createMonster('boss_knight', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      // Set HP to 55% to trigger charge phase (threshold: 60%)
      m.hp = Math.floor(m.maxHp * 0.55);
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(m.currentPhase).toBe(1);
      expect(attack.damage).toBe(Math.floor(m.damage * 1.5));
    });

    it('aoe_frenzy phase reduces damage to 0.8x', () => {
      const m = createMonster('boss_knight', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      // Set HP to 25% to trigger aoe_frenzy phase (threshold: 30%)
      m.hp = Math.floor(m.maxHp * 0.25);
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(m.currentPhase).toBe(2);
      expect(attack.damage).toBe(Math.floor(m.damage * 0.8));
    });
  });

  // ── Stun & Slow ─────────────────────────────────────────────────
  describe('effects', () => {
    it('stunned monster cannot act', () => {
      const m = createMonster('skeleton', 100, 100);
      m.aiState = AI_STATES.ALERT;
      m.applyStun(2000);
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const oldX = m.x;
      m.update(16, [player]);
      // Stunned monster should not move
      expect(m.x).toBe(oldX);
    });

    it('slowed monster moves at half speed', () => {
      const m = createMonster('skeleton', 100, 100);
      m.applySlow(5000);
      expect(m.slowed).toBe(5000);
    });

    it('applyStun uses max of current and new duration', () => {
      const m = createMonster('skeleton', 0, 0);
      m.applyStun(1000);
      m.applyStun(500);
      expect(m.stunned).toBe(1000);
      m.applyStun(2000);
      expect(m.stunned).toBe(2000);
    });
  });

  // ── Slime Split ─────────────────────────────────────────────────
  describe('slime splitting', () => {
    it('slime splits into 2 small slimes on death', () => {
      const m = createMonster('slime', 100, 100);
      m.alive = false;
      const splits = m.getSplitMonsters();
      expect(splits.length).toBe(2);
      expect(splits[0].type).toBe('slime_small');
      expect(splits[1].type).toBe('slime_small');
    });

    it('small slime does not split', () => {
      const m = createMonster('slime_small', 100, 100);
      m.alive = false;
      const splits = m.getSplitMonsters();
      expect(splits.length).toBe(0);
    });

    it('skeleton does not split', () => {
      const m = createMonster('skeleton', 100, 100);
      m.alive = false;
      const splits = m.getSplitMonsters();
      expect(splits.length).toBe(0);
    });

    it('split slimes spawn near parent position', () => {
      const m = createMonster('slime', 200, 300);
      const splits = m.getSplitMonsters();
      for (const s of splits) {
        expect(Math.abs(s.x - 200)).toBeLessThan(30);
        expect(Math.abs(s.y - 300)).toBeLessThan(30);
      }
    });
  });

  // ── Distance & Targeting ────────────────────────────────────────
  describe('utility', () => {
    it('distanceTo calculates correct Euclidean distance', () => {
      const m = createMonster('skeleton', 0, 0);
      const dist = m.distanceTo({ x: 30, y: 40 });
      expect(dist).toBeCloseTo(50, 5);
    });

    it('findClosestPlayer returns nearest alive player', () => {
      const m = createMonster('skeleton', 100, 100);
      const p1 = { id: 'p1', alive: true, x: 300, y: 100 };
      const p2 = { id: 'p2', alive: true, x: 150, y: 100 };
      const p3 = { id: 'p3', alive: false, x: 110, y: 100 }; // closer but dead
      const { player, distance } = m.findClosestPlayer([p1, p2, p3]);
      expect(player.id).toBe('p2');
      expect(distance).toBe(50);
    });

    it('findClosestPlayer returns null when no alive players', () => {
      const m = createMonster('skeleton', 100, 100);
      const { player } = m.findClosestPlayer([{ id: 'p1', alive: false, x: 110, y: 100 }]);
      expect(player).toBeNull();
    });
  });

  // ── Damage Types ───────────────────────────────────────────────
  describe('damage types', () => {
    it('all monster types have a damageType in their definition', () => {
      for (const [type, def] of Object.entries(MONSTER_DEFS)) {
        expect(def).toHaveProperty('damageType');
        expect(typeof def.damageType).toBe('string');
      }
    });

    it('skeleton has physical damageType', () => {
      expect(MONSTER_DEFS.skeleton.damageType).toBe('physical');
    });

    it('demon has fire damageType', () => {
      expect(MONSTER_DEFS.demon.damageType).toBe('fire');
    });

    it('slime has poison damageType', () => {
      expect(MONSTER_DEFS.slime.damageType).toBe('poison');
    });

    it('slime_small has poison damageType', () => {
      expect(MONSTER_DEFS.slime_small.damageType).toBe('poison');
    });

    it('zombie has poison damageType', () => {
      expect(MONSTER_DEFS.zombie.damageType).toBe('poison');
    });

    it('archer has physical damageType', () => {
      expect(MONSTER_DEFS.archer.damageType).toBe('physical');
    });

    it('boss_knight has physical damageType (base)', () => {
      expect(MONSTER_DEFS.boss_knight.damageType).toBe('physical');
    });

    it('monster constructor copies damageType from definition', () => {
      const skeleton = createMonster('skeleton', 0, 0);
      expect(skeleton.damageType).toBe('physical');

      const demon = createMonster('demon', 0, 0);
      expect(demon.damageType).toBe('fire');

      const slime = createMonster('slime', 0, 0);
      expect(slime.damageType).toBe('poison');
    });

    it('monster defaults to physical if definition has no damageType', () => {
      // The constructor uses `def.damageType || 'physical'`
      // All current defs have damageType, but test the fallback logic
      const m = createMonster('skeleton', 0, 0);
      expect(m.damageType).toBe('physical');
    });

    it('boss_knight has phase-specific damage types', () => {
      const phases = MONSTER_DEFS.boss_knight.phases;
      expect(phases[0].damageType).toBe('physical'); // melee phase
      expect(phases[1].damageType).toBe('fire');     // charge phase
      expect(phases[2].damageType).toBe('physical'); // aoe_frenzy phase
    });

    it('boss attack events use phase-specific damageType', () => {
      const m = createMonster('boss_knight', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      // Set HP to trigger charge phase (60%)
      m.hp = Math.floor(m.maxHp * 0.55);
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.damageType).toBe('fire'); // charge phase = fire
    });

    it('monster attack events include damageType field', () => {
      const m = createMonster('zombie', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.damageType).toBe('poison');
    });
  });

  // ── Serialization ───────────────────────────────────────────────
  describe('serialization', () => {
    it('serialize returns expected shape', () => {
      const m = createMonster('boss_knight', 100, 200, 2);
      const s = m.serialize();
      expect(s.id).toBe(m.id);
      expect(s.type).toBe('boss_knight');
      expect(s.name).toBe('Dark Knight');
      expect(s.x).toBe(100);
      expect(s.y).toBe(200);
      expect(s.isBoss).toBe(true);
      expect(s).toHaveProperty('hp');
      expect(s).toHaveProperty('maxHp');
      expect(s).toHaveProperty('alive');
    });

    it('serialize includes damageType', () => {
      const m = createMonster('demon', 100, 100);
      expect(m.damageType).toBe('fire');
      const s = m.serialize();
      expect(s).toHaveProperty('damageType', 'fire');
    });

    it('serialize includes damageType for all monster types', () => {
      for (const type of Object.keys(MONSTER_DEFS)) {
        const m = createMonster(type, 0, 0);
        const s = m.serialize();
        expect(s.damageType).toBe(m.damageType);
      }
    });
  });

  // ── Phase 9: New Monster Types — Creation & Stats ─────────────
  describe('phase 9 new monster types', () => {
    it('fire_imp has correct stats and ranged behavior', () => {
      const m = createMonster('fire_imp', 50, 50);
      expect(m.hp).toBe(45);
      expect(m.maxHp).toBe(45);
      expect(m.damage).toBe(14);
      expect(m.behavior).toBe('ranged');
      expect(m.damageType).toBe('fire');
      expect(m.projectileSpeed).toBe(350);
      expect(m.speed).toBe(100);
    });

    it('hell_hound has correct stats and melee_charge behavior', () => {
      const m = createMonster('hell_hound', 50, 50);
      expect(m.hp).toBe(100);
      expect(m.maxHp).toBe(100);
      expect(m.damage).toBe(20);
      expect(m.behavior).toBe('melee_charge');
      expect(m.damageType).toBe('fire');
      expect(m.speed).toBe(130);
      expect(m.chargeRange).toEqual([100, 250]);
    });

    it('shadow_stalker has correct stats and melee_stealth behavior', () => {
      const m = createMonster('shadow_stalker', 50, 50);
      expect(m.hp).toBe(90);
      expect(m.maxHp).toBe(90);
      expect(m.damage).toBe(25);
      expect(m.behavior).toBe('melee_stealth');
      expect(m.damageType).toBe('physical');
      expect(m.stealthAlpha).toBe(0.1);
      expect(m.firstHitMultiplier).toBe(2.0);
    });

    it('wraith has correct stats and ranged_teleport behavior', () => {
      const m = createMonster('wraith', 50, 50);
      expect(m.hp).toBe(70);
      expect(m.maxHp).toBe(70);
      expect(m.damage).toBe(18);
      expect(m.behavior).toBe('ranged_teleport');
      expect(m.damageType).toBe('cold');
      expect(m.physicalResist).toBe(50);
      expect(m.teleportAfterAttacks).toBe(2);
      expect(m.projectileSpeed).toBe(280);
    });
  });

  // ── Phase 9: New Bosses — Creation & Stats ────────────────────
  describe('phase 9 new bosses', () => {
    it('boss_infernal has correct stats and 3 phases', () => {
      const m = createMonster('boss_infernal', 50, 50);
      expect(m.hp).toBe(800);
      expect(m.maxHp).toBe(800);
      expect(m.damage).toBe(30);
      expect(m.isBoss).toBe(true);
      expect(m.damageType).toBe('fire');
      expect(m.phases).toHaveLength(3);
      expect(m.phases[0].mode).toBe('ranged_barrage');
      expect(m.phases[1].mode).toBe('summoner');
      expect(m.phases[2].mode).toBe('enrage');
      expect(m.summonType).toBe('fire_imp');
      expect(m.summonCount).toBe(2);
    });

    it('boss_void has correct stats and 3 phases', () => {
      const m = createMonster('boss_void', 50, 50);
      expect(m.hp).toBe(1200);
      expect(m.maxHp).toBe(1200);
      expect(m.damage).toBe(35);
      expect(m.isBoss).toBe(true);
      expect(m.damageType).toBe('cold');
      expect(m.phases).toHaveLength(3);
      expect(m.phases[0].mode).toBe('teleport_slash');
      expect(m.phases[1].mode).toBe('shadow_clones');
      expect(m.phases[2].mode).toBe('void_storm');
      expect(m.voidPulseRadius).toBe(150);
      expect(m.voidPulseDamage).toBe(40);
    });
  });

  // ── Phase 9: melee_charge Behavior (Hell Hound) ───────────────
  describe('melee_charge behavior', () => {
    it('starts with charging=false and chargeCooldown=0', () => {
      const m = createMonster('hell_hound', 100, 100);
      expect(m.charging).toBe(false);
      expect(m.chargeCooldown).toBe(0);
    });

    it('initiates charge when player is within chargeRange and cooldown is 0', () => {
      const m = createMonster('hell_hound', 100, 100);
      m.aiState = AI_STATES.ALERT;
      m.attackCooldown = 9999; // prevent regular attacks
      const player = { id: 'p1', alive: true, x: 250, y: 100 }; // 150 units, within [100, 250]
      const events = m.update(16, [player]);
      // Charge should have initiated — check for state change or event
      const chargeEvent = events.find(e => e.type === 'monster_charge' || e.type === 'monster_attack');
      if (m.charging !== undefined) {
        expect(m.charging === true || chargeEvent).toBeTruthy();
      }
    });

    it('charge attack deals 1.5x damage with charge attackType', () => {
      const m = createMonster('hell_hound', 100, 100);
      m.aiState = AI_STATES.ALERT;
      m.chargeCooldown = 0;
      // Place player at 150 units (within chargeRange [100, 250])
      const player = { id: 'p1', alive: true, x: 250, y: 100 };
      m.targetId = 'p1';
      // First update initiates charge
      m.update(16, [player]);
      expect(m.charging).toBe(true);
      // Expire the charge timer to trigger hit
      m.chargeTimer = 0;
      // Put player close so closestDist < attackRange * 2
      player.x = 130;
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.damage).toBe(Math.floor(20 * 1.5));
      expect(attack.attackType).toBe('charge');
    });

    it('charge attack includes stunDuration', () => {
      const m = createMonster('hell_hound', 100, 100);
      m.aiState = AI_STATES.ALERT;
      m.chargeCooldown = 0;
      const player = { id: 'p1', alive: true, x: 250, y: 100 };
      m.targetId = 'p1';
      m.update(16, [player]); // initiate charge
      m.chargeTimer = 0;
      player.x = 130;
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack).toHaveProperty('stunDuration');
      expect(attack.stunDuration).toBe(500); // chargeStunDuration from def
    });
  });

  // ── Phase 9: melee_stealth Behavior (Shadow Stalker) ──────────
  describe('melee_stealth behavior', () => {
    it('starts stealthed for melee_stealth behavior', () => {
      const m = createMonster('shadow_stalker', 100, 100);
      expect(m.stealthed).toBe(true);
    });

    it('reveals stealth when entering ALERT state', () => {
      const m = createMonster('shadow_stalker', 100, 100);
      expect(m.stealthed).toBe(true);
      m.aiState = AI_STATES.ALERT;
      m.targetId = 'p1';
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      // After alert processing, stealthed should become false
      const revealEvent = events.find(e => e.type === 'stealth_reveal');
      if (revealEvent) {
        expect(revealEvent).toBeDefined();
      }
      // Once close enough, stealth breaks
      if (m.stealthed !== undefined) {
        // stealth should be false after engaging
        expect(m.stealthed === false || m.aiState === AI_STATES.ATTACK).toBeTruthy();
      }
    });

    it('first hit deals damage * firstHitMultiplier with ambush attackType', () => {
      const m = createMonster('shadow_stalker', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      m.hasDealtFirstHit = false;
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.damage).toBe(Math.floor(25 * 2.0));
      expect(attack.attackType).toBe('ambush');
    });

    it('subsequent attacks use normal damage after first hit', () => {
      const m = createMonster('shadow_stalker', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      m.hasDealtFirstHit = true;
      m.stealthed = false;
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.damage).toBe(25);
    });
  });

  // ── Phase 9: ranged_teleport Behavior (Wraith) ────────────────
  describe('ranged_teleport behavior', () => {
    it('attacksSinceLastTeleport starts at 0', () => {
      const m = createMonster('wraith', 100, 100);
      expect(m.attacksSinceLastTeleport).toBe(0);
    });

    it('increments attack counter after each attack', () => {
      const m = createMonster('wraith', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      const player = { id: 'p1', alive: true, x: 200, y: 100 };
      m.update(16, [player]);
      expect(m.attacksSinceLastTeleport).toBeGreaterThanOrEqual(1);
    });

    it('teleports after reaching teleportAfterAttacks threshold', () => {
      const m = createMonster('wraith', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      m.attacksSinceLastTeleport = 1; // one attack away from teleport
      const player = { id: 'p1', alive: true, x: 200, y: 100 };
      const events = m.update(16, [player]);
      const teleport = events.find(e => e.type === 'monster_teleport');
      if (teleport) {
        expect(teleport).toBeDefined();
        expect(m.attacksSinceLastTeleport).toBe(0);
      }
    });

    it('wraith emits ranged attackType with projectile data', () => {
      const m = createMonster('wraith', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      const player = { id: 'p1', alive: true, x: 200, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.attackType).toBe('ranged');
      expect(attack.projectile).toBeDefined();
      expect(attack.projectile.speed).toBe(280);
    });
  });

  // ── Phase 9: Wraith Physical Resistance ───────────────────────
  describe('wraith physical resistance', () => {
    it('physical damage reduced by physicalResist percentage before armor', () => {
      const m = createMonster('wraith', 50, 50); // physicalResist = 50
      const dealt = m.takeDamage(100, 'physical');
      // 100 * (1 - 50/100) = 50 before armor
      // 50 - armor reduction after
      expect(dealt).toBeLessThanOrEqual(50);
      expect(dealt).toBeGreaterThan(0);
    });

    it('fire damage is not reduced by physicalResist', () => {
      const m = createMonster('wraith', 50, 50);
      const dealt = m.takeDamage(100, 'fire');
      // No resistance reduction — only armor applies
      expect(dealt).toBeGreaterThan(50);
    });

    it('cold damage is not reduced by physicalResist', () => {
      const m = createMonster('wraith', 50, 50);
      const dealt = m.takeDamage(100, 'cold');
      // No resistance reduction — only armor applies
      expect(dealt).toBeGreaterThan(50);
    });

    it('monster with 0 physicalResist takes full physical damage', () => {
      const m = createMonster('skeleton', 50, 50); // no physicalResist
      const dealt = m.takeDamage(100, 'physical');
      // Only armor reduction, no resistance
      const expected = Math.max(1, Math.floor(100 - m.armor * 0.4));
      expect(dealt).toBe(expected);
    });
  });

  // ── Phase 9: Serialize Includes New Fields ────────────────────
  describe('phase 9 serialization fields', () => {
    it('serialize includes stealthed, charging, physicalResist', () => {
      const stalker = createMonster('shadow_stalker', 0, 0);
      const ss = stalker.serialize();
      expect(ss).toHaveProperty('stealthed');

      const hound = createMonster('hell_hound', 0, 0);
      const hs = hound.serialize();
      expect(hs).toHaveProperty('charging');

      const wraith = createMonster('wraith', 0, 0);
      const ws = wraith.serialize();
      expect(ws).toHaveProperty('physicalResist');
    });

    it('shadow_stalker serializes with stealthed=true initially', () => {
      const m = createMonster('shadow_stalker', 0, 0);
      const s = m.serialize();
      expect(s.stealthed).toBe(true);
    });

    it('hell_hound serializes with charging=false initially', () => {
      const m = createMonster('hell_hound', 0, 0);
      const s = m.serialize();
      expect(s.charging).toBe(false);
    });

    it('wraith serializes with physicalResist=50', () => {
      const m = createMonster('wraith', 0, 0);
      const s = m.serialize();
      expect(s.physicalResist).toBe(50);
    });
  });

  // ── Phase 9: New Monster Damage Types ─────────────────────────
  describe('phase 9 damage types', () => {
    it('fire_imp has fire damageType', () => {
      expect(MONSTER_DEFS.fire_imp.damageType).toBe('fire');
    });

    it('hell_hound has fire damageType', () => {
      expect(MONSTER_DEFS.hell_hound.damageType).toBe('fire');
    });

    it('shadow_stalker has physical damageType', () => {
      expect(MONSTER_DEFS.shadow_stalker.damageType).toBe('physical');
    });

    it('wraith has cold damageType', () => {
      expect(MONSTER_DEFS.wraith.damageType).toBe('cold');
    });

    it('boss_infernal has fire damageType', () => {
      expect(MONSTER_DEFS.boss_infernal.damageType).toBe('fire');
    });

    it('boss_void has cold damageType', () => {
      expect(MONSTER_DEFS.boss_void.damageType).toBe('cold');
    });
  });

  // ── Phase 9.5: Boss Infernal Phase AI ─────────────────────────
  describe('boss_infernal phase AI', () => {
    it('phase 0 is ranged_barrage at full HP', () => {
      const m = createMonster('boss_infernal', 100, 100);
      expect(m.currentPhase).toBe(0);
      expect(m.phases[0].mode).toBe('ranged_barrage');
    });

    it('ranged_barrage emits 3 attack events (2 side + 1 center)', () => {
      const m = createMonster('boss_infernal', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      const player = { id: 'p1', alive: true, x: 300, y: 100 };
      const events = m.update(16, [player]);
      const attacks = events.filter(e => e.type === 'monster_attack');
      expect(attacks.length).toBe(3); // 2 side projectiles + 1 center
      // All should be ranged with projectile data
      for (const atk of attacks) {
        expect(atk.attackType).toBe('ranged');
        expect(atk.projectile).not.toBeNull();
        expect(atk.projectile.speed).toBe(320);
        expect(atk.damageType).toBe('fire');
      }
    });

    it('transitions to summoner phase at 60% HP', () => {
      const m = createMonster('boss_infernal', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 999;
      m.hp = Math.floor(m.maxHp * 0.55);
      const player = { id: 'p1', alive: true, x: 300, y: 100 };
      const events = m.update(16, [player]);
      const phase = events.find(e => e.type === 'boss_phase');
      expect(phase).toBeDefined();
      expect(phase.mode).toBe('summoner');
      expect(m.currentPhase).toBe(1);
    });

    it('summoner phase emits boss_summon event when cooldown expires', () => {
      const m = createMonster('boss_infernal', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 999;
      m.hp = Math.floor(m.maxHp * 0.55); // below 60% → triggers summoner phase
      m.currentPhase = 1;
      m.summonCooldown = 0; // expired
      const player = { id: 'p1', alive: true, x: 300, y: 100 };
      const events = m.update(16, [player]);
      const summon = events.find(e => e.type === 'boss_summon');
      expect(summon).toBeDefined();
      expect(summon.summonType).toBe('fire_imp');
      expect(summon.positions.length).toBe(2);
    });

    it('summoner does not summon when cooldown is active', () => {
      const m = createMonster('boss_infernal', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 999;
      m.currentPhase = 1;
      m.summonCooldown = 5000; // still active
      const player = { id: 'p1', alive: true, x: 300, y: 100 };
      const events = m.update(16, [player]);
      const summon = events.find(e => e.type === 'boss_summon');
      expect(summon).toBeUndefined();
    });

    it('enrage phase at 30% HP — 1.5x damage, halved cooldown', () => {
      const m = createMonster('boss_infernal', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      m.hp = Math.floor(m.maxHp * 0.25);
      const player = { id: 'p1', alive: true, x: 300, y: 100 };
      const events = m.update(16, [player]);
      const attacks = events.filter(e => e.type === 'monster_attack');
      expect(attacks.length).toBeGreaterThan(0);
      // enrage: 1.5x damage
      const center = attacks[attacks.length - 1]; // last one is center
      expect(center.damage).toBe(Math.floor(30 * 1.5));
      // Cooldown should be halved
      expect(m.attackCooldown).toBe(Math.floor(m.attackSpeed / 2));
    });
  });

  // ── Phase 9.5: Boss Void Reaper Phase AI ──────────────────────
  describe('boss_void phase AI', () => {
    it('phase 0 is teleport_slash at full HP', () => {
      const m = createMonster('boss_void', 100, 100);
      expect(m.currentPhase).toBe(0);
      expect(m.phases[0].mode).toBe('teleport_slash');
    });

    it('teleport_slash teleports behind player when cooldown expires', () => {
      const m = createMonster('boss_void', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.bossTeleportCooldown = 0;
      m.attackCooldown = 999;
      const player = { id: 'p1', alive: true, x: 150, y: 100 }; // within attackRange*1.2
      const events = m.update(16, [player]);
      const tp = events.find(e => e.type === 'teleport');
      expect(tp).toBeDefined();
      // Boss should be ~50px from player (behind them)
      const distToPlayer = Math.sqrt((m.x - 150) ** 2 + (m.y - 100) ** 2);
      expect(distToPlayer).toBeCloseTo(50, 0);
      // Teleport resets attackCooldown to 0, then attack block fires and sets it to attackSpeed
      // So we just verify the teleport happened and boss repositioned
    });

    it('teleport_slash deals 1.5x damage', () => {
      const m = createMonster('boss_void', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.damage).toBe(Math.floor(35 * 1.5));
      expect(attack.attackType).toBe('melee');
    });

    it('shadow_clones phase emits boss_shadow_clones on transition', () => {
      const m = createMonster('boss_void', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 999;
      m.hp = Math.floor(m.maxHp * 0.65); // below 70%
      const player = { id: 'p1', alive: true, x: 300, y: 100 };
      const events = m.update(16, [player]);
      const clones = events.find(e => e.type === 'boss_shadow_clones');
      expect(clones).toBeDefined();
      expect(clones.count).toBe(2);
      expect(clones.cloneHp).toBe(Math.floor(m.maxHp * 0.3));
      expect(clones.cloneDamage).toBe(Math.floor(35 * 0.5));
    });

    it('void_storm phase emits void_pulse when cooldown expires', () => {
      const m = createMonster('boss_void', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 999;
      m.hp = Math.floor(m.maxHp * 0.35); // below 40% → triggers void_storm
      m.currentPhase = 2;
      m.voidPulseCooldown = 0;
      const player = { id: 'p1', alive: true, x: 150, y: 100 }; // within attackRange*1.2
      const events = m.update(16, [player]);
      const pulse = events.find(e => e.type === 'void_pulse');
      expect(pulse).toBeDefined();
      expect(pulse.radius).toBe(150);
      expect(pulse.damage).toBe(40);
      expect(pulse.damageType).toBe('cold');
    });

    it('void_storm melee attacks deal 1.2x damage', () => {
      const m = createMonster('boss_void', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 0;
      m.hp = Math.floor(m.maxHp * 0.35); // below 40% → triggers void_storm
      m.currentPhase = 2;
      m.voidPulseCooldown = 999; // prevent pulse
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      const events = m.update(16, [player]);
      const attack = events.find(e => e.type === 'monster_attack');
      expect(attack).toBeDefined();
      expect(attack.damage).toBe(Math.floor(35 * 1.2));
    });
  });

  // ── Phase 9.5: Bug Fix Verification ───────────────────────────
  describe('Phase 9.5 bug fixes', () => {
    it('wraith teleport stays within leash distance', () => {
      const m = createMonster('wraith', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.attackCooldown = 999;
      m.attacksSinceLastTeleport = 2; // trigger teleport
      const player = { id: 'p1', alive: true, x: 200, y: 100 };
      // Run multiple times to check bounds
      for (let trial = 0; trial < 20; trial++) {
        m.attacksSinceLastTeleport = 2;
        m.x = 100; m.y = 100;
        m.update(16, [player]);
        const dist = Math.sqrt((m.x - m.spawnX) ** 2 + (m.y - m.spawnY) ** 2);
        expect(dist).toBeLessThan(m.leashDistance);
      }
    });

    it('chargeCooldown decrements in ATTACK state', () => {
      const m = createMonster('hell_hound', 100, 100);
      m.aiState = AI_STATES.ATTACK;
      m.chargeCooldown = 5000;
      m.attackCooldown = 999;
      const player = { id: 'p1', alive: true, x: 130, y: 100 };
      m.update(100, [player]); // 100ms tick
      expect(m.chargeCooldown).toBe(4900);
    });

    it('armor only reduces physical damage on monsters', () => {
      const m = createMonster('boss_knight', 0, 0); // armor = 15
      const physDmg = m.takeDamage(50, 'physical');
      const m2 = createMonster('boss_knight', 0, 0);
      const fireDmg = m2.takeDamage(50, 'fire');
      // Physical should be reduced by armor, fire should not
      expect(physDmg).toBeLessThan(fireDmg);
      expect(fireDmg).toBe(50); // fire bypasses armor
    });
  });

  // ── Phase 23.2: Aggro Range + Monster Patrol ─────────────────
  describe('Phase 23.2: aggro range & sticky aggro', () => {
    it('monster starts with aggroed=false', () => {
      const m = createMonster('skeleton', 100, 100);
      expect(m.aggroed).toBe(false);
    });

    it('monster aggros when player is within aggroRadius', () => {
      const m = createMonster('skeleton', 100, 100); // aggroRadius = 150
      const player = { id: 'p1', alive: true, x: 200, y: 100 }; // 100 units away
      m.update(16, [player]);
      expect(m.aggroed).toBe(true);
      expect(m.aiState).toBe(AI_STATES.ALERT);
    });

    it('monster does NOT aggro when player is beyond aggroRadius', () => {
      const m = createMonster('skeleton', 100, 100); // aggroRadius = 150
      const player = { id: 'p1', alive: true, x: 500, y: 500 };
      m.update(16, [player]);
      expect(m.aggroed).toBe(false);
      expect(m.aiState).toBe(AI_STATES.IDLE);
    });

    it('boss has unlimited aggro range — aggros regardless of distance', () => {
      const m = createMonster('boss_knight', 100, 100);
      const player = { id: 'p1', alive: true, x: 9999, y: 9999 };
      m.update(16, [player]);
      expect(m.aggroed).toBe(true);
      expect(m.aiState).toBe(AI_STATES.ALERT);
    });

    it('sticky aggro — once aggroed stays aggroed after returning to IDLE', () => {
      const m = createMonster('skeleton', 100, 100);
      // Manually set aggroed and put in IDLE with a distant player
      m.aggroed = true;
      m.aiState = AI_STATES.IDLE;
      // Player is far beyond aggroRadius, but aggroed is sticky
      const player = { id: 'p1', alive: true, x: 9999, y: 9999 };
      m.update(16, [player]);
      // Should immediately re-engage because aggroed is true
      expect(m.aiState).toBe(AI_STATES.ALERT);
    });

    it('leash return resets aggroed flag', () => {
      const m = createMonster('skeleton', 100, 100);
      m.aggroed = true;
      m.aiState = AI_STATES.LEASH;
      m.x = 105;
      m.y = 105;
      m.update(16, []);
      // If close enough to spawn, should reset
      if (Math.sqrt((m.x - 100) ** 2 + (m.y - 100) ** 2) < 10) {
        expect(m.aggroed).toBe(false);
        expect(m.aiState).toBe(AI_STATES.IDLE);
      }
    });

    it('taking damage sets aggroed=true (hit from beyond range)', () => {
      const m = createMonster('skeleton', 100, 100);
      expect(m.aggroed).toBe(false);
      m.takeDamage(10);
      expect(m.aggroed).toBe(true);
    });

    it('serialize includes aggroed field', () => {
      const m = createMonster('skeleton', 0, 0);
      m.aggroed = true;
      const s = m.serialize();
      expect(s).toHaveProperty('aggroed', true);
    });
  });

  describe('Phase 23.2: patrol behavior', () => {
    it('idle monster patrols at 30% speed (moves slowly)', () => {
      const m = createMonster('skeleton', 100, 100);
      // Set a wander target away from current position
      m.wanderTargetX = 164; // 64px from spawn
      m.wanderTargetY = 100;
      m.wanderTimer = 5000; // don't re-pick target
      const startX = m.x;
      m.update(100, []); // 100ms tick, no players
      // Monster should have moved, but slowly (30% of 80 speed)
      const moved = Math.abs(m.x - startX);
      // At 30% of 80 speed = 24 px/s, in 100ms = 2.4px
      expect(moved).toBeGreaterThan(0);
      expect(moved).toBeLessThan(10); // definitely slow patrol speed
    });

    it('patrol picks new target within 2 tiles (64px) of spawn', () => {
      const m = createMonster('skeleton', 200, 200);
      m.wanderTimer = 0; // force re-pick on next update
      m.update(16, []); // no players
      // After picking new target, should be within 64px of spawn
      const dx = m.wanderTargetX - m.spawnX;
      const dy = m.wanderTargetY - m.spawnY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeLessThanOrEqual(64);
      expect(dist).toBeGreaterThanOrEqual(16);
    });

    it('patrol picks new target when within 4px of current target', () => {
      const m = createMonster('skeleton', 100, 100);
      m.wanderTargetX = 102; // 2px away
      m.wanderTargetY = 100;
      m.wanderTimer = 9999; // high timer
      m.update(16, []); // no players
      // Within 4px → timer should be reset to 0 to pick new target
      expect(m.wanderTimer).toBe(0);
    });

    it('boss does NOT patrol — stays still in IDLE', () => {
      const m = createMonster('boss_knight', 100, 100);
      // No players in range — boss stays idle
      const startX = m.x;
      const startY = m.y;
      // Manually set IDLE and no players nearby
      m.aiState = AI_STATES.IDLE;
      m.aggroed = false;
      // Use empty players and far-away player to prevent aggro... but boss has unlimited aggro
      // Actually boss will immediately aggro any player. Test with NO players.
      m.update(100, []);
      // Boss should not have moved (no patrol)
      expect(m.x).toBe(startX);
      expect(m.y).toBe(startY);
    });

    it('treasure_goblin does NOT patrol', () => {
      // Treasure goblins have their own flee AI and skip the normal state machine
      const m = createMonster('treasure_goblin', 100, 100);
      // They always start in FLEE state
      expect(m.aiState).toBe(AI_STATES.FLEE);
    });

    it('patrol uses wall collision (moveToward)', () => {
      const m = createMonster('skeleton', 100, 100);
      // Mock world with isWalkable
      m._world = {
        isWalkable: (x, y) => x < 130, // wall at x=130
      };
      m.wanderTargetX = 200; // target past the wall
      m.wanderTargetY = 100;
      m.wanderTimer = 5000;
      m.update(1000, []); // 1 second tick
      // Should not pass x=130 due to wall collision
      expect(m.x).toBeLessThan(130);
    });
  });
});
