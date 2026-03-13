import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { CombatSystem } = require('../game/combat');
const { Monster, createSpiritWolf } = require('../game/monsters');
const { Player } = require('../game/player');

// ── Helper: mock player for processMonsterAttack ────────────────

function defensePlayer(overrides = {}) {
  const p = new Player('Defender', overrides.cls || 'warrior');
  p.recalcStats();
  p.hp = overrides.hp ?? p.maxHp;
  p.dodgeChance = overrides.dodgeChance ?? 0; // deterministic: no dodge
  p.talentBonuses = overrides.talentBonuses ?? { passives: {}, procs: [], auras: [] };
  return p;
}

function mockMonsterEvent(targetId, damage = 50) {
  return {
    type: 'monster_attack',
    targetId,
    monsterId: 'mob-1',
    damage,
    damageType: 'physical',
    attackType: 'melee',
  };
}

// ── 15.0: Defensive Talent Procs ────────────────────────────────

describe('Phase 15.0 — Defensive Talent Procs', () => {
  let combat;

  beforeEach(() => {
    combat = new CombatSystem();
  });

  describe('Shield Wall (block)', () => {
    it('refunds 50% of dealt damage to HP on proc', () => {
      const player = defensePlayer({
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_take_damage', chance: 1.0, effect: 'block' }],
          auras: [],
        },
      });
      const hpBefore = player.hp;
      const monster = new Monster('skeleton', 100, 100, 0);
      const event = mockMonsterEvent(player.id, 100);

      combat.processMonsterAttack(event, [player], monster);

      // Block proc emits combat:proc event with refunded value
      const blockEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'block');
      expect(blockEvents).toHaveLength(1);
      const refunded = blockEvents[0].value;
      expect(refunded).toBeGreaterThan(0);
      // Player took raw damage, then got 50% refunded → net damage = raw - refund
      // Refund = floor(raw * 0.5), so player.hp should be hpBefore - raw + refund
      const rawDamage = combat.events.find(e => e.type === 'combat:hit' && e.targetId === player.id)?.damage || 0;
      if (rawDamage > 0) {
        expect(refunded).toBe(Math.floor(rawDamage * 0.5));
      }
      expect(player.hp).toBeGreaterThan(hpBefore - 100); // took less than full damage
    });

    it('does not trigger on dodge', () => {
      const player = defensePlayer({
        dodgeChance: 100, // always dodge
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_take_damage', chance: 1.0, effect: 'block' }],
          auras: [],
        },
      });
      const monster = new Monster('skeleton', 100, 100, 0);
      const event = mockMonsterEvent(player.id, 50);

      combat.processMonsterAttack(event, [player], monster);

      const blockEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'block');
      expect(blockEvents).toHaveLength(0);
    });

    it('does not trigger with chance 0', () => {
      const player = defensePlayer({
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_take_damage', chance: 0, effect: 'block' }],
          auras: [],
        },
      });
      const monster = new Monster('skeleton', 100, 100, 0);
      const event = mockMonsterEvent(player.id, 50);

      combat.processMonsterAttack(event, [player], monster);

      const blockEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'block');
      expect(blockEvents).toHaveLength(0);
    });
  });

  describe('Last Stand', () => {
    it('activates when HP drops below 20%', () => {
      const player = defensePlayer({
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_take_damage', chance: 1.0, effect: 'last_stand', duration: 5000 }],
          auras: [],
        },
      });
      // Set HP to just above lethal — taking damage should put below 20%
      player.hp = Math.floor(player.maxHp * 0.21);
      const monster = new Monster('skeleton', 100, 100, 0);
      // Small damage to push below threshold but not kill
      const event = mockMonsterEvent(player.id, 5);

      combat.processMonsterAttack(event, [player], monster);

      const lsEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'last_stand');
      expect(lsEvents).toHaveLength(1);
      expect(player.lastStandTimer).toBeGreaterThanOrEqual(5000);
    });

    it('does NOT activate when HP is above 20%', () => {
      const player = defensePlayer({
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_take_damage', chance: 1.0, effect: 'last_stand', duration: 5000 }],
          auras: [],
        },
      });
      // Keep HP high
      player.hp = player.maxHp;
      const monster = new Monster('skeleton', 100, 100, 0);
      const event = mockMonsterEvent(player.id, 5); // small hit, stays above 20%

      combat.processMonsterAttack(event, [player], monster);

      const lsEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'last_stand');
      expect(lsEvents).toHaveLength(0);
    });

    it('Last Stand DR refunds 50% damage when timer active', () => {
      const player = defensePlayer({
        talentBonuses: { passives: {}, procs: [], auras: [] },
      });
      player.lastStandTimer = 3000; // already active
      const hpBefore = player.hp;
      const monster = new Monster('skeleton', 100, 100, 0);
      const event = mockMonsterEvent(player.id, 100);

      combat.processMonsterAttack(event, [player], monster);

      // Should have 50% DR applied (refund after takeDamage)
      // Net damage should be about 50% of what armor allowed through
      expect(player.hp).toBeGreaterThan(hpBefore - 100);
    });
  });

  describe('Ice Barrier (freeze)', () => {
    it('stuns the attacking monster', () => {
      const player = defensePlayer({
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_take_damage', chance: 1.0, effect: 'freeze', duration: 2000 }],
          auras: [],
        },
      });
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.stunned = 0;
      const event = mockMonsterEvent(player.id, 50);

      combat.processMonsterAttack(event, [player], monster);

      expect(monster.stunned).toBeGreaterThanOrEqual(2000);
      const freezeEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'freeze');
      expect(freezeEvents).toHaveLength(1);
      expect(freezeEvents[0].attackerId).toBe(monster.id);
    });
  });

  describe('Caltrops (on_dodge slow)', () => {
    it('slows attacker when player dodges', () => {
      const player = defensePlayer({
        dodgeChance: 100, // always dodge
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_dodge', chance: 1.0, effect: 'slow', duration: 3000 }],
          auras: [],
        },
      });
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.slowed = 0;
      const event = mockMonsterEvent(player.id, 50);

      combat.processMonsterAttack(event, [player], monster);

      expect(monster.slowed).toBeGreaterThanOrEqual(3000);
      const caltropEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'caltrops');
      expect(caltropEvents).toHaveLength(1);
    });

    it('does NOT trigger when player is hit (not dodged)', () => {
      const player = defensePlayer({
        dodgeChance: 0,
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_dodge', chance: 1.0, effect: 'slow', duration: 3000 }],
          auras: [],
        },
      });
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.slowed = 0;
      const event = mockMonsterEvent(player.id, 50);

      combat.processMonsterAttack(event, [player], monster);

      expect(monster.slowed).toBe(0);
      const caltropEvents = combat.events.filter(e => e.type === 'combat:proc' && e.effect === 'caltrops');
      expect(caltropEvents).toHaveLength(0);
    });
  });

  describe('No procs without talentBonuses', () => {
    it('processMonsterAttack works with talentBonuses = null', () => {
      const player = defensePlayer();
      player.talentBonuses = null;
      const monster = new Monster('skeleton', 100, 100, 0);
      const event = mockMonsterEvent(player.id, 50);

      expect(() => combat.processMonsterAttack(event, [player], monster)).not.toThrow();
    });
  });
});

