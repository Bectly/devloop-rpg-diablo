import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { Player } = require('../game/player');
const { CombatSystem } = require('../game/combat');
const { Monster } = require('../game/monsters');
const {
  MAX_SKILL_LEVEL,
  getDamageMult,
  getEffectiveMpCost,
  getEffectiveCooldown,
  getLevel5Bonus,
  getSkillPointsSpent,
  canLevelUpSkill,
} = require('../game/skill-levels');
const { getAvailablePoints } = require('../game/talents');

// ── Helpers ────────────────────────────────────────────────────────

function createWarrior(level = 10) {
  const p = new Player('TestWarrior', 'warrior');
  p.level = level;
  p.recalcStats();
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  p.dodgeChance = 0;
  p.critChance = 0;
  return p;
}

function createRanger(level = 10) {
  const p = new Player('TestRanger', 'ranger');
  p.level = level;
  p.recalcStats();
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  p.dodgeChance = 0;
  p.critChance = 0;
  return p;
}

function createMage(level = 10) {
  const p = new Player('TestMage', 'mage');
  p.level = level;
  p.recalcStats();
  p.hp = p.maxHp;
  p.mp = p.maxMp;
  p.dodgeChance = 0;
  p.critChance = 0;
  return p;
}

function createMonsterAt(x, y, hp = 5000) {
  const m = new Monster('skeleton', x, y, 0);
  m.maxHp = hp;
  m.hp = hp;
  m.armor = 0;
  return m;
}

// ── skill-levels.js pure functions ─────────────────────────────────

describe('skill-levels.js — scaling formulas', () => {
  it('MAX_SKILL_LEVEL is 5', () => {
    expect(MAX_SKILL_LEVEL).toBe(5);
  });

  it('getDamageMult scales correctly per level', () => {
    expect(getDamageMult(1)).toBe(1.0);
    expect(getDamageMult(2)).toBe(1.15);
    expect(getDamageMult(3)).toBe(1.30);
    expect(getDamageMult(4)).toBe(1.45);
    expect(getDamageMult(5)).toBe(1.60);
  });

  it('getDamageMult clamps above MAX_SKILL_LEVEL', () => {
    expect(getDamageMult(6)).toBe(1.60);
    expect(getDamageMult(99)).toBe(1.60);
  });

  it('getEffectiveMpCost reduces by 5% per level', () => {
    expect(getEffectiveMpCost(20, 1)).toBe(20);
    expect(getEffectiveMpCost(20, 2)).toBe(19); // floor(20 * 0.95)
    expect(getEffectiveMpCost(20, 3)).toBe(18); // floor(20 * 0.90)
    expect(getEffectiveMpCost(20, 4)).toBe(17); // floor(20 * 0.85)
    expect(getEffectiveMpCost(20, 5)).toBe(16); // floor(20 * 0.80)
  });

  it('getEffectiveMpCost never goes below 1', () => {
    expect(getEffectiveMpCost(1, 5)).toBe(1);
  });

  it('getEffectiveCooldown reduces by 10% per level', () => {
    expect(getEffectiveCooldown(4000, 1)).toBe(4000);
    expect(getEffectiveCooldown(4000, 2)).toBe(3600);
    expect(getEffectiveCooldown(4000, 3)).toBe(3200);
    expect(getEffectiveCooldown(4000, 4)).toBe(2800);
    expect(getEffectiveCooldown(4000, 5)).toBe(2400);
  });

  it('getLevel5Bonus returns null below level 5', () => {
    expect(getLevel5Bonus('Whirlwind', 1)).toBeNull();
    expect(getLevel5Bonus('Whirlwind', 4)).toBeNull();
  });

  it('getLevel5Bonus returns bonus at level 5', () => {
    const bonus = getLevel5Bonus('Whirlwind', 5);
    expect(bonus).toBeDefined();
    expect(bonus.extraHits).toBe(2);
  });

  it('getLevel5Bonus returns null for unknown skill', () => {
    expect(getLevel5Bonus('NonExistentSkill', 5)).toBeNull();
  });

  it('all 9 skills have Level 5 bonuses defined', () => {
    const skills = [
      'Whirlwind', 'Charging Strike', 'Battle Shout',
      'Arrow Volley', 'Sniper Shot', 'Shadow Step',
      'Meteor Strike', 'Blizzard', 'Chain Lightning',
    ];
    for (const name of skills) {
      expect(getLevel5Bonus(name, 5)).not.toBeNull();
    }
  });
});

