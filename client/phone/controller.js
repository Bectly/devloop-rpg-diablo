// ─── DevLoop RPG — Phone Controller ──────────────────────────────

const socket = io('/controller', {
  transports: ['websocket', 'polling'],
});

let playerId = null;
let playerStats = null;
let inventoryData = null;
let selectedClass = 'warrior';
let joinedName = null;   // cached at join time so reconnect uses correct name
let currentDialogue = null;
let typewriterInterval = null;
let staggerTimeouts = [];
let joystick = null;
let skillCooldownTimers = [0, 0, 0];
let currentFloor = 0;
let currentFloorName = '';
let currentZoneId = 'catacombs';
let currentZoneName = '';

const ZONE_COLORS = {
  catacombs: '#aaaacc',
  inferno: '#ff6622',
  abyss: '#8844dd',
};
let buttonsInitialized = false;
let notificationCount = 0;
let shopData = null;
let questData = [];
// encounteredElites moved to reconnect.js (Reconnect.encounteredElites)

// ─── DOM Elements ───────────────────────────────────────────────
const joinScreen = document.getElementById('join-screen');
const controller = document.getElementById('controller');
const inventoryScreen = document.getElementById('inventory-screen');
const dialogueScreen = document.getElementById('dialogue-screen');

DeathVictory.init(socket);

// ─── Join Screen — Class Card Selection ─────────────────────────
document.querySelectorAll('.class-card').forEach(card => {
  card.addEventListener('touchstart', (e) => {
    e.preventDefault();
    document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedClass = card.dataset.class;
  });
  // Fallback for desktop testing
  card.addEventListener('click', () => {
    document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedClass = card.dataset.class;
  });
});

document.getElementById('btn-join').addEventListener('touchstart', (e) => {
  e.preventDefault();
  Sound.unlock();
  joinedName = document.getElementById('name-input').value.trim() || 'Hero';
  socket.emit('join', { name: joinedName, characterClass: selectedClass });
});
// Fallback for desktop testing
document.getElementById('btn-join').addEventListener('click', () => {
  Sound.unlock();
  joinedName = document.getElementById('name-input').value.trim() || 'Hero';
  socket.emit('join', { name: joinedName, characterClass: selectedClass });
});

// ─── Socket Events ──────────────────────────────────────────────
socket.on('connect', () => {
  console.log('[Phone] Connected');

  const wasReconnect = Reconnect.onConnect();
  if (wasReconnect) {
    // Re-join automatically if we had an active session.
    // Use joinedName (cached at join time) — NOT the input field, which may
    // have been cleared or may show the join screen placeholder.
    if (playerId && joinedName) {
      socket.emit('join', { name: joinedName, characterClass: selectedClass });
    }
  }
});

socket.on('joined', (data) => {
  playerId = data.playerId;
  playerStats = data.stats;
  inventoryData = data.inventory;
  currentFloor = data.floor || 0;
  currentFloorName = data.floorName || '';
  questData = data.quests || [];
  Screens.setQuestContext(questData, socket);

  joinScreen.classList.add('hidden');
  controller.classList.remove('hidden');

  updateHUD(data.stats);
  updateFloorDisplay();
  initJoystick();
  initButtons();

  // Request wake lock after user gesture (join) to keep screen on during play
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').catch(() => {});
  }
});

let _prevSetBonusKeys = new Set();

socket.on('stats:update', (data) => {
  // Detect newly activated set bonuses
  if (data.activeSets && data.activeSets.length > 0) {
    const currKeys = new Set();
    for (const as of data.activeSets) {
      if (!as.bonuses) continue;
      for (const b of as.bonuses) {
        if (b.active) currKeys.add(`${as.setId}:${b.threshold}`);
      }
    }
    for (const key of currKeys) {
      if (!_prevSetBonusKeys.has(key)) {
        const [setId, threshold] = key.split(':');
        const as = data.activeSets.find(s => s.setId === setId);
        if (as) {
          const isComplete = as.pieces >= as.totalPieces;
          const bonus = as.bonuses.find(b => b.threshold === parseInt(threshold));
          const text = isComplete
            ? `\uD83C\uDFDB ${as.name} Set Complete! (${as.pieces}/${as.totalPieces})`
            : `\u2694 ${as.name} (${as.pieces}/${as.totalPieces}) \u2014 ${bonus ? bonus.description : ''}`;
          showNotification(text, 'set_bonus');
          if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
        }
      }
    }
    _prevSetBonusKeys = currKeys;
  } else {
    _prevSetBonusKeys = new Set();
  }

  playerStats = data;
  updateHUD(data);
});

