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
  });
});
