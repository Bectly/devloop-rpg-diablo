// ─── DevLoop RPG — Phone Controller ──────────────────────────────

const socket = io('/controller', {
  transports: ['websocket', 'polling'],
});

let playerId = null;
let playerStats = null;
let inventoryData = null;
let selectedClass = 'warrior';
let currentDialogue = null;
let typewriterInterval = null;
let staggerTimeouts = [];
let joystick = null;
let skillCooldownTimers = [0, 0, 0];
let currentFloor = 0;
let currentFloorName = '';
let isDead = false;
let deathCountdown = 0;
let deathInterval = null;
let buttonsInitialized = false;
let notificationCount = 0;
let shopData = null;
let questData = [];

// ─── DOM Elements ───────────────────────────────────────────────
const joinScreen = document.getElementById('join-screen');
const controller = document.getElementById('controller');
const inventoryScreen = document.getElementById('inventory-screen');
const dialogueScreen = document.getElementById('dialogue-screen');

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
  const name = document.getElementById('name-input').value.trim() || 'Hero';
  socket.emit('join', { name, characterClass: selectedClass });
});
// Fallback for desktop testing
document.getElementById('btn-join').addEventListener('click', () => {
  const name = document.getElementById('name-input').value.trim() || 'Hero';
  socket.emit('join', { name, characterClass: selectedClass });
});

// ─── Socket Events ──────────────────────────────────────────────
socket.on('connect', () => {
  console.log('[Phone] Connected');
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

socket.on('stats:update', (data) => {
  playerStats = data;
  updateHUD(data);
});

socket.on('inventory:update', (data) => {
  inventoryData = data;
  if (!inventoryScreen.classList.contains('hidden')) {
    renderInventory();
  }
});

socket.on('notification', (data) => {
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
});

socket.on('floor:change', (data) => {
  currentFloor = data.floor;
  currentFloorName = data.floorName || '';
  updateFloorDisplay();
});

socket.on('damage:taken', (data) => {
  flashDamage();
});

socket.on('player:death', (data) => {
  showDeathScreen(data.deathTimer, data.goldDropped);
});

socket.on('player:respawn', (data) => {
  hideDeathScreen();
});

socket.on('shop:inventory', (data) => {
  shopData = data;
  Screens.toggleShop(shopData, inventoryData, socket, hapticFeedback, () => { shopData = null; });
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

socket.on('disconnect', () => {
  console.log('[Phone] Disconnected');
  showNotification('Disconnected from server', 'error');
});

// ─── Floor Display ──────────────────────────────────────────────
function updateFloorDisplay() {
  const el = document.getElementById('hud-floor');
  if (el) {
    el.textContent = `F${currentFloor + 1}`;
    el.title = currentFloorName;
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

// ─── Death Screen ───────────────────────────────────────────────
function showDeathScreen(timerMs, goldDropped) {
  isDead = true;
  deathCountdown = timerMs || 5000;

  const deathEl = document.getElementById('death-overlay');
  if (!deathEl) return;
  deathEl.classList.remove('hidden');

  const goldText = goldDropped > 0 ? `Lost ${goldDropped} gold` : '';
  document.getElementById('death-gold-text').textContent = goldText;

  // Strong haptic
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

  // Countdown
  if (deathInterval) clearInterval(deathInterval);
  deathInterval = setInterval(() => {
    deathCountdown -= 100;
    if (deathCountdown < 0) deathCountdown = 0;
    const secs = (deathCountdown / 1000).toFixed(1);
    document.getElementById('death-timer-text').textContent = `Reviving in ${secs}s`;

    if (deathCountdown <= 0) {
      hideDeathScreen();
    }
  }, 100);
}

function hideDeathScreen() {
  isDead = false;
  if (deathInterval) {
    clearInterval(deathInterval);
    deathInterval = null;
  }
  const deathEl = document.getElementById('death-overlay');
  if (deathEl) deathEl.classList.add('hidden');
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
  if (isDead && stats.alive && !stats.isDying) {
    hideDeathScreen();
  }

  updateFloorDisplay();
}

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
    if (!data || !data.vector || isDead) return;
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
    if (isDead) return;
    socket.emit('attack');
    hapticFeedback();
  });
  document.getElementById('btn-attack').addEventListener('click', () => {
    if (isDead) return;
    socket.emit('attack');
  });

  // Skills
  for (let i = 0; i < 3; i++) {
    document.getElementById(`btn-skill-${i}`).addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (isDead) return;
      socket.emit('skill', { skillIndex: i });
      hapticFeedback();
    });
    document.getElementById(`btn-skill-${i}`).addEventListener('click', () => {
      if (isDead) return;
      socket.emit('skill', { skillIndex: i });
    });
  }

  // Health Potion
  document.getElementById('btn-potion').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isDead) return;
    socket.emit('use:potion', { type: 'health' });
  });
  document.getElementById('btn-potion').addEventListener('click', () => {
    if (isDead) return;
    socket.emit('use:potion', { type: 'health' });
  });

  // Interact
  document.getElementById('btn-interact').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isDead) return;
    socket.emit('interact');
  });
  document.getElementById('btn-interact').addEventListener('click', () => {
    if (isDead) return;
    socket.emit('interact');
  });

  // Pickup (LOOT button)
  document.getElementById('btn-pickup').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isDead) return;
    socket.emit('loot:pickup_nearest');
  });
  document.getElementById('btn-pickup').addEventListener('click', () => {
    if (isDead) return;
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

function renderStats() {
  if (!playerStats) return;

  const statList = document.getElementById('stat-list');
  statList.innerHTML = '';

  const hasFreePoints = playerStats.freeStatPoints > 0;
  document.getElementById('stat-points-display').textContent =
    hasFreePoints ? `(${playerStats.freeStatPoints} points)` : '';

  const stats = [
    { key: 'str', label: 'STR', val: playerStats.stats.str },
    { key: 'dex', label: 'DEX', val: playerStats.stats.dex },
    { key: 'int', label: 'INT', val: playerStats.stats.int },
    { key: 'vit', label: 'VIT', val: playerStats.stats.vit },
    { key: null, label: 'ATK', val: playerStats.attackPower },
    { key: null, label: 'SPL', val: playerStats.spellPower },
    { key: null, label: 'ARM', val: playerStats.armor },
    { key: null, label: 'CRT', val: `${playerStats.critChance}%` },
  ];

  for (const s of stats) {
    const row = document.createElement('div');
    row.classList.add('stat-row');

    let html = `<span class="stat-name">${s.label}</span><span class="stat-val">${s.val}</span>`;
    if (s.key && hasFreePoints) {
      html += `<button class="stat-btn" data-stat="${s.key}">+</button>`;
    }
    row.innerHTML = html;

    const btn = row.querySelector('.stat-btn');
    if (btn) {
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        socket.emit('levelup:stat', { stat: s.key });
      });
      // Fallback for desktop
      btn.addEventListener('click', () => {
        socket.emit('levelup:stat', { stat: s.key });
      });
    }

    statList.appendChild(row);
  }
}

