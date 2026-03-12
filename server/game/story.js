// Dialogue and quest system

const NPCS = {
  old_sage: {
    id: 'old_sage',
    name: 'Old Sage',
    x: 640,
    y: 150,
    dialogues: {
      intro: {
        text: 'Welcome, brave adventurers. The crypt below is infested with the undead. I need your help to clear it.',
        choices: [
          { text: 'We accept the challenge.', next: 'accept_quest', action: 'start_quest:clear_crypt' },
          { text: 'What happened here?', next: 'lore' },
          { text: 'Not now.', next: null },
        ],
      },
      lore: {
        text: 'A dark knight raised an army of the dead. He lurks in the deepest chamber. Defeat him, and the curse will break.',
        choices: [
          { text: 'We will end this.', next: 'accept_quest', action: 'start_quest:clear_crypt' },
          { text: 'We need to prepare first.', next: null },
        ],
      },
      accept_quest: {
        text: 'Excellent. Here, take these potions. You will need them. Return to me when the dark knight falls.',
        choices: [
          { text: 'Thank you.', next: null, action: 'give_items:health_potion:3' },
        ],
      },
      quest_complete: {
        text: 'You have done it! The curse is lifted. Take this reward — you have earned it.',
        choices: [
          { text: 'It was nothing.', next: null, action: 'give_items:epic_weapon' },
        ],
      },
    },
  },
  merchant: {
    id: 'merchant',
    name: 'Wandering Merchant',
    x: 400,
    y: 550,
    dialogues: {
      intro: {
        text: 'Psst... looking for supplies? I have potions and gear. Everything at a fair price, of course.',
        choices: [
          { text: 'Show me your wares. (Open Shop)', next: null, action: 'open_shop' },
          { text: 'Maybe later.', next: null },
        ],
      },
    },
  },
  shrine_guardian: {
    id: 'shrine_guardian',
    name: 'Shrine Guardian',
    x: 0,
    y: 0,
    dialogues: {
      intro: {
        text: 'The ancient power here responds to those who prove themselves. Clear every room, and the shrine shall grant you its full blessing.',
        choices: [
          { text: 'I will clear this floor.', next: 'accepted' },
          { text: 'Just heal me.', next: null },
        ],
      },
      accepted: {
        text: 'Go forth, warrior. Return when every shadow is banished from these halls.',
        choices: [
          { text: 'It will be done.', next: null },
        ],
      },
    },
  },
  floor_herald: {
    id: 'floor_herald',
    name: 'Dying Adventurer',
    x: 0,
    y: 0,
    dialogues: {
      intro: {
        text: 'Turn back... the dark knight below is unlike anything... *cough* ...he has three forms. Each more deadly than the last.',
        choices: [
          { text: 'What are his weaknesses?', next: 'weakness' },
          { text: 'Rest easy. We will finish this.', next: null },
        ],
      },
      weakness: {
        text: 'In his first form, he charges. Dodge sideways. In his rage form, he is slow but devastating. His final form... I could not see it.',
        choices: [
          { text: 'Thank you. Your sacrifice won\'t be in vain.', next: null, action: 'give_items:health_potion:2' },
        ],
      },
    },
  },
};

const QUESTS = {
  clear_crypt: {
    id: 'clear_crypt',
    name: 'Clear the Crypt',
    description: 'Defeat the Dark Knight in the Boss Arena.',
    objectives: [
      { type: 'kill', target: 'boss_knight', count: 1, current: 0, description: 'Defeat the Dark Knight' },
    ],
    rewards: {
      xp: 500,
      gold: 100,
    },
    status: 'inactive', // inactive, active, complete
  },
};

class StoryManager {
  constructor() {
    this.quests = {};
    // Deep clone quests
    for (const [key, quest] of Object.entries(QUESTS)) {
      this.quests[key] = JSON.parse(JSON.stringify(quest));
    }
    this.npcs = { ...NPCS };
  }

  startQuest(questId) {
    const quest = this.quests[questId];
    if (!quest || quest.status !== 'inactive') return null;
    quest.status = 'active';
    return quest;
  }

  updateQuest(eventType, target) {
    const results = [];
    for (const quest of Object.values(this.quests)) {
      if (quest.status !== 'active') continue;
      for (const obj of quest.objectives) {
        if (obj.type === eventType && obj.target === target && obj.current < obj.count) {
          obj.current += 1;
          results.push({ questId: quest.id, objective: obj.description, current: obj.current, total: obj.count });

          // Check if quest complete
          if (quest.objectives.every(o => o.current >= o.count)) {
            quest.status = 'complete';
            results.push({ questId: quest.id, complete: true, rewards: quest.rewards });
          }
        }
      }
    }
    return results;
  }

  getNpcDialogue(npcId, dialogueKey) {
    const npc = this.npcs[npcId];
    if (!npc) return null;

    const key = dialogueKey || 'intro';
    const dialogue = npc.dialogues[key];
    if (!dialogue) return null;

    return {
      npcId: npc.id,
      npcName: npc.name,
      dialogueKey: key,
      text: dialogue.text,
      choices: dialogue.choices.map((c, i) => ({
        index: i,
        text: c.text,
        hasAction: !!c.action,
      })),
    };
  }

  processDialogueChoice(npcId, dialogueKey, choiceIndex) {
    const npc = this.npcs[npcId];
    if (!npc) return { next: null, actions: [] };

    const key = dialogueKey || 'intro';
    const dialogue = npc.dialogues[key];
    if (!dialogue) return { next: null, actions: [] };

    const choice = dialogue.choices[choiceIndex];
    if (!choice) return { next: null, actions: [] };

    const actions = [];
    if (choice.action) {
      const parts = choice.action.split(':');
      if (parts[0] === 'start_quest') {
        actions.push({ type: 'start_quest', questId: parts[1] });
      } else if (parts[0] === 'give_items') {
        actions.push({ type: 'give_items', itemType: parts[1], count: parseInt(parts[2]) || 1 });
      } else if (parts[0] === 'open_shop') {
        actions.push({ type: 'open_shop' });
      }
    }

    return { next: choice.next || null, actions };
  }

  placeNpcs(placements) {
    // placements = [{id: 'old_sage', x: 100, y: 200}, ...]
    for (const placement of placements) {
      if (this.npcs[placement.id]) {
        this.npcs[placement.id].x = placement.x;
        this.npcs[placement.id].y = placement.y;
      }
    }
  }

  getActiveQuests() {
    return Object.values(this.quests).filter(q => q.status === 'active');
  }

  serialize() {
    return {
      quests: Object.values(this.quests).map(q => ({
        id: q.id,
        name: q.name,
        description: q.description,
        status: q.status,
        objectives: q.objectives.map(o => ({
          description: o.description,
          current: o.current,
          total: o.count,
        })),
      })),
      npcs: Object.values(this.npcs).map(n => ({
        id: n.id,
        name: n.name,
        x: n.x,
        y: n.y,
      })),
    };
  }
}

module.exports = { StoryManager, NPCS, QUESTS };