describe('skill-levels.js — point management', () => {
  it('getSkillPointsSpent returns 0 for default levels', () => {
    expect(getSkillPointsSpent([1, 1, 1])).toBe(0);
  });

  it('getSkillPointsSpent sums levels above 1', () => {
    expect(getSkillPointsSpent([3, 1, 2])).toBe(3); // (3-1) + (1-1) + (2-1) = 3
    expect(getSkillPointsSpent([5, 5, 5])).toBe(12); // 4+4+4
  });

  it('getSkillPointsSpent handles null/undefined', () => {
    expect(getSkillPointsSpent(null)).toBe(0);
    expect(getSkillPointsSpent(undefined)).toBe(0);
  });

  it('canLevelUpSkill returns ok when valid', () => {
    const result = canLevelUpSkill(0, [1, 1, 1], 5);
    expect(result.ok).toBe(true);
  });

  it('canLevelUpSkill rejects invalid index', () => {
    expect(canLevelUpSkill(-1, [1, 1, 1], 5).ok).toBe(false);
    expect(canLevelUpSkill(3, [1, 1, 1], 5).ok).toBe(false);
  });

  it('canLevelUpSkill rejects at max level', () => {
    expect(canLevelUpSkill(0, [5, 1, 1], 5).ok).toBe(false);
  });

  it('canLevelUpSkill rejects with 0 available points', () => {
    expect(canLevelUpSkill(0, [1, 1, 1], 0).ok).toBe(false);
  });
});

// ── Talent point pool integration ──────────────────────────────────

describe('Talent + Skill shared point pool', () => {
  it('skill levels reduce available talent points', () => {
    // Level 10 player, no talents, all skills at 1 → 10 points
    expect(getAvailablePoints(10, {}, [1, 1, 1])).toBe(10);
    // Level up skill 0 to 3 → spent 2 skill points
    expect(getAvailablePoints(10, {}, [3, 1, 1])).toBe(8);
  });

  it('talent allocation + skill levels both reduce pool', () => {
    // Level 10, 3 talent points + 2 skill points = 5 spent → 5 available
    expect(getAvailablePoints(10, { warrior_berserker_t1: 3 }, [2, 1, 1])).toBe(6);
  });

  it('maxing all 3 skills costs 12 points total', () => {
    expect(getAvailablePoints(15, {}, [5, 5, 5])).toBe(3); // 15 - 12 = 3
  });
});

// ── Player.levelUpSkill() ──────────────────────────────────────────

describe('Player.levelUpSkill()', () => {
  it('increments skill level', () => {
    const p = createWarrior(10);
    expect(p.skillLevels).toEqual([1, 1, 1]);
    expect(p.levelUpSkill(0)).toBe(true);
    expect(p.skillLevels[0]).toBe(2);
  });

  it('can level to max (5)', () => {
    const p = createWarrior(10);
    for (let i = 0; i < 4; i++) {
      expect(p.levelUpSkill(0)).toBe(true);
    }
    expect(p.skillLevels[0]).toBe(5);
  });

  it('rejects level beyond 5', () => {
    const p = createWarrior(10);
    p.skillLevels[0] = 5;
    expect(p.levelUpSkill(0)).toBe(false);
    expect(p.skillLevels[0]).toBe(5);
  });

  it('rejects when no available points', () => {
    const p = createWarrior(1); // level 1 = 1 point total
    expect(p.levelUpSkill(0)).toBe(true); // spend the 1 point: L1→L2
    expect(p.levelUpSkill(1)).toBe(false); // no more points
  });

  it('competes with talent allocations for points', () => {
    const p = createWarrior(3); // 3 points
    p.talents = { warrior_berserker_t1: 2 }; // 2 points spent on talents
    p.recalcTalentBonuses();
    expect(p.levelUpSkill(0)).toBe(true); // 1 point left → L2
    expect(p.levelUpSkill(1)).toBe(false); // 0 points left
  });
});

