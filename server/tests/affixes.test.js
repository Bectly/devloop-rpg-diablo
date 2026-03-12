import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  AFFIX_DEFS,
  rollAffixes,
  applyAffixes,
  processAffixUpdates,
  processAffixOnHitPlayer,
  processAffixOnDealDamage,
  processAffixOnDeath,
  modifyDamageByAffixes,
} = require('../game/affixes');
const { Monster, createMonster } = require('../game/monsters');

// Helper: create a basic monster with known stats for testing
function makeMonster(type = 'skeleton', floor = 0) {
  return createMonster(type, 100, 200, floor);
}

describe('Affix System', () => {
  // ── rollAffixes ──────────────────────────────────────────────────
  describe('rollAffixes()', () => {
    it('returns null for floor 0', () => {
      for (let i = 0; i < 50; i++) {
        expect(rollAffixes(0, 'skeleton')).toBeNull();
      }
    });

    it('returns null for floor 1', () => {
      for (let i = 0; i < 50; i++) {
        expect(rollAffixes(1, 'skeleton')).toBeNull();
      }
    });

    it('returns null for floor 2', () => {
      for (let i = 0; i < 50; i++) {
        expect(rollAffixes(2, 'skeleton')).toBeNull();
      }
    });

    it('returns null for boss monsters', () => {
      for (let i = 0; i < 50; i++) {
        expect(rollAffixes(7, 'boss_knight')).toBeNull();
      }
    });

    it('returns null for slime_small', () => {
      for (let i = 0; i < 50; i++) {
        expect(rollAffixes(7, 'slime_small')).toBeNull();
      }
    });

    it('returns champion rank for floors 3-4 (when elite rolls)', () => {
      // Force enough rolls to get at least one elite
      const results = [];
      vi.spyOn(Math, 'random').mockReturnValue(0.01); // guarantees elite roll
      try {
        const result = rollAffixes(3, 'skeleton');
        expect(result).not.toBeNull();
        expect(result.rank).toBe('champion');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('returns champion rank for floors 5-6 (when elite rolls)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      try {
        const result = rollAffixes(5, 'skeleton');
        expect(result).not.toBeNull();
        expect(result.rank).toBe('champion');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('returns rare rank for floor 7+ (when elite rolls)', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      try {
        const result = rollAffixes(7, 'skeleton');
        expect(result).not.toBeNull();
        expect(result.rank).toBe('rare');
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('floor 3-4: max 1 affix', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      try {
        for (let f = 3; f <= 4; f++) {
          const result = rollAffixes(f, 'skeleton');
          expect(result).not.toBeNull();
          // maxAffixes=1, count = 1 + floor(random * 1) = 1 + 0 = 1
          expect(result.affixes.length).toBe(1);
        }
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('floor 5-6: 1 to 2 affixes', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      try {
        const result = rollAffixes(5, 'demon');
        expect(result).not.toBeNull();
        // maxAffixes=2, count = 1 + floor(0.01 * 2) = 1
        expect(result.affixes.length).toBeGreaterThanOrEqual(1);
        expect(result.affixes.length).toBeLessThanOrEqual(2);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('floor 7: 1 to 3 affixes', () => {
      // Use random = 0.99 to maximize affix count
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      try {
        const result = rollAffixes(7, 'skeleton');
        expect(result).not.toBeNull();
        expect(result.affixes.length).toBeGreaterThanOrEqual(1);
        expect(result.affixes.length).toBeLessThanOrEqual(3);
      } finally {
        vi.restoreAllMocks();
      }
    });

    it('never returns duplicate affixes', () => {
      // Use a sequence of mock values to control the roll
      // rollAffixes at floor 7 uses Math.random() in this order:
      // 1. elite chance check (need < 0.30)
      // 2. count = 1 + floor(random * maxAffixes=3) — want max: 0.99 => 3
      // 3+ affix picking: Math.floor(random * available.length)
      for (let trial = 0; trial < 10; trial++) {
        let callCount = 0;
        // Seed different values per trial for affix picking
        const pickValues = [0.1, 0.5, 0.9, 0.3, 0.7];
        vi.spyOn(Math, 'random').mockImplementation(() => {
          callCount++;
          if (callCount === 1) return 0.01; // elite chance
          if (callCount === 2) return 0.99; // max count
          return pickValues[(callCount - 3) % pickValues.length];
        });
        const result = rollAffixes(7, 'skeleton');
        vi.restoreAllMocks();
        if (result) {
          const unique = new Set(result.affixes);
          expect(unique.size).toBe(result.affixes.length);
        }
      }
    });

    it('all returned affix keys are valid AFFIX_DEFS keys', () => {
      const validKeys = Object.keys(AFFIX_DEFS);
      vi.spyOn(Math, 'random').mockReturnValue(0.01);
      try {
        for (let floor = 3; floor <= 8; floor++) {
          const result = rollAffixes(floor, 'skeleton');
          if (result) {
            for (const key of result.affixes) {
              expect(validKeys).toContain(key);
            }
          }
        }
      } finally {
        vi.restoreAllMocks();
      }
    });
  });

  // ── applyAffixes ─────────────────────────────────────────────────
  describe('applyAffixes()', () => {
    it('does nothing when affixResult is null', () => {
      const m = makeMonster();
      const origHp = m.hp;
      applyAffixes(m, null);
      expect(m.isElite).toBeUndefined();
      expect(m.hp).toBe(origHp);
    });

    it('sets monster.isElite = true', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast'], rank: 'champion' });
      expect(m.isElite).toBe(true);
    });

    it('sets monster.eliteRank correctly', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast'], rank: 'champion' });
      expect(m.eliteRank).toBe('champion');

      const m2 = makeMonster();
      applyAffixes(m2, { affixes: ['fast', 'vampiric'], rank: 'rare' });
      expect(m2.eliteRank).toBe('rare');
    });

    it('sets monster.affixes array', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast', 'vampiric'], rank: 'champion' });
      expect(m.affixes).toEqual(['fast', 'vampiric']);
    });

    it('champion: XP x1.5, lootTier +1', () => {
      const m = makeMonster();
      const origXp = m.xpReward;
      const origLootTier = m.lootTier;
      applyAffixes(m, { affixes: ['fast'], rank: 'champion' });
      expect(m.xpReward).toBe(Math.floor(origXp * 1.5));
      expect(m.lootTier).toBe(Math.min(origLootTier + 1, 4));
    });

    it('champion: goldBonus = 1', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast'], rank: 'champion' });
      expect(m.goldBonus).toBe(1);
    });

    it('rare: XP x2.5, lootTier +2, goldBonus = 2', () => {
      const m = makeMonster();
      const origXp = m.xpReward;
      const origLootTier = m.lootTier;
      applyAffixes(m, { affixes: ['fast', 'vampiric'], rank: 'rare' });
      expect(m.xpReward).toBe(Math.floor(origXp * 2.5));
      expect(m.lootTier).toBe(Math.min(origLootTier + 2, 4));
      expect(m.goldBonus).toBe(2);
    });

    // ── Individual affix apply() effects ──
    it('fast: speed x1.5', () => {
      const m = makeMonster();
      const origSpeed = m.speed;
      applyAffixes(m, { affixes: ['fast'], rank: 'champion' });
      expect(m.speed).toBe(origSpeed * 1.5);
    });

    it('extra_strong: damage x1.6 (floored)', () => {
      const m = makeMonster();
      const origDmg = m.damage;
      applyAffixes(m, { affixes: ['extra_strong'], rank: 'champion' });
      expect(m.damage).toBe(Math.floor(origDmg * 1.6));
    });

    it('extra_health: hp x2, maxHp x2, size x1.3 (floored)', () => {
      const m = makeMonster();
      const origHp = m.hp;
      const origMaxHp = m.maxHp;
      const origSize = m.size;
      applyAffixes(m, { affixes: ['extra_health'], rank: 'champion' });
      expect(m.hp).toBe(origHp * 2);
      expect(m.maxHp).toBe(origMaxHp * 2);
      expect(m.size).toBe(Math.floor(origSize * 1.3));
    });

    it('vampiric: sets monster.vampiric = true', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['vampiric'], rank: 'champion' });
      expect(m.vampiric).toBe(true);
    });

    it('shielding: sets shielding properties', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['shielding'], rank: 'champion' });
      expect(m.shielding).toBe(true);
      expect(m.shieldTimer).toBe(0);
      expect(m.shieldActive).toBe(false);
      expect(m.shieldCycleTicks).toBe(200);
      expect(m.shieldDurationTicks).toBe(60);
    });

    it('fire_enchanted: sets monster.fireEnchanted = true', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fire_enchanted'], rank: 'champion' });
      expect(m.fireEnchanted).toBe(true);
    });

    it('cold_enchanted: sets monster.coldEnchanted = true', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['cold_enchanted'], rank: 'champion' });
      expect(m.coldEnchanted).toBe(true);
    });

    it('teleporter: sets teleporter properties', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['teleporter'], rank: 'champion' });
      expect(m.teleporter).toBe(true);
      expect(m.teleportCooldown).toBe(0);
      expect(m.teleportInterval).toBe(100);
    });
  });

  // ── processAffixUpdates ──────────────────────────────────────────
  describe('processAffixUpdates()', () => {
    it('returns empty array for monsters with no affixes', () => {
      const m = makeMonster();
      expect(processAffixUpdates(m)).toEqual([]);
    });

    it('returns empty array for monsters with no update-type affixes', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast', 'extra_strong'], rank: 'champion' });
      const events = processAffixUpdates(m);
      expect(events).toEqual([]);
    });

    it('teleporter: returns teleport event after teleportInterval ticks', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['teleporter'], rank: 'champion' });

      // Tick 99 times — no teleport yet
      for (let i = 0; i < 99; i++) {
        const events = processAffixUpdates(m);
        expect(events.length).toBe(0);
      }

      // Tick 100 — teleport triggers
      const events = processAffixUpdates(m);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('teleport');
      expect(events[0]).toHaveProperty('newX');
      expect(events[0]).toHaveProperty('newY');
    });

    it('teleporter: resets cooldown after teleporting', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['teleporter'], rank: 'champion' });

      // Fast-forward to teleport
      for (let i = 0; i < 100; i++) {
        processAffixUpdates(m);
      }
      // Cooldown should be reset
      expect(m.teleportCooldown).toBe(0);
    });

    it('shielding: returns shield_on after cycleTicks', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['shielding'], rank: 'champion' });

      // Tick 199 times — no shield event
      for (let i = 0; i < 199; i++) {
        const events = processAffixUpdates(m);
        expect(events.length).toBe(0);
      }

      // Tick 200 — shield_on
      const events = processAffixUpdates(m);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('shield_on');
      expect(m.shieldActive).toBe(true);
    });

    it('shielding: returns shield_off after durationTicks', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['shielding'], rank: 'champion' });

      // Activate shield
      for (let i = 0; i < 200; i++) {
        processAffixUpdates(m);
      }
      expect(m.shieldActive).toBe(true);

      // Tick 59 times — shield still active
      for (let i = 0; i < 59; i++) {
        const events = processAffixUpdates(m);
        expect(events.length).toBe(0);
      }

      // Tick 60 — shield_off
      const events = processAffixUpdates(m);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('shield_off');
      expect(m.shieldActive).toBe(false);
    });
  });

  // ── modifyDamageByAffixes ────────────────────────────────────────
  describe('modifyDamageByAffixes()', () => {
    it('returns original damage for monsters with no affixes', () => {
      const m = makeMonster();
      expect(modifyDamageByAffixes(m, 50)).toBe(50);
    });

    it('returns original damage for non-shielding affixes', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast', 'vampiric'], rank: 'champion' });
      expect(modifyDamageByAffixes(m, 50)).toBe(50);
    });

    it('shielding active: returns 0 damage', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['shielding'], rank: 'champion' });
      m.shieldActive = true;
      expect(modifyDamageByAffixes(m, 100)).toBe(0);
    });

    it('shielding inactive: returns original damage', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['shielding'], rank: 'champion' });
      m.shieldActive = false;
      expect(modifyDamageByAffixes(m, 100)).toBe(100);
    });
  });

  // ── processAffixOnDeath ──────────────────────────────────────────
  describe('processAffixOnDeath()', () => {
    it('returns empty array for monsters with no affixes', () => {
      const m = makeMonster();
      expect(processAffixOnDeath(m)).toEqual([]);
    });

    it('returns empty array for non-fire affixes', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast', 'vampiric'], rank: 'champion' });
      expect(processAffixOnDeath(m)).toEqual([]);
    });

    it('fire_enchanted: returns fire_explosion event', () => {
      const m = makeMonster();
      m.x = 150;
      m.y = 250;
      applyAffixes(m, { affixes: ['fire_enchanted'], rank: 'champion' });
      const events = processAffixOnDeath(m);
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('fire_explosion');
      expect(events[0].x).toBe(150);
      expect(events[0].y).toBe(250);
      expect(events[0].radius).toBe(80);
      expect(events[0].damage).toBe(Math.floor(m.damage * 0.5));
    });
  });

  // ── processAffixOnDealDamage ─────────────────────────────────────
  describe('processAffixOnDealDamage()', () => {
    it('returns 0 for monsters with no affixes', () => {
      const m = makeMonster();
      expect(processAffixOnDealDamage(m, 50)).toBe(0);
    });

    it('returns 0 for non-vampiric affixes', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast'], rank: 'champion' });
      expect(processAffixOnDealDamage(m, 50)).toBe(0);
    });

    it('vampiric: heals monster 15% of damage dealt', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['vampiric'], rank: 'champion' });
      m.hp = m.maxHp - 50; // take some damage first
      const hpBefore = m.hp;
      const heal = processAffixOnDealDamage(m, 100);
      expect(heal).toBe(Math.floor(100 * 0.15)); // 15
      expect(m.hp).toBe(hpBefore + 15);
    });

    it('vampiric: healing is capped at maxHp', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['vampiric'], rank: 'champion' });
      m.hp = m.maxHp - 1; // only 1 hp missing
      processAffixOnDealDamage(m, 100);
      expect(m.hp).toBe(m.maxHp); // capped, not over
    });
  });

  // ── processAffixOnHitPlayer ──────────────────────────────────────
  describe('processAffixOnHitPlayer()', () => {
    it('fire_enchanted: applies fire_dot debuff to player', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fire_enchanted'], rank: 'champion' });
      const mockPlayer = {
        addDebuff: vi.fn(),
      };
      processAffixOnHitPlayer(m, mockPlayer);
      expect(mockPlayer.addDebuff).toHaveBeenCalledWith({
        effect: 'fire_dot',
        damage: 5,
        ticksRemaining: 60,
        source: m.id,
      });
    });

    it('cold_enchanted: applies slow debuff to player', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['cold_enchanted'], rank: 'champion' });
      const mockPlayer = {
        addDebuff: vi.fn(),
      };
      processAffixOnHitPlayer(m, mockPlayer);
      expect(mockPlayer.addDebuff).toHaveBeenCalledWith({
        effect: 'slow',
        speedMult: 0.7,
        ticksRemaining: 60,
        source: m.id,
      });
    });

    it('does nothing for affixes without onHitPlayer', () => {
      const m = makeMonster();
      applyAffixes(m, { affixes: ['fast', 'extra_strong'], rank: 'champion' });
      const mockPlayer = {
        addDebuff: vi.fn(),
      };
      processAffixOnHitPlayer(m, mockPlayer);
      expect(mockPlayer.addDebuff).not.toHaveBeenCalled();
    });

    it('does nothing for monsters with no affixes', () => {
      const m = makeMonster();
      const mockPlayer = {
        addDebuff: vi.fn(),
      };
      processAffixOnHitPlayer(m, mockPlayer);
      expect(mockPlayer.addDebuff).not.toHaveBeenCalled();
    });
  });

  // ── AFFIX_DEFS structure ─────────────────────────────────────────
  describe('AFFIX_DEFS structure', () => {
    it('has 8 affix definitions', () => {
      expect(Object.keys(AFFIX_DEFS).length).toBe(8);
    });

    it('all affixes have name, description, color, and apply function', () => {
      for (const [key, def] of Object.entries(AFFIX_DEFS)) {
        expect(def).toHaveProperty('name');
        expect(def).toHaveProperty('description');
        expect(def).toHaveProperty('color');
        expect(typeof def.apply).toBe('function');
      }
    });

    it('expected affix keys exist', () => {
      const expected = ['fast', 'extra_strong', 'fire_enchanted', 'cold_enchanted',
                        'teleporter', 'vampiric', 'shielding', 'extra_health'];
      for (const key of expected) {
        expect(AFFIX_DEFS).toHaveProperty(key);
      }
    });
  });
});