socket.on('inventory:update', (data) => {
  inventoryData = data;
  if (!inventoryScreen.classList.contains('hidden')) {
    renderInventory();
  }
  // Update crafting screen if open
  Screens.updateCraftingInventory(data);
});

socket.on('notification', (data) => {
  if (data.type === 'save') {
    showSaveToast(data.text);
    return;
  }
  if (data.type === 'quest') Sound.questComplete();
  else if (data.type === 'levelup') Sound.levelUp();
  else if (data.type === 'gold' || (data.text && data.text.toLowerCase().includes('gold'))) Sound.gold();
  // welcome_back comes from server after reconnect grace-period restore
  showNotification(data.text, data.type);
});

socket.on('dialogue:prompt', (data) => {
  showDialogue(data);
});

socket.on('dialogue:end', () => {
  currentDialogue = null;
  if (typewriterInterval) {
    clearInterval(typewriterInterval);
    typewriterInterval = null;
  }
  staggerTimeouts.forEach(id => clearTimeout(id));
  staggerTimeouts = [];
  const textEl = document.getElementById('dialogue-text');
  if (textEl) textEl.classList.remove('typing');
  dialogueScreen.classList.add('hidden');
  _hideSyncBar();
});

let _syncTimerInterval = null;
function _hideSyncBar() {
  const el = document.getElementById('dialogue-sync');
  if (el) el.classList.add('hidden');
  if (_syncTimerInterval) { clearInterval(_syncTimerInterval); _syncTimerInterval = null; }
}

socket.on('dialogue:sync', (data) => {
  const el = document.getElementById('dialogue-sync');
  if (!el) return;

  if (data.resolved) {
    _hideSyncBar();
    return;
  }

  el.classList.remove('hidden');

  // Update dots — voted players get green dot
  const dot1 = document.getElementById('dialogue-sync-dot-1');
  const dot2 = document.getElementById('dialogue-sync-dot-2');
  if (dot1) dot1.classList.toggle('voted', data.votedPlayers.length >= 1);
  if (dot2) dot2.classList.toggle('voted', data.votedPlayers.length >= 2);

  const label = document.getElementById('dialogue-sync-label');
  if (label) label.textContent = data.votedPlayers.length === 1
    ? `${data.votedPlayers[0]} voted — waiting...`
    : 'Both voted!';

  // Countdown timer
  if (_syncTimerInterval) clearInterval(_syncTimerInterval);
  const timerEl = document.getElementById('dialogue-sync-timer');
  let remaining = data.timeout || 10;
  if (timerEl) timerEl.textContent = `${remaining}s`;
  _syncTimerInterval = setInterval(() => {
    remaining--;
    if (timerEl) timerEl.textContent = remaining > 0 ? `${remaining}s` : '';
    if (remaining <= 0) { clearInterval(_syncTimerInterval); _syncTimerInterval = null; }
  }, 1000);
});

socket.on('floor:change', (data) => {
  currentFloor = data.floor;
  currentFloorName = data.floorName || '';
  currentZoneId = data.zoneId || 'catacombs';
  currentZoneName = data.zoneName || '';
  Reconnect.clearElites();
  updateFloorDisplay();
});

socket.on('damage:taken', (data) => {
  Sound.playerHurt();
  flashDamage();

  // Elite encounter notification — show once per elite
  if (Reconnect.handleEliteEncounter(data)) {
    const affixList = (data.affixes || []).join(', ');
    if (data.eliteRank === 'rare') {
      showNotification(`\u{1F480} Rare ${data.monsterName} \u2014 ${affixList}`, 'elite_rare');
    } else {
      showNotification(`\u2694 Champion ${data.monsterName} \u2014 ${affixList}`, 'elite_champion');
    }
    if (navigator.vibrate) navigator.vibrate([60, 30, 60, 30, 100]);
  }
});

