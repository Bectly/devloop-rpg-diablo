import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  RARITIES,
  WEAPONS,
  PREFIXES,
  SUFFIXES,
  LEGENDARY_NAMES,
  generateWeapon,
  generateLoot,
  getSuffix,
  getLegendaryName,
  buildItemName,
} = require('../game/items');

describe('Procedural Loot Names (Cycles #31-33)', () => {
  // ── Common weapon naming ──────────────────────────────────────
  describe('common weapon naming', () => {
    it('common weapon has prefix from PREFIXES.common + base name (no suffix)', () => {
      // Generate many weapons until we get a common one
      let found = false;
      for (let i = 0; i < 200 && !found; i++) {
        const w = generateWeapon(0);
        if (w.rarity === 'common') {
          // Name should be "Prefix BaseName" with prefix from PREFIXES.common
          const name = w.name;
          const hasCommonPrefix = PREFIXES.common.some(p => name.startsWith(p + ' '));
          expect(hasCommonPrefix).toBe(true);

          // Common items should NOT have a suffix (e.g. "of the Bear")
          const hasSuffix = Object.values(SUFFIXES).flat().some(s => name.includes(s));
          expect(hasSuffix).toBe(false);
          found = true;
        }
      }
      expect(found).toBe(true);
    });
  });

  // ── Uncommon weapon naming ────────────────────────────────────
  describe('uncommon weapon naming', () => {
    it('uncommon weapon has prefix from PREFIXES.uncommon + base name', () => {
      let found = false;
      for (let i = 0; i < 200 && !found; i++) {
        const w = generateWeapon(0);
        if (w.rarity === 'uncommon') {
          const name = w.name;
          const hasUncommonPrefix = PREFIXES.uncommon.some(p => name.startsWith(p + ' '));
          expect(hasUncommonPrefix).toBe(true);
          found = true;
        }
      }
      expect(found).toBe(true);
    });
  });

  // ── Legendary weapon naming ───────────────────────────────────
  describe('legendary weapon naming', () => {
    it('legendary weapon gets unique name from LEGENDARY_NAMES (no prefix)', () => {
      // Use high tierBoost to increase legendary chance
      let found = false;
      for (let i = 0; i < 500 && !found; i++) {
        const w = generateWeapon(10);
        if (w.rarity === 'legendary') {
          const name = w.name;
          // Should be a unique legendary name, not a prefixed one
          const allLegendaryNames = Object.values(LEGENDARY_NAMES.weapon).flat();
          expect(allLegendaryNames).toContain(name);

          // Should NOT start with any legendary prefix
          const hasPrefix = PREFIXES.legendary.some(p => name.startsWith(p + ' '));
          expect(hasPrefix).toBe(false);
          found = true;
        }
      }
      expect(found).toBe(true);
    });
  });

  // ── Epic weapon suffix ────────────────────────────────────────
  describe('epic weapon suffix', () => {
    it('epic weapon with bonuses gets a suffix', () => {
      let found = false;
      for (let i = 0; i < 500 && !found; i++) {
        const w = generateWeapon(8);
        if (w.rarity === 'epic' && Object.keys(w.bonuses).length > 0) {
          const name = w.name;
          const allSuffixes = Object.values(SUFFIXES).flat();
          const hasSuffix = allSuffixes.some(s => name.includes(s));
          // Epic always tries to add suffix via getSuffix; if bonuses exist it should have one
          if (hasSuffix) {
            found = true;
          }
        }
      }
      // With epic bonusCount [3,4], we expect bonuses, and buildItemName always calls getSuffix for epic
      expect(found).toBe(true);
    });
  });

  // ── Rare weapon suffix probability ────────────────────────────
  describe('rare weapon suffix probability', () => {
    it('rare weapon has ~60% chance of suffix — some have suffix, some do not', () => {
      let withSuffix = 0;
      let withoutSuffix = 0;
      const allSuffixes = Object.values(SUFFIXES).flat();

      for (let i = 0; i < 1000; i++) {
        const w = generateWeapon(5);
        if (w.rarity === 'rare') {
          const hasSuffix = allSuffixes.some(s => w.name.includes(s));
          if (hasSuffix) withSuffix++;
          else withoutSuffix++;
        }
      }

      // We need both categories to have at least some occurrences
      const total = withSuffix + withoutSuffix;
      // Skip if not enough rare drops (extremely unlikely with 1000 iterations at tierBoost 5)
      if (total >= 20) {
        expect(withSuffix).toBeGreaterThan(0);
        expect(withoutSuffix).toBeGreaterThan(0);
        // 60% chance means roughly 40-80% with suffix
        const rate = withSuffix / total;
        expect(rate).toBeGreaterThan(0.30);
        expect(rate).toBeLessThan(0.85);
      }
    });
  });

  // ── getSuffix function ────────────────────────────────────────
  describe('getSuffix()', () => {
    it('returns empty string when no bonuses', () => {
      expect(getSuffix(null)).toBe('');
      expect(getSuffix({})).toBe('');
      expect(getSuffix(undefined)).toBe('');
    });

    it('returns suffix matching the highest bonus stat', () => {
      const bonuses = { str: 5, dex: 2, int: 1 };
      const result = getSuffix(bonuses);
      // Highest stat is str=5, so suffix should come from SUFFIXES.str
      expect(SUFFIXES.str).toContain(result);
    });

    it('returns suffix from correct pool when vit is highest', () => {
      const bonuses = { vit: 8, str: 1 };
      const result = getSuffix(bonuses);
      expect(SUFFIXES.vit).toContain(result);
    });

    it('returns suffix from correct pool when damage is highest', () => {
      const bonuses = { damage: 6, int: 2 };
      const result = getSuffix(bonuses);
      expect(SUFFIXES.damage).toContain(result);
    });

    it('returns suffix from correct pool when armor is highest', () => {
      const bonuses = { armor: 10, dex: 3 };
      const result = getSuffix(bonuses);
      expect(SUFFIXES.armor).toContain(result);
    });
  });

  // ── getLegendaryName function ─────────────────────────────────
  describe('getLegendaryName()', () => {
    it('returns a name from the correct weapon subType pool', () => {
      for (const subType of ['sword', 'axe', 'bow', 'staff', 'dagger']) {
        const name = getLegendaryName('weapon', subType);
        expect(LEGENDARY_NAMES.weapon[subType]).toContain(name);
      }
    });

    it('returns a name from the correct armor subType pool', () => {
      for (const subType of ['plate', 'leather', 'cloth', 'shield']) {
        const name = getLegendaryName('armor', subType);
        expect(LEGENDARY_NAMES.armor[subType]).toContain(name);
      }
    });

    it('returns a name from the correct accessory subType pool', () => {
      for (const subType of ['ring', 'amulet']) {
        const name = getLegendaryName('accessory', subType);
        expect(LEGENDARY_NAMES.accessory[subType]).toContain(name);
      }
    });

    it('returns null for unknown category or subType', () => {
      expect(getLegendaryName('unknown', 'sword')).toBeNull();
      expect(getLegendaryName('weapon', 'flail')).toBeNull();
    });
  });

  // ── buildItemName function ────────────────────────────────────
  describe('buildItemName()', () => {
    it('legendary returns unique name (ignores prefix)', () => {
      const name = buildItemName('Godslayer', 'Sword', 'legendary', { str: 5 }, 'weapon', 'sword');
      const allLegendaryWeaponNames = LEGENDARY_NAMES.weapon.sword;
      expect(allLegendaryWeaponNames).toContain(name);
    });

    it('epic returns "prefix base suffix" when bonuses exist', () => {
      const bonuses = { str: 8, dex: 2 };
      const name = buildItemName('Mythic', 'Sword', 'epic', bonuses, 'weapon', 'sword');
      expect(name).toMatch(/^Mythic Sword/);
      // Should have a suffix from SUFFIXES.str (str is highest)
      const allStrSuffixes = SUFFIXES.str;
      const hasSuffix = allStrSuffixes.some(s => name.includes(s));
      expect(hasSuffix).toBe(true);
    });

    it('epic returns "prefix base" when no bonuses yield a suffix', () => {
      const name = buildItemName('Mythic', 'Sword', 'epic', {}, 'weapon', 'sword');
      expect(name).toBe('Mythic Sword');
    });

    it('common/uncommon returns "prefix base" without suffix', () => {
      const name = buildItemName('Worn', 'Sword', 'common', { str: 3 }, 'weapon', 'sword');
      expect(name).toBe('Worn Sword');
    });

    it('uncommon returns "prefix base" without suffix', () => {
      const name = buildItemName('Fine', 'Axe', 'uncommon', { dex: 4 }, 'weapon', 'axe');
      expect(name).toBe('Fine Axe');
    });
  });

  // ── Boss loot rarity guarantee ────────────────────────────────
  describe('boss loot quality', () => {
    it('boss loot (lootTier >= 4) items are at least rare quality', () => {
      const rareOrBetter = ['rare', 'epic', 'legendary'];
      for (let i = 0; i < 50; i++) {
        const loot = generateLoot(4, 'boss_knight', 3);
        const equipItems = loot.filter(l =>
          l.type === 'weapon' || l.type === 'armor' || l.type === 'accessory'
        );
        // Boss loot guarantees at least one rare+ equipment item
        const hasRarePlus = equipItems.some(e => rareOrBetter.includes(e.rarity));
        expect(hasRarePlus).toBe(true);
      }
    });
  });
});