// ── Player.useSkill() — level-scaled MP/CD ─────────────────────────

describe('Player.useSkill() — level scaling', () => {
  it('deducts base MP at level 1', () => {
    const p = createWarrior(10);
    const startMp = p.mp;
    p.useSkill(0); // Whirlwind: 20 MP
    expect(p.mp).toBe(startMp - 20);
  });

  it('deducts reduced MP at level 3', () => {
    const p = createWarrior(10);
    p.skillLevels[0] = 3; // 90% MP cost
    const startMp = p.mp;
    p.useSkill(0); // 20 * 0.90 = 18
    expect(p.mp).toBe(startMp - 18);
  });

  it('sets reduced cooldown at level 3', () => {
    const p = createWarrior(10);
    p.skillLevels[0] = 3; // 80% cooldown
    p.useSkill(0); // Whirlwind: 4000 * 0.80 = 3200
    expect(p.skillCooldowns[0]).toBe(3200);
  });

  it('sets base cooldown at level 1', () => {
    const p = createWarrior(10);
    p.useSkill(0); // Whirlwind: 4000
    expect(p.skillCooldowns[0]).toBe(4000);
  });

  it('level 5 cooldown is 60% of base', () => {
    const p = createWarrior(10);
    p.skillLevels[0] = 5;
    p.useSkill(0); // 4000 * 0.60 = 2400
    expect(p.skillCooldowns[0]).toBe(2400);
  });
});

// ── Player.canUseSkill() — checks level-scaled MP cost ─────────────

describe('Player.canUseSkill() — level-scaled MP check', () => {
  it('allows skill when MP exactly matches level-scaled cost', () => {
    const p = createWarrior(10);
    p.skillLevels[0] = 5; // MP cost: 20 * 0.80 = 16
    p.mp = 16;
    expect(p.canUseSkill(0)).toBe(true);
  });

  it('rejects when MP below level-scaled cost', () => {
    const p = createWarrior(10);
    p.skillLevels[0] = 5; // MP cost: 16
    p.mp = 15;
    expect(p.canUseSkill(0)).toBe(false);
  });
});

// ── Damage scaling in combat ───────────────────────────────────────

describe('Skill damage scaling in combat', () => {
  let combat;

  beforeEach(() => {
    combat = new CombatSystem();
  });

  it('Whirlwind deals more damage at level 3 than level 1', () => {
    const p1 = createWarrior(10);
    const p2 = createWarrior(10);
    const m1 = createMonsterAt(p1.x + 30, p1.y);
    const m2 = createMonsterAt(p2.x + 30, p2.y);

    // Level 1
    combat.playerSkill(p1, 0, [m1], [p1]);
    const dmg1 = m1.maxHp - m1.hp;

    // Level 3
    p2.skillLevels[0] = 3;
    combat.playerSkill(p2, 0, [m2], [p2]);
    const dmg2 = m2.maxHp - m2.hp;

    expect(dmg2).toBeGreaterThan(dmg1);
  });

  it('Blizzard spellPower damage scales with level', () => {
    const p1 = createMage(10);
    const p2 = createMage(10);
    p1.mp = 200;
    p2.mp = 200;
    const m1 = createMonsterAt(p1.x + 50, p1.y);
    const m2 = createMonsterAt(p2.x + 50, p2.y);

    // Level 1
    combat.playerSkill(p1, 1, [m1], [p1]);
    const dmg1 = m1.maxHp - m1.hp;

    // Level 4
    p2.skillLevels[1] = 4;
    combat.playerSkill(p2, 1, [m2], [p2]);
    const dmg2 = m2.maxHp - m2.hp;

    expect(dmg2).toBeGreaterThan(dmg1);
  });
});

// ── Level 5 bonuses ────────────────────────────────────────────────