socket.on('player:death', (data) => {
  DeathVictory.showDeathScreen(data.deathTimer, data.goldDropped);
});

socket.on('player:respawn', (data) => {
  DeathVictory.hideDeathScreen();
});

socket.on('shop:inventory', (data) => {
  shopData = data;
  Screens.toggleShop(shopData, inventoryData, socket, hapticFeedback, () => { shopData = null; });
});

// ── Crafting events ──
socket.on('craft:reforge_result', (data) => {
  Screens.handleReforgeResult(data);
});

socket.on('quest:update', (quests) => {
  // Detect newly completed quests by comparing against previous state
  const prevCompletedIds = new Set(questData.filter(q => q.completed).map(q => q.id));
  const newlyCompleted = quests.filter(q => q.completed && !q.claimed && !prevCompletedIds.has(q.id));

  questData = quests;
  Screens.setQuestContext(questData, socket);

  if (newlyCompleted.length > 0) {
    // Flash the QST button only for genuinely new completions
    const qstBtn = document.getElementById('btn-quests');
    if (qstBtn) {
      qstBtn.classList.add('quest-flash');
      setTimeout(() => qstBtn.classList.remove('quest-flash'), 1500);
    }
  }
  // If quest screen is visible, re-render
  const screen = document.getElementById('quest-screen');
  if (screen && !screen.classList.contains('hidden')) {
    Screens.renderQuests(questData, socket);
  }
  Screens.updateQuestBadge(questData);
});

socket.on('quest:claimed', (data) => {
  showNotification(`Quest complete! +${data.gold}g${data.item ? ' + ' + data.item.name : ''}`, 'legendary');
  // Re-render and update badge
  Screens.renderQuests(questData, socket);
  Screens.updateQuestBadge(questData);
});

socket.on('chat:message', (data) => {
  ChatUI.showChatMessage(data.name, data.text);
});

socket.on('leaderboard:data', (data) => {
  Screens.renderLeaderboard(data.entries, data.type);
});

socket.on('game:victory', (data) => {
  console.log('[Phone] VICTORY!', data);

  // Dismiss any open dialogue to prevent overlay stacking
  if (dialogueScreen && !dialogueScreen.classList.contains('hidden')) {
    dialogueScreen.style.display = 'none';
    currentDialogue = null;
    if (typewriterInterval) {
      clearInterval(typewriterInterval);
      typewriterInterval = null;
    }
    staggerTimeouts.forEach(id => clearTimeout(id));
    staggerTimeouts = [];
    const textEl = document.getElementById('dialogue-text');
    if (textEl) textEl.classList.remove('typing');
    _hideSyncBar();
  }

  Sound.victory();

  // Victory haptic pattern
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

  DeathVictory.showVictoryScreen(data);
});

socket.on('game:restarted', () => {
  DeathVictory.hideVictoryScreen();
});

// ─── Reconnect Overlay — delegated to reconnect.js (window.Reconnect) ──
socket.on('disconnect', () => {
  console.log('[Phone] Disconnected');
  Reconnect.onDisconnect();
});

// ─── Floor Display ──────────────────────────────────────────────
function updateFloorDisplay() {
  const el = document.getElementById('hud-floor');
  if (el) {
    el.textContent = `F${currentFloor + 1}`;
    el.title = `${currentFloorName} — ${currentZoneName}`;
    el.style.color = ZONE_COLORS[currentZoneId] || '#aaaacc';
  }
}

// ─── Damage Flash ───────────────────────────────────────────────
function flashDamage() {
  const overlay = document.getElementById('damage-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  overlay.style.opacity = '0.4';

  // Haptic
  if (navigator.vibrate) navigator.vibrate(40);

  setTimeout(() => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.classList.add('hidden'), 200);
  }, 100);
}

