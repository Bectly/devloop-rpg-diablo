import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
  ITEM_SETS,
  generateSetItem,
  rollSetDrop,
  getSetInfo,
  countSetPieces,
} = require('../game/sets');

const { RARITIES, WEAPONS, ARMORS, ACCESSORIES } = require('../game/items');

// ── ITEM_SETS definitions ────────────────────────────────────────

describe('Sets', () => {
  describe('ITEM_SETS definitions', () => {
    it('has exactly 4 sets', () => {
      expect(Object.keys(ITEM_SETS)).toHaveLength(4);
    });

    it('all sets have required fields', () => {
      for (const [id, set] of Object.entries(ITEM_SETS)) {
        expect(set.name).toBeTruthy();
        expect(set.color).toBe('#00cc66');
        expect(set.pieces).toBeDefined();
        expect(set.bonuses).toBeDefined();
        expect(set.bonuses[2]).toBeDefined();
        expect(set.bonuses[3]).toBeDefined();
        expect(set.bonuses[2].description).toBeTruthy();
        expect(set.bonuses[3].description).toBeTruthy();
      }
    });

    it('each set has exactly 3 pieces', () => {
      for (const set of Object.values(ITEM_SETS)) {
        expect(Object.keys(set.pieces)).toHaveLength(3);
      }
    });

    it('ironwall is warrior-only', () => {
      expect(ITEM_SETS.ironwall.class).toBe('warrior');
    });

    it('shadowweave is rogue-only', () => {
      expect(ITEM_SETS.shadowweave.class).toBe('rogue');
    });

    it('arcane_codex is mage-only', () => {
      expect(ITEM_SETS.arcane_codex.class).toBe('mage');
    });

    it('bones_of_fallen is universal (null class)', () => {
      expect(ITEM_SETS.bones_of_fallen.class).toBeNull();
    });

    it('all piece bases resolve to valid items', () => {
      for (const set of Object.values(ITEM_SETS)) {
        for (const piece of Object.values(set.pieces)) {
          const base = WEAPONS[piece.base] || ARMORS[piece.base] || ACCESSORIES[piece.base];
          expect(base).toBeDefined();
        }
      }
    });

    it('weapon pieces have baseDamage ranges', () => {
      for (const set of Object.values(ITEM_SETS)) {
        for (const [slot, piece] of Object.entries(set.pieces)) {
          if (slot === 'weapon') {
            expect(piece.baseDamage).toBeDefined();
            expect(piece.baseDamage).toHaveLength(2);
            expect(piece.baseDamage[0]).toBeLessThanOrEqual(piece.baseDamage[1]);
          }
        }
      }
    });

    it('armor pieces have baseArmor ranges', () => {
      for (const set of Object.values(ITEM_SETS)) {
        for (const [slot, piece] of Object.entries(set.pieces)) {
          const base = WEAPONS[piece.base] || ARMORS[piece.base] || ACCESSORIES[piece.base];
          if (base && base.type === 'armor' && piece.baseArmor) {
            expect(piece.baseArmor).toHaveLength(2);
            expect(piece.baseArmor[0]).toBeLessThanOrEqual(piece.baseArmor[1]);
          }
        }
      }
    });

    it('ironwall 2pc gives armor + maxHpPercent', () => {
      const b = ITEM_SETS.ironwall.bonuses[2];
      expect(b.armor).toBe(30);
      expect(b.maxHpPercent).toBe(15);
    });

    it('ironwall 3pc gives damagePercent', () => {
      expect(ITEM_SETS.ironwall.bonuses[3].damagePercent).toBe(25);
    });

    it('shadowweave 2pc gives critChance + speedPercent', () => {
      const b = ITEM_SETS.shadowweave.bonuses[2];
      expect(b.critChance).toBe(20);
      expect(b.speedPercent).toBe(15);
    });

    it('shadowweave 3pc gives critDamagePercent', () => {
      expect(ITEM_SETS.shadowweave.bonuses[3].critDamagePercent).toBe(30);
    });

    it('arcane_codex 2pc gives spellDamagePercent + maxMana', () => {
      const b = ITEM_SETS.arcane_codex.bonuses[2];
      expect(b.spellDamagePercent).toBe(25);
      expect(b.maxMana).toBe(20);
    });

    it('arcane_codex 3pc gives cooldownReduction', () => {
      expect(ITEM_SETS.arcane_codex.bonuses[3].cooldownReduction).toBe(20);
    });

    it('bones_of_fallen 2pc gives all_resist + maxHp', () => {
      const b = ITEM_SETS.bones_of_fallen.bonuses[2];
      expect(b.all_resist).toBe(10);
      expect(b.maxHp).toBe(100);
    });

    it('bones_of_fallen 3pc gives lifestealPercent + xpPercent', () => {
      const b = ITEM_SETS.bones_of_fallen.bonuses[3];
      expect(b.lifestealPercent).toBe(5);
      expect(b.xpPercent).toBe(50);
    });
  });

  // ── generateSetItem ──────────────────────────────────────────

  describe('generateSetItem()', () => {
    it('returns null for invalid setId', () => {
      expect(generateSetItem('nonexistent', 'weapon')).toBeNull();
    });

    it('returns null for invalid slot', () => {
      expect(generateSetItem('ironwall', 'amulet')).toBeNull();
    });

    it('generates ironwall weapon with correct fields', () => {
      const item = generateSetItem('ironwall', 'weapon');
      expect(item).not.toBeNull();
      expect(item.name).toBe('Ironwall Greatsword');
      expect(item.rarity).toBe('set');
      expect(item.rarityColor).toBe('#00cc66');
      expect(item.setId).toBe('ironwall');
      expect(item.isSetItem).toBe(true);
      expect(item.slot).toBe('weapon');
      expect(item.damage).toBeGreaterThan(0);
      expect(item.attackSpeed).toBeGreaterThan(0);
    });

    it('generates armor piece with armor value', () => {
      const item = generateSetItem('ironwall', 'chest');
      expect(item).not.toBeNull();
      expect(item.name).toBe('Ironwall Plate');
      expect(item.armor).toBeGreaterThan(0);
      expect(item.type).toBe('armor');
    });

    it('weapon damage uses 1.9x multiplier', () => {
      // Run multiple times, verify damage is in expected range
      // baseDamage [16, 24], multiplier 1.9 → ceil(16*1.9)=31 to ceil(24*1.9)=46
      for (let i = 0; i < 50; i++) {
        const item = generateSetItem('ironwall', 'weapon');
        expect(item.damage).toBeGreaterThanOrEqual(Math.ceil(16 * 1.9));
        expect(item.damage).toBeLessThanOrEqual(Math.ceil(24 * 1.9));
      }
    });

    it('armor value uses 1.9x multiplier', () => {
      // Ironwall Plate: baseArmor [22, 30], multiplier 1.9 → ceil(22*1.9)=42 to ceil(30*1.9)=57
      for (let i = 0; i < 50; i++) {
        const item = generateSetItem('ironwall', 'chest');
        expect(item.armor).toBeGreaterThanOrEqual(Math.ceil(22 * 1.9));
        expect(item.armor).toBeLessThanOrEqual(Math.ceil(30 * 1.9));
      }
    });

    it('generates 2-3 random bonuses', () => {
      for (let i = 0; i < 50; i++) {
        const item = generateSetItem('ironwall', 'weapon');
        const bonusCount = Object.keys(item.bonuses).length;
        expect(bonusCount).toBeGreaterThanOrEqual(2);
        expect(bonusCount).toBeLessThanOrEqual(3);
      }
    });

    it('armor pieces can have resist bonuses', () => {
      // Armor items draw from BONUS_POOL + RESIST_BONUS_POOL
      let foundResist = false;
      for (let i = 0; i < 200; i++) {
        const item = generateSetItem('ironwall', 'chest');
        const keys = Object.keys(item.bonuses);
        if (keys.some(k => k.includes('resist'))) {
          foundResist = true;
          break;
        }
      }
      expect(foundResist).toBe(true);
    });

    it('has unique uuid id', () => {
      const a = generateSetItem('ironwall', 'weapon');
      const b = generateSetItem('ironwall', 'weapon');
      expect(a.id).not.toBe(b.id);
    });

    it('item is not stackable', () => {
      const item = generateSetItem('ironwall', 'weapon');
      expect(item.stackable).toBe(false);
      expect(item.quantity).toBe(1);
    });

    it('generates all 4 sets correctly', () => {
      const sets = ['ironwall', 'shadowweave', 'arcane_codex', 'bones_of_fallen'];
      for (const setId of sets) {
        const slots = Object.keys(ITEM_SETS[setId].pieces);
        for (const slot of slots) {
          const item = generateSetItem(setId, slot);
          expect(item).not.toBeNull();
          expect(item.setId).toBe(setId);
          expect(item.isSetItem).toBe(true);
          expect(item.rarity).toBe('set');
        }
      }
    });

    it('accessory piece (amulet) has no armor/damage', () => {
      const item = generateSetItem('bones_of_fallen', 'amulet');
      expect(item).not.toBeNull();
      expect(item.name).toBe('Talisman of the Fallen');
      // Amulet has no baseDamage or baseArmor in set def
      expect(item.damage).toBeUndefined();
      expect(item.armor).toBeUndefined();
    });
  });

  // ── rollSetDrop ──────────────────────────────────────────────

  describe('rollSetDrop()', () => {
    it('normal monsters never drop sets', () => {
      for (let i = 0; i < 100; i++) {
        const result = rollSetDrop(3, false, null);
        expect(result).toBeNull();
      }
    });

    it('rare elites always drop sets', () => {
      for (let i = 0; i < 50; i++) {
        const result = rollSetDrop(1, true, 'rare');
        expect(result).not.toBeNull();
        expect(result.setId).toBeTruthy();
        expect(result.slot).toBeTruthy();
      }
    });

    it('champion elites drop sets ~25% of the time', () => {
      let drops = 0;
      const trials = 1000;
      for (let i = 0; i < trials; i++) {
        if (rollSetDrop(1, true, 'champion')) drops++;
      }
      // 25% ± 5% tolerance
      expect(drops).toBeGreaterThan(trials * 0.15);
      expect(drops).toBeLessThan(trials * 0.35);
    });

    it('floor 5+ non-elite always drops', () => {
      // Note: floor >= 5 path triggers chance = 1.0 for non-elite
      for (let i = 0; i < 50; i++) {
        const result = rollSetDrop(5, false, null);
        expect(result).not.toBeNull();
      }
    });

    it('floor 6 non-elite always drops', () => {
      for (let i = 0; i < 20; i++) {
        const result = rollSetDrop(6, false, null);
        expect(result).not.toBeNull();
      }
    });

    it('floor 4 non-elite never drops', () => {
      for (let i = 0; i < 100; i++) {
        expect(rollSetDrop(4, false, null)).toBeNull();
      }
    });

    it('dropped setId is always valid', () => {
      const validSets = Object.keys(ITEM_SETS);
      for (let i = 0; i < 50; i++) {
        const result = rollSetDrop(1, true, 'rare');
        expect(validSets).toContain(result.setId);
      }
    });

    it('dropped slot matches set pieces', () => {
      for (let i = 0; i < 50; i++) {
        const result = rollSetDrop(1, true, 'rare');
        const validSlots = Object.keys(ITEM_SETS[result.setId].pieces);
        expect(validSlots).toContain(result.slot);
      }
    });

    it('distribution covers all 4 sets', () => {
      const seen = new Set();
      for (let i = 0; i < 200; i++) {
        const result = rollSetDrop(1, true, 'rare');
        seen.add(result.setId);
      }
      expect(seen.size).toBe(4);
    });
  });

  // ── getSetInfo ───────────────────────────────────────────────

  describe('getSetInfo()', () => {
    it('returns set definition for valid id', () => {
      const info = getSetInfo('ironwall');
      expect(info).not.toBeNull();
      expect(info.name).toBe('Ironwall');
      expect(info.pieces).toBeDefined();
      expect(info.bonuses).toBeDefined();
    });

    it('returns null for invalid id', () => {
      expect(getSetInfo('nonexistent')).toBeNull();
    });

    it('returns all 4 sets', () => {
      for (const id of ['ironwall', 'shadowweave', 'arcane_codex', 'bones_of_fallen']) {
        expect(getSetInfo(id)).not.toBeNull();
      }
    });
  });

  // ── countSetPieces ───────────────────────────────────────────

  describe('countSetPieces()', () => {
    it('returns empty map for empty equipment', () => {
      const counts = countSetPieces({});
      expect(counts.size).toBe(0);
    });

    it('returns empty map for non-set items', () => {
      const equipment = {
        weapon: { name: 'Sword', rarity: 'common' },
        chest: { name: 'Plate', rarity: 'rare' },
      };
      const counts = countSetPieces(equipment);
      expect(counts.size).toBe(0);
    });

    it('returns empty map for null slots', () => {
      const equipment = { weapon: null, chest: null };
      const counts = countSetPieces(equipment);
      expect(counts.size).toBe(0);
    });

    it('counts single set piece', () => {
      const equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
      };
      const counts = countSetPieces(equipment);
      expect(counts.get('ironwall')).toBe(1);
    });

    it('counts 2 pieces from same set', () => {
      const equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall' },
      };
      const counts = countSetPieces(equipment);
      expect(counts.get('ironwall')).toBe(2);
    });

    it('counts 3 pieces from same set', () => {
      const equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall' },
        boots: { isSetItem: true, setId: 'ironwall' },
      };
      const counts = countSetPieces(equipment);
      expect(counts.get('ironwall')).toBe(3);
    });

    it('counts pieces from multiple sets', () => {
      const equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { isSetItem: true, setId: 'ironwall' },
        helmet: { isSetItem: true, setId: 'bones_of_fallen' },
      };
      const counts = countSetPieces(equipment);
      expect(counts.get('ironwall')).toBe(2);
      expect(counts.get('bones_of_fallen')).toBe(1);
    });

    it('ignores items without isSetItem flag', () => {
      const equipment = {
        weapon: { setId: 'ironwall' }, // no isSetItem
      };
      const counts = countSetPieces(equipment);
      expect(counts.size).toBe(0);
    });

    it('ignores set items without setId', () => {
      const equipment = {
        weapon: { isSetItem: true }, // no setId
      };
      const counts = countSetPieces(equipment);
      expect(counts.size).toBe(0);
    });

    it('mixes set and non-set items correctly', () => {
      const equipment = {
        weapon: { isSetItem: true, setId: 'ironwall' },
        chest: { name: 'Epic Plate', rarity: 'epic' },
        boots: { isSetItem: true, setId: 'ironwall' },
        helmet: null,
      };
      const counts = countSetPieces(equipment);
      expect(counts.get('ironwall')).toBe(2);
      expect(counts.size).toBe(1);
    });
  });

  // ── RARITIES.set ─────────────────────────────────────────────

  describe('RARITIES.set', () => {
    it('exists and has correct color', () => {
      expect(RARITIES.set).toBeDefined();
      expect(RARITIES.set.color).toBe('#00cc66');
    });

    it('has weight 0 (not in random drops)', () => {
      expect(RARITIES.set.weight).toBe(0);
    });

    it('has multiplier 1.9', () => {
      expect(RARITIES.set.multiplier).toBe(1.9);
    });

    it('has bonusCount [2, 3]', () => {
      expect(RARITIES.set.bonusCount).toEqual([2, 3]);
    });
  });

  // ── Integration: generateSetItem + countSetPieces ────────────

  describe('integration', () => {
    it('generated set items are counted correctly', () => {
      const weapon = generateSetItem('ironwall', 'weapon');
      const chest = generateSetItem('ironwall', 'chest');
      const boots = generateSetItem('ironwall', 'boots');

      const equipment = {
        weapon,
        chest,
        boots,
      };

      const counts = countSetPieces(equipment);
      expect(counts.get('ironwall')).toBe(3);
    });

    it('mixed generated sets are counted separately', () => {
      const w = generateSetItem('ironwall', 'weapon');
      const h = generateSetItem('bones_of_fallen', 'helmet');

      const equipment = { weapon: w, helmet: h };
      const counts = countSetPieces(equipment);
      expect(counts.get('ironwall')).toBe(1);
      expect(counts.get('bones_of_fallen')).toBe(1);
    });

    it('rollSetDrop result feeds into generateSetItem', () => {
      const drop = rollSetDrop(1, true, 'rare');
      expect(drop).not.toBeNull();

      const item = generateSetItem(drop.setId, drop.slot);
      expect(item).not.toBeNull();
      expect(item.isSetItem).toBe(true);
      expect(item.setId).toBe(drop.setId);
    });
  });
});
