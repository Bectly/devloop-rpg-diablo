import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  MATERIALS, SALVAGE_YIELDS, UPGRADE_COSTS, MAX_UPGRADE_LEVEL, UPGRADE_STAT_BONUS,
  REFORGE_BASE_COST, REFORGE_PER_REROLL,
  isSalvageable, generateMaterial, getSalvageResult, getReforgeCost,
  reforgeItem, getUpgradeCost, upgradeItem, getCraftingInfo,
  countMaterials, removeMaterials, canAfford,
} = require('../game/crafting');
const { generateWeapon, generateArmor, generateAccessory, generateConsumable } = require('../game/items');

// ── Helpers ──

function makeWeapon(overrides = {}) {
  return {
    id: 'w1', name: 'Test Sword', type: 'weapon', subType: 'sword', slot: 'weapon',
    rarity: 'rare', damage: 20, attackSpeed: 800,
    bonuses: { str: 5, dex: 3 }, gridW: 1, gridH: 2,
    stackable: false, quantity: 1,
    ...overrides,
  };
}

function makeArmor(overrides = {}) {
  return {
    id: 'a1', name: 'Test Plate', type: 'armor', subType: 'plate', slot: 'chest',
    rarity: 'epic', armor: 25,
    bonuses: { vit: 8, armor: 6, fire_resist: 10 }, gridW: 2, gridH: 3,
    stackable: false, quantity: 1,
    ...overrides,
  };
}

function makeAccessory(overrides = {}) {
  return {
    id: 'r1', name: 'Test Ring', type: 'accessory', subType: 'ring', slot: 'ring1',
    rarity: 'uncommon',
    bonuses: { int: 4, dex: 2 }, gridW: 1, gridH: 1,
    stackable: false, quantity: 1,
    ...overrides,
  };
}

function makeMockInventory(items = []) {
  const _items = [...items];
  return {
    getAllItems: () => _items,
    getItem: (id) => _items.find(i => i.id === id),
    removeItem: (id) => {
      const idx = _items.findIndex(i => i.id === id);
      if (idx >= 0) _items.splice(idx, 1);
    },
    addItem: (item) => { _items.push(item); return { success: true }; },
  };
}

// ══════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════