// ─── HUD Update ─────────────────────────────────────────────────
function updateHUD(stats) {
  if (!stats) return;

  document.getElementById('hud-name').textContent = stats.name;
  document.getElementById('hud-level').textContent = `Lv.${stats.level}`;

  // HP bar with label and color class
  const hpPct = (stats.hp / stats.maxHp) * 100;
  const hpBar = document.getElementById('hp-bar');
  hpBar.style.width = hpPct + '%';
  hpBar.className = 'stat-bar hp' + (hpPct < 25 ? ' low' : hpPct < 50 ? ' mid' : '');
  document.getElementById('hp-label').textContent = `${stats.hp}/${stats.maxHp}`;

  // MP bar with label
  const mpPct = (stats.mp / stats.maxMp) * 100;
  document.getElementById('mp-bar').style.width = mpPct + '%';
  document.getElementById('mp-label').textContent = `${stats.mp}/${stats.maxMp}`;

  // XP bar with label
  const xpPct = stats.xpToNext > 0 ? Math.round((stats.xp / stats.xpToNext) * 100) : 0;
  document.getElementById('xp-bar').style.width = xpPct + '%';
  document.getElementById('xp-label').textContent = `${xpPct}%`;

  // Skill button labels + cooldowns
  if (stats.skills) {
    for (let i = 0; i < 3; i++) {
      const btn = document.getElementById(`btn-skill-${i}`);
      if (!btn || !stats.skills[i]) continue;
      const skill = stats.skills[i];
      const remaining = skill.cooldownRemaining || 0;

      btn.title = skill.description;

      if (remaining > 0) {
        // On cooldown: show timer overlay
        btn.classList.add('on-cooldown');
        // Set base label (short name + mp cost)
        btn.innerHTML = '';
        const nameEl = document.createElement('span');
        nameEl.className = 'skill-label';
        nameEl.textContent = skill.shortName || skill.name.substring(0, 3).toUpperCase();
        btn.appendChild(nameEl);
        const mpEl = document.createElement('span');
        mpEl.className = 'skill-mp-cost';
        mpEl.textContent = skill.mpCost;
        btn.appendChild(mpEl);
        // Cooldown overlay
        let overlay = btn.querySelector('.cooldown-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.className = 'cooldown-overlay';
          btn.appendChild(overlay);
        }
        overlay.textContent = (remaining / 1000).toFixed(1);
      } else {
        // Ready: show skill name + mp cost
        btn.classList.remove('on-cooldown');
        const overlay = btn.querySelector('.cooldown-overlay');
        if (overlay) overlay.remove();
        btn.innerHTML = '';
        const nameEl = document.createElement('span');
        nameEl.className = 'skill-label';
        nameEl.textContent = skill.shortName || skill.name.substring(0, 3).toUpperCase();
        btn.appendChild(nameEl);
        const mpEl = document.createElement('span');
        mpEl.className = 'skill-mp-cost';
        mpEl.textContent = skill.mpCost;
        btn.appendChild(mpEl);
      }
    }
  }

  // Check if respawned
  if (DeathVictory.isDead() && stats.alive && !stats.isDying) {
    DeathVictory.hideDeathScreen();
  }

  // Update debuff indicators
  Reconnect.updateDebuffDisplay(stats.debuffs || []);

  updateFloorDisplay();
}

// ─── Debuff Display — delegated to reconnect.js (Reconnect.updateDebuffDisplay) ──

// ─── Joystick ───────────────────────────────────────────────────
function initJoystick() {
  if (joystick) return;

  joystick = nipplejs.create({
    zone: document.getElementById('joystick-zone'),
    mode: 'dynamic',
    position: { left: '50%', top: '50%' },
    color: '#ff880066',
    size: 120,
    restOpacity: 0.5,
    fadeTime: 100,
  });

  joystick.on('move', (evt, data) => {
    if (!data || !data.vector || DeathVictory.isDead()) return;
    socket.emit('move', {
      dx: data.vector.x,
      dy: -data.vector.y,
    });
  });

  joystick.on('end', () => {
    socket.emit('move:stop');
  });
}

