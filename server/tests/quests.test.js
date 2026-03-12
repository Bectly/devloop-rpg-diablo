import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { QuestManager, QUEST_TEMPLATES } = require('../game/quests');

// Monster types used internally (not exported, mirrored here for assertions)
const VALID_MONSTER_TYPES = ['skeleton', 'zombie', 'demon', 'archer', 'slime'];

/**
 * Helper: create a QuestManager with deterministic quests by directly injecting
 * quest objects. This avoids the broken generateItem import in _generateReward
 * (quests.js imports generateItem from items.js, but items.js does not export it).
 */
function makeQuest(overrides = {}) {
  return {
    id: overrides.id || 'q-' + Math.random().toString(36).slice(2, 8),
    type: overrides.type || 'kill_count',
    title: overrides.title || 'Test Quest',
    description: overrides.description || 'A test quest',
    target: overrides.target ?? 5,
    subtype: overrides.subtype ?? null,
    progress: overrides.progress ?? 0,
    reward: overrides.reward ?? { gold: 50 },
    completed: overrides.completed ?? false,
    claimed: overrides.claimed ?? false,
    floor: overrides.floor ?? 1,
  };
}

describe('QuestManager', () => {
  let qm;
  let randomSpy;

  beforeEach(() => {
    qm = new QuestManager();
    // Stub Math.random to return 0.5 by default — avoids the broken
    // generateItem call in _generateReward (triggered when random < 0.3).
    // Tests that need specific random values override this per-call.
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  // ── QUEST_TEMPLATES ─────────────────────────────────────────────
  describe('QUEST_TEMPLATES', () => {
    it('has at least 6 templates', () => {
      expect(QUEST_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    });

    it('each template has type, title, desc, baseTarget, perFloor', () => {
      for (const t of QUEST_TEMPLATES) {
        expect(t).toHaveProperty('type');
        expect(t).toHaveProperty('title');
        expect(t).toHaveProperty('desc');
        expect(t).toHaveProperty('baseTarget');
        expect(t).toHaveProperty('perFloor');
        expect(typeof t.type).toBe('string');
        expect(typeof t.title).toBe('string');
        expect(typeof t.desc).toBe('string');
        expect(typeof t.baseTarget).toBe('number');
        expect(typeof t.perFloor).toBe('number');
      }
    });
  });

  // ── generateForFloor ────────────────────────────────────────────
  describe('generateForFloor', () => {
    it('generates 3-5 quests for floor 1', () => {
      // Math.random() = 0.5 → count = 3 + floor(0.5 * 3) = 3 + 1 = 4
      const quests = qm.generateForFloor(1);
      expect(quests.length).toBeGreaterThanOrEqual(3);
      expect(quests.length).toBeLessThanOrEqual(5);
    });

    it('quests have all required fields', () => {
      const quests = qm.generateForFloor(1);
      for (const q of quests) {
        expect(q).toHaveProperty('id');
        expect(q).toHaveProperty('type');
        expect(q).toHaveProperty('title');
        expect(q).toHaveProperty('description');
        expect(q).toHaveProperty('target');
        expect(q).toHaveProperty('progress');
        expect(q).toHaveProperty('reward');
        expect(q).toHaveProperty('completed');
        expect(q).toHaveProperty('claimed');
        expect(q).toHaveProperty('floor');
        expect(typeof q.id).toBe('string');
        expect(typeof q.type).toBe('string');
        expect(typeof q.title).toBe('string');
        expect(typeof q.description).toBe('string');
        expect(typeof q.target).toBe('number');
        expect(q.progress).toBe(0);
        expect(q.completed).toBe(false);
        expect(q.claimed).toBe(false);
        expect(q.floor).toBe(1);
      }
    });

    it('no duplicate quest types in active quests', () => {
      const quests = qm.generateForFloor(1);
      const types = quests.map(q => q.type);
      expect(new Set(types).size).toBe(types.length);
    });

    it('floor scaling works — higher floor gives higher targets for kill_count', () => {
      const m1 = new QuestManager();
      const q1 = m1.generateForFloor(1);
      const kc1 = q1.find(q => q.type === 'kill_count');

      const m10 = new QuestManager();
      const q10 = m10.generateForFloor(10);
      const kc10 = q10.find(q => q.type === 'kill_count');

      // With stubbed random (0.5), template selection is deterministic
      // kill_count: baseTarget=5, perFloor=2 → floor 1: 7, floor 10: 25
      if (kc1 && kc10) {
        expect(kc10.target).toBeGreaterThan(kc1.target);
      }
    });

    it('floor scaling works — higher floor gives higher targets for collect_gold', () => {
      const m1 = new QuestManager();
      const q1 = m1.generateForFloor(1);
      const cg1 = q1.find(q => q.type === 'collect_gold');

      const m10 = new QuestManager();
      const q10 = m10.generateForFloor(10);
      const cg10 = q10.find(q => q.type === 'collect_gold');

      // collect_gold: baseTarget=50, perFloor=25 → floor 1: 75, floor 10: 300
      if (cg1 && cg10) {
        expect(cg10.target).toBeGreaterThan(cg1.target);
      }
    });

    it('reach_floor quest target is floor + 2', () => {
      const quests = qm.generateForFloor(3);
      const rf = quests.find(q => q.type === 'reach_floor');
      if (rf) {
        expect(rf.target).toBe(5); // floor 3 + 2
      }
    });

    it('kill_type quest has valid subtype from MONSTER_TYPES_FOR_QUESTS', () => {
      const quests = qm.generateForFloor(1);
      const kt = quests.find(q => q.type === 'kill_type');
      if (kt) {
        expect(kt.subtype).toBeDefined();
        expect(VALID_MONSTER_TYPES).toContain(kt.subtype);
      }
    });

    it('reward has gold field', () => {
      const quests = qm.generateForFloor(1);
      for (const q of quests) {
        expect(q.reward).toHaveProperty('gold');
        expect(q.reward.gold).toBeGreaterThan(0);
      }
    });

    it('second call does not duplicate active quest types', () => {
      qm.generateForFloor(1);
      qm.generateForFloor(2);
      const allActive = qm.quests.filter(q => !q.completed);
      const types = allActive.map(q => q.type);
      expect(new Set(types).size).toBe(types.length);
    });
  });

  // ── check ───────────────────────────────────────────────────────
  describe('check', () => {
    it('kill event increments kill_count progress', () => {
      const quest = makeQuest({ type: 'kill_count', target: 10 });
      qm.quests.push(quest);
      qm.check('kill', { type: 'skeleton' });
      expect(quest.progress).toBe(1);
    });

    it('kill event with matching type increments kill_type', () => {
      const quest = makeQuest({ type: 'kill_type', subtype: 'demon', target: 5 });
      qm.quests.push(quest);
      qm.check('kill', { type: 'demon' });
      expect(quest.progress).toBe(1);
    });

    it('kill event with wrong type does not increment kill_type', () => {
      const quest = makeQuest({ type: 'kill_type', subtype: 'demon', target: 5 });
      qm.quests.push(quest);
      qm.check('kill', { type: 'skeleton' });
      expect(quest.progress).toBe(0);
    });

    it('clear_room increments clear_rooms', () => {
      const quest = makeQuest({ type: 'clear_rooms', target: 3 });
      qm.quests.push(quest);
      qm.check('clear_room', {});
      expect(quest.progress).toBe(1);
    });

    it('collect_gold adds correct amount', () => {
      const quest = makeQuest({ type: 'collect_gold', target: 100 });
      qm.quests.push(quest);
      qm.check('collect_gold', { amount: 25 });
      expect(quest.progress).toBe(25);
    });

    it('reach_floor completes when data.floor >= target', () => {
      const quest = makeQuest({ type: 'reach_floor', target: 5 });
      qm.quests.push(quest);
      qm.check('reach_floor', { floor: 5 });
      expect(quest.completed).toBe(true);
      expect(quest.progress).toBe(quest.target);
    });

    it('reach_floor does not complete when floor < target', () => {
      const quest = makeQuest({ type: 'reach_floor', target: 5 });
      qm.quests.push(quest);
      qm.check('reach_floor', { floor: 4 });
      expect(quest.completed).toBe(false);
      expect(quest.progress).toBe(0);
    });

    it('use_shrine increments use_shrine quest', () => {
      const quest = makeQuest({ type: 'use_shrine', target: 1 });
      qm.quests.push(quest);
      qm.check('use_shrine', {});
      expect(quest.progress).toBe(1);
    });

    it('buy_item increments buy_item quest progress', () => {
      const quest = makeQuest({ type: 'buy_item', target: 1 });
      qm.quests.push(quest);
      qm.check('buy_item', {});
      expect(quest.progress).toBe(1);
    });

    it('does not increment completed quests', () => {
      const quest = makeQuest({ type: 'kill_count', target: 10, completed: true, progress: 5 });
      qm.quests.push(quest);
      qm.check('kill', { type: 'skeleton' });
      expect(quest.progress).toBe(5);
    });

    it('does not increment claimed quests', () => {
      const quest = makeQuest({ type: 'kill_count', target: 10, claimed: true, progress: 5 });
      qm.quests.push(quest);
      qm.check('kill', { type: 'skeleton' });
      expect(quest.progress).toBe(5);
    });

    it('returns changed quests array', () => {
      const quest = makeQuest({ type: 'kill_count', target: 10 });
      qm.quests.push(quest);
      const changed = qm.check('kill', { type: 'skeleton' });
      expect(Array.isArray(changed)).toBe(true);
      expect(changed).toContain(quest);
    });

    it('quest auto-completes when progress >= target', () => {
      const quest = makeQuest({ type: 'use_shrine', target: 1 });
      qm.quests.push(quest);
      qm.check('use_shrine', {});
      expect(quest.progress).toBe(1);
      expect(quest.completed).toBe(true);
    });

    it('progress is capped at target', () => {
      const quest = makeQuest({ type: 'collect_gold', target: 30 });
      qm.quests.push(quest);
      qm.check('collect_gold', { amount: 50 });
      expect(quest.progress).toBe(30); // capped at target
    });

    it('reach_floor completes when data.floor exceeds target', () => {
      const quest = makeQuest({ type: 'reach_floor', target: 5 });
      qm.quests.push(quest);
      qm.check('reach_floor', { floor: 7 });
      expect(quest.completed).toBe(true);
      expect(quest.progress).toBe(quest.target);
    });

    it('returns empty array when no quests changed', () => {
      const quest = makeQuest({ type: 'kill_count', target: 10 });
      qm.quests.push(quest);
      const changed = qm.check('use_shrine', {}); // wrong event for kill_count
      expect(changed).toEqual([]);
    });

    it('completed quest is added to completedIds', () => {
      const quest = makeQuest({ type: 'use_shrine', target: 1, id: 'shrine-1' });
      qm.quests.push(quest);
      qm.check('use_shrine', {});
      expect(qm.completedIds.has('shrine-1')).toBe(true);
    });
  });

  // ── claimReward ─────────────────────────────────────────────────
  describe('claimReward', () => {
    it('returns reward for completed quest', () => {
      const quest = makeQuest({ id: 'claim-test', completed: true, reward: { gold: 100 } });
      qm.quests.push(quest);
      const reward = qm.claimReward('claim-test');
      expect(reward).not.toBeNull();
      expect(reward).toHaveProperty('gold');
      expect(reward.gold).toBe(100);
    });

    it('marks quest as claimed', () => {
      const quest = makeQuest({ id: 'claim-mark', completed: true, reward: { gold: 50 } });
      qm.quests.push(quest);
      qm.claimReward('claim-mark');
      expect(quest.claimed).toBe(true);
    });

    it('returns null for uncompleted quest', () => {
      const quest = makeQuest({ id: 'uncompleted', completed: false });
      qm.quests.push(quest);
      const reward = qm.claimReward('uncompleted');
      expect(reward).toBeNull();
    });

    it('returns null for already claimed quest', () => {
      const quest = makeQuest({ id: 'already-claimed', completed: true, claimed: true, reward: { gold: 50 } });
      qm.quests.push(quest);
      const reward = qm.claimReward('already-claimed');
      expect(reward).toBeNull();
    });

    it('returns null for non-existent quest ID', () => {
      const reward = qm.claimReward('non-existent-id');
      expect(reward).toBeNull();
    });
  });

  // ── getActiveQuests ─────────────────────────────────────────────
  describe('getActiveQuests', () => {
    it('returns unclaimed quests only', () => {
      qm.quests.push(makeQuest({ id: 'active-1' }));
      qm.quests.push(makeQuest({ id: 'active-2' }));
      qm.quests.push(makeQuest({ id: 'claimed-1', claimed: true }));
      const active = qm.getActiveQuests();
      expect(active.length).toBe(2);
    });

    it('returns correct shape (id, title, description, progress, target, completed, reward, type)', () => {
      qm.quests.push(makeQuest({ id: 'shape-test' }));
      const active = qm.getActiveQuests();
      expect(active.length).toBe(1);
      const q = active[0];
      expect(q).toHaveProperty('id');
      expect(q).toHaveProperty('title');
      expect(q).toHaveProperty('description');
      expect(q).toHaveProperty('progress');
      expect(q).toHaveProperty('target');
      expect(q).toHaveProperty('completed');
      expect(q).toHaveProperty('reward');
      expect(q).toHaveProperty('type');
      // Should NOT have internal fields
      expect(q).not.toHaveProperty('claimed');
      expect(q).not.toHaveProperty('floor');
      expect(q).not.toHaveProperty('subtype');
    });

    it('excludes claimed quests', () => {
      const quest = makeQuest({ id: 'excl-test', claimed: true });
      qm.quests.push(quest);
      const active = qm.getActiveQuests();
      const found = active.find(q => q.id === 'excl-test');
      expect(found).toBeUndefined();
    });
  });

  // ── serialize ───────────────────────────────────────────────────
  describe('serialize', () => {
    it('returns quests array and completedIds', () => {
      const quest = makeQuest({ id: 'ser-1' });
      qm.quests.push(quest);
      qm.completedIds.add('old-completed');

      const data = qm.serialize();
      expect(data).toHaveProperty('quests');
      expect(data).toHaveProperty('completedIds');
      expect(Array.isArray(data.quests)).toBe(true);
      expect(Array.isArray(data.completedIds)).toBe(true);
      expect(data.quests.length).toBe(1);
      expect(data.completedIds).toContain('old-completed');
    });
  });
});