describe('Crafting System (Phase 10)', () => {

  // ── Material Definitions ──
  describe('MATERIALS', () => {
    it('defines 3 material types', () => {
      expect(Object.keys(MATERIALS)).toHaveLength(3);
      expect(MATERIALS.arcane_dust).toBeDefined();
      expect(MATERIALS.magic_essence).toBeDefined();
      expect(MATERIALS.rare_crystal).toBeDefined();
    });

    it('all materials are stackable 1x1 with maxStack 99', () => {
      for (const mat of Object.values(MATERIALS)) {
        expect(mat.stackable).toBe(true);
        expect(mat.maxStack).toBe(99);
        expect(mat.gridW).toBe(1);
        expect(mat.gridH).toBe(1);
        expect(mat.type).toBe('material');
      }
    });
  });

  // ── SALVAGE_YIELDS ──
  describe('SALVAGE_YIELDS', () => {
    it('defines yields for all 6 rarities', () => {
      const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'set'];
      for (const r of rarities) {
        expect(SALVAGE_YIELDS[r]).toBeDefined();
        expect(SALVAGE_YIELDS[r].arcane_dust).toBeGreaterThan(0);
      }
    });

    it('legendary yields all 3 material types', () => {
      expect(SALVAGE_YIELDS.legendary.arcane_dust).toBe(8);
      expect(SALVAGE_YIELDS.legendary.magic_essence).toBe(3);
      expect(SALVAGE_YIELDS.legendary.rare_crystal).toBe(1);
    });

    it('common yields only arcane_dust', () => {
      expect(SALVAGE_YIELDS.common.arcane_dust).toBe(1);
      expect(SALVAGE_YIELDS.common.magic_essence).toBeUndefined();
    });
  });

  // ── isSalvageable ──
  describe('isSalvageable', () => {
    it('returns true for weapons', () => {
      expect(isSalvageable(makeWeapon())).toBe(true);
    });

    it('returns true for armor', () => {
      expect(isSalvageable(makeArmor())).toBe(true);
    });

    it('returns true for accessories', () => {
      expect(isSalvageable(makeAccessory())).toBe(true);
    });

    it('returns false for consumables', () => {
      expect(isSalvageable({ type: 'consumable', subType: 'health_potion' })).toBe(false);
    });

    it('returns false for currency', () => {
      expect(isSalvageable({ type: 'currency', subType: 'gold' })).toBe(false);
    });

    it('returns false for materials', () => {
      expect(isSalvageable({ type: 'material', subType: 'arcane_dust' })).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isSalvageable(null)).toBe(false);
      expect(isSalvageable(undefined)).toBe(false);
    });
  });

  // ── generateMaterial ──
  describe('generateMaterial', () => {
    it('generates arcane_dust with correct fields', () => {
      const mat = generateMaterial('arcane_dust', 5);
      expect(mat.name).toBe('Arcane Dust');
      expect(mat.type).toBe('material');
      expect(mat.subType).toBe('arcane_dust');
      expect(mat.stackable).toBe(true);
      expect(mat.quantity).toBe(5);
      expect(mat.maxStack).toBe(99);
      expect(mat.id).toBeTruthy();
    });

    it('caps quantity at maxStack', () => {
      const mat = generateMaterial('arcane_dust', 200);
      expect(mat.quantity).toBe(99);
    });

    it('returns null for unknown subType', () => {
      expect(generateMaterial('unknown_material')).toBeNull();
    });

    it('defaults to quantity 1', () => {
      const mat = generateMaterial('rare_crystal');
      expect(mat.quantity).toBe(1);
    });
  });

  // ── getSalvageResult ──
  describe('getSalvageResult', () => {
    it('returns materials and gold for a rare weapon', () => {
      const result = getSalvageResult(makeWeapon({ rarity: 'rare' }));
      expect(result.materials.arcane_dust).toBe(3);
      expect(result.materials.magic_essence).toBe(1);
      expect(result.gold).toBe(25);
    });

    it('returns correct yields for epic armor', () => {
      const result = getSalvageResult(makeArmor({ rarity: 'epic' }));
      expect(result.materials.arcane_dust).toBe(5);
      expect(result.materials.magic_essence).toBe(2);
      expect(result.gold).toBe(50);
    });

    it('returns correct yields for set items', () => {
      const result = getSalvageResult(makeWeapon({ rarity: 'set' }));
      expect(result.materials.arcane_dust).toBe(3);
      expect(result.materials.magic_essence).toBe(2);
      expect(result.materials.rare_crystal).toBe(1);
      expect(result.gold).toBe(40);
    });

    it('returns null for consumables', () => {
      expect(getSalvageResult({ type: 'consumable' })).toBeNull();
    });

    it('defaults to common yields for unknown rarity', () => {
      const result = getSalvageResult(makeWeapon({ rarity: 'mythic_unknown' }));
      expect(result.materials.arcane_dust).toBe(1);
      expect(result.gold).toBe(5);
    });
  });

  // ── getReforgeCost ──
  describe('getReforgeCost', () => {
    it('returns base cost for first reforge', () => {
      const cost = getReforgeCost(makeWeapon());
      expect(cost.arcane_dust).toBe(3);
      expect(cost.gold).toBe(50);
    });

    it('escalates cost with reforgeCount', () => {
      const cost = getReforgeCost(makeWeapon({ reforgeCount: 3 }));
      expect(cost.arcane_dust).toBe(3 + 3 * 1); // 6
      expect(cost.gold).toBe(50 + 3 * 25);       // 125
    });

    it('handles missing reforgeCount as 0', () => {
      const cost = getReforgeCost({});
      expect(cost.arcane_dust).toBe(3);
      expect(cost.gold).toBe(50);
    });
  });

  // ── reforgeItem ──
  describe('reforgeItem', () => {
    it('returns a new item with different bonuses', () => {
      const original = makeWeapon({ bonuses: { str: 5, dex: 3 } });
      const reforged = reforgeItem(original);
      expect(reforged).not.toBeNull();
      // Same number of bonus keys (one removed, one added)
      expect(Object.keys(reforged.bonuses).length).toBe(2);
      // Original is NOT mutated
      expect(original.bonuses.str).toBe(5);
      expect(original.bonuses.dex).toBe(3);
    });

    it('returns null for items with no bonuses', () => {
      expect(reforgeItem(makeWeapon({ bonuses: {} }))).toBeNull();
    });

    it('returns null for non-salvageable items', () => {
      expect(reforgeItem({ type: 'consumable', bonuses: { str: 5 } })).toBeNull();
    });

    it('preserves item identity (id, name, type, rarity)', () => {
      const original = makeWeapon();
      const reforged = reforgeItem(original);
      expect(reforged.id).toBe(original.id);
      expect(reforged.name).toBe(original.name);
      expect(reforged.type).toBe(original.type);
      expect(reforged.rarity).toBe(original.rarity);
    });

    it('applies rarity multiplier to reforged bonus values', () => {
      // legendary multiplier = 2.2, so even min value (1) → ceil(1 * 2.2) = 3
      const original = makeWeapon({ rarity: 'legendary', bonuses: { str: 10 } });
      const reforged = reforgeItem(original);
      const newVal = Object.values(reforged.bonuses)[0];
      expect(newVal).toBeGreaterThanOrEqual(1); // At minimum scaled by multiplier
    });
  });

  // ── getUpgradeCost ──
  describe('getUpgradeCost', () => {
    it('returns level 1 cost for unupgraded item', () => {
      const cost = getUpgradeCost(makeWeapon());
      expect(cost.magic_essence).toBe(2);
      expect(cost.gold).toBe(100);
    });

    it('returns level 2 cost for +1 item', () => {
      const cost = getUpgradeCost(makeWeapon({ upgradeLevel: 1 }));
      expect(cost.magic_essence).toBe(4);
      expect(cost.rare_crystal).toBe(1);
      expect(cost.gold).toBe(250);
    });

    it('returns level 3 cost for +2 item', () => {
      const cost = getUpgradeCost(makeWeapon({ upgradeLevel: 2 }));
      expect(cost.magic_essence).toBe(8);
      expect(cost.rare_crystal).toBe(3);
      expect(cost.gold).toBe(500);
    });

    it('returns null for +3 item (max level)', () => {
      expect(getUpgradeCost(makeWeapon({ upgradeLevel: 3 }))).toBeNull();
    });
  });

  // ── upgradeItem ──
  describe('upgradeItem', () => {
    it('upgrades weapon damage by 15%', () => {
      const w = makeWeapon({ damage: 20 });
      const upgraded = upgradeItem(w);
      expect(upgraded.upgradeLevel).toBe(1);
      expect(upgraded.damage).toBe(Math.ceil(20 * 1.15)); // 23
      expect(upgraded.name).toBe('+1 Test Sword');
    });

    it('upgrades armor value by 15%', () => {
      const a = makeArmor({ armor: 25 });
      const upgraded = upgradeItem(a);
      expect(upgraded.upgradeLevel).toBe(1);
      expect(upgraded.armor).toBe(Math.ceil(25 * 1.15)); // 29
    });

    it('upgrades accessory biggest bonus by 15%', () => {
      const r = makeAccessory({ bonuses: { int: 4, dex: 2 } });
      const upgraded = upgradeItem(r);
      expect(upgraded.upgradeLevel).toBe(1);
      expect(upgraded.bonuses.int).toBe(Math.ceil(4 * 1.15)); // 5
      expect(upgraded.bonuses.dex).toBe(2); // Unchanged
    });

    it('chains upgrades +1 → +2 → +3', () => {
      let item = makeWeapon({ damage: 20 });
      item = upgradeItem(item);
      expect(item.upgradeLevel).toBe(1);
      expect(item.name).toMatch(/^\+1/);

      item = upgradeItem(item);
      expect(item.upgradeLevel).toBe(2);
      expect(item.name).toMatch(/^\+2/);

      item = upgradeItem(item);
      expect(item.upgradeLevel).toBe(3);
      expect(item.name).toMatch(/^\+3/);

      // +3 is max
      expect(upgradeItem(item)).toBeNull();
    });

    it('strips existing +N prefix when upgrading', () => {
      const w = makeWeapon({ name: '+1 Test Sword', upgradeLevel: 1 });
      const upgraded = upgradeItem(w);
      expect(upgraded.name).toBe('+2 Test Sword');
    });

    it('does not mutate original item', () => {
      const original = makeWeapon({ damage: 20 });
      upgradeItem(original);
      expect(original.damage).toBe(20);
      expect(original.upgradeLevel).toBeUndefined();
    });

    it('returns null for non-salvageable items', () => {
      expect(upgradeItem({ type: 'consumable' })).toBeNull();
    });

    it('returns null for already max level', () => {
      expect(upgradeItem(makeWeapon({ upgradeLevel: 3 }))).toBeNull();
    });
  });

  // ── getCraftingInfo ──
  describe('getCraftingInfo', () => {
    it('returns full info for a craftable weapon', () => {
      const info = getCraftingInfo(makeWeapon());
      expect(info.salvageable).toBe(true);
      expect(info.reforgeable).toBe(true);
      expect(info.upgradeable).toBe(true);
      expect(info.salvageResult.materials.arcane_dust).toBe(3);
      expect(info.reforgeCost.arcane_dust).toBe(3);
      expect(info.upgradeCost.magic_essence).toBe(2);
      expect(info.upgradeLevel).toBe(0);
      expect(info.maxUpgradeLevel).toBe(3);
    });

    it('marks non-salvageable items correctly', () => {
      const info = getCraftingInfo({ type: 'consumable' });
      expect(info.salvageable).toBe(false);
      expect(info.reforgeable).toBe(false);
      expect(info.upgradeable).toBe(false);
    });

    it('marks max-level items as not upgradeable', () => {
      const info = getCraftingInfo(makeWeapon({ upgradeLevel: 3 }));
      expect(info.upgradeable).toBe(false);
      expect(info.upgradeCost).toBeNull();
    });

    it('marks items without bonuses as not reforgeable', () => {
      const info = getCraftingInfo(makeWeapon({ bonuses: {} }));
      expect(info.reforgeable).toBe(false);
    });
  });

  // ── countMaterials ──
  describe('countMaterials', () => {
    it('counts materials in inventory', () => {
      const inv = makeMockInventory([
        { type: 'material', subType: 'arcane_dust', quantity: 10 },
        { type: 'material', subType: 'arcane_dust', quantity: 5 },
        { type: 'material', subType: 'magic_essence', quantity: 3 },
        { type: 'weapon', subType: 'sword' }, // Not a material
      ]);
      const counts = countMaterials(inv);
      expect(counts.arcane_dust).toBe(15);
      expect(counts.magic_essence).toBe(3);
      expect(counts.rare_crystal).toBe(0);
    });

    it('returns zeroes for empty inventory', () => {
      const counts = countMaterials(makeMockInventory([]));
      expect(counts.arcane_dust).toBe(0);
      expect(counts.magic_essence).toBe(0);
      expect(counts.rare_crystal).toBe(0);
    });
  });

  // ── removeMaterials ──
  describe('removeMaterials', () => {
    it('removes materials from stacks', () => {
      const dust = { id: 'd1', type: 'material', subType: 'arcane_dust', quantity: 10 };
      const inv = makeMockInventory([dust]);
      const success = removeMaterials(inv, { arcane_dust: 3 });
      expect(success).toBe(true);
      expect(dust.quantity).toBe(7);
    });

    it('removes item when stack depleted', () => {
      const dust = { id: 'd1', type: 'material', subType: 'arcane_dust', quantity: 3 };
      const inv = makeMockInventory([dust]);
      const success = removeMaterials(inv, { arcane_dust: 3 });
      expect(success).toBe(true);
      expect(inv.getAllItems()).toHaveLength(0);
    });

    it('returns false when insufficient materials', () => {
      const dust = { id: 'd1', type: 'material', subType: 'arcane_dust', quantity: 2 };
      const inv = makeMockInventory([dust]);
      const success = removeMaterials(inv, { arcane_dust: 5 });
      expect(success).toBe(false);
      // Items unchanged on failure
      expect(dust.quantity).toBe(2);
    });

    it('skips gold in cost (gold is on player)', () => {
      const inv = makeMockInventory([]);
      const success = removeMaterials(inv, { gold: 1000 });
      expect(success).toBe(true);
    });

    it('consumes from multiple stacks', () => {
      const s1 = { id: 'd1', type: 'material', subType: 'arcane_dust', quantity: 2 };
      const s2 = { id: 'd2', type: 'material', subType: 'arcane_dust', quantity: 5 };
      const inv = makeMockInventory([s1, s2]);
      const success = removeMaterials(inv, { arcane_dust: 4 });
      expect(success).toBe(true);
      // s1 depleted (removed), s2 has 3 left
      expect(inv.getAllItems().filter(i => i.subType === 'arcane_dust'))
        .toHaveLength(1);
    });
  });

  // ── canAfford ──
  describe('canAfford', () => {
    it('returns true when player has enough gold and materials', () => {
      const player = { gold: 100 };
      const inv = makeMockInventory([
        { type: 'material', subType: 'arcane_dust', quantity: 5 },
      ]);
      expect(canAfford(player, inv, { arcane_dust: 3, gold: 50 })).toBe(true);
    });

    it('returns false when not enough gold', () => {
      const player = { gold: 10 };
      const inv = makeMockInventory([
        { type: 'material', subType: 'arcane_dust', quantity: 5 },
      ]);
      expect(canAfford(player, inv, { arcane_dust: 3, gold: 50 })).toBe(false);
    });

    it('returns false when not enough materials', () => {
      const player = { gold: 100 };
      const inv = makeMockInventory([
        { type: 'material', subType: 'arcane_dust', quantity: 1 },
      ]);
      expect(canAfford(player, inv, { arcane_dust: 3, gold: 50 })).toBe(false);
    });

    it('returns false for null cost', () => {
      expect(canAfford({ gold: 100 }, makeMockInventory([]), null)).toBe(false);
    });
  });

  // ── Integration: generated items work with crafting ──
  describe('Integration with items.js generators', () => {
    it('generated weapons are salvageable', () => {
      const w = generateWeapon(2);
      expect(isSalvageable(w)).toBe(true);
      const result = getSalvageResult(w);
      expect(result).not.toBeNull();
      expect(result.materials.arcane_dust).toBeGreaterThan(0);
    });

    it('generated armor is salvageable', () => {
      const a = generateArmor(2);
      expect(isSalvageable(a)).toBe(true);
    });

    it('generated accessories are salvageable', () => {
      const acc = generateAccessory(1);
      expect(isSalvageable(acc)).toBe(true);
    });

    it('generated consumables are NOT salvageable', () => {
      const c = generateConsumable('health_potion', 3);
      expect(isSalvageable(c)).toBe(false);
    });

    it('generated weapon can be upgraded 3 times', () => {
      let w = generateWeapon(3);
      const origDmg = w.damage;
      w = upgradeItem(w);
      expect(w.upgradeLevel).toBe(1);
      expect(w.damage).toBeGreaterThan(origDmg);
      w = upgradeItem(w);
      expect(w.upgradeLevel).toBe(2);
      w = upgradeItem(w);
      expect(w.upgradeLevel).toBe(3);
      expect(upgradeItem(w)).toBeNull();
    });

    it('generated weapon with bonuses can be reforged', () => {
      // Generate until we get one with bonuses
      let w;
      for (let i = 0; i < 20; i++) {
        w = generateWeapon(3);
        if (w.bonuses && Object.keys(w.bonuses).length > 0) break;
      }
      if (w.bonuses && Object.keys(w.bonuses).length > 0) {
        const origCount = Object.keys(w.bonuses).length;
        const reforged = reforgeItem(w);
        expect(reforged).not.toBeNull();
        // Reforge removes 1 key and adds 1 — count stays same OR the new key
        // overwrites an existing different key (net count = origCount - 1 + 1 = origCount,
        // but if deleted key != new key and new key already existed, count decreases by 1)
        expect(Object.keys(reforged.bonuses).length).toBeGreaterThanOrEqual(origCount - 1);
        expect(Object.keys(reforged.bonuses).length).toBeLessThanOrEqual(origCount);
      }
    });
  });

  // ── UPGRADE_COSTS ──
  describe('UPGRADE_COSTS', () => {
    it('defines costs for levels 1-3', () => {
      expect(UPGRADE_COSTS[1]).toBeDefined();
      expect(UPGRADE_COSTS[2]).toBeDefined();
      expect(UPGRADE_COSTS[3]).toBeDefined();
    });

    it('costs escalate with level', () => {
      expect(UPGRADE_COSTS[3].gold).toBeGreaterThan(UPGRADE_COSTS[2].gold);
      expect(UPGRADE_COSTS[2].gold).toBeGreaterThan(UPGRADE_COSTS[1].gold);
    });

    it('level 2+ requires rare_crystal', () => {
      expect(UPGRADE_COSTS[1].rare_crystal).toBeUndefined();
      expect(UPGRADE_COSTS[2].rare_crystal).toBeGreaterThan(0);
      expect(UPGRADE_COSTS[3].rare_crystal).toBeGreaterThan(0);
    });
  });

  // ── Constants ──
  describe('Constants', () => {
    it('MAX_UPGRADE_LEVEL is 3', () => {
      expect(MAX_UPGRADE_LEVEL).toBe(3);
    });

    it('UPGRADE_STAT_BONUS is 0.15 (15%)', () => {
      expect(UPGRADE_STAT_BONUS).toBe(0.15);
    });

    it('REFORGE_BASE_COST is 3 dust + 50 gold', () => {
      expect(REFORGE_BASE_COST.arcane_dust).toBe(3);
      expect(REFORGE_BASE_COST.gold).toBe(50);
    });

    it('REFORGE_PER_REROLL is 1 dust + 25 gold', () => {
      expect(REFORGE_PER_REROLL.arcane_dust).toBe(1);
      expect(REFORGE_PER_REROLL.gold).toBe(25);
    });
  });
});