// ── 15.1: Shatter Bonus ─────────────────────────────────────────

describe('Phase 15.1 — Shatter Bonus (applyShatter)', () => {
  let combat;

  beforeEach(() => {
    combat = new CombatSystem();
  });

  function attackPlayer(overrides = {}) {
    return {
      id: 'shatter-test', name: 'ShatterMage', alive: true,
      attackPower: 100, spellPower: 100, critChance: 0, x: 90, y: 90,
      attackRange: 60, attackCooldown: 0, attackSpeed: 1000,
      canAttack: function () { return this.attackCooldown <= 0; },
      startAttackCooldown: function () { this.attackCooldown = this.attackSpeed; },
      equipment: {}, setBonuses: {}, buffs: [],
      kills: 0, gold: 0, difficulty: 'normal', maxHp: 200, hp: 200,
      gainXp: () => null,
      questManager: { check: () => [] },
      talentBonuses: { passives: { shatter_bonus: 30 }, procs: [], auras: [] },
      ...overrides,
    };
  }

  it('deals bonus damage to stunned monsters', () => {
    const player = attackPlayer();
    const monster = new Monster('skeleton', 100, 100, 0);
    monster.stunned = 2000; // frozen/stunned
    const hpBefore = monster.hp;

    combat.playerAttack(player, [monster]);

    const hpLost = hpBefore - monster.hp;
    // With 30% shatter bonus, damage should be ~30% more than base
    // Base is ~100 ± variance, shatter adds ~30
    expect(hpLost).toBeGreaterThan(0);
  });

  it('does NOT apply shatter to non-stunned monsters', () => {
    const player = attackPlayer();
    const monsterStunned = new Monster('skeleton', 100, 100, 0);
    monsterStunned.stunned = 2000;
    monsterStunned.maxHp = 5000;
    monsterStunned.hp = 5000;

    const monsterNormal = new Monster('skeleton', 100, 100, 0);
    monsterNormal.stunned = 0;
    monsterNormal.maxHp = 5000;
    monsterNormal.hp = 5000;

    // Attack stunned monster
    combat.playerAttack(player, [monsterStunned]);
    const stunnedDmg = 5000 - monsterStunned.hp;

    // Reset combat and attack normal monster
    combat.clearEvents();
    player.attackCooldown = 0;
    combat.playerAttack(player, [monsterNormal]);
    const normalDmg = 5000 - monsterNormal.hp;

    // Stunned monster should take more damage (shatter bonus)
    expect(stunnedDmg).toBeGreaterThan(normalDmg);
  });

  it('no crash when player has no shatter_bonus', () => {
    const player = attackPlayer({
      talentBonuses: { passives: {}, procs: [], auras: [] },
    });
    const monster = new Monster('skeleton', 100, 100, 0);
    monster.stunned = 2000;

    expect(() => combat.playerAttack(player, [monster])).not.toThrow();
  });
});

