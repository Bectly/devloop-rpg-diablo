import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { StoryManager, NPCS, QUESTS } = require('../game/story');

describe('StoryManager — new NPCs and features (Cycle #22)', () => {
  let sm;

  beforeEach(() => {
    sm = new StoryManager();
  });

  // ── shrine_guardian NPC ─────────────────────────────────────────
  describe('shrine_guardian NPC', () => {
    it('exists in NPCS constant', () => {
      expect(NPCS).toHaveProperty('shrine_guardian');
      expect(NPCS.shrine_guardian.id).toBe('shrine_guardian');
      expect(NPCS.shrine_guardian.name).toBe('Shrine Guardian');
    });

    it('has intro and accepted dialogues', () => {
      const dialogues = NPCS.shrine_guardian.dialogues;
      expect(dialogues).toHaveProperty('intro');
      expect(dialogues).toHaveProperty('accepted');
      expect(Object.keys(dialogues).length).toBe(2);
    });

    it('intro dialogue has 2 choices', () => {
      const intro = NPCS.shrine_guardian.dialogues.intro;
      expect(intro.choices.length).toBe(2);
    });

    it('accepted dialogue has 1 choice', () => {
      const accepted = NPCS.shrine_guardian.dialogues.accepted;
      expect(accepted.choices.length).toBe(1);
    });
  });

  // ── floor_herald NPC ──────────────────────────────────────────
  describe('floor_herald NPC', () => {
    it('exists in NPCS constant', () => {
      expect(NPCS).toHaveProperty('floor_herald');
      expect(NPCS.floor_herald.id).toBe('floor_herald');
      expect(NPCS.floor_herald.name).toBe('Dying Adventurer');
    });

    it('has intro and weakness dialogues', () => {
      const dialogues = NPCS.floor_herald.dialogues;
      expect(dialogues).toHaveProperty('intro');
      expect(dialogues).toHaveProperty('weakness');
      expect(Object.keys(dialogues).length).toBe(2);
    });

    it('weakness dialogue has 1 choice with give_items action', () => {
      const weakness = NPCS.floor_herald.dialogues.weakness;
      expect(weakness.choices.length).toBe(1);
      expect(weakness.choices[0].action).toBe('give_items:health_potion:2');
    });
  });

  // ── getNpcDialogue returns dialogueKey ────────────────────────
  describe('getNpcDialogue dialogueKey field', () => {
    it('returns dialogueKey matching the requested key', () => {
      const result = sm.getNpcDialogue('old_sage', 'intro');
      expect(result).not.toBeNull();
      expect(result.dialogueKey).toBe('intro');
    });

    it('returns dialogueKey "intro" when no key specified', () => {
      const result = sm.getNpcDialogue('old_sage');
      expect(result).not.toBeNull();
      expect(result.dialogueKey).toBe('intro');
    });

    it('getNpcDialogue("shrine_guardian", "intro") returns correct data', () => {
      const result = sm.getNpcDialogue('shrine_guardian', 'intro');
      expect(result).not.toBeNull();
      expect(result.npcId).toBe('shrine_guardian');
      expect(result.npcName).toBe('Shrine Guardian');
      expect(result.dialogueKey).toBe('intro');
      expect(result.choices.length).toBe(2);
    });

    it('getNpcDialogue("shrine_guardian", "accepted") returns correct data', () => {
      const result = sm.getNpcDialogue('shrine_guardian', 'accepted');
      expect(result).not.toBeNull();
      expect(result.npcId).toBe('shrine_guardian');
      expect(result.dialogueKey).toBe('accepted');
      expect(result.choices.length).toBe(1);
    });

    it('getNpcDialogue("floor_herald", "weakness") returns correct data', () => {
      const result = sm.getNpcDialogue('floor_herald', 'weakness');
      expect(result).not.toBeNull();
      expect(result.npcId).toBe('floor_herald');
      expect(result.npcName).toBe('Dying Adventurer');
      expect(result.dialogueKey).toBe('weakness');
      expect(result.choices.length).toBe(1);
      expect(result.choices[0].hasAction).toBe(true);
    });
  });

  // ── processDialogueChoice for new NPCs ────────────────────────
  describe('processDialogueChoice for new NPCs', () => {
    it('shrine_guardian intro choice 0 goes to accepted', () => {
      const result = sm.processDialogueChoice('shrine_guardian', 'intro', 0);
      expect(result.next).toBe('accepted');
      expect(result.actions).toEqual([]);
    });

    it('floor_herald intro choice 0 goes to weakness', () => {
      const result = sm.processDialogueChoice('floor_herald', 'intro', 0);
      expect(result.next).toBe('weakness');
      expect(result.actions).toEqual([]);
    });

    it('floor_herald weakness choice 0 has give_items action', () => {
      const result = sm.processDialogueChoice('floor_herald', 'weakness', 0);
      expect(result.next).toBeNull();
      expect(result.actions.length).toBe(1);
      expect(result.actions[0].type).toBe('give_items');
      expect(result.actions[0].itemType).toBe('health_potion');
      expect(result.actions[0].count).toBe(2);
    });
  });

  // ── placeNpcs ─────────────────────────────────────────────────
  describe('placeNpcs', () => {
    it('updates NPC positions', () => {
      sm.placeNpcs([{ id: 'shrine_guardian', x: 300, y: 400 }]);
      expect(sm.npcs.shrine_guardian.x).toBe(300);
      expect(sm.npcs.shrine_guardian.y).toBe(400);
    });

    it('ignores unknown NPC IDs silently', () => {
      // Should not throw
      sm.placeNpcs([{ id: 'nonexistent_npc', x: 100, y: 200 }]);
      expect(sm.npcs).not.toHaveProperty('nonexistent_npc');
    });

    it('does nothing with empty array', () => {
      const before = { ...sm.npcs.old_sage };
      sm.placeNpcs([]);
      expect(sm.npcs.old_sage.x).toBe(before.x);
      expect(sm.npcs.old_sage.y).toBe(before.y);
    });

    it('updates multiple NPCs at once', () => {
      sm.placeNpcs([
        { id: 'shrine_guardian', x: 100, y: 150 },
        { id: 'floor_herald', x: 500, y: 550 },
      ]);
      expect(sm.npcs.shrine_guardian.x).toBe(100);
      expect(sm.npcs.shrine_guardian.y).toBe(150);
      expect(sm.npcs.floor_herald.x).toBe(500);
      expect(sm.npcs.floor_herald.y).toBe(550);
    });
  });
});
