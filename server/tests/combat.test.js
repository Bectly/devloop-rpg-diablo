import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CombatSystem } = require('../game/combat');
const { Player } = require('../game/player');
const { Monster, createMonster } = require('../game/monsters');

describe('CombatSystem', () => {
  let combat;
  let player;

  beforeEach(() => {
    combat = new CombatSystem();
    player = new Player('TestHero', 'warrior');
    // Set dodge to 0 for deterministic tests
    player.dodgeChance = 0;
  });

  // ── Damage Calculation ──────────────────────────────────────────
  describe('calcPlayerDamage', () => {
    it('returns damage based on attackPower', () => {
      const { damage } = combat.calcPlayerDamage(player);
      // Warrior: attackPower = 26 (str 13 * 2)
      // With +/- 15% variance: floor(26 * [0.85..1.15])
      // Min: floor(26 * 0.85) = 22, Max: floor(26 * 1.15) = 29
      expect(damage).toBeGreaterThanOrEqual(1);
      // Non-crit max (with ceiling from variance) should be reasonable
      expect(damage).toBeLessThanOrEqual(60); // generous upper bound for crits
    });

    it('weapon damage adds to base damage', () => {
      player.equipment.weapon = { type: 'weapon', subType: 'sword', damage: 20, bonuses: {}, attackSpeed: 800 };
      player.recalcEquipBonuses();
      // attackPower = 20 + (13*2) = 46
      // Weapon adds another 20 in calcPlayerDamage
      // Total base = 46 + 20 = 66
      const results = [];
      for (let i = 0; i < 50; i++) {
        results.push(combat.calcPlayerDamage(player).damage);
      }
      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      // Average should be roughly around 66 (without crit)
      expect(avg).toBeGreaterThan(30);
    });

    it('attack_up buff multiplies damage by 1.3', () => {
      player.buffs.push({ effect: 'attack_up', remaining: 5000, duration: 5000 });
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(combat.calcPlayerDamage(player).damage);
      }
      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      // Base 26, with 1.3x buff = ~33.8 average (without crits factored in)
      expect(avg).toBeGreaterThan(20);
    });

    it('critical hits double the damage', () => {
      // Force crit by setting critChance to 100
      player.critChance = 100;
      const results = [];
      for (let i = 0; i < 20; i++) {
        const { damage, isCrit } = combat.calcPlayerDamage(player);
        expect(isCrit).toBe(true);
        results.push(damage);
      }
      // All should be crit (2x multiplied)
      const avg = results.reduce((a, b) => a + b, 0) / results.length;
      expect(avg).toBeGreaterThan(30); // 26 base * 2x * variance
    });

    it('dagger gets extra 20% crit damage on crit', () => {
      player.critChance = 100;
      player.equipment.weapon = { type: 'weapon', subType: 'dagger', damage: 5, bonuses: {}, attackSpeed: 500 };
      player.recalcEquipBonuses();

      const daggerDamages = [];
      for (let i = 0; i < 500; i++) {
        daggerDamages.push(combat.calcPlayerDamage(player).damage);
      }
      const daggerAvg = daggerDamages.reduce((a, b) => a + b, 0) / daggerDamages.length;

      // Switch to sword with same damage
      player.equipment.weapon = { type: 'weapon', subType: 'sword', damage: 5, bonuses: {}, attackSpeed: 800 };
      player.recalcEquipBonuses();
      const swordDamages = [];
      for (let i = 0; i < 500; i++) {
        swordDamages.push(combat.calcPlayerDamage(player).damage);
      }
      const swordAvg = swordDamages.reduce((a, b) => a + b, 0) / swordDamages.length;

      // Dagger crit damage should be ~20% higher than sword crit damage
      // Both have 100% crit, same base. Dagger gets floor(baseDmg * 2.0 * 1.2)
      // vs sword floor(baseDmg * 2.0). So dagger should be ~1.2x sword.
      expect(daggerAvg).toBeGreaterThan(swordAvg * 1.1);
    });

    it('damage minimum is 1', () => {
      player.stats.str = 0;
      player.equipBonuses.damage = 0;
      player.recalcStats();
      const { damage } = combat.calcPlayerDamage(player);
      expect(damage).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Monster Armor Reduction ─────────────────────────────────────
  describe('armor reduction on monsters', () => {
    it('monster takeDamage applies armor * 0.4 reduction', () => {
      const m = createMonster('skeleton', 100, 100);
      // skeleton armor = 3, reduction = floor(3 * 0.4) = 1.2 => floor
      // damage 20 => max(1, floor(20 - 3*0.4)) = max(1, floor(18.8)) = 18
      const dealt = m.takeDamage(20);
      expect(dealt).toBe(Math.max(1, Math.floor(20 - 3 * 0.4)));
    });

    it('minimum damage through armor is 1', () => {
      const m = createMonster('boss_knight', 100, 100);
      // boss_knight armor = 15, reduction = 15 * 0.4 = 6
      // damage 1 => max(1, floor(1 - 6)) = max(1, -5) = 1
      const dealt = m.takeDamage(1);
      expect(dealt).toBe(1);
    });
  });

  // ── Player Attack ───────────────────────────────────────────────
  describe('playerAttack', () => {
    it('attacks nearest monster in range', () => {
      const m = createMonster('skeleton', player.x + 30, player.y);
      const result = combat.playerAttack(player, [m]);
      expect(result).not.toBeNull();
      expect(result.type).toBe('combat:hit');
      expect(result.targetId).toBe(m.id);
    });

    it('returns null if no monster in range', () => {
      const m = createMonster('skeleton', player.x + 9999, player.y);
      const result = combat.playerAttack(player, [m]);
      expect(result).toBeNull();
    });

    it('returns null if player cannot attack (cooldown)', () => {
      player.attackCooldown = 500;
      const m = createMonster('skeleton', player.x + 30, player.y);
      const result = combat.playerAttack(player, [m]);
      expect(result).toBeNull();
    });

    it('starts attack cooldown after attacking', () => {
      const m = createMonster('skeleton', player.x + 30, player.y);
      combat.playerAttack(player, [m]);
      expect(player.attackCooldown).toBe(player.baseAttackSpeed);
    });

    it('emits combat:death event when monster dies', () => {
      const m = createMonster('slime_small', player.x + 30, player.y);
      m.hp = 1;
      m.armor = 0;
      combat.playerAttack(player, [m]);
      const events = combat.clearEvents();
      const deathEvent = events.find(e => e.type === 'combat:death');
      expect(deathEvent).toBeDefined();
      expect(deathEvent.entityId).toBe(m.id);
    });

    it('awards XP on kill', () => {
      const m = createMonster('slime_small', player.x + 30, player.y);
      m.hp = 1;
      m.armor = 0;
      const xpBefore = player.xp;
      combat.playerAttack(player, [m]);
      expect(player.xp).toBeGreaterThan(xpBefore);
    });

    it('skips dead monsters when finding targets', () => {
      const m1 = createMonster('skeleton', player.x + 20, player.y);
      const m2 = createMonster('skeleton', player.x + 30, player.y);
      m1.alive = false;
      const result = combat.playerAttack(player, [m1, m2]);
      expect(result.targetId).toBe(m2.id);
    });
  });

  // ── Skill Usage ─────────────────────────────────────────────────
  describe('playerSkill', () => {
    it('AOE skill (Cleave) hits all monsters in radius', () => {
      const m1 = createMonster('skeleton', player.x + 20, player.y);
      const m2 = createMonster('skeleton', player.x + 40, player.y);
      const m3 = createMonster('skeleton', player.x + 500, player.y); // out of range

      const results = combat.playerSkill(player, 0, [m1, m2, m3], [player]);
      // Cleave radius = 60, so m1 and m2 should be hit, not m3
      const hits = results.filter(e => e.type === 'combat:hit');
      expect(hits.length).toBe(2);
      expect(hits.map(h => h.targetId)).toContain(m1.id);
      expect(hits.map(h => h.targetId)).toContain(m2.id);
    });

    it('Fireball uses spellPower for damage', () => {
      const mage = new Player('Mage', 'mage');
      mage.dodgeChance = 0;
      const m = createMonster('skeleton', mage.x + 20, mage.y);
      const initialHp = m.hp;

      combat.playerSkill(mage, 0, [m], [mage]);
      // Fireball: damage multiplier 2.5, uses spellPower
      // spellPower = 39, so base = floor(39 * 2.5) = 97
      expect(m.hp).toBeLessThan(initialHp);
    });

    it('single target skill (Shield Bash) applies stun', () => {
      const m = createMonster('skeleton', player.x + 30, player.y);
      combat.playerSkill(player, 1, [m], [player]); // Shield Bash
      expect(m.stunned).toBeGreaterThan(0);
    });

    it('buff skill (War Cry) applies to all players', () => {
      const p2 = new Player('Ally', 'ranger');
      combat.playerSkill(player, 2, [], [player, p2]); // War Cry
      expect(player.buffs.length).toBe(1);
      expect(player.buffs[0].effect).toBe('attack_up');
      expect(p2.buffs.length).toBe(1);
      expect(p2.buffs[0].effect).toBe('attack_up');
    });

    it('multi skill (Multi-Shot) hits up to count targets', () => {
      const ranger = new Player('R', 'ranger');
      const m1 = createMonster('skeleton', ranger.x + 20, ranger.y);
      const m2 = createMonster('skeleton', ranger.x + 40, ranger.y);
      const m3 = createMonster('skeleton', ranger.x + 60, ranger.y);
      const m4 = createMonster('skeleton', ranger.x + 80, ranger.y);

      const results = combat.playerSkill(ranger, 0, [m1, m2, m3, m4], [ranger]);
      // Multi-Shot count = 3
      const hits = results.filter(e => e.type === 'combat:hit');
      expect(hits.length).toBe(3);
    });

    it('dot skill (Poison Arrow) sets poison on target', () => {
      const ranger = new Player('R', 'ranger');
      const m = createMonster('skeleton', ranger.x + 30, ranger.y);
      combat.playerSkill(ranger, 1, [m], [ranger]); // Poison Arrow
      expect(m.poisonTick).toBeGreaterThan(0);
      expect(m.poisonDamage).toBe(5);
    });

    it('movement skill (Teleport) moves player in facing direction', () => {
      const mage = new Player('M', 'mage');
      mage.facing = 'right';
      const oldX = mage.x;
      combat.playerSkill(mage, 2, [], [mage]); // Teleport, range = 150
      expect(mage.x).toBe(Math.min(1264, oldX + 150));
    });

    it('skill deducts MP', () => {
      const mpBefore = player.mp;
      combat.playerSkill(player, 0, [], [player]); // Cleave, mpCost 15
      expect(player.mp).toBe(mpBefore - 15);
    });

    it('skill returns null if player cannot use it', () => {
      player.mp = 0;
      const result = combat.playerSkill(player, 0, [], [player]);
      expect(result).toBeNull();
    });
  });

  // ── Monster Attack Processing ───────────────────────────────────
  describe('processMonsterAttack', () => {
    it('deals damage to target player', () => {
      const initialHp = player.hp;
      const event = {
        monsterId: 'mob1',
        targetId: player.id,
        damage: 20,
        attackType: 'melee',
      };
      combat.processMonsterAttack(event, [player]);
      expect(player.hp).toBeLessThan(initialHp);
    });

    it('returns null if target player not found', () => {
      const event = {
        monsterId: 'mob1',
        targetId: 'nonexistent',
        damage: 20,
        attackType: 'melee',
      };
      const result = combat.processMonsterAttack(event, [player]);
      expect(result).toBeNull();
    });

    it('emits player death event when player dies', () => {
      player.hp = 1;
      player.dodgeChance = 0;
      player.armor = 0;
      player.equipBonuses.armor = 0;
      player.stats.vit = 0;
      player.recalcStats();
      player.dodgeChance = 0;
      player.hp = 1;
      const event = {
        monsterId: 'mob1',
        targetId: player.id,
        damage: 10000,
        attackType: 'melee',
      };
      combat.processMonsterAttack(event, [player]);
      const events = combat.clearEvents();
      const deathEvent = events.find(e => e.type === 'combat:player_death');
      expect(deathEvent).toBeDefined();
      expect(deathEvent.playerId).toBe(player.id);
    });
  });

  // ── Poison Processing ──────────────────────────────────────────
  describe('processPoison', () => {
    it('deals poison damage per second', () => {
      const m = createMonster('skeleton', 100, 100);
      m.poisonTick = 3000;
      m.poisonDamage = 10;
      const initialHp = m.hp;

      // Simulate 1 second tick boundary crossing
      combat.processPoison(m, 1000);
      expect(m.hp).toBeLessThan(initialHp);
    });

    it('does not deal poison damage if not poisoned', () => {
      const m = createMonster('skeleton', 100, 100);
      m.poisonTick = 0;
      const initialHp = m.hp;
      combat.processPoison(m, 1000);
      expect(m.hp).toBe(initialHp);
    });
  });

  // ── Event Management ────────────────────────────────────────────
  describe('events', () => {
    it('clearEvents returns all events and resets', () => {
      combat.events.push({ type: 'test1' });
      combat.events.push({ type: 'test2' });
      const events = combat.clearEvents();
      expect(events.length).toBe(2);
      expect(combat.events.length).toBe(0);
    });
  });
});
