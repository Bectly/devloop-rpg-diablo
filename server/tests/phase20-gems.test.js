import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const {
  GEM_TYPES, GEM_TIERS, GEM_DATA, GEM_COLORS, TIER_RARITY,
  generateGem, rollGemDrop, combineGems, getSocketBonuses,
} = require('../game/gems');
const { generateLoot, SOCKET_RANGES, rollSockets } = require('../game/items');
const { Player } = require('../game/player');

// ══════════════════════════════════════════════════════════════════
// Gem Data Constants
// ══════════════════════════════════════════════════════════════════

describe('Gem constants', () => {
  it('GEM_TYPES has 6 types', () => {
    expect(GEM_TYPES).toHaveLength(6);
    expect(GEM_TYPES).toContain('ruby');
    expect(GEM_TYPES).toContain('diamond');
    expect(GEM_TYPES).toContain('amethyst');
  });

  it('GEM_TIERS has 3 tiers', () => {
    expect(GEM_TIERS).toHaveLength(3);
    expect(GEM_TIERS[0]).toEqual({ tier: 1, name: 'Chipped' });
    expect(GEM_TIERS[2]).toEqual({ tier: 3, name: 'Perfect' });
  });

  it('GEM_DATA covers all types × all tiers', () => {
    for (const type of GEM_TYPES) {
      expect(GEM_DATA[type]).toBeDefined();
      for (let tier = 1; tier <= 3; tier++) {
        expect(GEM_DATA[type][tier]).toBeDefined();
        expect(GEM_DATA[type][tier].name).toContain(type.charAt(0).toUpperCase() + type.slice(1));
        expect(GEM_DATA[type][tier].bonuses).toBeDefined();
        expect(GEM_DATA[type][tier].color).toBeDefined();
      }
    }
  });

  it('GEM_COLORS has a color for each type', () => {
    for (const type of GEM_TYPES) {
      expect(GEM_COLORS[type]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('TIER_RARITY maps tiers to rarity strings', () => {
    expect(TIER_RARITY[1]).toBe('uncommon');
    expect(TIER_RARITY[2]).toBe('rare');
    expect(TIER_RARITY[3]).toBe('epic');
  });

  it('gem stat values increase with tier', () => {
    // Ruby: str 3 → 6 → 10
    expect(GEM_DATA.ruby[1].bonuses.str).toBeLessThan(GEM_DATA.ruby[2].bonuses.str);
    expect(GEM_DATA.ruby[2].bonuses.str).toBeLessThan(GEM_DATA.ruby[3].bonuses.str);
    // Diamond: allResist 2 → 4 → 7
    expect(GEM_DATA.diamond[1].bonuses.allResist).toBeLessThan(GEM_DATA.diamond[3].bonuses.allResist);
  });
});

// ══════════════════════════════════════════════════════════════════
// generateGem
// ══════════════════════════════════════════════════════════════════

describe('generateGem', () => {
  it('creates a valid gem item', () => {
    const gem = generateGem('ruby', 1);
    expect(gem).not.toBeNull();
    expect(gem.type).toBe('gem');
    expect(gem.gemType).toBe('ruby');
    expect(gem.gemTier).toBe(1);
    expect(gem.name).toBe('Chipped Ruby');
    expect(gem.stackable).toBe(true);
    expect(gem.quantity).toBe(1);
    expect(gem.id).toBeDefined();
  });

  it('sets correct bonuses per type', () => {
    expect(generateGem('ruby', 1).bonuses).toEqual({ str: 3 });
    expect(generateGem('sapphire', 2).bonuses).toEqual({ int: 6 });
    expect(generateGem('emerald', 3).bonuses).toEqual({ dex: 10 });
    expect(generateGem('topaz', 1).bonuses).toEqual({ vit: 3 });
    expect(generateGem('diamond', 2).bonuses).toEqual({ allResist: 4 });
    expect(generateGem('amethyst', 3).bonuses).toEqual({ critChance: 12 });
  });

  it('sets rarity based on tier', () => {
    expect(generateGem('ruby', 1).rarity).toBe('uncommon');
    expect(generateGem('ruby', 2).rarity).toBe('rare');
    expect(generateGem('ruby', 3).rarity).toBe('epic');
  });

  it('returns null for invalid type', () => {
    expect(generateGem('obsidian', 1)).toBeNull();
  });

  it('returns null for invalid tier', () => {
    expect(generateGem('ruby', 4)).toBeNull();
    expect(generateGem('ruby', 0)).toBeNull();
  });

  it('generates unique IDs', () => {
    const g1 = generateGem('ruby', 1);
    const g2 = generateGem('ruby', 1);
    expect(g1.id).not.toBe(g2.id);
  });

  it('bonuses object is not shared reference', () => {
    const g1 = generateGem('ruby', 1);
    const g2 = generateGem('ruby', 1);
    g1.bonuses.str = 999;
    expect(g2.bonuses.str).toBe(3);
  });
});

// ══════════════════════════════════════════════════════════════════
// rollGemDrop
// ══════════════════════════════════════════════════════════════════

describe('rollGemDrop', () => {
  it('returns null or a gem item', () => {
    // Run many times — mostly null (95%), some gems
    let gems = 0;
    let nulls = 0;
    for (let i = 0; i < 1000; i++) {
      const result = rollGemDrop(5);
      if (result) { gems++; expect(result.type).toBe('gem'); }
      else nulls++;
    }
    expect(gems).toBeGreaterThan(0);
    expect(nulls).toBeGreaterThan(gems); // ~95% null
  });

  it('tier 1 on floors 1-9', () => {
    for (let i = 0; i < 500; i++) {
      const gem = rollGemDrop(5);
      if (gem) { expect(gem.gemTier).toBe(1); break; }
    }
  });

  it('tier 2 on floors 10-19', () => {
    for (let i = 0; i < 500; i++) {
      const gem = rollGemDrop(15);
      if (gem) { expect(gem.gemTier).toBe(2); break; }
    }
  });

  it('tier 3 on floors 20+', () => {
    for (let i = 0; i < 500; i++) {
      const gem = rollGemDrop(25);
      if (gem) { expect(gem.gemTier).toBe(3); break; }
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// combineGems
// ══════════════════════════════════════════════════════════════════

describe('combineGems', () => {
  it('combines 3 chipped rubies into 1 flawed ruby', () => {
    const gems = [
      generateGem('ruby', 1),
      generateGem('ruby', 1),
      generateGem('ruby', 1),
    ];
    const result = combineGems(gems);
    expect(result).not.toBeNull();
    expect(result.gemType).toBe('ruby');
    expect(result.gemTier).toBe(2);
    expect(result.name).toBe('Flawed Ruby');
  });

  it('combines 3 flawed into 1 perfect', () => {
    const gems = [
      generateGem('diamond', 2),
      generateGem('diamond', 2),
      generateGem('diamond', 2),
    ];
    const result = combineGems(gems);
    expect(result.gemTier).toBe(3);
    expect(result.name).toBe('Perfect Diamond');
  });

  it('returns null for 3 perfect gems (max tier)', () => {
    const gems = [
      generateGem('ruby', 3),
      generateGem('ruby', 3),
      generateGem('ruby', 3),
    ];
    expect(combineGems(gems)).toBeNull();
  });

  it('returns null for mismatched types', () => {
    const gems = [
      generateGem('ruby', 1),
      generateGem('sapphire', 1),
      generateGem('ruby', 1),
    ];
    expect(combineGems(gems)).toBeNull();
  });

  it('returns null for mismatched tiers', () => {
    const gems = [
      generateGem('ruby', 1),
      generateGem('ruby', 2),
      generateGem('ruby', 1),
    ];
    expect(combineGems(gems)).toBeNull();
  });

  it('returns null for wrong count (2 gems)', () => {
    expect(combineGems([generateGem('ruby', 1), generateGem('ruby', 1)])).toBeNull();
  });

  it('returns null for non-array', () => {
    expect(combineGems(null)).toBeNull();
    expect(combineGems('ruby')).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// getSocketBonuses
// ══════════════════════════════════════════════════════════════════

describe('getSocketBonuses', () => {
  it('aggregates bonuses from multiple gems', () => {
    const gems = [
      generateGem('ruby', 1),     // str: 3
      generateGem('ruby', 2),     // str: 6
      generateGem('emerald', 1),  // dex: 3
    ];
    const bonuses = getSocketBonuses(gems);
    expect(bonuses.str).toBe(9);
    expect(bonuses.dex).toBe(3);
  });

  it('returns empty object for empty array', () => {
    expect(getSocketBonuses([])).toEqual({});
  });

  it('skips null entries', () => {
    const bonuses = getSocketBonuses([null, generateGem('topaz', 1), null]);
    expect(bonuses.vit).toBe(3);
  });

  it('handles single gem', () => {
    const bonuses = getSocketBonuses([generateGem('amethyst', 3)]);
    expect(bonuses.critChance).toBe(12);
  });
});

// ══════════════════════════════════════════════════════════════════
// Item Socket Generation
// ══════════════════════════════════════════════════════════════════

describe('Item socket generation', () => {
  it('rollSockets returns array of nulls', () => {
    const sockets = rollSockets('weapon', 'legendary');
    expect(Array.isArray(sockets)).toBe(true);
    expect(sockets.length).toBeGreaterThanOrEqual(1);
    expect(sockets.length).toBeLessThanOrEqual(2);
    for (const s of sockets) {
      expect(s).toBeNull();
    }
  });

  it('common weapons have 0 sockets', () => {
    const sockets = rollSockets('weapon', 'common');
    expect(sockets).toHaveLength(0);
  });

  it('accessories always have 0 sockets', () => {
    for (const rarity of ['common', 'uncommon', 'rare', 'legendary', 'set']) {
      expect(rollSockets('accessory', rarity)).toHaveLength(0);
    }
  });

  it('legendary armor always has 1 socket', () => {
    const sockets = rollSockets('armor', 'legendary');
    expect(sockets).toHaveLength(1);
  });

  it('unknown category returns empty array', () => {
    expect(rollSockets('pants', 'rare')).toEqual([]);
  });

  it('SOCKET_RANGES covers all expected categories', () => {
    expect(SOCKET_RANGES).toHaveProperty('weapon');
    expect(SOCKET_RANGES).toHaveProperty('armor');
    expect(SOCKET_RANGES).toHaveProperty('accessory');
  });

  it('generated loot items have sockets property', () => {
    // Generate many items, all should have sockets array
    for (let i = 0; i < 50; i++) {
      const items = generateLoot(3);
      for (const item of items) {
        if (item.type === 'weapon' || item.type === 'armor' || item.type === 'accessory') {
          expect(item).toHaveProperty('sockets');
          expect(Array.isArray(item.sockets)).toBe(true);
        }
      }
    }
  });
});

// ══════════════════════════════════════════════════════════════════
// Death Recap — Damage Log
// ══════════════════════════════════════════════════════════════════

describe('Death recap — damage log', () => {
  let player;

  beforeEach(() => {
    player = new Player('TestHero', 'warrior');
    player.level = 10;
    player.recalcStats();
    player.hp = player.maxHp;
    player.dodgeChance = 0; // deterministic — no random dodges
  });

  it('damageLog starts empty', () => {
    expect(player.damageLog).toEqual([]);
  });

  it('takeDamage adds entry to damageLog', () => {
    player.takeDamage(10, 'physical', 'Skeleton');
    expect(player.damageLog).toHaveLength(1);
    expect(player.damageLog[0].source).toBe('Skeleton');
    expect(player.damageLog[0].type).toBe('physical');
    expect(player.damageLog[0].amount).toBeGreaterThan(0);
    expect(player.damageLog[0].timestamp).toBeDefined();
  });

  it('damageLog capped at 10 entries', () => {
    for (let i = 0; i < 15; i++) {
      player.takeDamage(1, 'physical', `Monster${i}`);
    }
    expect(player.damageLog.length).toBeLessThanOrEqual(10);
    // Oldest entries removed
    expect(player.damageLog[0].source).toBe('Monster5');
  });

  it('dodged attacks do NOT add to damageLog', () => {
    player.dodgeChance = 100;
    const result = player.takeDamage(50, 'physical', 'Ghost');
    expect(result).toBe(-1);
    expect(player.damageLog).toHaveLength(0);
  });

  it('getDeathRecap returns up to 5 entries', () => {
    for (let i = 0; i < 8; i++) {
      player.takeDamage(1, 'physical', `Mob${i}`);
    }
    expect(player.damageLog).toHaveLength(8);

    const recap = player.getDeathRecap();
    expect(recap.entries).toHaveLength(5);
    // All entries should be from the damage log
    for (const entry of recap.entries) {
      expect(entry).toHaveProperty('source');
      expect(entry).toHaveProperty('amount');
      expect(entry).toHaveProperty('type');
    }
  });

  it('getDeathRecap returns fewer than 5 if log is small', () => {
    player.takeDamage(10, 'fire', 'Imp');
    player.takeDamage(20, 'cold', 'Yeti');
    const recap = player.getDeathRecap();
    expect(recap.entries).toHaveLength(2);
  });

  it('getDeathRecap identifies killer (highest damage)', () => {
    player.takeDamage(5, 'physical', 'Weak Mob');
    player.takeDamage(100, 'fire', 'Fire Dragon');
    player.takeDamage(10, 'cold', 'Ice Golem');
    const recap = player.getDeathRecap();
    expect(recap.killer.source).toBe('Fire Dragon');
  });

  it('getDeathRecap returns empty on fresh player', () => {
    const recap = player.getDeathRecap();
    expect(recap.entries).toHaveLength(0);
    expect(recap.killer).toBeNull();
  });

  it('source defaults to unknown when not provided', () => {
    player.takeDamage(10);
    expect(player.damageLog[0].source).toBe('unknown');
  });

  it('damageLog not in serialize() (ephemeral)', () => {
    player.takeDamage(10, 'fire', 'Dragon');
    const data = player.serialize();
    expect(data).not.toHaveProperty('damageLog');
  });

  it('damageLog IS in serializeForPhone()', () => {
    player.takeDamage(10, 'fire', 'Dragon');
    const data = player.serializeForPhone();
    expect(data).toHaveProperty('damageLog');
    expect(data.damageLog).toHaveLength(1);
  });
});