// ── 15.2: Separate Bleed/Poison ─────────────────────────────────

describe('Phase 15.2 — Bleed/Poison Split', () => {
  let combat;

  beforeEach(() => {
    combat = new CombatSystem();
  });

  describe('Monster bleed fields', () => {
    it('Monster starts with bleedTick=0 and bleedDamage=0', () => {
      const m = new Monster('skeleton', 100, 100, 0);
      expect(m.bleedTick).toBe(0);
      expect(m.bleedDamage).toBe(0);
    });

    it('bleed and poison are independent fields', () => {
      const m = new Monster('skeleton', 100, 100, 0);
      m.poisonTick = 3000;
      m.poisonDamage = 10;
      m.bleedTick = 2000;
      m.bleedDamage = 15;

      expect(m.poisonTick).toBe(3000);
      expect(m.bleedTick).toBe(2000);
      expect(m.poisonDamage).toBe(10);
      expect(m.bleedDamage).toBe(15);
    });
  });

  describe('processBleed', () => {
    it('deals damage every 1 second', () => {
      const m = new Monster('skeleton', 100, 100, 0);
      m.maxHp = 500;
      m.hp = 500;
      m.bleedTick = 3000;
      m.bleedDamage = 20;

      // First tick at 2000ms mark (from 3000 to 2000)
      combat.processBleed(m, 1000);
      const hpAfter1 = m.hp;
      expect(hpAfter1).toBeLessThan(500);

      const bleedHits = combat.events.filter(e => e.attackType === 'bleed_tick');
      expect(bleedHits).toHaveLength(1);
      expect(bleedHits[0].attackerId).toBe('bleed');
      expect(bleedHits[0].damageType).toBe('physical');
    });

    it('does not tick if bleedTick is 0', () => {
      const m = new Monster('skeleton', 100, 100, 0);
      m.bleedTick = 0;
      m.bleedDamage = 20;

      combat.processBleed(m, 1000);

      expect(combat.events).toHaveLength(0);
    });

    it('does not tick on dead monster', () => {
      const m = new Monster('skeleton', 100, 100, 0);
      m.alive = false;
      m.bleedTick = 3000;
      m.bleedDamage = 20;

      combat.processBleed(m, 1000);

      expect(combat.events).toHaveLength(0);
    });

    it('bleed and poison can tick simultaneously', () => {
      const m = new Monster('skeleton', 100, 100, 0);
      m.maxHp = 1000;
      m.hp = 1000;
      m.poisonTick = 3000;
      m.poisonDamage = 10;
      m.bleedTick = 3000;
      m.bleedDamage = 15;

      combat.processPoison(m, 1000);
      combat.processBleed(m, 1000);

      const poisonHits = combat.events.filter(e => e.attackType === 'poison_tick');
      const bleedHits = combat.events.filter(e => e.attackType === 'bleed_tick');

      expect(poisonHits).toHaveLength(1);
      expect(bleedHits).toHaveLength(1);
      expect(m.hp).toBeLessThan(1000);
    });
  });

  describe('bleed proc uses bleedTick (not poisonTick)', () => {
    function bleedPlayer(overrides = {}) {
      return {
        id: 'bleed-test', name: 'Bleeder', alive: true,
        attackPower: 50, critChance: 0, x: 90, y: 90,
        attackRange: 60, attackCooldown: 0, attackSpeed: 1000,
        canAttack: function () { return this.attackCooldown <= 0; },
        startAttackCooldown: function () { this.attackCooldown = this.attackSpeed; },
        equipment: {}, setBonuses: {}, buffs: [],
        kills: 0, gold: 0, difficulty: 'normal', maxHp: 200, hp: 200,
        gainXp: () => null,
        questManager: { check: () => [] },
        talentBonuses: {
          passives: {},
          procs: [{ trigger: 'on_hit', chance: 1.0, effect: 'bleed', duration: 3000 }],
          auras: [],
        },
        ...overrides,
      };
    }

    it('bleed proc sets bleedTick, NOT poisonTick', () => {
      const player = bleedPlayer();
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 1000;
      monster.hp = 1000;

      combat.playerAttack(player, [monster]);

      expect(monster.bleedTick).toBeGreaterThan(0);
      expect(monster.poisonTick).toBe(0); // poison unaffected
    });

    it('bleed does not overwrite existing poison', () => {
      const player = bleedPlayer();
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 1000;
      monster.hp = 1000;
      monster.poisonTick = 5000;
      monster.poisonDamage = 25;

      combat.playerAttack(player, [monster]);

      // Poison should be untouched
      expect(monster.poisonTick).toBe(5000);
      expect(monster.poisonDamage).toBe(25);
      // Bleed should be set
      expect(monster.bleedTick).toBeGreaterThan(0);
    });
  });
});

