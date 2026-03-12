import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Inventory, GRID_COLS, GRID_ROWS } = require('../game/inventory');
const { generateWeapon, generateArmor, generateConsumable } = require('../game/items');

describe('Inventory', () => {
  let inv;

  beforeEach(() => {
    inv = new Inventory();
  });

  // ── Grid Dimensions ─────────────────────────────────────────────
  describe('grid setup', () => {
    it('grid is 10 columns x 6 rows', () => {
      expect(GRID_COLS).toBe(10);
      expect(GRID_ROWS).toBe(6);
      expect(inv.grid.length).toBe(6);
      expect(inv.grid[0].length).toBe(10);
    });

    it('grid starts empty (all null)', () => {
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          expect(inv.grid[r][c]).toBeNull();
        }
      }
    });
  });

  // ── Item Placement ──────────────────────────────────────────────
  describe('placement', () => {
    it('places a 1x1 item in first available slot (0,0)', () => {
      const item = { id: 'dagger1', gridW: 1, gridH: 1 };
      const result = inv.addItem(item);
      expect(result.success).toBe(true);
      expect(item.gridCol).toBe(0);
      expect(item.gridRow).toBe(0);
      expect(inv.grid[0][0]).toBe('dagger1');
    });

    it('places a 1x2 item occupying 2 cells vertically', () => {
      const item = { id: 'sword1', gridW: 1, gridH: 2 };
      const result = inv.addItem(item);
      expect(result.success).toBe(true);
      expect(inv.grid[0][0]).toBe('sword1');
      expect(inv.grid[1][0]).toBe('sword1');
    });

    it('places a 2x2 item occupying 4 cells', () => {
      const item = { id: 'shield1', gridW: 2, gridH: 2 };
      const result = inv.addItem(item);
      expect(result.success).toBe(true);
      expect(inv.grid[0][0]).toBe('shield1');
      expect(inv.grid[0][1]).toBe('shield1');
      expect(inv.grid[1][0]).toBe('shield1');
      expect(inv.grid[1][1]).toBe('shield1');
    });

    it('places a 2x3 item (chest armor) occupying 6 cells', () => {
      const item = { id: 'chest1', gridW: 2, gridH: 3 };
      const result = inv.addItem(item);
      expect(result.success).toBe(true);
      // Should occupy columns 0-1, rows 0-2
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          expect(inv.grid[r][c]).toBe('chest1');
        }
      }
    });

    it('second item placed next to first', () => {
      inv.addItem({ id: 'item1', gridW: 1, gridH: 1 });
      const item2 = { id: 'item2', gridW: 1, gridH: 1 };
      inv.addItem(item2);
      expect(item2.gridCol).toBe(1);
      expect(item2.gridRow).toBe(0);
    });

    it('findSpace wraps to next row when current row is full', () => {
      // Fill first row with 1x1 items
      for (let c = 0; c < GRID_COLS; c++) {
        inv.addItem({ id: `fill${c}`, gridW: 1, gridH: 1 });
      }
      const overflow = { id: 'overflow', gridW: 1, gridH: 1 };
      inv.addItem(overflow);
      expect(overflow.gridRow).toBe(1);
      expect(overflow.gridCol).toBe(0);
    });
  });

  // ── canPlace ────────────────────────────────────────────────────
  describe('canPlace', () => {
    it('returns false for negative coordinates', () => {
      expect(inv.canPlace(-1, 0, 1, 1)).toBe(false);
      expect(inv.canPlace(0, -1, 1, 1)).toBe(false);
    });

    it('returns false when item exceeds grid bounds', () => {
      expect(inv.canPlace(9, 0, 2, 1)).toBe(false); // col 9 + width 2 > 10
      expect(inv.canPlace(0, 5, 1, 2)).toBe(false); // row 5 + height 2 > 6
    });

    it('returns false when cell is occupied', () => {
      inv.addItem({ id: 'blocker', gridW: 1, gridH: 1 });
      expect(inv.canPlace(0, 0, 1, 1)).toBe(false);
    });

    it('ignoreItemId allows placing over self', () => {
      inv.addItem({ id: 'self', gridW: 1, gridH: 1 });
      expect(inv.canPlace(0, 0, 1, 1, 'self')).toBe(true);
    });
  });

  // ── Stacking ────────────────────────────────────────────────────
  describe('stacking', () => {
    it('stackable items merge into existing stack', () => {
      const potion1 = generateConsumable('health_potion', 5);
      const potion2 = generateConsumable('health_potion', 3);

      inv.addItem(potion1);
      const result = inv.addItem(potion2);

      expect(result.success).toBe(true);
      expect(result.stacked).toBe(true);
      expect(potion1.quantity).toBe(8);
    });

    it('stack respects maxStack limit (20 for potions)', () => {
      const potion1 = generateConsumable('health_potion', 18);
      const potion2 = generateConsumable('health_potion', 5);

      inv.addItem(potion1);
      inv.addItem(potion2);

      // potion1 should be 20, remaining 3 goes to new slot
      expect(potion1.quantity).toBe(20);
    });

    it('overflow from stacking creates new slot', () => {
      const potion1 = generateConsumable('health_potion', 18);
      const potion2 = generateConsumable('health_potion', 5);

      inv.addItem(potion1);
      const result = inv.addItem(potion2);

      // First stack fills to 20, remaining 3 needs new slot
      expect(potion1.quantity).toBe(20);
      expect(result.success).toBe(true);
      // The remaining item should be in inventory too
      expect(inv.items.size).toBe(2);
    });

    it('non-stackable items do not merge', () => {
      const w1 = generateWeapon(0);
      const w2 = generateWeapon(0);
      inv.addItem(w1);
      inv.addItem(w2);
      expect(inv.items.size).toBe(2);
    });

    it('different consumable types do not stack together', () => {
      const hp = generateConsumable('health_potion', 5);
      const mp = generateConsumable('mana_potion', 3);
      inv.addItem(hp);
      inv.addItem(mp);
      expect(inv.items.size).toBe(2);
      expect(hp.quantity).toBe(5);
      expect(mp.quantity).toBe(3);
    });
  });

  // ── Item Removal ────────────────────────────────────────────────
  describe('removal', () => {
    it('removeItem clears grid cells and returns item', () => {
      const item = { id: 'sword1', gridW: 1, gridH: 2 };
      inv.addItem(item);
      const removed = inv.removeItem('sword1');
      expect(removed).toBe(item);
      expect(inv.grid[0][0]).toBeNull();
      expect(inv.grid[1][0]).toBeNull();
      expect(inv.items.has('sword1')).toBe(false);
    });

    it('removeItem returns null for unknown item', () => {
      const result = inv.removeItem('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ── Move Item ───────────────────────────────────────────────────
  describe('moveItem', () => {
    it('moves item to new valid position', () => {
      const item = { id: 'dagger1', gridW: 1, gridH: 1 };
      inv.addItem(item);
      const result = inv.moveItem('dagger1', 5, 3);
      expect(result.success).toBe(true);
      expect(inv.grid[0][0]).toBeNull();
      expect(inv.grid[3][5]).toBe('dagger1');
      expect(item.gridCol).toBe(5);
      expect(item.gridRow).toBe(3);
    });

    it('fails to move to occupied position and restores original', () => {
      const item1 = { id: 'a', gridW: 1, gridH: 1 };
      const item2 = { id: 'b', gridW: 1, gridH: 1 };
      inv.addItem(item1);
      inv.addItem(item2);

      const result = inv.moveItem('a', 1, 0); // occupied by b
      expect(result.success).toBe(false);
      // Item should be back in original position
      expect(inv.grid[0][0]).toBe('a');
    });

    it('returns failure for nonexistent item', () => {
      const result = inv.moveItem('ghost', 0, 0);
      expect(result.success).toBe(false);
    });
  });

  // ── Grid Overflow ───────────────────────────────────────────────
  describe('grid overflow', () => {
    it('returns failure when grid is full', () => {
      // Fill entire grid with 1x1 items
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          inv.addItem({ id: `fill_${r}_${c}`, gridW: 1, gridH: 1 });
        }
      }
      const overflow = { id: 'extra', gridW: 1, gridH: 1 };
      const result = inv.addItem(overflow);
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Inventory full');
    });

    it('large item fails when not enough contiguous space', () => {
      // Fill in a checkerboard pattern to prevent 2x2 placement
      for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
          if ((r + c) % 2 === 0) {
            inv.placeAt({ id: `cb_${r}_${c}`, gridW: 1, gridH: 1 }, c, r);
          }
        }
      }
      const bigItem = { id: 'big', gridW: 2, gridH: 2 };
      const result = inv.addItem(bigItem);
      expect(result.success).toBe(false);
    });
  });

  // ── Lookup ──────────────────────────────────────────────────────
  describe('lookup', () => {
    it('getItem returns item by ID', () => {
      const item = { id: 'test1', gridW: 1, gridH: 1 };
      inv.addItem(item);
      expect(inv.getItem('test1')).toBe(item);
    });

    it('getItem returns null for unknown ID', () => {
      expect(inv.getItem('nope')).toBeNull();
    });

    it('getAllItems returns all items', () => {
      inv.addItem({ id: 'a', gridW: 1, gridH: 1 });
      inv.addItem({ id: 'b', gridW: 1, gridH: 1 });
      const all = inv.getAllItems();
      expect(all.length).toBe(2);
    });
  });

  // ── Serialization ───────────────────────────────────────────────
  describe('serialization', () => {
    it('serializes grid and items correctly', () => {
      const item = generateConsumable('health_potion', 5);
      inv.addItem(item);
      const s = inv.serialize();
      expect(s.cols).toBe(GRID_COLS);
      expect(s.rows).toBe(GRID_ROWS);
      expect(s.grid.length).toBe(GRID_ROWS);
      expect(s.items.length).toBe(1);
      expect(s.items[0].id).toBe(item.id);
      expect(s.items[0].quantity).toBe(5);
    });
  });
});
