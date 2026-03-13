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
      expect(warrior.skills[0].name).toBe('Whirlwind');
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
      const skill = p.useSkill(0); // Whirlwind: mpCost 20, cooldown 4000
      expect(skill).not.toBeNull();
      expect(skill.name).toBe('Whirlwind');
      expect(p.mp).toBe(initialMp - 20);
      expect(p.skillCooldowns[0]).toBe(4000);
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

    it('serializeForPhone() skills array has required fields', () => {
      const p = new Player('TestHero', 'warrior');
      const s = p.serializeForPhone();
      for (const skill of s.skills) {
        expect(skill).toHaveProperty('name');
        expect(skill).toHaveProperty('shortName');
        expect(skill).toHaveProperty('mpCost');
        expect(skill).toHaveProperty('cooldown');
        expect(skill).toHaveProperty('cooldownRemaining');
        expect(skill).toHaveProperty('type');
        expect(skill).toHaveProperty('description');
        expect(typeof skill.shortName).toBe('string');
        expect(skill.shortName.length).toBeLessThanOrEqual(3);
        expect(typeof skill.mpCost).toBe('number');
        expect(typeof skill.cooldown).toBe('number');
        expect(typeof skill.cooldownRemaining).toBe('number');
      }
    });

    it('cooldownRemaining is 0 when skill is ready', () => {
      const p = new Player('TestHero', 'mage');
      const s = p.serializeForPhone();
      // All skills start off cooldown
      for (const skill of s.skills) {
        expect(skill.cooldownRemaining).toBe(0);
      }
    });

    it('cooldownRemaining > 0 right after skill use', () => {
      const p = new Player('TestHero', 'warrior');
      p.useSkill(0); // Whirlwind: cooldown 4000
      const s = p.serializeForPhone();
      expect(s.skills[0].cooldownRemaining).toBe(4000);
      // Other skills should still be 0
      expect(s.skills[1].cooldownRemaining).toBe(0);
      expect(s.skills[2].cooldownRemaining).toBe(0);
    });

    it('cooldownRemaining decreases over time and never goes negative', () => {
      const p = new Player('TestHero', 'warrior');
      p.useSkill(0); // Whirlwind: cooldown 4000
      p.update(2000); // 2 seconds pass
      const s1 = p.serializeForPhone();
      expect(s1.skills[0].cooldownRemaining).toBe(2000);

      p.update(3000); // 3 more seconds (1 extra past cooldown)
      const s2 = p.serializeForPhone();
      expect(s2.skills[0].cooldownRemaining).toBe(0); // clamped by Math.max(0, ...)
    });

    it('warrior skills have correct shortNames', () => {
      const p = new Player('W', 'warrior');
      const s = p.serializeForPhone();
      expect(s.skills[0].shortName).toBe('WHL');
      expect(s.skills[1].shortName).toBe('CHG');
      expect(s.skills[2].shortName).toBe('SHT');
    });

    it('ranger skills have correct shortNames', () => {
      const p = new Player('R', 'ranger');
      const s = p.serializeForPhone();
      expect(s.skills[0].shortName).toBe('MLT');
      expect(s.skills[1].shortName).toBe('PSN');
      expect(s.skills[2].shortName).toBe('EVD');
    });

    it('mage skills have correct shortNames', () => {
      const p = new Player('M', 'mage');
      const s = p.serializeForPhone();
      expect(s.skills[0].shortName).toBe('FBL');
      expect(s.skills[1].shortName).toBe('FRZ');
      expect(s.skills[2].shortName).toBe('TLP');
    });

    it('serializeForPhone includes buffs and lastDamageTaken', () => {
      const p = new Player('TestHero', 'warrior');
      const s = p.serializeForPhone();
      expect(s).toHaveProperty('buffs');
      expect(Array.isArray(s.buffs)).toBe(true);
      expect(s).toHaveProperty('lastDamageTaken');
    });

    it('serializeForPhone includes skillCooldowns array', () => {
      const p = new Player('TestHero', 'warrior');
      const s = p.serializeForPhone();
      expect(s).toHaveProperty('skillCooldowns');
      expect(Array.isArray(s.skillCooldowns)).toBe(true);
      expect(s.skillCooldowns.length).toBe(3);
    });
  });

  // ── restoreFrom ───────────────────────────────────────────────
  describe('restoreFrom', () => {
    it('sets level, xp, gold, kills correctly', () => {
      const p = new Player('Restored', 'warrior');
      p.restoreFrom({
        level: 12,
        xp: 450,
        gold: 2500,
        kills: 87,
        stats: { str: 20, dex: 15, int: 12, vit: 18 },
      });

      expect(p.level).toBe(12);
      expect(p.xp).toBe(450);
      expect(p.gold).toBe(2500);
      expect(p.kills).toBe(87);
    });

    it('recalculates derived stats', () => {
      const p = new Player('Restored', 'warrior');
      const oldMaxHp = p.maxHp;
      const oldMaxMp = p.maxMp;

      p.restoreFrom({
        level: 10,
        xp: 0,
        gold: 0,
        kills: 0,
        stats: { str: 25, dex: 20, int: 18, vit: 30 },
        equipment: {
          weapon: { type: 'weapon', subType: 'sword', damage: 20, bonuses: { str: 5 }, attackSpeed: 700 },
        },
      });

      // With vit=30 and level=10: maxHp = 100 + (30+0)*10 + 10*15 = 550
      // (equipBonuses.vit is 0 since weapon has str bonus only)
      expect(p.maxHp).toBeGreaterThan(oldMaxHp);
      expect(p.maxMp).toBeGreaterThan(oldMaxMp);
      // attackPower should incorporate weapon damage + str bonuses
      expect(p.attackPower).toBeGreaterThan(0);
      // xpToNext should be recalculated for level 10
      expect(p.xpToNext).toBe(Math.floor(100 * Math.pow(1.15, 10)));
    });

    it('preserves potions count', () => {
      const p = new Player('Restored', 'mage');
      p.restoreFrom({
        level: 5,
        xp: 100,
        gold: 50,
        kills: 10,
        healthPotions: 8,
        manaPotions: 6,
        stats: { str: 10, dex: 12, int: 13, vit: 10 },
      });

      expect(p.healthPotions).toBe(8);
      expect(p.manaPotions).toBe(6);
    });

    it('sets HP/MP to max after restore', () => {
      const p = new Player('Restored', 'warrior');
      p.hp = 1;
      p.mp = 1;

      p.restoreFrom({
        level: 15,
        xp: 0,
        gold: 0,
        kills: 0,
        stats: { str: 30, dex: 20, int: 15, vit: 25 },
      });

      expect(p.hp).toBe(p.maxHp);
      expect(p.mp).toBe(p.maxMp);
    });

    it('with missing fields does not crash (defensive)', () => {
      const p = new Player('Restored', 'ranger');

      // Completely empty savedData
      expect(() => p.restoreFrom({})).not.toThrow();
      expect(p.level).toBe(1);
      expect(p.xp).toBe(0);
      expect(p.gold).toBe(0);
      expect(p.kills).toBe(0);
      expect(p.healthPotions).toBe(3); // default via ??
      expect(p.manaPotions).toBe(2);   // default via ??
      expect(p.hp).toBe(p.maxHp);
      expect(p.mp).toBe(p.maxMp);
    });

    it('restores freeStatPoints', () => {
      const p = new Player('Restored', 'warrior');
      p.restoreFrom({
        level: 8,
        xp: 200,
        gold: 100,
        kills: 30,
        freeStatPoints: 15,
        stats: { str: 20, dex: 14, int: 10, vit: 16 },
      });

      expect(p.freeStatPoints).toBe(15);
    });

    it('restores equipment and recalculates bonuses', () => {
      const p = new Player('Restored', 'warrior');
      const baseAttackPower = p.attackPower;

      p.restoreFrom({
        level: 5,
        xp: 0,
        gold: 0,
        kills: 0,
        stats: { str: 13, dex: 10, int: 10, vit: 12 },
        equipment: {
          weapon: { type: 'weapon', subType: 'sword', damage: 15, bonuses: { str: 5 }, attackSpeed: 600 },
          chest: { type: 'armor', subType: 'plate', armor: 20, bonuses: { vit: 3 } },
        },
      });

      expect(p.equipment.weapon).not.toBeNull();
      expect(p.equipment.weapon.damage).toBe(15);
      expect(p.equipment.chest).not.toBeNull();
      expect(p.attackPower).toBeGreaterThan(baseAttackPower);
      expect(p.baseAttackSpeed).toBe(600);
    });
  });

  // ── Resistances ────────────────────────────────────────────────────
  describe('resistances', () => {
    it('player starts with all resistances at 0', () => {
      const p = new Player('T', 'warrior');
      expect(p.resistances).toEqual({ fire: 0, cold: 0, poison: 0 });
    });

    it('resistances initialized for all classes', () => {
      for (const cls of ['warrior', 'ranger', 'mage']) {
        const p = new Player('T', cls);
        expect(p.resistances.fire).toBe(0);
        expect(p.resistances.cold).toBe(0);
        expect(p.resistances.poison).toBe(0);
      }
    });

    it('recalcEquipBonuses sums fire_resist from equipment', () => {
      const p = new Player('T', 'warrior');
      p.equipment.chest = { type: 'armor', armor: 10, bonuses: { fire_resist: 15 } };
      p.equipment.helmet = { type: 'armor', armor: 5, bonuses: { fire_resist: 10 } };
      p.recalcEquipBonuses();
      expect(p.resistances.fire).toBe(25);
    });

    it('recalcEquipBonuses sums cold_resist from equipment', () => {
      const p = new Player('T', 'warrior');
      p.equipment.gloves = { type: 'armor', armor: 3, bonuses: { cold_resist: 12 } };
      p.recalcEquipBonuses();
      expect(p.resistances.cold).toBe(12);
    });

    it('recalcEquipBonuses sums poison_resist from equipment', () => {
      const p = new Player('T', 'warrior');
      p.equipment.boots = { type: 'armor', armor: 4, bonuses: { poison_resist: 18 } };
      p.recalcEquipBonuses();
      expect(p.resistances.poison).toBe(18);
    });

    it('all_resist bonus adds to all three resistance types', () => {
      const p = new Player('T', 'warrior');
      p.equipment.amulet = { type: 'accessory', bonuses: { all_resist: 8 } };
      p.recalcEquipBonuses();
      expect(p.resistances.fire).toBe(8);
      expect(p.resistances.cold).toBe(8);
      expect(p.resistances.poison).toBe(8);
    });

    it('all_resist stacks with individual element resists', () => {
      const p = new Player('T', 'warrior');
      p.equipment.chest = { type: 'armor', armor: 10, bonuses: { fire_resist: 15, all_resist: 5 } };
      p.recalcEquipBonuses();
      expect(p.resistances.fire).toBe(20); // 15 + 5
      expect(p.resistances.cold).toBe(5);  // 0 + 5
      expect(p.resistances.poison).toBe(5); // 0 + 5
    });

    it('resistance capped at 75', () => {
      const p = new Player('T', 'warrior');
      p.equipment.chest = { type: 'armor', armor: 10, bonuses: { fire_resist: 50 } };
      p.equipment.helmet = { type: 'armor', armor: 5, bonuses: { fire_resist: 40 } };
      p.recalcEquipBonuses();
      expect(p.resistances.fire).toBe(75); // 50 + 40 = 90, capped at 75
    });

    it('all_resist + individual resist capped at 75', () => {
      const p = new Player('T', 'warrior');
      p.equipment.chest = { type: 'armor', armor: 10, bonuses: { cold_resist: 60, all_resist: 20 } };
      p.recalcEquipBonuses();
      expect(p.resistances.cold).toBe(75); // 60 + 20 = 80, capped at 75
    });

    it('unequipping resets resistances to 0', () => {
      const p = new Player('T', 'warrior');
      p.equipment.chest = { type: 'armor', armor: 10, bonuses: { fire_resist: 20 } };
      p.recalcEquipBonuses();
      expect(p.resistances.fire).toBe(20);

      p.equipment.chest = null;
      p.recalcEquipBonuses();
      expect(p.resistances.fire).toBe(0);
    });

    it('takeDamage with fire type applies fire resistance', () => {
      const p = new Player('T', 'warrior');
      p.dodgeChance = 0;
      p.resistances.fire = 50;
      const initialHp = p.hp;
      const dealt = p.takeDamage(100, 'fire');
      // 50% fire resist: floor(100 * (1 - 50/100)) = 50
      expect(dealt).toBe(50);
      expect(p.hp).toBe(initialHp - 50);
    });

    it('takeDamage with cold type applies cold resistance', () => {
      const p = new Player('T', 'warrior');
      p.dodgeChance = 0;
      p.resistances.cold = 30;
      const dealt = p.takeDamage(100, 'cold');
      // 30% cold resist: floor(100 * 0.7) = 70
      expect(dealt).toBe(70);
    });

    it('takeDamage with poison type applies poison resistance', () => {
      const p = new Player('T', 'warrior');
      p.dodgeChance = 0;
      p.resistances.poison = 75;
      const dealt = p.takeDamage(100, 'poison');
      // 75% poison resist: floor(100 * 0.25) = 25
      expect(dealt).toBe(25);
    });

    it('takeDamage with physical type uses armor (not resistance)', () => {
      const p = new Player('T', 'warrior');
      p.dodgeChance = 0;
      p.resistances.fire = 75; // should not affect physical
      const dealt = p.takeDamage(100, 'physical');
      // Physical uses armor: max(1, floor(100 - armor * 0.4))
      const expected = Math.max(1, Math.floor(100 - p.armor * 0.4));
      expect(dealt).toBe(expected);
    });

    it('takeDamage defaults to physical when no type specified', () => {
      const p = new Player('T', 'warrior');
      p.dodgeChance = 0;
      const dealt = p.takeDamage(100);
      const expected = Math.max(1, Math.floor(100 - p.armor * 0.4));
      expect(dealt).toBe(expected);
    });

    it('elemental damage bypasses armor entirely', () => {
      const p = new Player('T', 'warrior');
      p.dodgeChance = 0;
      p.equipBonuses.armor = 1000; // massive armor
      p.recalcStats();
      p.dodgeChance = 0;
      p.resistances.fire = 0; // no fire resist
      const dealt = p.takeDamage(100, 'fire');
      // Fire ignores armor, 0 resist => full 100 damage
      expect(dealt).toBe(100);
    });

    it('serialize() includes resistances', () => {
      const p = new Player('T', 'warrior');
      p.resistances = { fire: 10, cold: 20, poison: 30 };
      const s = p.serialize();
      expect(s.resistances).toEqual({ fire: 10, cold: 20, poison: 30 });
    });

    it('serialize() resistances is a copy (not reference)', () => {
      const p = new Player('T', 'warrior');
      p.resistances.fire = 15;
      const s = p.serialize();
      s.resistances.fire = 999;
      expect(p.resistances.fire).toBe(15); // unchanged
    });

    it('serializeForPhone() includes resistances', () => {
      const p = new Player('T', 'warrior');
      p.resistances = { fire: 5, cold: 10, poison: 15 };
      const s = p.serializeForPhone();
      expect(s.resistances).toEqual({ fire: 5, cold: 10, poison: 15 });
    });

    it('serializeForPhone() resistances is a copy (not reference)', () => {
      const p = new Player('T', 'warrior');
      p.resistances.cold = 25;
      const s = p.serializeForPhone();
      s.resistances.cold = 999;
      expect(p.resistances.cold).toBe(25); // unchanged
    });
  });

  // ── Debuff System ─────────────────────────────────────────────────
  describe('debuffs', () => {
    let player;

    beforeEach(() => {
      player = new Player('DebuffTest', 'warrior');
    });

    it('addDebuff() adds a debuff to the array', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 60, source: 'mob1' });
      expect(player.debuffs.length).toBe(1);
      expect(player.debuffs[0].effect).toBe('fire_dot');
    });

    it('addDebuff() replaces existing debuff with same source + effect', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 60, source: 'mob1' });
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 60, source: 'mob1' });
      expect(player.debuffs.length).toBe(1);
    });

    it('addDebuff() does not replace debuff from different source', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 60, source: 'mob1' });
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 60, source: 'mob2' });
      expect(player.debuffs.length).toBe(2);
    });

    it('addDebuff() does not replace debuff with different effect', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 60, source: 'mob1' });
      player.addDebuff({ effect: 'slow', speedMult: 0.7, ticksRemaining: 60, source: 'mob1' });
      expect(player.debuffs.length).toBe(2);
    });

    it('processDebuffs() ticks down fire_dot and returns damage', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 3, source: 'mob1' });
      const dmg = player.processDebuffs();
      expect(dmg).toBe(5);
      expect(player.debuffs[0].ticksRemaining).toBe(2);
    });

    it('processDebuffs() ticks down slow debuff', () => {
      player.addDebuff({ effect: 'slow', speedMult: 0.7, ticksRemaining: 3, source: 'mob1' });
      player.processDebuffs();
      expect(player.debuffs[0].ticksRemaining).toBe(2);
    });

    it('processDebuffs() removes expired debuffs', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 1, source: 'mob1' });
      player.processDebuffs(); // ticks to 0
      expect(player.debuffs.length).toBe(0);
    });

    it('processDebuffs() returns 0 with no debuffs', () => {
      expect(player.processDebuffs()).toBe(0);
    });

    it('processDebuffs() accumulates damage from multiple fire_dot sources', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 10, source: 'mob1' });
      player.addDebuff({ effect: 'fire_dot', damage: 8, ticksRemaining: 10, source: 'mob2' });
      const dmg = player.processDebuffs();
      expect(dmg).toBe(13); // 5 + 8
    });

    it('speedMultiplier returns 0.7 with slow debuff', () => {
      player.addDebuff({ effect: 'slow', speedMult: 0.7, ticksRemaining: 60, source: 'mob1' });
      expect(player.speedMultiplier).toBe(0.7);
    });

    it('speedMultiplier returns 1.0 without slow debuff', () => {
      expect(player.speedMultiplier).toBe(1.0);
    });

    it('speedMultiplier returns 1.0 with only fire_dot (no slow)', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 60, source: 'mob1' });
      expect(player.speedMultiplier).toBe(1.0);
    });

    it('debuffs appear in serialize() output', () => {
      player.addDebuff({ effect: 'fire_dot', damage: 5, ticksRemaining: 30, source: 'mob1' });
      const s = player.serialize();
      expect(s.debuffs).toBeDefined();
      expect(s.debuffs.length).toBe(1);
      expect(s.debuffs[0].effect).toBe('fire_dot');
    });

    it('debuffs appear in serializeForPhone() output', () => {
      player.addDebuff({ effect: 'slow', speedMult: 0.7, ticksRemaining: 60, source: 'mob1' });
      const s = player.serializeForPhone();
      expect(s.debuffs).toBeDefined();
      expect(s.debuffs.length).toBe(1);
      expect(s.debuffs[0].effect).toBe('slow');
    });
  });

  // ── Equipment Sets & Set Bonuses ─────────────────────────────

  describe('equipment sets', () => {
    let player;

    beforeEach(() => {
      player = new Player('SetTester', 'warrior');
    });

    it('no set items → empty activeSets', () => {
      player.equipment = { weapon: null, chest: null, boots: null };
      player.recalcSetBonuses();
      expect(player.activeSets).toEqual([]);
      expect(player.setBonuses).toEqual({});
    });

    it('1 set piece → tracked but no bonuses active', () => {
      player.equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: null,
        boots: null,
      };
      player.recalcSetBonuses();
      expect(player.activeSets.length).toBe(1);
      expect(player.activeSets[0].pieces).toBe(1);
      // No 2pc bonus should apply
      expect(player.setBonuses.armor).toBeUndefined();
    });

    it('2 ironwall pieces → 2pc bonus (armor +30, maxHpPercent +15)', () => {
      const baseMaxHp = player.maxHp;
      const baseArmor = player.armor;

      player.equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall', armor: 40 },
        boots: null,
      };
      player.recalcSetBonuses();

      expect(player.activeSets[0].pieces).toBe(2);
      // armor bonus applied
      expect(player.armor).toBeGreaterThan(baseArmor);
      // maxHp percentage increase
      expect(player.maxHp).toBeGreaterThan(baseMaxHp);
    });

    it('3 ironwall pieces → both 2pc and 3pc bonuses', () => {
      player.equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall', armor: 40 },
        boots: { isSetItem: true, setId: 'ironwall', armor: 15 },
      };
      player.recalcSetBonuses();

      expect(player.activeSets[0].pieces).toBe(3);
      expect(player.setBonuses.damagePercent).toBe(25);
    });

    it('shadowweave 2pc gives critChance + speedPercent', () => {
      player.equipment = {
        weapon: { isSetItem: true, setId: 'shadowweave' },
        gloves: { isSetItem: true, setId: 'shadowweave' },
        boots: null,
      };
      player.recalcSetBonuses();
      expect(player.critChance).toBeGreaterThan(0);
    });

    it('shadowweave 3pc gives critDamagePercent', () => {
      player.equipment = {
        weapon: { isSetItem: true, setId: 'shadowweave' },
        gloves: { isSetItem: true, setId: 'shadowweave' },
        boots: { isSetItem: true, setId: 'shadowweave' },
      };
      player.recalcSetBonuses();
      expect(player.setBonuses.critDamagePercent).toBe(30);
    });

    it('arcane_codex 2pc gives spellDamagePercent + maxMana', () => {
      player = new Player('MageTest', 'mage');
      const baseMp = player.maxMp;

      player.equipment = {
        weapon: { isSetItem: true, setId: 'arcane_codex' },
        helmet: { isSetItem: true, setId: 'arcane_codex' },
        chest: null,
      };
      player.recalcSetBonuses();

      expect(player.setBonuses.spellDamagePercent).toBe(25);
      expect(player.maxMp).toBeGreaterThan(baseMp);
    });

    it('arcane_codex 3pc gives cooldownReduction', () => {
      player = new Player('MageTest', 'mage');
      player.equipment = {
        weapon: { isSetItem: true, setId: 'arcane_codex' },
        helmet: { isSetItem: true, setId: 'arcane_codex' },
        chest: { isSetItem: true, setId: 'arcane_codex' },
      };
      player.recalcSetBonuses();
      expect(player.setBonuses.cooldownReduction).toBe(20);
    });

    it('bones_of_fallen 2pc gives all_resist + maxHp', () => {
      const baseMaxHp = player.maxHp;
      player.equipment = {
        helmet: { isSetItem: true, setId: 'bones_of_fallen' },
        gloves: { isSetItem: true, setId: 'bones_of_fallen' },
      };
      player.recalcSetBonuses();

      expect(player.maxHp).toBe(baseMaxHp + 100);
      // all_resist applied to fire, cold, poison
      expect(player.resistances.fire).toBe(10);
      expect(player.resistances.cold).toBe(10);
      expect(player.resistances.poison).toBe(10);
    });

    it('bones_of_fallen 3pc gives lifestealPercent + xpPercent', () => {
      player.equipment = {
        helmet: { isSetItem: true, setId: 'bones_of_fallen' },
        gloves: { isSetItem: true, setId: 'bones_of_fallen' },
        amulet: { isSetItem: true, setId: 'bones_of_fallen' },
      };
      player.recalcSetBonuses();
      expect(player.setBonuses.lifestealPercent).toBe(5);
      expect(player.setBonuses.xpPercent).toBe(50);
    });

    it('resistance cap at 75 with all_resist', () => {
      // Set base resistances high, then add all_resist
      player.resistances = { fire: 70, cold: 70, poison: 70 };
      player.equipment = {
        helmet: { isSetItem: true, setId: 'bones_of_fallen' },
        gloves: { isSetItem: true, setId: 'bones_of_fallen' },
      };
      player.recalcSetBonuses();
      // all_resist +10 would make 80, but cap is 75
      expect(player.resistances.fire).toBeLessThanOrEqual(75);
      expect(player.resistances.cold).toBeLessThanOrEqual(75);
      expect(player.resistances.poison).toBeLessThanOrEqual(75);
    });

    it('activeSets appears in serialize()', () => {
      player.equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall', armor: 40 },
      };
      player.recalcSetBonuses();
      const s = player.serialize();
      expect(s.activeSets).toBeDefined();
      expect(s.activeSets.length).toBe(1);
      expect(s.activeSets[0].setId).toBe('ironwall');
    });

    it('setBonuses appears in serialize()', () => {
      player.equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall', armor: 40 },
        boots: { isSetItem: true, setId: 'ironwall', armor: 15 },
      };
      player.recalcSetBonuses();
      const s = player.serialize();
      expect(s.setBonuses).toBeDefined();
      expect(s.setBonuses.damagePercent).toBe(25);
    });

    it('activeSets appears in serializeForPhone()', () => {
      player.equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall', armor: 40 },
      };
      player.recalcSetBonuses();
      const s = player.serializeForPhone();
      expect(s.activeSets).toBeDefined();
    });

    it('multiple sets active simultaneously', () => {
      player.equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall', armor: 40 },
        helmet: { isSetItem: true, setId: 'bones_of_fallen' },
        gloves: { isSetItem: true, setId: 'bones_of_fallen' },
      };
      player.recalcSetBonuses();
      expect(player.activeSets.length).toBe(2);
    });

    it('recalc clears previous set bonuses', () => {
      // First: equip ironwall 2pc
      player.equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall', armor: 40 },
      };
      player.recalcSetBonuses();
      expect(player.activeSets.length).toBe(1);

      // Then: unequip all
      player.equipment = {};
      player.recalcSetBonuses();
      expect(player.activeSets).toEqual([]);
      expect(player.setBonuses).toEqual({});
    });
  });
});