describe('Level 5 — Whirlwind (+2 hits)', () => {
  it('deals 5 hits instead of 3 at level 5', () => {
    const combat = new CombatSystem();
    const p = createWarrior(10);
    p.skillLevels[0] = 5;
    const m = createMonsterAt(p.x + 30, p.y);
    const results = combat.playerSkill(p, 0, [m], [p]);
    const hits = results.filter(e => e.type === 'combat:hit' && e.targetId === m.id);
    expect(hits.length).toBe(5);
  });

  it('deals 3 hits at level 4 (no L5 bonus)', () => {
    const combat = new CombatSystem();
    const p = createWarrior(10);
    p.skillLevels[0] = 4;
    const m = createMonsterAt(p.x + 30, p.y);
    const results = combat.playerSkill(p, 0, [m], [p]);
    const hits = results.filter(e => e.type === 'combat:hit' && e.targetId === m.id);
    expect(hits.length).toBe(3);
  });
});

describe('Level 5 — Arrow Volley (+2 projectiles)', () => {
  it('fires 7 projectiles instead of 5 at level 5', () => {
    const combat = new CombatSystem();
    const p = createRanger(10);
    p.skillLevels[0] = 5;
    const m = createMonsterAt(p.x + 100, p.y);
    const results = combat.playerSkill(p, 0, [m], [p]);
    const projs = results.filter(e => e.type === 'projectile:create');
    expect(projs.length).toBe(7);
  });

  it('fires 5 projectiles at level 4', () => {
    const combat = new CombatSystem();
    const p = createRanger(10);
    p.skillLevels[0] = 4;
    const m = createMonsterAt(p.x + 100, p.y);
    const results = combat.playerSkill(p, 0, [m], [p]);
    const projs = results.filter(e => e.type === 'projectile:create');
    expect(projs.length).toBe(5);
  });
});

describe('Level 5 — Sniper Shot (guaranteed crit)', () => {
  it('projectile has guaranteedCrit=true at level 5', () => {
    const combat = new CombatSystem();
    const p = createRanger(10);
    p.skillLevels[1] = 5;
    const m = createMonsterAt(p.x + 100, p.y);
    const results = combat.playerSkill(p, 1, [m], [p]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.guaranteedCrit).toBe(true);
  });

  it('projectile has guaranteedCrit=false at level 4', () => {
    const combat = new CombatSystem();
    const p = createRanger(10);
    p.skillLevels[1] = 4;
    const m = createMonsterAt(p.x + 100, p.y);
    const results = combat.playerSkill(p, 1, [m], [p]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.guaranteedCrit).toBe(false);
  });
});

describe('Level 5 — Shadow Step (+1 decoy)', () => {
  it('emits 2 shadow_decoy summons at level 5', () => {
    const combat = new CombatSystem();
    const p = createRanger(10);
    p.skillLevels[2] = 5;
    const results = combat.playerSkill(p, 2, [], [p]);
    const decoys = results.filter(e => e.type === 'summon:shadow_decoy');
    expect(decoys.length).toBe(2);
  });

  it('emits 1 shadow_decoy at level 4', () => {
    const combat = new CombatSystem();
    const p = createRanger(10);
    p.skillLevels[2] = 4;
    const results = combat.playerSkill(p, 2, [], [p]);
    const decoys = results.filter(e => e.type === 'summon:shadow_decoy');
    expect(decoys.length).toBe(1);
  });
});

describe('Level 5 — Meteor Strike (burning ground)', () => {
  it('projectile has burningGround=true at level 5', () => {
    const combat = new CombatSystem();
    const p = createMage(10);
    p.mp = 200;
    p.skillLevels[0] = 5;
    const m = createMonsterAt(p.x + 200, p.y);
    const results = combat.playerSkill(p, 0, [m], [p]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.burningGround).toBe(true);
    expect(proj.burnDamage).toBe(0.5);
    expect(proj.burnDuration).toBe(3000);
  });

  it('projectile has burningGround=false at level 4', () => {
    const combat = new CombatSystem();
    const p = createMage(10);
    p.mp = 200;
    p.skillLevels[0] = 4;
    const m = createMonsterAt(p.x + 200, p.y);
    const results = combat.playerSkill(p, 0, [m], [p]);
    const proj = results.find(e => e.type === 'projectile:create');
    expect(proj.burningGround).toBe(false);
  });
});