// ── Player.lastStandTimer ───────────────────────────────────────

describe('Player.lastStandTimer', () => {
  it('new player has lastStandTimer = 0', () => {
    const p = new Player('TimerTest', 'warrior');
    expect(p.lastStandTimer).toBe(0);
  });

  it('lastStandTimer included in serializeForPhone()', () => {
    const p = new Player('SerializeTest', 'warrior');
    p.lastStandTimer = 3500;
    const data = p.serializeForPhone();
    expect(data.lastStandTimer).toBe(3500);
  });

  it('lastStandTimer defaults to 0 in serializeForPhone()', () => {
    const p = new Player('SerializeTest2', 'warrior');
    const data = p.serializeForPhone();
    expect(data.lastStandTimer).toBe(0);
  });
});

// ── heal_on_kill event has targetId ─────────────────────────────

describe('heal_on_kill event structure', () => {
  it('includes targetId for phone forwarding', () => {
    const combat = new CombatSystem();
    const player = {
      id: 'heal-kill-test', name: 'Healer', alive: true,
      attackPower: 200, spellPower: 0, critChance: 0,
      x: 90, y: 90, attackRange: 120, attackCooldown: 0, attackSpeed: 1000,
      canAttack() { return this.attackCooldown <= 0; },
      startAttackCooldown() { this.attackCooldown = this.attackSpeed; },
      equipment: {}, setBonuses: {}, buffs: [], hp: 80, maxHp: 200,
      kills: 0, gold: 0, difficulty: 'normal',
      gainXp() { return null; },
      questManager: { notifyKill() {} },
      talentBonuses: {
        passives: {},
        procs: [
          { trigger: 'on_kill', chance: 1.0, effect: 'heal_percent', value: 15 },
        ],
        auras: [],
      },
    };
    const monster = new Monster('skeleton', 100, 100, 0);
    monster.maxHp = 100;
    monster.hp = 1; // will die from hit

    combat.playerAttack(player, [monster]);

    const healEvent = combat.events.find(e => e.type === 'combat:proc' && e.effect === 'heal_on_kill');
    expect(healEvent).toBeDefined();
    expect(healEvent.targetId).toBe(player.id);
  });
});

