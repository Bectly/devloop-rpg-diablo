/**
 * SQLite persistence layer for DevLoop RPG.
 *
 * Saves/loads character state (stats, equipment, inventory, gold, floor, kills).
 * Auto-save triggers: floor transition, every 60s, graceful shutdown.
 *
 * Schema:
 *   characters(name TEXT PK, class TEXT, level INT, xp INT, stats JSON,
 *              equipment JSON, inventory JSON, gold INT, floor INT, kills INT,
 *              health_potions INT, mana_potions INT, updated_at TEXT)
 *
 * Usage:
 *   const db = new GameDatabase('./data/game.db');
 *   db.saveCharacter(player, inventory);
 *   const saved = db.loadCharacter('HeroName');
 *   db.close();
 */

const Database = require('better-sqlite3');
const path = require('path');

const DEFAULT_DB_PATH = path.join(__dirname, '..', 'data', 'game.db');

class GameDatabase {
  constructor(dbPath = DEFAULT_DB_PATH) {
    // Ensure data directory exists
    const fs = require('fs');
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this._createTables();
    this._prepareStatements();
  }

  _createTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS characters (
        name TEXT PRIMARY KEY,
        class TEXT NOT NULL,
        level INTEGER NOT NULL DEFAULT 1,
        xp INTEGER NOT NULL DEFAULT 0,
        stats TEXT NOT NULL DEFAULT '{}',
        equipment TEXT NOT NULL DEFAULT '{}',
        inventory TEXT NOT NULL DEFAULT '[]',
        gold INTEGER NOT NULL DEFAULT 0,
        floor INTEGER NOT NULL DEFAULT 0,
        kills INTEGER NOT NULL DEFAULT 0,
        health_potions INTEGER NOT NULL DEFAULT 3,
        mana_potions INTEGER NOT NULL DEFAULT 2,
        free_stat_points INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this._stmtSave = this.db.prepare(`
      INSERT OR REPLACE INTO characters
        (name, class, level, xp, stats, equipment, inventory, gold, floor, kills,
         health_potions, mana_potions, free_stat_points, updated_at)
      VALUES
        (@name, @class, @level, @xp, @stats, @equipment, @inventory, @gold, @floor, @kills,
         @health_potions, @mana_potions, @free_stat_points, datetime('now'))
    `);

    this._stmtLoad = this.db.prepare(`
      SELECT * FROM characters WHERE name = ?
    `);

    this._stmtDelete = this.db.prepare(`
      DELETE FROM characters WHERE name = ?
    `);

    this._stmtList = this.db.prepare(`
      SELECT name, class, level, floor, kills, updated_at FROM characters ORDER BY updated_at DESC
    `);
  }

  /**
   * Save a player + inventory to DB.
   * @param {Player} player
   * @param {Inventory} inventory
   */
  saveCharacter(player, inventory) {
    const invItems = inventory ? inventory.getAllItems() : [];

    this._stmtSave.run({
      name: player.name,
      class: player.characterClass,
      level: player.level,
      xp: player.xp,
      stats: JSON.stringify(player.stats),
      equipment: JSON.stringify(player.equipment),
      inventory: JSON.stringify(invItems),
      gold: player.gold,
      floor: 0, // current floor set by caller
      kills: player.kills,
      health_potions: player.healthPotions,
      mana_potions: player.manaPotions,
      free_stat_points: player.freeStatPoints,
    });
  }

  /**
   * Load character data by name. Returns null if not found.
   * @param {string} name
   * @returns {object|null} Raw row with parsed JSON fields
   */
  loadCharacter(name) {
    const row = this._stmtLoad.get(name);
    if (!row) return null;

    return {
      name: row.name,
      characterClass: row.class,
      level: row.level,
      xp: row.xp,
      stats: JSON.parse(row.stats),
      equipment: JSON.parse(row.equipment),
      inventory: JSON.parse(row.inventory),
      gold: row.gold,
      floor: row.floor,
      kills: row.kills,
      healthPotions: row.health_potions,
      manaPotions: row.mana_potions,
      freeStatPoints: row.free_stat_points,
    };
  }

  /**
   * Delete a saved character.
   */
  deleteCharacter(name) {
    return this._stmtDelete.run(name);
  }

  /**
   * List all saved characters (summary).
   */
  listCharacters() {
    return this._stmtList.all();
  }

  close() {
    this.db.close();
  }
}

module.exports = { GameDatabase };
