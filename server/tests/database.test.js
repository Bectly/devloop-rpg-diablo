import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { GameDatabase } = require('../game/database');
const { Player } = require('../game/player');

describe('GameDatabase', () => {
  let db;

  beforeEach(() => {
    // Use in-memory DB for test isolation
    db = new GameDatabase(':memory:');
  });

  afterEach(() => {
    db.close();
  });

  // ── Constructor & Schema ──────────────────────────────────────
  describe('constructor', () => {
    it('creates DB and tables successfully', () => {
      // If we got here without throwing, constructor worked.
      // Verify the characters table exists by running a query.
      const rows = db.listCharacters();
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(0);
    });
  });

  // ── saveCharacter ─────────────────────────────────────────────
  describe('saveCharacter', () => {
    it('stores player data correctly', () => {
      const player = new Player('TestHero', 'warrior');
      player.level = 5;
      player.xp = 42;
      player.gold = 300;
      player.kills = 17;
      player.healthPotions = 5;
      player.manaPotions = 4;
      player.freeStatPoints = 3;

      const inventory = { getAllItems: () => [{ name: 'Sword', type: 'weapon' }] };

      db.saveCharacter(player, inventory);

      const loaded = db.loadCharacter('TestHero');
      expect(loaded).not.toBeNull();
      expect(loaded.name).toBe('TestHero');
      expect(loaded.characterClass).toBe('warrior');
      expect(loaded.level).toBe(5);
      expect(loaded.xp).toBe(42);
      expect(loaded.gold).toBe(300);
      expect(loaded.kills).toBe(17);
      expect(loaded.healthPotions).toBe(5);
      expect(loaded.manaPotions).toBe(4);
      expect(loaded.freeStatPoints).toBe(3);
    });

    it('overwrites existing character with same name', () => {
      const player = new Player('DupeHero', 'mage');
      player.gold = 100;
      const inv = { getAllItems: () => [] };

      db.saveCharacter(player, inv);
      expect(db.loadCharacter('DupeHero').gold).toBe(100);

      player.gold = 999;
      db.saveCharacter(player, inv);

      const loaded = db.loadCharacter('DupeHero');
      expect(loaded.gold).toBe(999);

      // Should still be exactly 1 character, not 2
      expect(db.listCharacters().length).toBe(1);
    });
  });

  // ── loadCharacter ─────────────────────────────────────────────
  describe('loadCharacter', () => {
    it('returns null for unknown name', () => {
      const loaded = db.loadCharacter('NonExistent');
      expect(loaded).toBeNull();
    });

    it('returns correct data for saved character', () => {
      const player = new Player('SavedHero', 'ranger');
      player.level = 10;
      player.gold = 500;
      const inv = { getAllItems: () => [] };

      db.saveCharacter(player, inv);

      const loaded = db.loadCharacter('SavedHero');
      expect(loaded.name).toBe('SavedHero');
      expect(loaded.characterClass).toBe('ranger');
      expect(loaded.level).toBe(10);
      expect(loaded.gold).toBe(500);
    });
  });

  // ── deleteCharacter ───────────────────────────────────────────
  describe('deleteCharacter', () => {
    it('removes the record', () => {
      const player = new Player('DeleteMe', 'warrior');
      const inv = { getAllItems: () => [] };

      db.saveCharacter(player, inv);
      expect(db.loadCharacter('DeleteMe')).not.toBeNull();

      db.deleteCharacter('DeleteMe');
      expect(db.loadCharacter('DeleteMe')).toBeNull();
    });

    it('does not throw when deleting non-existent character', () => {
      expect(() => db.deleteCharacter('Ghost')).not.toThrow();
    });
  });

  // ── listCharacters ────────────────────────────────────────────
  describe('listCharacters', () => {
    it('returns summary of all characters', () => {
      const inv = { getAllItems: () => [] };

      const p1 = new Player('Alpha', 'warrior');
      p1.level = 3;
      p1.kills = 10;
      db.saveCharacter(p1, inv);

      const p2 = new Player('Beta', 'mage');
      p2.level = 7;
      p2.kills = 25;
      db.saveCharacter(p2, inv);

      const list = db.listCharacters();
      expect(list.length).toBe(2);

      // Each entry should have summary fields
      for (const entry of list) {
        expect(entry).toHaveProperty('name');
        expect(entry).toHaveProperty('class');
        expect(entry).toHaveProperty('level');
        expect(entry).toHaveProperty('floor');
        expect(entry).toHaveProperty('kills');
        expect(entry).toHaveProperty('updated_at');
      }

      const names = list.map(e => e.name);
      expect(names).toContain('Alpha');
      expect(names).toContain('Beta');
    });

    it('returns empty array when no characters saved', () => {
      expect(db.listCharacters()).toEqual([]);
    });
  });

  // ── JSON Roundtrip ────────────────────────────────────────────
  describe('JSON roundtrip', () => {
    it('inventory items survive save/load cycle', () => {
      const player = new Player('InvHero', 'warrior');
      const items = [
        { name: 'Iron Sword', type: 'weapon', damage: 10, rarity: 'common' },
        { name: 'Health Potion', type: 'consumable', healing: 50 },
        { name: 'Dragon Shield', type: 'armor', armor: 25, bonuses: { vit: 5 } },
      ];
      const inv = { getAllItems: () => items };

      db.saveCharacter(player, inv);
      const loaded = db.loadCharacter('InvHero');

      expect(loaded.inventory).toEqual(items);
      expect(loaded.inventory.length).toBe(3);
      expect(loaded.inventory[0].name).toBe('Iron Sword');
      expect(loaded.inventory[2].bonuses.vit).toBe(5);
    });

    it('equipment survives save/load cycle', () => {
      const player = new Player('EquipHero', 'warrior');
      player.equipment.weapon = {
        name: 'Flame Blade', type: 'weapon', subType: 'sword',
        damage: 15, bonuses: { str: 3 }, attackSpeed: 700,
      };
      player.equipment.chest = {
        name: 'Steel Plate', type: 'armor', subType: 'plate',
        armor: 20, bonuses: { vit: 4 },
      };
      const inv = { getAllItems: () => [] };

      db.saveCharacter(player, inv);
      const loaded = db.loadCharacter('EquipHero');

      expect(loaded.equipment.weapon).not.toBeNull();
      expect(loaded.equipment.weapon.name).toBe('Flame Blade');
      expect(loaded.equipment.weapon.damage).toBe(15);
      expect(loaded.equipment.weapon.bonuses.str).toBe(3);
      expect(loaded.equipment.chest.name).toBe('Steel Plate');
      expect(loaded.equipment.chest.armor).toBe(20);
    });

    it('stats (str/dex/int/vit) survive save/load cycle', () => {
      const player = new Player('StatHero', 'mage');
      // Modify stats beyond defaults
      player.stats.str = 20;
      player.stats.dex = 25;
      player.stats.int = 30;
      player.stats.vit = 15;
      const inv = { getAllItems: () => [] };

      db.saveCharacter(player, inv);
      const loaded = db.loadCharacter('StatHero');

      expect(loaded.stats.str).toBe(20);
      expect(loaded.stats.dex).toBe(25);
      expect(loaded.stats.int).toBe(30);
      expect(loaded.stats.vit).toBe(15);
    });

    it('empty inventory serializes and deserializes correctly', () => {
      const player = new Player('EmptyInv', 'ranger');
      const inv = { getAllItems: () => [] };

      db.saveCharacter(player, inv);
      const loaded = db.loadCharacter('EmptyInv');

      expect(loaded.inventory).toEqual([]);
    });

    it('null inventory (no inventory object) defaults to empty array', () => {
      const player = new Player('NullInv', 'warrior');

      db.saveCharacter(player, null);
      const loaded = db.loadCharacter('NullInv');

      expect(loaded.inventory).toEqual([]);
    });
  });
});