// ─── Action Buttons ─────────────────────────────────────────────
function initButtons() {
  if (buttonsInitialized) return;
  buttonsInitialized = true;

  // Attack
  document.getElementById('btn-attack').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (DeathVictory.isDead()) return;
    Sound.hit(0.3);
    socket.emit('attack');
    hapticFeedback();
  });
  document.getElementById('btn-attack').addEventListener('click', () => {
    if (DeathVictory.isDead()) return;
    Sound.hit(0.3);
    socket.emit('attack');
  });

  // Skills
  for (let i = 0; i < 3; i++) {
    document.getElementById(`btn-skill-${i}`).addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (DeathVictory.isDead()) return;
      socket.emit('skill', { skillIndex: i });
      hapticFeedback();
    });
    document.getElementById(`btn-skill-${i}`).addEventListener('click', () => {
      if (DeathVictory.isDead()) return;
      socket.emit('skill', { skillIndex: i });
    });
  }

  // Health Potion
  document.getElementById('btn-potion').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (DeathVictory.isDead()) return;
    socket.emit('use:potion', { type: 'health' });
  });
  document.getElementById('btn-potion').addEventListener('click', () => {
    if (DeathVictory.isDead()) return;
    socket.emit('use:potion', { type: 'health' });
  });

  // Interact
  document.getElementById('btn-interact').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (DeathVictory.isDead()) return;
    socket.emit('interact');
  });
  document.getElementById('btn-interact').addEventListener('click', () => {
    if (DeathVictory.isDead()) return;
    socket.emit('interact');
  });

  // Pickup (LOOT button)
  document.getElementById('btn-pickup').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (DeathVictory.isDead()) return;
    Sound.uiClick();
    socket.emit('loot:pickup_nearest');
  });
  document.getElementById('btn-pickup').addEventListener('click', () => {
    if (DeathVictory.isDead()) return;
    Sound.uiClick();
    socket.emit('loot:pickup_nearest');
  });

  // Inventory
  document.getElementById('btn-inventory').addEventListener('touchstart', (e) => {
    e.preventDefault();
    openInventory();
  });
  document.getElementById('btn-inventory').addEventListener('click', () => {
    openInventory();
  });

  // Quests
  document.getElementById('btn-quests').addEventListener('touchstart', (e) => {
    e.preventDefault();
    Screens.toggleQuestLog();
  });
  document.getElementById('btn-quests').addEventListener('click', (e) => {
    e.preventDefault();
    Screens.toggleQuestLog();
  });

  // Crafting
  document.getElementById('btn-craft').addEventListener('touchstart', (e) => {
    e.preventDefault();
    Screens.toggleCrafting(inventoryData, socket, hapticFeedback, () => {});
  });
  document.getElementById('btn-craft').addEventListener('click', () => {
    Screens.toggleCrafting(inventoryData, socket, hapticFeedback, () => {});
  });

  // Chat toggle
  const chatBtn = document.getElementById('btn-chat');
  if (chatBtn) {
    chatBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      ChatUI.toggleChatInput();
    });
    chatBtn.addEventListener('click', () => ChatUI.toggleChatInput());
  }

  // Leaderboard
  const ldbBtn = document.getElementById('btn-leaderboard');
  if (ldbBtn) {
    ldbBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      Screens.toggleLeaderboard(socket);
    });
    ldbBtn.addEventListener('click', () => Screens.toggleLeaderboard(socket));
  }
}

// ─── Haptic Feedback ────────────────────────────────────────────
function hapticFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(30);
  }
}

// ─── Notifications — Toast Style ────────────────────────────────
function showNotification(text, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `notification-toast ${type}`;
  toast.textContent = text;

  // Stack notifications vertically: offset by number of active toasts
  const activeToasts = document.querySelectorAll('.notification-toast');
  const stackOffset = activeToasts.length * 46; // ~46px per toast (height + gap)
  toast.style.top = (60 + stackOffset) + 'px';

  document.body.appendChild(toast);

  if (type === 'legendary' || type === 'epic' || type === 'levelup') {
    if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
  }

  setTimeout(() => toast.remove(), 2500);
}
window.showNotification = showNotification;

// ─── Save Toast — Subtle, bottom-right, short-lived ─────────
function showSaveToast(text) {
  const toast = document.createElement('div');
  toast.className = 'toast-save';
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2000);
}

// ─── Chat — delegated to chat-ui.js (window.ChatUI) ──────────
ChatUI.init(socket);

// ─── Inventory ──────────────────────────────────────────────────
function openInventory() {
  socket.emit('inventory:request');
  inventoryScreen.classList.remove('hidden');
  renderInventory();
}

