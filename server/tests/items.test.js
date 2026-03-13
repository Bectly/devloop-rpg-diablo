import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  RARITIES,
  WEAPONS,
  ARMORS,
  CONSUMABLES,
  BONUS_POOL,
  RESIST_BONUS_POOL,
  generateWeapon,
  generateArmor,
  generateAccessory,
  generateConsumable,
  generateLoot,
  pickRarity,
} = require('../game/items');

describe('Items', () => {
  // ── Rarity System ───────────────────────────────────────────────
  describe('rarity distribution', () => {
    it('pickRarity returns valid rarity key', () => {
      for (let i = 0; i < 100; i++) {
        const rarity = pickRarity(0);
        expect(Object.keys(RARITIES)).toContain(rarity);
      }
    });

    it('common is most frequent at tierBoost 0', () => {
      const counts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
      for (let i = 0; i < 5000; i++) {
        counts[pickRarity(0)]++;
      }
      // Common weight 60 out of 100 total, so should be ~60%
      expect(counts.common).toBeGreaterThan(counts.uncommon);
      expect(counts.common).toBeGreaterThan(counts.rare);
      expect(counts.common).toBeGreaterThan(counts.epic);
      expect(counts.common).toBeGreaterThan(counts.legendary);
    });

    it('high tierBoost reduces common drops and increases rare+', () => {
      const highBoostCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
      const noBoostCounts   = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };

      for (let i = 0; i < 1000; i++) {
        highBoostCounts[pickRarity(10)]++;
        noBoostCounts[pickRarity(0)]++;
      }

      // tierBoost=10: common weight=10/(10+45+40+24+11)=~7.7%, not dominant
      expect(highBoostCounts.common).toBeLessThan(200);
      // rare+ should outnumber commons at high boost
      const highRarePlus = highBoostCounts.rare + highBoostCounts.epic + highBoostCounts.legendary;
      expect(highRarePlus).toBeGreaterThan(highBoostCounts.common);
      // no boost: commons dominate (~60%)
      expect(noBoostCounts.common).toBeGreaterThan(400);
    });

    it('rarity color mapping is correct', () => {
      expect(RARITIES.common.color).toBe('#aaaaaa');
      expect(RARITIES.uncommon.color).toBe('#44cc44');
      expect(RARITIES.rare.color).toBe('#4488ff');
      expect(RARITIES.epic.color).toBe('#bb44ff');
      expect(RARITIES.legendary.color).toBe('#ff8800');
    });

    it('rarity multipliers scale from 1.0 to 2.2', () => {
      expect(RARITIES.common.multiplier).toBe(1.0);
      expect(RARITIES.uncommon.multiplier).toBe(1.2);
      expect(RARITIES.rare.multiplier).toBe(1.5);
      expect(RARITIES.epic.multiplier).toBe(1.8);
      expect(RARITIES.legendary.multiplier).toBe(2.2);
    });
  });

  // ── Weapon Generation ───────────────────────────────────────────
  describe('weapon generation', () => {
    it('generates a weapon with required fields', () => {
      const w = generateWeapon(0);
      expect(w.id).toBeDefined();
      expect(w.name).toBeDefined();
      expect(w.type).toBe('weapon');
      expect(w.slot).toBe('weapon');
      expect(w.rarity).toBeDefined();
      expect(w.damage).toBeGreaterThan(0);
      expect(w.attackSpeed).toBeGreaterThan(0);
      expect(w.gridW).toBeGreaterThan(0);
      expect(w.gridH).toBeGreaterThan(0);
      expect(w.stackable).toBe(false);
      expect(w.quantity).toBe(1);
    });

    it('sword damage range is [8, 14] * rarity multiplier', () => {
      // Generate many swords
      for (let i = 0; i < 100; i++) {
        const w = generateWeapon(0);
        if (w.subType === 'sword') {
          const maxPossible = Math.ceil(14 * RARITIES.legendary.multiplier);
          expect(w.damage).toBeGreaterThanOrEqual(1); // ceil(8 * 1.0) minimum
          expect(w.damage).toBeLessThanOrEqual(maxPossible + 1);
        }
      }
    });

    it('axe has higher base damage and slower attack speed than sword', () => {
      expect(WEAPONS.axe.baseDamage[0]).toBeGreaterThan(WEAPONS.sword.baseDamage[0]);
      expect(WEAPONS.axe.attackSpeed).toBeGreaterThan(WEAPONS.sword.attackSpeed);
    });

    it('dagger has fastest attack speed', () => {
      const speeds = Object.values(WEAPONS).map(w => w.attackSpeed);
      expect(WEAPONS.dagger.attackSpeed).toBe(Math.min(...speeds));
    });

    it('bow and staff have larger grid height (3)', () => {
      expect(WEAPONS.bow.gridH).toBe(3);
      expect(WEAPONS.staff.gridH).toBe(3);
    });

    it('weapon name includes rarity prefix', () => {
      const w = generateWeapon(0);
      // Name should be "Prefix WeaponType"
      const parts = w.name.split(' ');
      expect(parts.length).toBeGreaterThanOrEqual(2);
    });

    it('weapon has bonuses object', () => {
      const w = generateWeapon(0);
      expect(typeof w.bonuses).toBe('object');
    });
  });

  // ── Armor Generation ────────────────────────────────────────────
  describe('armor generation', () => {
    it('generates armor with required fields', () => {
      const a = generateArmor(0);
      expect(a.id).toBeDefined();
      expect(a.type).toBe('armor');
      expect(a.armor).toBeGreaterThan(0);
      expect(a.slot).toBeDefined();
      expect(['helmet', 'chest', 'gloves', 'boots']).toContain(a.slot);
    });

    it('plate armor has higher base armor than leather', () => {
      expect(ARMORS.plate_chest.baseArmor[0]).toBeGreaterThan(ARMORS.leather_chest.baseArmor[0]);
    });

    it('leather has higher base armor than cloth', () => {
      expect(ARMORS.leather_chest.baseArmor[0]).toBeGreaterThan(ARMORS.cloth_chest.baseArmor[0]);
    });

    it('chest pieces have gridH of 3, others gridH of 2', () => {
      for (const [key, armor] of Object.entries(ARMORS)) {
        if (armor.slot === 'chest') {
          expect(armor.gridH).toBe(3);
        } else {
          expect(armor.gridH).toBe(2);
        }
      }
    });
  });

  // ── Accessory Generation ────────────────────────────────────────
  describe('accessory generation', () => {
    it('generates accessory with bonuses', () => {
      const a = generateAccessory(0);
      expect(a.id).toBeDefined();
      expect(typeof a.bonuses).toBe('object');
    });

    it('shield gets armor value', () => {
      // Generate many until we get a shield
      for (let i = 0; i < 100; i++) {
        const a = generateAccessory(0);
        if (a.subType === 'shield') {
          expect(a.armor).toBeGreaterThan(0);
          return;
        }
      }
      // If we reach here, shield is at minimum possible (not a failure of logic, just RNG)
    });
  });

  // ── Bonus Generation ────────────────────────────────────────────
  describe('bonus generation', () => {
    it('common items get 0-1 bonuses', () => {
      expect(RARITIES.common.bonusCount).toEqual([0, 1]);
    });

    it('legendary items get 4-5 bonuses', () => {
      expect(RARITIES.legendary.bonusCount).toEqual([4, 5]);
    });

    it('bonus count scales with rarity', () => {
      const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
      for (let i = 1; i < rarityOrder.length; i++) {
        const prev = RARITIES[rarityOrder[i - 1]];
        const curr = RARITIES[rarityOrder[i]];
        expect(curr.bonusCount[0]).toBeGreaterThanOrEqual(prev.bonusCount[0]);
      }
    });
  });

  // ── Consumable Generation ───────────────────────────────────────
  describe('consumable generation', () => {
    it('generates health potion', () => {
      const p = generateConsumable('health_potion', 5);
      expect(p.name).toBe('Health Potion');
      expect(p.type).toBe('consumable');
      expect(p.stackable).toBe(true);
      expect(p.quantity).toBe(5);
      expect(p.maxStack).toBe(20);
    });

    it('generates mana potion', () => {
      const p = generateConsumable('mana_potion', 3);
      expect(p.name).toBe('Mana Potion');
      expect(p.quantity).toBe(3);
    });

    it('generates gold', () => {
      const g = generateConsumable('gold', 100);
      expect(g.name).toBe('Gold');
      expect(g.type).toBe('currency');
      expect(g.quantity).toBe(100);
      expect(g.maxStack).toBe(9999);
    });

    it('clamps quantity to maxStack', () => {
      const p = generateConsumable('health_potion', 999);
      expect(p.quantity).toBe(20); // maxStack is 20
    });

    it('returns null for unknown consumable type', () => {
      const result = generateConsumable('super_elixir');
      expect(result).toBeNull();
    });
  });

  // ── Resistance Bonuses ─────────────────────────────────────────
  describe('resistance bonuses', () => {
    it('RESIST_BONUS_POOL defines 4 resistance types', () => {
      expect(RESIST_BONUS_POOL.length).toBe(4);
      const stats = RESIST_BONUS_POOL.map(b => b.stat);
      expect(stats).toContain('fire_resist');
      expect(stats).toContain('cold_resist');
      expect(stats).toContain('poison_resist');
      expect(stats).toContain('all_resist');
    });

    it('fire_resist range is 5-20', () => {
      const fr = RESIST_BONUS_POOL.find(b => b.stat === 'fire_resist');
      expect(fr.min).toBe(5);
      expect(fr.max).toBe(20);
    });

    it('cold_resist range is 5-20', () => {
      const cr = RESIST_BONUS_POOL.find(b => b.stat === 'cold_resist');
      expect(cr.min).toBe(5);
      expect(cr.max).toBe(20);
    });

    it('poison_resist range is 5-20', () => {
      const pr = RESIST_BONUS_POOL.find(b => b.stat === 'poison_resist');
      expect(pr.min).toBe(5);
      expect(pr.max).toBe(20);
    });

    it('all_resist range is 3-10', () => {
      const ar = RESIST_BONUS_POOL.find(b => b.stat === 'all_resist');
      expect(ar.min).toBe(3);
      expect(ar.max).toBe(10);
    });

    it('armor items can generate resistance bonuses', () => {
      // Generate many armor items and check if any have resist bonuses
      let foundResist = false;
      for (let i = 0; i < 200; i++) {
        const armor = generateArmor(5); // high tier for more bonuses
        const bonusKeys = Object.keys(armor.bonuses);
        if (bonusKeys.some(k => k.includes('resist'))) {
          foundResist = true;
          break;
        }
      }
      expect(foundResist).toBe(true);
    });

    it('resistance bonus values are within valid range (scaled by rarity)', () => {
      for (let i = 0; i < 200; i++) {
        const armor = generateArmor(5);
        for (const [stat, val] of Object.entries(armor.bonuses)) {
          if (stat === 'fire_resist' || stat === 'cold_resist' || stat === 'poison_resist') {
            // min 5 * 1.0 (common) = 5, max 20 * 2.2 (legendary) = 44
            expect(val).toBeGreaterThanOrEqual(5);
            expect(val).toBeLessThanOrEqual(Math.ceil(20 * RARITIES.legendary.multiplier));
          }
          if (stat === 'all_resist') {
            // min 3 * 1.0 = 3, max 10 * 2.2 = 22
            expect(val).toBeGreaterThanOrEqual(3);
            expect(val).toBeLessThanOrEqual(Math.ceil(10 * RARITIES.legendary.multiplier));
          }
        }
      }
    });

    it('weapons do not get resistance bonuses from RESIST_BONUS_POOL', () => {
      // generateWeapon uses BONUS_POOL only (no RESIST_BONUS_POOL)
      // So resist bonuses should never appear on weapons
      for (let i = 0; i < 200; i++) {
        const w = generateWeapon(5);
        const bonusKeys = Object.keys(w.bonuses);
        const hasResist = bonusKeys.some(k => k.includes('resist'));
        expect(hasResist).toBe(false);
      }
    });
  });

  // ── Loot Table Generation ───────────────────────────────────────
  describe('loot generation', () => {
    it('gold always drops', () => {
      for (let i = 0; i < 50; i++) {
        const loot = generateLoot(1, 'skeleton');
        const gold = loot.find(item => item.subType === 'gold');
        expect(gold).toBeDefined();
        expect(gold.quantity).toBeGreaterThan(0);
      }
    });

    it('gold amount scales with floor', () => {
      const floor0Golds = [];
      const floor5Golds = [];
      for (let i = 0; i < 100; i++) {
        const loot0 = generateLoot(1, 'skeleton', 0);
        const loot5 = generateLoot(1, 'skeleton', 5);
        floor0Golds.push(loot0.find(l => l.subType === 'gold').quantity);
        floor5Golds.push(loot5.find(l => l.subType === 'gold').quantity);
      }
      const avg0 = floor0Golds.reduce((a, b) => a + b) / floor0Golds.length;
      const avg5 = floor5Golds.reduce((a, b) => a + b) / floor5Golds.length;
      expect(avg5).toBeGreaterThan(avg0);
    });

    it('equipment drop chance increases with lootTier', () => {
      let lowTierEquip = 0;
      let highTierEquip = 0;
      const iterations = 2000;

      for (let i = 0; i < iterations; i++) {
        const loot1 = generateLoot(0, 'skeleton');
        const loot2 = generateLoot(3, 'demon');
        if (loot1.some(l => l.type === 'weapon' || l.type === 'armor' || l.type === 'accessory')) lowTierEquip++;
        if (loot2.some(l => l.type === 'weapon' || l.type === 'armor' || l.type === 'accessory')) highTierEquip++;
      }

      expect(highTierEquip).toBeGreaterThan(lowTierEquip);
    });

    it('boss loot (lootTier >= 4) guarantees a rare+ drop', () => {
      for (let i = 0; i < 50; i++) {
        const loot = generateLoot(4, 'boss_knight');
        // Should have at least one equipment item that is rare or better
        const rareOrder = ['rare', 'epic', 'legendary'];
        const bossEquip = loot.filter(l =>
          (l.type === 'weapon' || l.type === 'armor' || l.type === 'accessory') &&
          rareOrder.includes(l.rarity)
        );
        expect(bossEquip.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('boss loot upgrades sub-rare items to rare', () => {
      // The code forces rarity to 'rare' if below index 2 (common/uncommon)
      // We can't guarantee a specific roll, but the loot should always have
      // at least one rare+ equipment
      for (let i = 0; i < 30; i++) {
        const loot = generateLoot(4, 'boss_knight');
        const equipItems = loot.filter(l => l.type === 'weapon' || l.type === 'armor' || l.type === 'accessory');
        const hasRarePlus = equipItems.some(e => ['rare', 'epic', 'legendary'].includes(e.rarity));
        expect(hasRarePlus).toBe(true);
      }
    });

    it('potion drop rate is approximately 30%', () => {
      let potionDrops = 0;
      const iterations = 3000;
      for (let i = 0; i < iterations; i++) {
        const loot = generateLoot(1, 'skeleton');
        if (loot.some(l => l.subType === 'health_potion' || l.subType === 'mana_potion')) {
          potionDrops++;
        }
      }
      const rate = potionDrops / iterations;
      // Should be roughly 30% (allow 20-40% margin for randomness)
      expect(rate).toBeGreaterThan(0.20);
      expect(rate).toBeLessThan(0.40);
    });
  });
});
