import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { generateShopInventory, calculatePrice, getSellPrice } = require('../game/shop');
const { RARITIES } = require('../game/items');

describe('Shop', () => {
  // ── generateShopInventory ───────────────────────────────────────
  describe('generateShopInventory', () => {
    it('returns an array of items', () => {
      const items = generateShopInventory(0);
      expect(Array.isArray(items)).toBe(true);
      expect(items.length).toBeGreaterThan(0);
    });

    it('always includes a health potion', () => {
      const items = generateShopInventory(0);
      const hp = items.find(i => i.subType === 'health_potion');
      expect(hp).toBeDefined();
      expect(hp.name).toBe('Health Potion');
      expect(hp.type).toBe('consumable');
    });

    it('always includes a mana potion', () => {
      const items = generateShopInventory(0);
      const mp = items.find(i => i.subType === 'mana_potion');
      expect(mp).toBeDefined();
      expect(mp.name).toBe('Mana Potion');
      expect(mp.type).toBe('consumable');
    });

    it('has 3-5 equipment items (plus 2 potions)', () => {
      // Run multiple times since count is random
      for (let trial = 0; trial < 20; trial++) {
        const items = generateShopInventory(0);
        const potions = items.filter(i => i.type === 'consumable');
        const equipment = items.filter(i => i.type !== 'consumable');
        expect(potions.length).toBe(2); // always hp + mp potion
        expect(equipment.length).toBeGreaterThanOrEqual(3);
        expect(equipment.length).toBeLessThanOrEqual(5);
      }
    });

    it('equipment items have shopPrice set', () => {
      const items = generateShopInventory(0);
      const equipment = items.filter(i => i.type !== 'consumable');
      for (const item of equipment) {
        expect(item.shopPrice).toBeDefined();
        expect(item.shopPrice).toBeGreaterThan(0);
      }
    });

    it('potion prices scale with floor', () => {
      const floor0 = generateShopInventory(0);
      const floor5 = generateShopInventory(5);
      const hp0 = floor0.find(i => i.subType === 'health_potion');
      const hp5 = floor5.find(i => i.subType === 'health_potion');
      // Floor 0: 25 + 0*5 = 25, Floor 5: 25 + 5*5 = 50
      expect(hp0.shopPrice).toBe(25);
      expect(hp5.shopPrice).toBe(50);
      expect(hp5.shopPrice).toBeGreaterThan(hp0.shopPrice);
    });

    it('mana potion price formula is 20 + floor * 5', () => {
      const floor3 = generateShopInventory(3);
      const mp = floor3.find(i => i.subType === 'mana_potion');
      expect(mp.shopPrice).toBe(20 + 3 * 5); // 35
    });

    it('inventory scales with floor (tierBoost = floor/2)', () => {
      // Higher floors should produce equipment with the floor/2 tier boost
      // We just verify the items are generated without error at high floors
      const highFloor = generateShopInventory(10);
      expect(highFloor.length).toBeGreaterThan(0);
      const equipment = highFloor.filter(i => i.type !== 'consumable');
      expect(equipment.length).toBeGreaterThanOrEqual(3);
    });

    it('equipment items are weapons, armor, or accessories', () => {
      for (let trial = 0; trial < 10; trial++) {
        const items = generateShopInventory(0);
        const equipment = items.filter(i => i.type !== 'consumable');
        for (const item of equipment) {
          expect(['weapon', 'armor', 'accessory']).toContain(item.type);
        }
      }
    });
  });

  // ── calculatePrice ──────────────────────────────────────────────
  describe('calculatePrice', () => {
    it('returns higher price for rarer items', () => {
      const common = { type: 'weapon', rarity: 'common', bonuses: {} };
      const rare = { type: 'weapon', rarity: 'rare', bonuses: {} };
      const epic = { type: 'weapon', rarity: 'epic', bonuses: {} };
      const legendary = { type: 'weapon', rarity: 'legendary', bonuses: {} };

      const commonPrice = calculatePrice(common);
      const rarePrice = calculatePrice(rare);
      const epicPrice = calculatePrice(epic);
      const legendaryPrice = calculatePrice(legendary);

      expect(rarePrice).toBeGreaterThan(commonPrice);
      expect(epicPrice).toBeGreaterThan(rarePrice);
      expect(legendaryPrice).toBeGreaterThan(epicPrice);
    });

    it('weapon base price is 30', () => {
      const item = { type: 'weapon', rarity: 'common', bonuses: {} };
      // common mult = 1, no bonuses: floor(30 * 1 * 1) = 30
      expect(calculatePrice(item)).toBe(30);
    });

    it('armor base price is 25', () => {
      const item = { type: 'armor', rarity: 'common', bonuses: {} };
      expect(calculatePrice(item)).toBe(25);
    });

    it('accessory base price is 20', () => {
      const item = { type: 'accessory', rarity: 'common', bonuses: {} };
      expect(calculatePrice(item)).toBe(20);
    });

    it('unknown type base price defaults to 10', () => {
      const item = { type: 'consumable', rarity: 'common', bonuses: {} };
      expect(calculatePrice(item)).toBe(10);
    });

    it('accounts for bonus count (0.3 per bonus)', () => {
      const noBonus = { type: 'weapon', rarity: 'common', bonuses: {} };
      const twoBonus = { type: 'weapon', rarity: 'common', bonuses: { str: 3, vit: 2 } };
      const threeBonus = { type: 'weapon', rarity: 'common', bonuses: { str: 3, vit: 2, dex: 1 } };

      const noBonusPrice = calculatePrice(noBonus);
      const twoBonusPrice = calculatePrice(twoBonus);
      const threeBonusPrice = calculatePrice(threeBonus);

      // noBonus: floor(30 * 1 * (1 + 0)) = 30
      // twoBonus: floor(30 * 1 * (1 + 2 * 0.3)) = floor(30 * 1.6) = 48
      // threeBonus: floor(30 * 1 * (1 + 3 * 0.3)) = floor(30 * 1.9) = 57
      expect(noBonusPrice).toBe(30);
      expect(twoBonusPrice).toBe(48);
      expect(threeBonusPrice).toBe(57);
      expect(twoBonusPrice).toBeGreaterThan(noBonusPrice);
      expect(threeBonusPrice).toBeGreaterThan(twoBonusPrice);
    });

    it('handles undefined rarity gracefully (fallback mult = 1)', () => {
      const item = { type: 'weapon', rarity: 'mythical', bonuses: {} };
      // Unknown rarity: mult defaults to 1, so floor(30 * 1 * 1) = 30
      expect(calculatePrice(item)).toBe(30);
    });

    it('handles null bonuses gracefully', () => {
      const item = { type: 'weapon', rarity: 'common' };
      // No bonuses key at all: floor(30 * 1 * (1 + 0)) = 30
      expect(calculatePrice(item)).toBe(30);
    });

    it('legendary weapon with 4 bonuses has correct price', () => {
      const item = { type: 'weapon', rarity: 'legendary', bonuses: { str: 5, dex: 3, vit: 4, damage: 6 } };
      // basePr=30, mult=50, bonusMult=(1 + 4*0.3) = 2.2
      // price = floor(30 * 50 * 2.2) = floor(3300) = 3300
      expect(calculatePrice(item)).toBe(3300);
    });
  });

  // ── getSellPrice ────────────────────────────────────────────────
  describe('getSellPrice', () => {
    it('returns approximately 40% of buy price', () => {
      const item = { type: 'weapon', rarity: 'rare', bonuses: {}, shopPrice: 100 };
      expect(getSellPrice(item)).toBe(40); // floor(100 * 0.4)
    });

    it('uses shopPrice if available', () => {
      const item = { shopPrice: 200 };
      expect(getSellPrice(item)).toBe(80); // floor(200 * 0.4)
    });

    it('calculates price if shopPrice not set', () => {
      const item = { type: 'weapon', rarity: 'common', bonuses: {} };
      // calculatePrice = 30, sell = floor(30 * 0.4) = 12
      expect(getSellPrice(item)).toBe(12);
    });

    it('returns minimum 1 gold', () => {
      const item = { type: 'consumable', rarity: 'common', bonuses: {}, shopPrice: 1 };
      // floor(1 * 0.4) = 0, but minimum is 1
      expect(getSellPrice(item)).toBe(1);
    });

    it('returns minimum 1 gold for zero shopPrice', () => {
      const item = { shopPrice: 0, type: 'weapon', rarity: 'common', bonuses: {} };
      // shopPrice is 0 (falsy), so calculatePrice kicks in: 30
      // floor(30 * 0.4) = 12
      // Actually: shopPrice 0 is falsy, so it uses calculatePrice
      const price = getSellPrice(item);
      expect(price).toBeGreaterThanOrEqual(1);
    });

    it('sell price scales with rarity via buy price', () => {
      const common = { type: 'weapon', rarity: 'common', bonuses: {} };
      const epic = { type: 'weapon', rarity: 'epic', bonuses: {} };
      expect(getSellPrice(epic)).toBeGreaterThan(getSellPrice(common));
    });
  });
});
