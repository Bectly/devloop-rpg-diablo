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
 *   leaderboard(id INT PK AUTO, player_name TEXT, character_class TEXT,
 *               level INT, floor_reached INT, kills INT, gold_earned INT,
 *               time_seconds INT, victory INT, difficulty TEXT, created_at TEXT)
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
        talents TEXT NOT NULL DEFAULT '{}',
        keystones INTEGER NOT NULL DEFAULT 0,
        paragon_level INTEGER NOT NULL DEFAULT 0,
        paragon_xp INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS leaderboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player_name TEXT NOT NULL,
        character_class TEXT NOT NULL,
        level INTEGER NOT NULL,
        floor_reached INTEGER NOT NULL,
        kills INTEGER NOT NULL,
        gold_earned INTEGER NOT NULL,
        time_seconds INTEGER NOT NULL,
        victory INTEGER DEFAULT 0,
        difficulty TEXT DEFAULT 'normal',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rift_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player1 TEXT NOT NULL,
        player2 TEXT,
        tier INTEGER NOT NULL,
        time_seconds REAL NOT NULL,
        modifiers TEXT NOT NULL DEFAULT '[]',
        difficulty TEXT NOT NULL DEFAULT 'normal',
        date TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }

  _prepareStatements() {
    this._stmtSave = this.db.prepare(`
      INSERT OR REPLACE INTO characters
        (name, class, level, xp, stats, equipment, inventory, gold, floor, kills,
         health_potions, mana_potions, free_stat_points, talents, keystones,
         paragon_level, paragon_xp, updated_at)
      VALUES
        (@name, @class, @level, @xp, @stats, @equipment, @inventory, @gold, @floor, @kills,
         @health_potions, @mana_potions, @free_stat_points, @talents, @keystones,
         @paragonLevel, @paragonXp, datetime('now'))
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

    this._stmtLeaderboardInsert = this.db.prepare(`
      INSERT INTO leaderboard
        (player_name, character_class, level, floor_reached, kills, gold_earned, time_seconds, victory, difficulty)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this._stmtLeaderboardTop = this.db.prepare(`
      SELECT * FROM leaderboard
      ORDER BY CASE difficulty WHEN 'hell' THEN 0 WHEN 'nightmare' THEN 1 ELSE 2 END,
        victory DESC, floor_reached DESC, time_seconds ASC
      LIMIT 10
    `);

    this._stmtLeaderboardPersonal = this.db.prepare(`
      SELECT * FROM leaderboard
      WHERE player_name = ?
      ORDER BY CASE difficulty WHEN 'hell' THEN 0 WHEN 'nightmare' THEN 1 ELSE 2 END,
        victory DESC, floor_reached DESC, time_seconds ASC
      LIMIT 5
    `);
  }

  /**
   * Save a player + inventory to DB.
   * @param {Player} player
   * @param {Inventory} inventory
   * @param {number} [floor=0] Current dungeon floor number
   */
  saveCharacter(player, inventory, floor = 0) {
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
      floor,
      kills: player.kills,
      health_potions: player.healthPotions,
      mana_potions: player.manaPotions,
      free_stat_points: player.freeStatPoints,
      talents: JSON.stringify(player.talents || {}),
      keystones: player.keystones || 0,
      paragonLevel: player.paragonLevel || 0,
      paragonXp: player.paragonXp || 0,
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

    let stats, equipment, inventory;
    try {
      stats = JSON.parse(row.stats);
    } catch (_) {
      stats = {};
    }
    try {
      equipment = JSON.parse(row.equipment);
    } catch (_) {
      equipment = {};
    }
    try {
      inventory = JSON.parse(row.inventory);
    } catch (_) {
      inventory = [];
    }
    let talents;
    try {
      talents = JSON.parse(row.talents);
    } catch (_) {
      talents = {};
    }

    return {
      name: row.name,
      characterClass: row.class,
      level: row.level,
      xp: row.xp,
      stats,
      equipment,
      inventory,
      gold: row.gold,
      floor: row.floor,
      kills: row.kills,
      healthPotions: row.health_potions,
      manaPotions: row.mana_potions,
      freeStatPoints: row.free_stat_points,
      talents,
      keystones: row.keystones || 0,
      paragonLevel: row.paragon_level || 0,
      paragonXp: row.paragon_xp || 0,
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

  /**
   * Record a completed run to the leaderboard.
   * @param {string} playerName
   * @param {string} characterClass
   * @param {number} level
   * @param {number} floorReached
   * @param {number} kills
   * @param {number} goldEarned
   * @param {number} timeSeconds
   * @param {number} victory 1 = won, 0 = died
   */
  recordRun(playerName, characterClass, level, floorReached, kills, goldEarned, timeSeconds, victory, difficulty = 'normal') {
    return this._stmtLeaderboardInsert.run(
      playerName, characterClass, level, floorReached, kills, goldEarned, timeSeconds, victory, difficulty
    );
  }

  /**
   * Get the top 10 leaderboard runs.
   * @returns {object[]}
   */
  getTopRuns() {
    return this._stmtLeaderboardTop.all();
  }

  /**
   * Get top 5 personal runs for a specific player.
   * @param {string} playerName
   * @returns {object[]}
   */
  getPersonalRuns(playerName) {
    return this._stmtLeaderboardPersonal.all(playerName);
  }

  /**
   * Get difficulties unlocked by a player (based on victories).
   * Normal is always unlocked. Beat Normal → unlock Nightmare. Beat Nightmare → unlock Hell.
   * @param {string} playerName
   * @returns {string[]}
   */
  getUnlockedDifficulties(playerName) {
    const rows = this.db.prepare(
      'SELECT DISTINCT difficulty FROM leaderboard WHERE player_name = ? AND victory = 1'
    ).all(playerName);
    const unlocked = ['normal'];
    const won = rows.map(r => r.difficulty);
    if (won.includes('normal')) unlocked.push('nightmare');
    if (won.includes('nightmare')) unlocked.push('hell');
    return unlocked;
  }

  /**
   * Record a completed rift clear to the rift leaderboard.
   * @param {number} tier  Rift tier (1–10)
   * @param {string[]} playerNames  [player1, player2] (player2 may be undefined for solo)
   * @param {number} timeSeconds  Clear time in seconds (float)
   * @param {object[]} modifiers  Array of modifier objects from the rift
   * @param {string} difficulty  'normal' | 'nightmare' | 'hell'
   */
  recordRiftClear(tier, playerNames, timeSeconds, modifiers, difficulty) {
    const stmt = this.db.prepare(`
      INSERT INTO rift_records (player1, player2, tier, time_seconds, modifiers, difficulty)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      playerNames[0] || 'Unknown',
      playerNames[1] || null,
      tier,
      timeSeconds,
      JSON.stringify(modifiers || []),
      difficulty || 'normal'
    );
  }

  /**
   * Get the top 20 fastest clears for a specific rift tier.
   * @param {number} tier  Rift tier (1–10)
   * @returns {object[]}
   */
  getRiftLeaderboard(tier) {
    const stmt = this.db.prepare(`
      SELECT player1, player2, tier, time_seconds, modifiers, difficulty, date
      FROM rift_records
      WHERE tier = ?
      ORDER BY time_seconds ASC
      LIMIT 20
    `);
    return stmt.all(tier).map(row => ({
      ...row,
      modifiers: JSON.parse(row.modifiers || '[]'),
    }));
  }

  /**
   * Get a player's personal best rift times grouped by tier.
   * @param {string} playerName
   * @returns {object[]}  Each row: { tier, best_time, clears }
   */
  getPersonalRiftRecords(playerName) {
    const stmt = this.db.prepare(`
      SELECT tier, MIN(time_seconds) as best_time, COUNT(*) as clears
      FROM rift_records
      WHERE player1 = ? OR player2 = ?
      GROUP BY tier
      ORDER BY tier ASC
    `);
    return stmt.all(playerName, playerName);
  }

  close() {
    this.db.close();
  }
}

module.exports = { GameDatabase };
