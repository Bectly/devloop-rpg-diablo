import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Player, CLASS_SKILLS, DEATH_DURATION, RESPAWN_HP_PERCENT, DEATH_GOLD_DROP_PERCENT } = require('../game/player');

describe('Player', () => {
  // ── Creation & Class Stats ──────────────────────────────────────
  describe('creation', () => {
    it('warrior gets correct base stats (str+3, vit+2)', () => {
      const p = new Player('TestWarrior', 'warrior');
      expect(p.stats.str).toBe(13);
      expect(p.stats.dex).toBe(10);
      expect(p.stats.int).toBe(10);
      expect(p.stats.vit).toBe(12);
    });

    it('ranger gets correct base stats (str+2, dex+3)', () => {
      const p = new Player('TestRanger', 'ranger');
      expect(p.stats.str).toBe(12);
      expect(p.stats.dex).toBe(13);
      expect(p.stats.int).toBe(10);
      expect(p.stats.vit).toBe(10);
    });

    it('mage gets correct base stats (dex+2, int+3)', () => {
      const p = new Player('TestMage', 'mage');
      expect(p.stats.str).toBe(10);
      expect(p.stats.dex).toBe(12);
      expect(p.stats.int).toBe(13);
      expect(p.stats.vit).toBe(10);
    });

    it('unknown class defaults to warrior bonuses', () => {
      const p = new Player('TestUnknown', 'necromancer');
      expect(p.stats.str).toBe(13);
      expect(p.stats.vit).toBe(12);
    });

    it('default name is Hero and class is warrior', () => {
      const p = new Player();
      expect(p.name).toBe('Hero');
      expect(p.characterClass).toBe('warrior');
    });

    it('assigns correct skills per class', () => {
      const warrior = new Player('W', 'warrior');
      const ranger = new Player('R', 'ranger');
      const mage = new Player('M', 'mage');
      expect(warrior.skills[0].name).toBe('Cleave');
      expect(ranger.skills[0].name).toBe('Multi-Shot');
      expect(mage.skills[0].name).toBe('Fireball');
    });

    it('starts at level 1 with 0 xp', () => {
      const p = new Player('T', 'warrior');
      expect(p.level).toBe(1);
      expect(p.xp).toBe(0);
      expect(p.xpToNext).toBe(100);
    });

    it('starts alive with full HP and MP', () => {
      const p = new Player('T', 'warrior');
      expect(p.alive).toBe(true);
      expect(p.hp).toBe(p.maxHp);
      expect(p.mp).toBe(p.maxMp);
      expect(p.hp).toBeGreaterThan(0);
      expect(p.mp).toBeGreaterThan(0);
    });

    it('starts with 3 health potions and 2 mana potions', () => {
      const p = new Player('T', 'warrior');
      expect(p.healthPotions).toBe(3);
      expect(p.manaPotions).toBe(2);
    });
  });

  // ── Derived Stat Calculation ────────────────────────────────────
  describe('derived stats', () => {
    it('maxHp = 100 + (vit * 10) + (level * 15)', () => {
      const p = new Player('T', 'warrior');
      // warrior: vit = 12, level = 1, no equip bonuses
      // maxHp = 100 + (12 * 10) + (1 * 15) = 235
      expect(p.maxHp).toBe(235);
    });

    it('maxMp = 50 + (int * 5) + (level * 8)', () => {
      const p = new Player('T', 'mage');
      // mage: int = 13, level = 1
      // maxMp = 50 + (13 * 5) + (1 * 8) = 123
      expect(p.maxMp).toBe(123);
    });

    it('armor = equipArmor + (vit * 0.5)', () => {
      const p = new Player('T', 'warrior');
      // warrior: vit = 12, no equip
      // armor = 0 + (12 * 0.5) = 6
      expect(p.armor).toBe(6);
    });

    it('critChance = 5 + (dex * 1)', () => {
      const p = new Player('T', 'ranger');
      // ranger: dex = 13
      // critChance = 5 + 13 = 18
      expect(p.critChance).toBe(18);
    });

    it('attackPower = equipDamage + (str * 2)', () => {
      const p = new Player('T', 'warrior');
      // warrior: str = 13
      // attackPower = 0 + (13 * 2) = 26
      expect(p.attackPower).toBe(26);
    });

    it('spellPower = int * 3', () => {
      const p = new Player('T', 'mage');
      // mage: int = 13
      // spellPower = 13 * 3 = 39
      expect(p.spellPower).toBe(39);
    });

    it('dodgeChance = dex * 0.5', () => {
      const p = new Player('T', 'ranger');
      // ranger: dex = 13
      expect(p.dodgeChance).toBe(6.5);
    });
  });

  // ── Level Up ────────────────────────────────────────────────────
  describe('leveling', () => {
    it('levels up when xp >= xpToNext', () => {
      const p = new Player('T', 'warrior');
      const result = p.gainXp(100);
      expect(result).not.toBeNull();
      expect(p.level).toBe(2);
    });

    it('grants 5 free stat points on level up', () => {
      const p = new Player('T', 'warrior');
      p.gainXp(100);
      expect(p.freeStatPoints).toBe(5);
    });

    it('restores HP and MP to max on level up', () => {
      const p = new Player('T', 'warrior');
      p.hp = 50;
      p.mp = 10;
      p.gainXp(100);
      expect(p.hp).toBe(p.maxHp);
      expect(p.mp).toBe(p.maxMp);
    });

    it('carries over excess XP', () => {
      const p = new Player('T', 'warrior');
      p.gainXp(130); // 100 needed, 30 leftover
      expect(p.level).toBe(2);
      expect(p.xp).toBe(30);
    });

    it('increases xpToNext with formula 100 * 1.15^level', () => {
      const p = new Player('T', 'warrior');
      p.gainXp(100);
      // level 2: xpToNext = floor(100 * 1.15^2) = floor(132.25) = 132
      expect(p.xpToNext).toBe(Math.floor(100 * Math.pow(1.15, 2)));
    });

    it('does not gain XP when dead', () => {
      const p = new Player('T', 'warrior');
      p.alive = false;
      const result = p.gainXp(100);
      expect(result).toBeNull();
      expect(p.level).toBe(1);
    });

    it('returns null when XP gained is not enough to level', () => {
      const p = new Player('T', 'warrior');
      const result = p.gainXp(50);
      expect(result).toBeNull();
      expect(p.level).toBe(1);
      expect(p.xp).toBe(50);
    });
  });

  // ── Stat Allocation ─────────────────────────────────────────────
  describe('stat allocation', () => {
    it('allocates stat point and recalcs stats', () => {
      const p = new Player('T', 'warrior');
      p.freeStatPoints = 3;
      const oldMaxHp = p.maxHp;
      const result = p.allocateStat('vit');
      expect(result).toBe(true);
      expect(p.stats.vit).toBe(13); // was 12 for warrior
      expect(p.freeStatPoints).toBe(2);
      expect(p.maxHp).toBeGreaterThan(oldMaxHp);
    });

    it('fails with 0 free stat points', () => {
      const p = new Player('T', 'warrior');
      p.freeStatPoints = 0;
      expect(p.allocateStat('str')).toBe(false);
    });

    it('fails with invalid stat name', () => {
      const p = new Player('T', 'warrior');
      p.freeStatPoints = 5;
      expect(p.allocateStat('luck')).toBe(false);
    });
  });

  // ── Damage Taking ───────────────────────────────────────────────
  describe('taking damage', () => {
    let player;

    beforeEach(() => {
      player = new Player('T', 'warrior');
      // Override dodgeChance to 0 so tests are deterministic
      player.dodgeChance = 0;
      player.recalcStats = function() {
        // Keep dodgeChance at 0 during tests
        const origRecalc = Player.prototype.recalcStats.bind(this);
        origRecalc();
        this.dodgeChance = 0;
      };
    });

    it('reduces HP by armor-reduced amount', () => {
      const initialHp = player.hp;
      const armorReduction = Math.floor(player.armor * 0.4);
      const dealt = player.takeDamage(50);
      const expected = Math.max(1, Math.floor(50 - player.armor * 0.4));
      // Note: armor was read before takeDamage, re-read after isn't needed as armor doesn't change
      expect(dealt).toBe(expected);
      expect(player.hp).toBe(initialHp - dealt);
    });

    it('minimum damage is 1 (even if armor is very high)', () => {
      player.equipBonuses.armor = 10000;
      player.recalcStats();
      player.dodgeChance = 0;
      const dealt = player.takeDamage(1);
      expect(dealt).toBe(1);
    });

    it('dies when HP reaches 0', () => {
      player.takeDamage(10000);
      expect(player.hp).toBe(0);
      expect(player.alive).toBe(false);
      expect(player.isDying).toBe(true);
    });

    it('does not take damage when already dead', () => {
      player.alive = false;
      const dealt = player.takeDamage(50);
      expect(dealt).toBe(0);
    });

    it('does not take damage when isDying', () => {
      player.isDying = true;
      const dealt = player.takeDamage(50);
      expect(dealt).toBe(0);
    });
  });

  // ── Equipment Bonuses ───────────────────────────────────────────
  describe('equipment bonuses', () => {
    it('equipping a weapon increases attackPower via equipBonuses.damage', () => {
      const p = new Player('T', 'warrior');
      const basePower = p.attackPower;
      p.equipment.weapon = {
        type: 'weapon', subType: 'sword', damage: 10,
        bonuses: { str: 3 }, attackSpeed: 800,
      };
      p.recalcEquipBonuses();
      // damage bonus of 10 + str bonus of 3 => attackPower should rise
      expect(p.attackPower).toBeGreaterThan(basePower);
      expect(p.equipBonuses.damage).toBe(10);
      expect(p.equipBonuses.str).toBe(3);
    });

    it('equipping armor increases armor stat', () => {
      const p = new Player('T', 'warrior');
      const baseArmor = p.armor;
      p.equipment.chest = { type: 'armor', subType: 'plate', armor: 15, bonuses: {} };
      p.recalcEquipBonuses();
      expect(p.armor).toBeGreaterThan(baseArmor);
      expect(p.equipBonuses.armor).toBe(15);
    });

    it('unequipping resets bonuses', () => {
      const p = new Player('T', 'warrior');
      p.equipment.weapon = { type: 'weapon', subType: 'sword', damage: 10, bonuses: { str: 5 }, attackSpeed: 800 };
      p.recalcEquipBonuses();
      const boosted = p.attackPower;

      p.equipment.weapon = null;
      p.recalcEquipBonuses();
      expect(p.attackPower).toBeLessThan(boosted);
    });

    it('bow/staff set attackRange to 200', () => {
      const p = new Player('T', 'ranger');
      p.equipment.weapon = { type: 'weapon', subType: 'bow', damage: 8, bonuses: {}, attackSpeed: 1000 };
      p.recalcEquipBonuses();
      expect(p.attackRange).toBe(200);
    });

    it('melee weapon keeps attackRange at 48', () => {
      const p = new Player('T', 'warrior');
      p.equipment.weapon = { type: 'weapon', subType: 'sword', damage: 10, bonuses: {}, attackSpeed: 800 };
      p.recalcEquipBonuses();
      expect(p.attackRange).toBe(48);
    });

    it('weapon sets baseAttackSpeed from weapon data', () => {
      const p = new Player('T', 'warrior');
      p.equipment.weapon = { type: 'weapon', subType: 'dagger', damage: 5, bonuses: {}, attackSpeed: 500 };
      p.recalcEquipBonuses();
      expect(p.baseAttackSpeed).toBe(500);
    });
  });

  // ── Death & Respawn ─────────────────────────────────────────────
  describe('death and respawn', () => {
    it('drops 10% gold on death', () => {
      const p = new Player('T', 'warrior');
      p.gold = 200;
      p.dodgeChance = 0;
      p.takeDamage(10000);
      expect(p.deathGoldDrop).toBe(20); // 10% of 200
      expect(p.gold).toBe(180);
    });

    it('sets isDying and deathTimer on die()', () => {
      const p = new Player('T', 'warrior');
      p.die();
      expect(p.alive).toBe(false);
      expect(p.isDying).toBe(true);
      expect(p.deathTimer).toBe(DEATH_DURATION);
    });

    it('respawn restores 50% HP and 30% MP', () => {
      const p = new Player('T', 'warrior');
      p.setRespawnPoint(100, 200);
      p.die();
      const result = p.respawn();
      expect(p.alive).toBe(true);
      expect(p.isDying).toBe(false);
      expect(p.hp).toBe(Math.floor(p.maxHp * RESPAWN_HP_PERCENT));
      expect(p.mp).toBe(Math.floor(p.maxMp * 0.3));
      expect(p.x).toBe(100);
      expect(p.y).toBe(200);
    });

    it('respawn returns event with player data', () => {
      const p = new Player('T', 'warrior');
      p.setRespawnPoint(50, 75);
      p.die();
      const result = p.respawn();
      expect(result.type).toBe('player:respawn');
      expect(result.playerId).toBe(p.id);
      expect(result.x).toBe(50);
      expect(result.y).toBe(75);
    });

    it('auto-respawns after death timer in update()', () => {
      const p = new Player('T', 'warrior');
      p.setRespawnPoint(100, 200);
      p.die();
      // Tick just under the timer
      p.update(DEATH_DURATION - 100);
      expect(p.isDying).toBe(true);
      // Tick past the timer
      const result = p.update(200);
      expect(result).not.toBeNull();
      expect(result.type).toBe('player:respawn');
      expect(p.alive).toBe(true);
    });

    it('gold cannot go negative on death', () => {
      const p = new Player('T', 'warrior');
      p.gold = 0;
      p.die();
      expect(p.gold).toBe(0);
      expect(p.deathGoldDrop).toBe(0);
    });
  });

  // ── Skills & Cooldowns ──────────────────────────────────────────
  describe('skills', () => {
    it('canUseSkill returns true when alive, off cooldown, and has MP', () => {
      const p = new Player('T', 'warrior');
      expect(p.canUseSkill(0)).toBe(true);
    });

    it('canUseSkill returns false when on cooldown', () => {
      const p = new Player('T', 'warrior');
      p.skillCooldowns[0] = 1000;
      expect(p.canUseSkill(0)).toBe(false);
    });

    it('canUseSkill returns false when not enough MP', () => {
      const p = new Player('T', 'warrior');
      p.mp = 0;
      expect(p.canUseSkill(0)).toBe(false);
    });

    it('canUseSkill returns false when dead', () => {
      const p = new Player('T', 'warrior');
      p.alive = false;
      expect(p.canUseSkill(0)).toBe(false);
    });

    it('canUseSkill returns false for out-of-range index', () => {
      const p = new Player('T', 'warrior');
      expect(p.canUseSkill(-1)).toBe(false);
      expect(p.canUseSkill(10)).toBe(false);
    });

    it('useSkill deducts MP and sets cooldown', () => {
      const p = new Player('T', 'warrior');
      const initialMp = p.mp;
      const skill = p.useSkill(0); // Cleave: mpCost 15, cooldown 3000
      expect(skill).not.toBeNull();
      expect(skill.name).toBe('Cleave');
      expect(p.mp).toBe(initialMp - 15);
      expect(p.skillCooldowns[0]).toBe(3000);
    });

    it('useSkill returns null if cannot use', () => {
      const p = new Player('T', 'warrior');
      p.mp = 0;
      expect(p.useSkill(0)).toBeNull();
    });
  });

  // ── Potions ─────────────────────────────────────────────────────
  describe('potions', () => {
    it('health potion heals 35% of maxHp', () => {
      const p = new Player('T', 'warrior');
      p.hp = 50;
      const used = p.useHealthPotion();
      expect(used).toBe(true);
      expect(p.hp).toBe(Math.min(p.maxHp, 50 + Math.floor(p.maxHp * 0.35)));
      expect(p.healthPotions).toBe(2);
    });

    it('health potion does not overheal', () => {
      const p = new Player('T', 'warrior');
      p.hp = p.maxHp - 1;
      p.useHealthPotion();
      expect(p.hp).toBe(p.maxHp);
    });

    it('health potion fails when at full HP', () => {
      const p = new Player('T', 'warrior');
      expect(p.useHealthPotion()).toBe(false);
      expect(p.healthPotions).toBe(3);
    });

    it('health potion fails when out of potions', () => {
      const p = new Player('T', 'warrior');
      p.healthPotions = 0;
      p.hp = 50;
      expect(p.useHealthPotion()).toBe(false);
    });

    it('mana potion restores 40% of maxMp', () => {
      const p = new Player('T', 'mage');
      p.mp = 10;
      const used = p.useManaPotion();
      expect(used).toBe(true);
      expect(p.mp).toBe(Math.min(p.maxMp, 10 + Math.floor(p.maxMp * 0.4)));
      expect(p.manaPotions).toBe(1);
    });
  });

  // ── Attack Cooldown ─────────────────────────────────────────────
  describe('attack cooldown', () => {
    it('canAttack returns true when alive and cooldown <= 0', () => {
      const p = new Player('T', 'warrior');
      expect(p.canAttack()).toBe(true);
    });

    it('canAttack returns false during cooldown', () => {
      const p = new Player('T', 'warrior');
      p.startAttackCooldown();
      expect(p.canAttack()).toBe(false);
    });

    it('cooldown decreases over time via update()', () => {
      const p = new Player('T', 'warrior');
      p.startAttackCooldown(); // 800ms
      p.update(500);
      expect(p.attackCooldown).toBe(300);
      p.update(400);
      expect(p.canAttack()).toBe(true);
    });
  });

  // ── Update / Movement ───────────────────────────────────────────
  describe('update', () => {
    it('moves player based on inputDx/inputDy and moveSpeed', () => {
      const p = new Player('T', 'warrior');
      p.x = 400;
      p.y = 300;
      p.inputDx = 1;
      p.inputDy = 0;
      p.update(1000); // 1 second
      // moveSpeed is 160, so should move 160px in 1 second
      expect(p.x).toBeCloseTo(560, 0);
      expect(p.moving).toBe(true);
    });

    it('diagonal movement is normalized', () => {
      const p = new Player('T', 'warrior');
      p.x = 400;
      p.y = 300;
      p.inputDx = 1;
      p.inputDy = 1;
      p.update(1000);
      // Normalized: each axis gets moveSpeed / sqrt(2) ~ 113.14
      const distMoved = Math.sqrt((p.x - 400) ** 2 + (p.y - 300) ** 2);
      expect(distMoved).toBeCloseTo(160, 0);
    });

    it('sets facing direction based on movement', () => {
      const p = new Player('T', 'warrior');
      p.inputDx = 1;
      p.inputDy = 0;
      p.update(16);
      expect(p.facing).toBe('right');

      p.inputDx = 0;
      p.inputDy = -1;
      p.update(16);
      expect(p.facing).toBe('up');
    });

    it('clamps position to world bounds', () => {
      const p = new Player('T', 'warrior');
      p.x = 0;
      p.y = 0;
      p.inputDx = -1;
      p.inputDy = -1;
      p.update(5000);
      expect(p.x).toBeGreaterThanOrEqual(16);
      expect(p.y).toBeGreaterThanOrEqual(16);
    });

    it('regenerates HP every second', () => {
      const p = new Player('T', 'warrior');
      p.hp = 100;
      p.hpRegenAccum = 0;
      p.update(1000);
      const expectedRegen = 1 + Math.floor(p.stats.vit / 10);
      expect(p.hp).toBe(100 + expectedRegen);
    });

    it('regenerates 2 MP every second', () => {
      const p = new Player('T', 'warrior');
      p.mp = 10;
      p.mpRegenAccum = 0;
      p.update(1000);
      expect(p.mp).toBe(12);
    });
  });

  // ── Serialization ───────────────────────────────────────────────
  describe('serialization', () => {
    it('serialize() returns expected fields', () => {
      const p = new Player('TestHero', 'mage');
      const s = p.serialize();
      expect(s.id).toBe(p.id);
      expect(s.name).toBe('TestHero');
      expect(s.characterClass).toBe('mage');
      expect(s).toHaveProperty('hp');
      expect(s).toHaveProperty('maxHp');
      expect(s).toHaveProperty('alive');
      expect(s).toHaveProperty('isDying');
    });

    it('serializeForPhone() includes stats and equipment', () => {
      const p = new Player('TestHero', 'warrior');
      const s = p.serializeForPhone();
      expect(s).toHaveProperty('stats');
      expect(s).toHaveProperty('equipment');
      expect(s).toHaveProperty('gold');
      expect(s).toHaveProperty('skills');
      expect(s.skills.length).toBe(3);
    });
  });
});
