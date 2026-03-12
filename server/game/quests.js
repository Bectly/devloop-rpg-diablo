/**
 * Quest System — generates and tracks per-player quests
 *
 * Architecture (designed by Aria, Cycle #11):
 * - QuestManager is per-player (each player has own quest state)
 * - Quests auto-generate on floor entry (3-5 per floor)
 * - Progress tracked via check() calls from index.js event handlers
 * - Rewards claimed manually via phone UI
 *
 * Quest types:
 *   kill_count  — Kill N total monsters
 *   kill_type   — Kill N of specific monster type (skeleton, demon, etc.)
 *   reach_floor — Reach floor N
 *   clear_rooms — Clear N rooms on current floor
 *   collect_gold — Collect N gold total
 *   use_shrine  — Use a healing shrine
 *   buy_item    — Buy an item from shop
 *
 * Bolt: Implement the TODOs below in Cycle #12
 */

const { v4: uuidv4 } = require('uuid');
const { generateItem } = require('./items');

// Quest templates — scaled by floor
const QUEST_TEMPLATES = [
  { type: 'kill_count', title: 'Monster Slayer', desc: 'Kill {target} monsters', baseTarget: 5, perFloor: 2 },
  { type: 'kill_type', title: 'Hunter: {subtype}', desc: 'Kill {target} {subtype}s', baseTarget: 3, perFloor: 1 },
  { type: 'clear_rooms', title: 'Dungeon Explorer', desc: 'Clear {target} rooms', baseTarget: 2, perFloor: 1 },
  { type: 'collect_gold', title: 'Gold Rush', desc: 'Collect {target} gold', baseTarget: 50, perFloor: 25 },
  { type: 'reach_floor', title: 'Deeper Still', desc: 'Reach floor {target}', baseTarget: 0, perFloor: 0 }, // target = current + 1
  { type: 'use_shrine', title: 'Sacred Touch', desc: 'Use a healing shrine', baseTarget: 1, perFloor: 0 },
];

const MONSTER_TYPES_FOR_QUESTS = ['skeleton', 'zombie', 'demon', 'archer', 'slime'];

class QuestManager {
  constructor() {
    this.quests = []; // active quests
    this.completedIds = new Set(); // IDs of all-time completed quests
  }

  /**
   * Generate new quests for a floor. Called on floor entry.
   * @param {number} floor - current floor number
   * @returns {object[]} - newly generated quests
   */
  generateForFloor(floor) {
    // TODO: Bolt implement
    // Pick 3-5 random templates, scale targets by floor, add to this.quests
    // Don't duplicate active quest types
    // Return the new quests array
    const count = 3 + Math.floor(Math.random() * 3); // 3-5
    const available = QUEST_TEMPLATES.filter(t => !this.quests.some(q => q.type === t.type && !q.completed));
    const picked = [];

    for (let i = 0; i < count && available.length > 0; i++) {
      const idx = Math.floor(Math.random() * available.length);
      const template = available.splice(idx, 1)[0];

      let target = template.baseTarget + template.perFloor * floor;
      let title = template.title;
      let desc = template.desc;
      let subtype = null;

      if (template.type === 'reach_floor') {
        target = floor + 2; // reach 2 floors deeper
      }

      if (template.type === 'kill_type') {
        subtype = MONSTER_TYPES_FOR_QUESTS[Math.floor(Math.random() * MONSTER_TYPES_FOR_QUESTS.length)];
        title = title.replace('{subtype}', subtype.charAt(0).toUpperCase() + subtype.slice(1));
        desc = desc.replace('{subtype}', subtype);
      }

      const quest = {
        id: uuidv4(),
        type: template.type,
        title: title.replace('{target}', target),
        description: desc.replace('{target}', target),
        target,
        subtype,
        progress: 0,
        reward: this._generateReward(floor, template.type),
        completed: false,
        claimed: false,
        floor,
      };

      this.quests.push(quest);
      picked.push(quest);
    }

    return picked;
  }

  /**
   * Check quest progress against an event.
   * @param {string} event - event type (kill, clear_room, reach_floor, collect_gold, use_shrine, buy_item)
   * @param {object} data - event data
   * @returns {object[]} - quests that changed (for UI update)
   */
  check(event, data = {}) {
    const changed = [];

    for (const quest of this.quests) {
      if (quest.completed || quest.claimed) continue;

      let increment = 0;

      switch (quest.type) {
        case 'kill_count':
          if (event === 'kill') increment = 1;
          break;
        case 'kill_type':
          if (event === 'kill' && data.type === quest.subtype) increment = 1;
          break;
        case 'clear_rooms':
          if (event === 'clear_room') increment = 1;
          break;
        case 'collect_gold':
          if (event === 'collect_gold') increment = data.amount || 0;
          break;
        case 'reach_floor':
          if (event === 'reach_floor' && data.floor >= quest.target) {
            quest.progress = quest.target;
            quest.completed = true;
            this.completedIds.add(quest.id);
            changed.push(quest);
            continue;
          }
          break;
        case 'use_shrine':
          if (event === 'use_shrine') increment = 1;
          break;
        case 'buy_item':
          if (event === 'buy_item') increment = 1;
          break;
      }

      if (increment > 0) {
        quest.progress = Math.min(quest.target, quest.progress + increment);
        if (quest.progress >= quest.target) {
          quest.completed = true;
          this.completedIds.add(quest.id);
        }
        changed.push(quest);
      }
    }

    return changed;
  }

  /**
   * Claim reward for completed quest.
   * @param {string} questId
   * @returns {{ gold: number, item?: object } | null}
   */
  claimReward(questId) {
    const quest = this.quests.find(q => q.id === questId);
    if (!quest || !quest.completed || quest.claimed) return null;
    quest.claimed = true;
    return quest.reward;
  }

  /**
   * Get all active (unclaimed) quests for phone display.
   */
  getActiveQuests() {
    return this.quests.filter(q => !q.claimed).map(q => ({
      id: q.id,
      title: q.title,
      description: q.description,
      progress: q.progress,
      target: q.target,
      completed: q.completed,
      reward: q.reward,
      type: q.type,
    }));
  }

  /**
   * Generate reward based on floor and quest difficulty.
   */
  _generateReward(floor, questType) {
    const baseGold = { kill_count: 30, kill_type: 40, clear_rooms: 50, collect_gold: 20, reach_floor: 80, use_shrine: 15, buy_item: 10 };
    const gold = (baseGold[questType] || 25) + floor * 10;
    const reward = { gold };

    // 30% chance for item reward on harder quests
    if (Math.random() < 0.3 && ['kill_type', 'clear_rooms', 'reach_floor'].includes(questType)) {
      reward.item = generateItem(floor, Math.random() < 0.5 ? 'weapon' : 'armor');
    }

    return reward;
  }

  /**
   * Serialize for persistence.
   */
  serialize() {
    return {
      quests: this.quests,
      completedIds: [...this.completedIds],
    };
  }
}

module.exports = { QuestManager, QUEST_TEMPLATES };