document.getElementById('inv-close').addEventListener('touchstart', (e) => {
  e.preventDefault();
  inventoryScreen.classList.add('hidden');
  hideTooltip();
});
// Fallback for desktop
document.getElementById('inv-close').addEventListener('click', () => {
  inventoryScreen.classList.add('hidden');
  hideTooltip();
});

function renderInventory() {
  if (!inventoryData || !playerStats) return;

  document.getElementById('inv-gold').textContent = `${playerStats.gold || 0}g`;

  // Equipment slots
  const slots = document.querySelectorAll('.equip-slot');
  slots.forEach(slotEl => {
    const slotName = slotEl.dataset.slot;
    const item = playerStats.equipment[slotName];
    if (item) {
      slotEl.textContent = item.name;
      slotEl.style.color = item.rarityColor || '#aaa';
      slotEl.style.borderColor = item.rarityColor || '#555';
      slotEl.classList.add('filled');
      slotEl.onclick = () => {
        showTooltip(item, slotEl, true, slotName);
      };
    } else {
      slotEl.textContent = slotName.charAt(0).toUpperCase() + slotName.slice(1);
      slotEl.style.color = '#666';
      slotEl.style.borderColor = '';
      slotEl.classList.remove('filled');
      slotEl.onclick = null;
    }
  });

  // Grid
  const grid = document.getElementById('inv-grid');
  grid.innerHTML = '';

  const rows = inventoryData.rows || 6;
  const cols = inventoryData.cols || 10;
  const rendered = new Set();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = document.createElement('div');
      cell.classList.add('inv-cell');
      cell.dataset.row = r;
      cell.dataset.col = c;

      const itemId = inventoryData.grid[r]?.[c];
      if (itemId && !rendered.has(itemId)) {
        const item = inventoryData.items.find(i => i.id === itemId);
        if (item) {
          cell.classList.add('occupied', 'item-origin');
          cell.style.borderColor = item.rarityColor || '#444';
          cell.textContent = item.stackable ? `${item.name} x${item.quantity}` : item.name.substring(0, 6);
          cell.style.color = item.rarityColor || '#ddd';
          cell.onclick = () => showTooltip(item, cell, false);
          rendered.add(itemId);
        }
      } else if (itemId) {
        cell.classList.add('occupied');
        cell.style.borderColor = '';
      }

      grid.appendChild(cell);
    }
  }

  renderStats();
}

// ─── Stats & Tooltip — delegated to stats-ui.js (StatsUI) ──────
function renderStats() {
  StatsUI.renderStats(playerStats, socket);
}

function showTooltip(item, anchor, isEquipped, slotName) {
  StatsUI.showTooltip(item, anchor, isEquipped, slotName, playerStats, socket);
}

function hideTooltip() {
  StatsUI.hideTooltip();
}

// Initialize StatsUI socket reference
StatsUI.setSocket(socket);

