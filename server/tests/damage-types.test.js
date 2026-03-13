import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  DAMAGE_TYPES,
  MAX_RESISTANCE,
  SKILL_DAMAGE_TYPES,
  calcResistance,
  applyResistance,
  applyArmor,
  getSkillDamageType,
  getDamageTypeDef,
} = require('../game/damage-types');

describe('DamageTypes', () => {
  // ── DAMAGE_TYPES definitions ────────────────────────────────────
  describe('DAMAGE_TYPES', () => {
    it('defines exactly 4 damage types', () => {
      const keys = Object.keys(DAMAGE_TYPES);
      expect(keys.length).toBe(4);
      expect(keys).toContain('physical');
      expect(keys).toContain('fire');
      expect(keys).toContain('cold');
      expect(keys).toContain('poison');
    });

    it('physical has correct fields (name, color, resistKey=null)', () => {
      const phys = DAMAGE_TYPES.physical;
      expect(phys.name).toBe('Physical');
      expect(phys.color).toBe('#ffffff');
      expect(phys.resistKey).toBeNull();
    });

    it('fire has correct fields', () => {
      const fire = DAMAGE_TYPES.fire;
      expect(fire.name).toBe('Fire');
      expect(fire.color).toBe('#ff8800');
      expect(fire.resistKey).toBe('fire');
    });

    it('cold has correct fields', () => {
      const cold = DAMAGE_TYPES.cold;
      expect(cold.name).toBe('Cold');
      expect(cold.color).toBe('#4488ff');
      expect(cold.resistKey).toBe('cold');
    });

    it('poison has correct fields', () => {
      const poison = DAMAGE_TYPES.poison;
      expect(poison.name).toBe('Poison');
      expect(poison.color).toBe('#44cc44');
      expect(poison.resistKey).toBe('poison');
    });

    it('all types have name, color, and resistKey properties', () => {
      for (const [key, def] of Object.entries(DAMAGE_TYPES)) {
        expect(def).toHaveProperty('name');
        expect(def).toHaveProperty('color');
        expect(def).toHaveProperty('resistKey');
        expect(typeof def.name).toBe('string');
        expect(typeof def.color).toBe('string');
      }
    });
  });

  // ── MAX_RESISTANCE ──────────────────────────────────────────────
  describe('MAX_RESISTANCE', () => {
    it('is 75', () => {
      expect(MAX_RESISTANCE).toBe(75);
    });
  });

  // ── SKILL_DAMAGE_TYPES mapping ──────────────────────────────────
  describe('SKILL_DAMAGE_TYPES', () => {
    it('defines exactly 9 skill mappings', () => {
      expect(Object.keys(SKILL_DAMAGE_TYPES).length).toBe(9);
    });

    it('warrior skills: Whirlwind=physical, Charging Strike=physical, Battle Shout=physical', () => {
      expect(SKILL_DAMAGE_TYPES['Whirlwind']).toBe('physical');
      expect(SKILL_DAMAGE_TYPES['Charging Strike']).toBe('physical');
      expect(SKILL_DAMAGE_TYPES['Battle Shout']).toBe('physical');
    });

    it('mage skills: Fireball=fire, Frost Nova=cold, Teleport=physical', () => {
      expect(SKILL_DAMAGE_TYPES['Fireball']).toBe('fire');
      expect(SKILL_DAMAGE_TYPES['Frost Nova']).toBe('cold');
      expect(SKILL_DAMAGE_TYPES['Teleport']).toBe('physical');
    });

    it('ranger skills: Arrow Volley=physical, Sniper Shot=physical, Shadow Step=physical', () => {
      expect(SKILL_DAMAGE_TYPES['Arrow Volley']).toBe('physical');
      expect(SKILL_DAMAGE_TYPES['Sniper Shot']).toBe('physical');
      expect(SKILL_DAMAGE_TYPES['Shadow Step']).toBe('physical');
    });

    it('all mapped types are valid DAMAGE_TYPES keys', () => {
      for (const [skill, type] of Object.entries(SKILL_DAMAGE_TYPES)) {
        expect(DAMAGE_TYPES).toHaveProperty(type);
      }
    });
  });

  // ── applyResistance ─────────────────────────────────────────────
  describe('applyResistance', () => {
    it('0 resistance returns full damage', () => {
      expect(applyResistance(100, 0)).toBe(100);
    });

    it('50 resistance returns half damage', () => {
      // floor(100 * (1 - 50/100)) = floor(100 * 0.5) = 50
      expect(applyResistance(100, 50)).toBe(50);
    });

    it('75 resistance (max) returns 25% damage', () => {
      // floor(100 * (1 - 75/100)) = floor(100 * 0.25) = 25
      expect(applyResistance(100, 75)).toBe(25);
    });

    it('resistance over 75 is capped at 75', () => {
      // floor(100 * (1 - 75/100)) = 25, even with resist=100
      expect(applyResistance(100, 100)).toBe(25);
      expect(applyResistance(100, 200)).toBe(25);
    });

    it('negative resistance is treated as 0', () => {
      expect(applyResistance(100, -50)).toBe(100);
      expect(applyResistance(100, -1)).toBe(100);
    });

    it('always returns minimum 1 damage', () => {
      // Even with max resistance and low damage
      expect(applyResistance(1, 75)).toBe(1);
      expect(applyResistance(2, 75)).toBe(1);
      expect(applyResistance(3, 75)).toBe(1);
    });

    it('minimum 1 damage with high resistance and small input', () => {
      expect(applyResistance(1, 0)).toBe(1);
      expect(applyResistance(1, 50)).toBe(1);
      expect(applyResistance(1, 75)).toBe(1);
    });

    it('returns integer values (floors the result)', () => {
      // floor(77 * (1 - 33/100)) = floor(77 * 0.67) = floor(51.59) = 51
      expect(applyResistance(77, 33)).toBe(Math.floor(77 * (1 - 33 / 100)));
      expect(Number.isInteger(applyResistance(77, 33))).toBe(true);
    });

    it('works with large damage values', () => {
      expect(applyResistance(10000, 50)).toBe(5000);
      expect(applyResistance(10000, 75)).toBe(2500);
    });
  });

  // ── applyArmor ──────────────────────────────────────────────────
  describe('applyArmor', () => {
    it('reduces damage by armor * 0.4', () => {
      // floor(100 - 10 * 0.4) = floor(96) = 96
      expect(applyArmor(100, 10)).toBe(96);
    });

    it('minimum 1 damage even with very high armor', () => {
      expect(applyArmor(1, 10000)).toBe(1);
      expect(applyArmor(5, 100)).toBe(1);
    });

    it('0 armor returns full damage', () => {
      expect(applyArmor(50, 0)).toBe(50);
    });

    it('returns integer values (floors the result)', () => {
      // floor(10 - 3 * 0.4) = floor(10 - 1.2) = floor(8.8) = 8
      expect(applyArmor(10, 3)).toBe(8);
    });
  });

  // ── calcResistance ──────────────────────────────────────────────
  describe('calcResistance', () => {
    it('simple addition of base + bonus', () => {
      expect(calcResistance(10, 20)).toBe(30);
    });

    it('capped at 75', () => {
      expect(calcResistance(50, 50)).toBe(75);
      expect(calcResistance(75, 1)).toBe(75);
      expect(calcResistance(100, 100)).toBe(75);
    });

    it('returns exact sum when under cap', () => {
      expect(calcResistance(0, 0)).toBe(0);
      expect(calcResistance(25, 25)).toBe(50);
      expect(calcResistance(0, 75)).toBe(75);
    });
  });

  // ── getSkillDamageType ──────────────────────────────────────────
  describe('getSkillDamageType', () => {
    it('returns correct type for known skills', () => {
      expect(getSkillDamageType('Fireball')).toBe('fire');
      expect(getSkillDamageType('Frost Nova')).toBe('cold');
      expect(getSkillDamageType('Sniper Shot')).toBe('physical');
      expect(getSkillDamageType('Whirlwind')).toBe('physical');
    });

    it('returns physical for unknown skills', () => {
      expect(getSkillDamageType('Unknown Skill')).toBe('physical');
      expect(getSkillDamageType('')).toBe('physical');
      expect(getSkillDamageType('Thunderbolt')).toBe('physical');
    });
  });

  // ── getDamageTypeDef ────────────────────────────────────────────
  describe('getDamageTypeDef', () => {
    it('returns correct definition for known types', () => {
      expect(getDamageTypeDef('fire').name).toBe('Fire');
      expect(getDamageTypeDef('cold').name).toBe('Cold');
      expect(getDamageTypeDef('poison').name).toBe('Poison');
      expect(getDamageTypeDef('physical').name).toBe('Physical');
    });

    it('returns physical for unknown type keys', () => {
      expect(getDamageTypeDef('lightning')).toBe(DAMAGE_TYPES.physical);
      expect(getDamageTypeDef('arcane')).toBe(DAMAGE_TYPES.physical);
    });
  });
});