// ── Phase 15.3: Party Aura Full Implementation ──────────────────

describe('Phase 15.3 — Party Auras', () => {
  let combat;

  beforeEach(() => {
    combat = new CombatSystem();
  });

  // Helper: create a minimal attackable player with aura-providing ally
  function auraPlayer(auras = []) {
    return {
      id: 'aura-provider', name: 'AuraGuy', alive: true,
      talentBonuses: { passives: {}, procs: [], auras },
    };
  }

  function attackerPlayer(overrides = {}) {
    return {
      id: 'atk-test', name: 'Attacker', alive: true,
      attackPower: 100, spellPower: 0, critChance: 0,
      x: 90, y: 90, attackRange: 120,
      attackCooldown: 0, attackSpeed: 1000,
      canAttack() { return this.attackCooldown <= 0; },
      startAttackCooldown() { this.attackCooldown = this.attackSpeed; },
      equipment: {}, setBonuses: {}, buffs: [],
      hp: 200, maxHp: 200,
      kills: 0, gold: 0, difficulty: 'normal',
      gainXp(amount) { this._lastXp = amount; return null; },
      questManager: { notifyKill() {} },
      talentBonuses: { passives: {}, procs: [], auras: [] },
      _lastXp: 0,
      ...overrides,
    };
  }

  describe('getPartyBuffs()', () => {
    it('aggregates aura stats from multiple players', () => {
      const p1 = auraPlayer([{ party: true, stat: 'str', value: 3 }]);
      const p2 = auraPlayer([{ party: true, stat: 'str', value: 5 }]);
      const result = combat.getPartyBuffs([p1, p2]);
      expect(result.str).toBe(8);
    });

    it('aggregates different aura types', () => {
      const p1 = auraPlayer([
        { party: true, stat: 'xp_percent', value: 10 },
        { party: true, stat: 'attack_speed', value: 5 },
      ]);
      const result = combat.getPartyBuffs([p1]);
      expect(result.xp_percent).toBe(10);
      expect(result.attack_speed).toBe(5);
      expect(result.move_speed).toBe(0);
    });

    it('ignores non-party auras', () => {
      const p1 = auraPlayer([{ party: false, stat: 'str', value: 99 }]);
      const result = combat.getPartyBuffs([p1]);
      expect(result.str).toBe(0);
    });

    it('returns zeros for null/empty players', () => {
      expect(combat.getPartyBuffs(null).str).toBe(0);
      expect(combat.getPartyBuffs([]).str).toBe(0);
    });

    it('ignores unknown stat keys', () => {
      const p1 = auraPlayer([{ party: true, stat: 'unknown_stat', value: 99 }]);
      const result = combat.getPartyBuffs([p1]);
      expect(result.str).toBe(0);
      expect(result.unknown_stat).toBeUndefined();
    });
  });

  describe('XP aura bonus', () => {
    it('increases XP reward on kill via playerAttack', () => {
      const player = attackerPlayer();
      const ally = auraPlayer([{ party: true, stat: 'xp_percent', value: 20 }]);
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 100;
      monster.hp = 1; // will die
      monster.xpReward = 100;

      combat.playerAttack(player, [monster], [player, ally]);

      // XP should be 100 * 1.2 = 120 (20% aura bonus)
      expect(player._lastXp).toBe(120);
    });

    it('XP aura stacks with setBonuses.xpPercent', () => {
      const player = attackerPlayer({ setBonuses: { xpPercent: 50 } });
      const ally = auraPlayer([{ party: true, stat: 'xp_percent', value: 20 }]);
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 100;
      monster.hp = 1;
      monster.xpReward = 100;

      combat.playerAttack(player, [monster], [player, ally]);

      // setBonuses: 100 * 1.5 = 150, then aura: 150 * 1.2 = 180
      expect(player._lastXp).toBe(180);
    });

    it('no XP aura bonus without allPlayers', () => {
      const player = attackerPlayer();
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 100;
      monster.hp = 1;
      monster.xpReward = 100;

      // No allPlayers passed (solo mode)
      combat.playerAttack(player, [monster]);

      expect(player._lastXp).toBe(100);
    });
  });

  describe('Attack speed aura', () => {
    it('reduces attack cooldown by aura percentage', () => {
      const ally = auraPlayer([{ party: true, stat: 'attack_speed', value: 10 }]);
      const player = attackerPlayer({ attackSpeed: 1000 });
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 5000;
      monster.hp = 5000;

      combat.playerAttack(player, [monster], [player, ally]);

      // attackCooldown should be floor(1000 * 0.9) = 900
      expect(player.attackCooldown).toBe(900);
    });

    it('no attack speed change without aura', () => {
      const player = attackerPlayer({ attackSpeed: 1000 });
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 5000;
      monster.hp = 5000;

      combat.playerAttack(player, [monster], [player]);

      // No aura → cooldown stays at attackSpeed
      expect(player.attackCooldown).toBe(1000);
    });
  });

  describe('Move speed aura (auraMoveBuff)', () => {
    it('Player.auraMoveBuff defaults to 0', () => {
      const p = new Player('AuraTest', 'ranger');
      expect(p.auraMoveBuff).toBe(0);
    });

    it('auraMoveBuff affects speedMultiplier', () => {
      const p = new Player('SpeedTest', 'ranger');
      p.auraMoveBuff = 10; // +10%
      const mult = p.speedMultiplier;
      expect(mult).toBeCloseTo(1.1, 2);
    });

    it('auraMoveBuff stacks with setBonuses.speedPercent', () => {
      const p = new Player('SpeedStack', 'ranger');
      p.setBonuses = { speedPercent: 20 };
      p.auraMoveBuff = 10;
      // mult = 1.0 * (1 + 20/100) * (1 + 10/100) = 1.2 * 1.1 = 1.32
      expect(p.speedMultiplier).toBeCloseTo(1.32, 2);
    });

    it('auraMoveBuff included in serializeForPhone()', () => {
      const p = new Player('SerAura', 'warrior');
      p.auraMoveBuff = 15;
      const data = p.serializeForPhone();
      expect(data.auraMoveBuff).toBe(15);
    });
  });
});