describe('Level 5 — Blizzard (freeze instead of slow)', () => {
  it('freezes (stuns) monsters at level 5', () => {
    const combat = new CombatSystem();
    const p = createMage(10);
    p.mp = 200;
    p.skillLevels[1] = 5;
    const m = createMonsterAt(p.x + 50, p.y);
    combat.playerSkill(p, 1, [m], [p]);
    // Monster should be stunned (frozen), not just slowed
    expect(m.stunned).toBeGreaterThan(0);
  });

  it('slows (not freezes) monsters at level 4', () => {
    const combat = new CombatSystem();
    const p = createMage(10);
    p.mp = 200;
    p.skillLevels[1] = 4;
    const m = createMonsterAt(p.x + 50, p.y);
    combat.playerSkill(p, 1, [m], [p]);
    expect(m.slowed).toBeGreaterThan(0);
    expect(m.stunned || 0).toBe(0);
  });
});

describe('Level 5 — Chain Lightning (+2 bounces)', () => {
  it('chains up to 6 targets at level 5', () => {
    const combat = new CombatSystem();
    const p = createMage(10);
    p.mp = 200;
    p.skillLevels[2] = 5;
    const monsters = [];
    for (let i = 0; i < 8; i++) {
      monsters.push(createMonsterAt(p.x + 50 + i * 80, p.y));
    }
    const results = combat.playerSkill(p, 2, monsters, [p]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits.length).toBe(6); // 4 + 2 extra
  });

  it('chains up to 4 targets at level 4', () => {
    const combat = new CombatSystem();
    const p = createMage(10);
    p.mp = 200;
    p.skillLevels[2] = 4;
    const monsters = [];
    for (let i = 0; i < 8; i++) {
      monsters.push(createMonsterAt(p.x + 50 + i * 80, p.y));
    }
    const results = combat.playerSkill(p, 2, monsters, [p]);
    const hits = results.filter(e => e.type === 'combat:hit');
    expect(hits.length).toBe(4);
  });
});

// ── Serialization ──────────────────────────────────────────────────

describe('Player serialization includes skillLevels', () => {
  it('serialize() includes skillLevels', () => {
    const p = createWarrior(10);
    p.skillLevels = [3, 1, 2];
    const data = p.serialize();
    expect(data.skillLevels).toEqual([3, 1, 2]);
  });

  it('serializeForPhone() includes skillLevels and per-skill level', () => {
    const p = createWarrior(10);
    p.skillLevels = [2, 1, 1];
    const data = p.serializeForPhone();
    expect(data.skillLevels).toEqual([2, 1, 1]);
    expect(data.skills[0].level).toBe(2);
    expect(data.skills[1].level).toBe(1);
  });

  it('serializeForPhone() shows effective MP/CD at level', () => {
    const p = createWarrior(10);
    p.skillLevels = [3, 1, 1]; // Whirlwind at level 3
    const data = p.serializeForPhone();
    // Whirlwind base: 20 MP, 4000 CD
    // Level 3: MP 18, CD 3200
    expect(data.skills[0].mpCost).toBe(18);
    expect(data.skills[0].baseMpCost).toBe(20);
    expect(data.skills[0].cooldown).toBe(3200);
    expect(data.skills[0].baseCooldown).toBe(4000);
  });

  it('restoreFrom() restores skillLevels', () => {
    const p = createWarrior(10);
    p.restoreFrom({
      level: 10,
      skillLevels: [4, 2, 3],
    });
    expect(p.skillLevels).toEqual([4, 2, 3]);
  });

  it('restoreFrom() preserves existing skillLevels if not in saved data', () => {
    const p = createWarrior(10);
    p.skillLevels = [3, 3, 3];
    p.restoreFrom({ level: 10 });
    // No skillLevels in saved data → keeps existing (constructor default or previous)
    expect(p.skillLevels).toEqual([3, 3, 3]);
  });
});