// ─── Dialogue ───────────────────────────────────────────────────
function showDialogue(data) {
  Sound.dialogueOpen();
  currentDialogue = data;
  dialogueScreen.classList.remove('hidden');

  // Clear any running typewriter from a previous prompt
  if (typewriterInterval) {
    clearInterval(typewriterInterval);
    typewriterInterval = null;
  }
  staggerTimeouts.forEach(id => clearTimeout(id));
  staggerTimeouts = [];

  document.getElementById('dialogue-npc-name').textContent = data.npcName;

  // Set NPC type for color styling
  const box = document.getElementById('dialogue-box');
  if (box) {
    if (data.npcId.includes('merchant') || data.npcId.includes('shop')) {
      box.setAttribute('data-npc-type', 'shop');
    } else if (data.npcId.includes('shrine')) {
      box.setAttribute('data-npc-type', 'shrine');
    } else if (data.npcId.includes('boss')) {
      box.setAttribute('data-npc-type', 'boss');
    } else {
      box.setAttribute('data-npc-type', 'lore');
    }
  }

  // ── Typewriter text reveal ──
  const textEl = document.getElementById('dialogue-text');
  const fullText = data.text;
  let charIndex = 0;
  textEl.textContent = '';
  textEl.classList.add('typing');

  // Build choices (hidden) while typewriter runs
  const choicesEl = document.getElementById('dialogue-choices');
  choicesEl.innerHTML = '';
  const buttons = [];

  for (const choice of data.choices) {
    const btn = document.createElement('button');
    btn.classList.add('dialogue-choice', 'dialogue-choice-hidden');
    btn.textContent = choice.text;
    const dialogueHandler = () => {
      Sound.uiClick();
      if (navigator.vibrate) navigator.vibrate(15);
      socket.emit('dialogue:choose', {
        npcId: data.npcId,
        dialogueKey: data.dialogueKey || 'intro',
        choiceIndex: choice.index,
      });
      // Don't hide here — server will send dialogue:prompt (follow-up)
      // or dialogue:end (conversation over). Disable buttons to prevent
      // double-taps while waiting for server response.
      btn.classList.add('chosen');
      choicesEl.querySelectorAll('button').forEach(b => {
        b.disabled = true;
        if (b !== btn) b.classList.add('dialogue-choice-disabled');
      });
    };
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      dialogueHandler();
    });
    // Fallback for desktop
    btn.addEventListener('click', dialogueHandler);
    choicesEl.appendChild(btn);
    buttons.push(btn);
  }

  // Reveal ~3 chars per tick at 30ms
  typewriterInterval = setInterval(() => {
    charIndex = Math.min(charIndex + 3, fullText.length);
    textEl.textContent = fullText.slice(0, charIndex);

    if (charIndex >= fullText.length) {
      clearInterval(typewriterInterval);
      typewriterInterval = null;
      textEl.classList.remove('typing');

      // Staggered choice fade-in
      buttons.forEach((btn, i) => {
        const tid = setTimeout(() => btn.classList.remove('dialogue-choice-hidden'), i * 50);
        staggerTimeouts.push(tid);
      });
    }
  }, 30);
}


// ─── Sound mute toggle ──────────────────────────────────────────
const soundBtn = document.getElementById('btn-sound');
if (soundBtn) {
  const toggleSound = () => {
    const isOn = Sound.toggle();
    soundBtn.classList.toggle('muted', !isOn);
    soundBtn.textContent = isOn ? '\u266B' : '\u2715';
    if (isOn) Sound.uiClick();
  };
  soundBtn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleSound();
  });
  soundBtn.addEventListener('click', toggleSound);
}

// ─── Prevent zoom/scroll on mobile ──────────────────────────────
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('#inv-content') || e.target.closest('.quest-list') || e.target.closest('.shop-items') || e.target.closest('.ldb-list')) return;
  e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    e.preventDefault();
  }
  lastTouchEnd = now;
}, false);

// ─── Cooldown ticker ────────────────────────────────────────────
setInterval(() => {
  if (!playerStats || !playerStats.skills) return;
  for (let i = 0; i < 3; i++) {
    const btn = document.getElementById(`btn-skill-${i}`);
    if (!btn) continue;
    const skill = playerStats.skills[i];
    if (!skill) continue;
    const cd = skill.cooldownRemaining || 0;
    if (cd > 0) {
      btn.classList.add('on-cooldown');
      let overlay = btn.querySelector('.cooldown-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'cooldown-overlay';
        btn.appendChild(overlay);
      }
      overlay.textContent = (cd / 1000).toFixed(1);
    } else {
      btn.classList.remove('on-cooldown');
      const overlay = btn.querySelector('.cooldown-overlay');
      if (overlay) overlay.remove();
    }
  }
}, 100);

// ─── Skill Tooltips (delegated to screens.js) ──────────────────
function initSkillTooltips() {
  document.querySelectorAll('.action-btn.skill').forEach((btn, i) => {
    let holdTimer;
    btn.addEventListener('touchstart', (e) => {
      holdTimer = setTimeout(() => {
        Screens.showSkillTooltip(i, btn, playerStats, selectedClass);
      }, 500);
    });
    btn.addEventListener('touchend', () => {
      clearTimeout(holdTimer);
      Screens.hideSkillTooltip();
    });
    btn.addEventListener('touchmove', () => {
      clearTimeout(holdTimer);
    });
  });
}

// Initialize tooltips once DOM is ready
initSkillTooltips();

// ─── Keep screen awake ──────────────────────────────────────────
// Wake lock is requested inside the 'joined' handler to avoid
// requesting it before user gesture (which fails on many browsers).