// ─── Item Tooltip ───────────────────────────────────────────────
function showTooltip(item, anchor, isEquipped, slotName) {
  const tt = document.getElementById('item-tooltip');
  tt.classList.remove('hidden');

  let html = `<div class="tt-name" style="color:${item.rarityColor || '#aaa'}">${item.name}</div>`;
  html += `<div class="tt-type">${(item.rarity || '').toUpperCase()} ${item.type || ''} ${item.subType ? '(' + item.subType + ')' : ''}</div>`;

  if (item.damage) html += `<div class="tt-stat">Damage: ${item.damage}</div>`;
  if (item.armor) html += `<div class="tt-stat">Armor: ${item.armor}</div>`;
  if (item.bonuses) {
    for (const [stat, val] of Object.entries(item.bonuses)) {
      html += `<div class="tt-stat">+${val} ${stat.toUpperCase()}</div>`;
    }
  }
  if (item.description) html += `<div style="color:#888;margin-top:4px;font-size:10px">${item.description}</div>`;

  html += '<div class="tt-actions">';
  if (isEquipped) {
    html += `<button onclick="unequipItem('${slotName}')">Unequip</button>`;
  } else if (item.slot) {
    html += `<button onclick="equipItem('${item.id}')">Equip</button>`;
  }
  html += `<button onclick="dropItem('${item.id}')">Drop</button>`;
  html += `<button onclick="hideTooltip()">Close</button>`;
  html += '</div>';

  tt.innerHTML = html;

  const rect = anchor.getBoundingClientRect();
  tt.style.top = Math.min(rect.bottom + 5, window.innerHeight - 200) + 'px';
  tt.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 260)) + 'px';
}

function hideTooltip() {
  document.getElementById('item-tooltip').classList.add('hidden');
}
window.hideTooltip = hideTooltip;

window.equipItem = function(itemId) {
  socket.emit('inventory:equip', { itemId });
  hideTooltip();
};

window.unequipItem = function(slot) {
  socket.emit('inventory:unequip', { slot });
  hideTooltip();
};

window.dropItem = function(itemId) {
  socket.emit('inventory:drop', { itemId });
  hideTooltip();
};

// ─── Dialogue ───────────────────────────────────────────────────
function showDialogue(data) {
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


// ─── Prevent zoom/scroll on mobile ──────────────────────────────
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('#inv-content') || e.target.closest('.quest-list') || e.target.closest('.shop-items')) return;
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