// ── Phase 15.4: Spirit Wolf ──────────────────────────────────────

describe('Phase 15.4 — Spirit Wolf', () => {
  describe('createSpiritWolf() factory', () => {
    it('creates a friendly wolf with correct stats from owner', () => {
      const owner = new Player('WolfOwner', 'ranger');
      owner.recalcStats();
      const wolf = createSpiritWolf(100, 200, owner);

      expect(wolf.friendly).toBe(true);
      expect(wolf.ownerId).toBe(owner.id);
      expect(wolf.maxHp).toBe(Math.floor(owner.maxHp * 0.3));
      expect(wolf.hp).toBe(wolf.maxHp);
      expect(wolf.damage).toBe(Math.floor(owner.attackPower * 0.8));
      expect(wolf.speed).toBe(200);
      expect(wolf.expireTimer).toBe(10000);
    });

    it('wolf position matches spawn coordinates', () => {
      const owner = new Player('PosTest', 'warrior');
      owner.recalcStats();
      const wolf = createSpiritWolf(42, 84, owner);
      expect(wolf.x).toBe(42);
      expect(wolf.y).toBe(84);
    });

    it('wolf type is spirit_wolf', () => {
      const owner = new Player('TypeTest', 'mage');
      owner.recalcStats();
      const wolf = createSpiritWolf(0, 0, owner);
      expect(wolf.type).toBe('spirit_wolf');
    });

    it('wolf xpReward is 0 (no XP for killing friendly summon)', () => {
      const owner = new Player('XPTest', 'warrior');
      owner.recalcStats();
      const wolf = createSpiritWolf(0, 0, owner);
      expect(wolf.xpReward).toBe(0);
    });

    it('wolf scales with owner stats', () => {
      const weak = new Player('Weak', 'ranger');
      weak.recalcStats();
      const strong = new Player('Strong', 'warrior');
      strong.recalcStats();
      strong.attackPower = 500;
      strong.maxHp = 1000;

      const weakWolf = createSpiritWolf(0, 0, weak);
      const strongWolf = createSpiritWolf(0, 0, strong);

      expect(strongWolf.maxHp).toBeGreaterThan(weakWolf.maxHp);
      expect(strongWolf.damage).toBeGreaterThan(weakWolf.damage);
    });
  });

  describe('on-kill proc emits summon event', () => {
    it('emits summon:spirit_wolf event when proc triggers', () => {
      const combat = new CombatSystem();
      const player = {
        id: 'wolf-summoner', name: 'Summoner', alive: true,
        attackPower: 100, spellPower: 0, critChance: 0,
        x: 90, y: 90, attackRange: 120,
        attackCooldown: 0, attackSpeed: 1000,
        canAttack() { return this.attackCooldown <= 0; },
        startAttackCooldown() { this.attackCooldown = this.attackSpeed; },
        equipment: {}, setBonuses: {}, buffs: [],
        hp: 200, maxHp: 200,
        kills: 0, gold: 0, difficulty: 'normal',
        gainXp() { return null; },
        questManager: { notifyKill() {} },
        talentBonuses: {
          passives: {},
          procs: [
            { trigger: 'on_kill', chance: 1.0, effect: 'summon_spirit_wolf' },
          ],
          auras: [],
        },
      };
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 100;
      monster.hp = 1;

      combat.playerAttack(player, [monster]);

      const summonEvents = combat.events.filter(e => e.type === 'summon:spirit_wolf');
      expect(summonEvents).toHaveLength(1);
      expect(summonEvents[0].playerId).toBe('wolf-summoner');
      expect(summonEvents[0].x).toBe(monster.x);
      expect(summonEvents[0].y).toBe(monster.y);
    });

    it('does not emit summon event if monster survives', () => {
      const combat = new CombatSystem();
      const player = {
        id: 'wolf-no-kill', name: 'NoKill', alive: true,
        attackPower: 10, spellPower: 0, critChance: 0,
        x: 90, y: 90, attackRange: 120,
        attackCooldown: 0, attackSpeed: 1000,
        canAttack() { return this.attackCooldown <= 0; },
        startAttackCooldown() { this.attackCooldown = this.attackSpeed; },
        equipment: {}, setBonuses: {}, buffs: [],
        hp: 200, maxHp: 200,
        kills: 0, gold: 0, difficulty: 'normal',
        gainXp() { return null; },
        questManager: { notifyKill() {} },
        talentBonuses: {
          passives: {},
          procs: [
            { trigger: 'on_kill', chance: 1.0, effect: 'summon_spirit_wolf' },
          ],
          auras: [],
        },
      };
      const monster = new Monster('skeleton', 100, 100, 0);
      monster.maxHp = 5000;
      monster.hp = 5000;

      combat.playerAttack(player, [monster]);

      const summonEvents = combat.events.filter(e => e.type === 'summon:spirit_wolf');
      expect(summonEvents).toHaveLength(0);
    });
  });

  describe('friendly monster serialization', () => {
    it('serialize() includes friendly and ownerId', () => {
      const owner = new Player('SerOwner', 'warrior');
      owner.recalcStats();
      const wolf = createSpiritWolf(50, 50, owner);
      const data = wolf.serialize();
      expect(data.friendly).toBe(true);
      expect(data.ownerId).toBe(owner.id);
    });

    it('normal monster has friendly=false in serialize', () => {
      const m = new Monster('skeleton', 0, 0, 0);
      const data = m.serialize();
      expect(data.friendly).toBe(false);
    });
  });

  describe('Player.summonedWolf tracking', () => {
    it('defaults to null', () => {
      const p = new Player('WolfTrack', 'ranger');
      expect(p.summonedWolf).toBeNull();
    });

    it('can be set to wolf id', () => {
      const p = new Player('WolfSet', 'warrior');
      p.summonedWolf = 'wolf-123';
      expect(p.summonedWolf).toBe('wolf-123');
    });
  });
});
