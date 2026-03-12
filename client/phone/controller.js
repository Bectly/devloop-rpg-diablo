// ─── DevLoop RPG — Phone Controller ──────────────────────────────

const socket = io('/controller', {
  transports: ['websocket', 'polling'],
});

let playerId = null;
let playerStats = null;
let inventoryData = null;
let selectedClass = 'warrior';
let currentDialogue = null;
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
let shopTab = 'buy'; // 'buy' or 'sell'
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
  openShop();
});

socket.on('quest:update', (quests) => {
  questData = quests;
  // If quest screen is visible, re-render
  const screen = document.getElementById('quest-screen');
  if (screen && !screen.classList.contains('hidden')) {
    renderQuests();
  }
  updateQuestBadge();
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

  // Skills
  for (let i = 0; i < 3; i++) {
    document.getElementById(`btn-skill-${i}`).addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (isDead) return;
      socket.emit('skill', { skillIndex: i });
      hapticFeedback();
    });
  }

  // Health Potion
  document.getElementById('btn-potion').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isDead) return;
    socket.emit('use:potion', { type: 'health' });
  });

  // Interact
  document.getElementById('btn-interact').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isDead) return;
    socket.emit('interact');
  });

  // Pickup (LOOT button)
  document.getElementById('btn-pickup').addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (isDead) return;
    socket.emit('loot:pickup_nearest');
  });

  // Inventory
  document.getElementById('btn-inventory').addEventListener('touchstart', (e) => {
    e.preventDefault();
    openInventory();
  });

  // Quests
  document.getElementById('btn-quests').addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleQuestLog();
  });
  document.getElementById('btn-quests').addEventListener('click', (e) => {
    e.preventDefault();
    toggleQuestLog();
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

  document.getElementById('dialogue-npc-name').textContent = data.npcName;
  document.getElementById('dialogue-text').textContent = data.text;

  const choicesEl = document.getElementById('dialogue-choices');
  choicesEl.innerHTML = '';

  for (const choice of data.choices) {
    const btn = document.createElement('button');
    btn.classList.add('dialogue-choice');
    btn.textContent = choice.text;
    const dialogueHandler = () => {
      socket.emit('dialogue:choose', {
        npcId: data.npcId,
        dialogueKey: data.dialogueKey || 'intro',
        choiceIndex: choice.index,
      });
      dialogueScreen.classList.add('hidden');
    };
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      dialogueHandler();
    });
    // Fallback for desktop
    btn.addEventListener('click', dialogueHandler);
    choicesEl.appendChild(btn);
  }
}

// ─── Shop System ────────────────────────────────────────────────
function createShopScreen() {
  // Only create once
  if (document.getElementById('shop-screen')) return;

  const shopEl = document.createElement('div');
  shopEl.id = 'shop-screen';
  shopEl.className = 'hidden';
  shopEl.innerHTML = `
    <div class="shop-header">
      <span class="shop-title">Merchant</span>
      <span class="shop-gold" id="shop-gold">0g</span>
      <button class="shop-close" id="shop-close">&times;</button>
    </div>
    <div class="shop-tabs">
      <button class="shop-tab active" data-tab="buy">Buy</button>
      <button class="shop-tab" data-tab="sell">Sell</button>
    </div>
    <div class="shop-items" id="shop-items"></div>
  `;
  document.body.appendChild(shopEl);

  // Tab handlers
  shopEl.querySelectorAll('.shop-tab').forEach(tab => {
    const handler = () => {
      shopTab = tab.dataset.tab;
      shopEl.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderShop();
    };
    tab.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); });
    tab.addEventListener('click', handler);
  });

  // Close handler
  const closeHandler = () => {
    shopEl.classList.add('hidden');
    shopData = null;
  };
  document.getElementById('shop-close').addEventListener('touchstart', (e) => { e.preventDefault(); closeHandler(); });
  document.getElementById('shop-close').addEventListener('click', closeHandler);
}

function openShop() {
  createShopScreen();
  const shopEl = document.getElementById('shop-screen');
  shopEl.classList.remove('hidden');
  renderShop();
}

function renderShop() {
  if (!shopData) return;
  const shopEl = document.getElementById('shop-screen');
  if (!shopEl || shopEl.classList.contains('hidden')) return;

  document.getElementById('shop-gold').textContent = `${shopData.playerGold || 0}g`;

  const container = document.getElementById('shop-items');
  container.innerHTML = '';

  if (shopTab === 'buy') {
    if (!shopData.items || shopData.items.length === 0) {
      container.innerHTML = '<div class="shop-empty">Nothing for sale</div>';
      return;
    }
    for (const item of shopData.items) {
      const canAfford = (shopData.playerGold || 0) >= item.shopPrice;
      const rarityClass = (item.rarity || 'common').toLowerCase();
      const el = document.createElement('div');
      el.className = 'shop-item';

      // Build stat line
      let statsText = '';
      if (item.damage) statsText += `DMG:${item.damage} `;
      if (item.armor) statsText += `ARM:${item.armor} `;
      if (item.bonuses) {
        for (const [stat, val] of Object.entries(item.bonuses)) {
          statsText += `+${val} ${stat.toUpperCase()} `;
        }
      }
      if (item.type === 'consumable') statsText = item.subType === 'health_potion' ? 'Restores HP' : 'Restores MP';

      const nameEl = document.createElement('div');
      nameEl.className = `shop-item-name ${rarityClass}`;
      nameEl.textContent = item.name;

      const typeEl = document.createElement('div');
      typeEl.className = 'shop-item-type';
      typeEl.textContent = `${(item.rarity || '').toUpperCase()} ${item.type || ''}`;

      const infoEl = document.createElement('div');
      infoEl.className = 'shop-item-info';
      infoEl.appendChild(nameEl);
      infoEl.appendChild(typeEl);

      if (statsText.trim()) {
        const statsEl = document.createElement('div');
        statsEl.className = 'shop-item-stats';
        statsEl.textContent = statsText.trim();
        infoEl.appendChild(statsEl);
      }

      const priceEl = document.createElement('div');
      priceEl.className = 'shop-item-price';
      priceEl.textContent = `${item.shopPrice}g`;

      const btn = document.createElement('button');
      btn.className = 'shop-btn';
      btn.textContent = 'BUY';
      if (!canAfford) btn.disabled = true;

      const buyHandler = () => {
        if (!canAfford) return;
        socket.emit('shop:buy', { itemId: item.id });
        hapticFeedback();
      };
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); buyHandler(); });
      btn.addEventListener('click', buyHandler);

      el.appendChild(infoEl);
      el.appendChild(priceEl);
      el.appendChild(btn);
      container.appendChild(el);
    }
  } else {
    // Sell tab — show player inventory items
    if (!inventoryData || !inventoryData.items || inventoryData.items.length === 0) {
      container.innerHTML = '<div class="shop-empty">No items to sell</div>';
      return;
    }
    for (const item of inventoryData.items) {
      // Skip consumables already tracked as potion count
      if (item.type === 'consumable') continue;

      const sellPrice = Math.max(1, Math.floor((item.shopPrice || estimateSellPrice(item)) * 0.4));
      const rarityClass = (item.rarity || 'common').toLowerCase();
      const el = document.createElement('div');
      el.className = 'shop-item';

      // Build stat line
      let statsText = '';
      if (item.damage) statsText += `DMG:${item.damage} `;
      if (item.armor) statsText += `ARM:${item.armor} `;
      if (item.bonuses) {
        for (const [stat, val] of Object.entries(item.bonuses)) {
          statsText += `+${val} ${stat.toUpperCase()} `;
        }
      }

      const nameEl = document.createElement('div');
      nameEl.className = `shop-item-name ${rarityClass}`;
      nameEl.textContent = item.name;

      const typeEl = document.createElement('div');
      typeEl.className = 'shop-item-type';
      typeEl.textContent = `${(item.rarity || '').toUpperCase()} ${item.type || ''}`;

      const infoEl = document.createElement('div');
      infoEl.className = 'shop-item-info';
      infoEl.appendChild(nameEl);
      infoEl.appendChild(typeEl);

      if (statsText.trim()) {
        const statsEl = document.createElement('div');
        statsEl.className = 'shop-item-stats';
        statsEl.textContent = statsText.trim();
        infoEl.appendChild(statsEl);
      }

      const priceEl = document.createElement('div');
      priceEl.className = 'shop-item-price';
      priceEl.textContent = `${sellPrice}g`;

      const btn = document.createElement('button');
      btn.className = 'shop-btn sell';
      btn.textContent = 'SELL';

      const sellHandler = () => {
        socket.emit('shop:sell', { itemId: item.id });
        hapticFeedback();
      };
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); sellHandler(); });
      btn.addEventListener('click', sellHandler);

      el.appendChild(infoEl);
      el.appendChild(priceEl);
      el.appendChild(btn);
      container.appendChild(el);
    }
    if (container.children.length === 0) {
      container.innerHTML = '<div class="shop-empty">No items to sell</div>';
    }
  }
}

// Client-side sell price estimate (server has final say)
function estimateSellPrice(item) {
  if (item.shopPrice) return Math.max(1, Math.floor(item.shopPrice * 0.4));
  const rarityMult = { common: 1, uncommon: 2, rare: 5, epic: 15, legendary: 50 };
  const base = item.type === 'weapon' ? 30 : item.type === 'armor' ? 25 : 10;
  const mult = rarityMult[item.rarity] || 1;
  const bonusCount = item.bonuses ? Object.keys(item.bonuses).length : 0;
  return Math.max(1, Math.floor(base * mult * (1 + bonusCount * 0.3) * 0.4));
}

// ─── Quest Log ──────────────────────────────────────────────────
function createQuestScreen() {
  if (document.getElementById('quest-screen')) return;

  const screen = document.createElement('div');
  screen.id = 'quest-screen';
  screen.className = 'hidden';
  screen.innerHTML = `
    <div class="quest-header">
      <span class="quest-title">QUESTS</span>
      <button class="quest-close" id="quest-close">&times;</button>
    </div>
    <div class="quest-list" id="quest-list"></div>
  `;
  document.body.appendChild(screen);

  document.getElementById('quest-close').addEventListener('touchstart', (e) => {
    e.preventDefault();
    toggleQuestLog();
  });
  document.getElementById('quest-close').addEventListener('click', (e) => {
    e.preventDefault();
    toggleQuestLog();
  });
}

function toggleQuestLog() {
  createQuestScreen();
  const screen = document.getElementById('quest-screen');
  screen.classList.toggle('hidden');
  if (!screen.classList.contains('hidden')) {
    renderQuests();
  }
}

function renderQuests() {
  const container = document.getElementById('quest-list');
  if (!container) return;
  container.innerHTML = '';

  if (!questData || questData.length === 0) {
    container.innerHTML = '<div class="quest-empty">No active quests. Explore deeper!</div>';
    return;
  }

  // Sort: uncompleted first, then completed unclaimed, then claimed
  const sorted = [...questData].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return 0;
  });

  for (const quest of sorted) {
    const pct = Math.min(100, Math.round((quest.progress / quest.target) * 100));
    const el = document.createElement('div');
    el.className = 'quest-item' + (quest.completed ? ' completed' : '');

    el.innerHTML = `
      <div class="quest-item-header">
        <span class="quest-item-title">${quest.title}</span>
        <span class="quest-item-progress">${quest.progress}/${quest.target}</span>
      </div>
      <div class="quest-item-desc">${quest.description}</div>
      <div class="quest-progress-bar">
        <div class="quest-progress-fill" style="width: ${pct}%"></div>
      </div>
      <div class="quest-reward">
        <span class="quest-reward-gold">${quest.reward.gold}g</span>
        ${quest.reward.item ? `<span class="quest-reward-item">${quest.reward.item.name}</span>` : ''}
      </div>
      ${quest.completed ? `<button class="quest-claim-btn" data-quest-id="${quest.id}">CLAIM</button>` : ''}
    `;

    container.appendChild(el);
  }

  // Attach claim handlers
  container.querySelectorAll('.quest-claim-btn').forEach(btn => {
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      socket.emit('quest:claim', { questId: btn.dataset.questId });
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      socket.emit('quest:claim', { questId: btn.dataset.questId });
    });
  });
}

function updateQuestBadge() {
  const btn = document.getElementById('btn-quests');
  if (!btn) return;
  const unclaimedCount = questData.filter(q => q.completed).length;
  let badge = btn.querySelector('.quest-badge');
  if (unclaimedCount > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'quest-badge';
      btn.appendChild(badge);
    }
    badge.textContent = unclaimedCount;
  } else if (badge) {
    badge.remove();
  }
}

// ─── Prevent zoom/scroll on mobile ──────────────────────────────
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('#inv-content')) return;
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

// ─── Skill Tooltip System ────────────────────────────────────────
const SKILL_DESCRIPTIONS = {
  warrior: [
    { name: 'Cleave', desc: 'Swing weapon in wide arc. Deals 1.8x damage to all enemies within 60px.', type: 'AoE' },
    { name: 'Shield Bash', desc: 'Bash enemy with shield. Deals 1.2x damage and stuns for 2 seconds.', type: 'Single' },
    { name: 'War Cry', desc: 'Rally allies! All party members gain +30% attack power for 8 seconds.', type: 'Buff' },
  ],
  ranger: [
    { name: 'Multi-Shot', desc: 'Fire 3 arrows at once. Each deals 0.8x damage to nearby targets.', type: 'Multi' },
    { name: 'Poison Arrow', desc: 'Poison-tipped arrow. Deals damage over time for 5 seconds.', type: 'DoT' },
    { name: 'Evasion', desc: 'Sharpen reflexes. Greatly increased dodge chance for 5 seconds.', type: 'Buff' },
  ],
  mage: [
    { name: 'Fireball', desc: 'Hurl a fireball. Deals 2.5x spell damage in 50px explosion.', type: 'AoE' },
    { name: 'Frost Nova', desc: 'Frozen blast around you. Deals damage and slows enemies for 3 seconds.', type: 'AoE' },
    { name: 'Teleport', desc: 'Blink 150px forward instantly. Escape danger or reposition.', type: 'Movement' },
  ],
};

function showSkillTooltip(index, btn) {
  hideSkillTooltip();

  const classSkills = SKILL_DESCRIPTIONS[playerStats?.characterClass || selectedClass];
  if (!classSkills || !classSkills[index]) return;

  const skillInfo = classSkills[index];
  const skill = playerStats && playerStats.skills ? playerStats.skills[index] : null;

  const tooltip = document.createElement('div');
  tooltip.className = 'skill-tooltip';
  tooltip.id = 'active-skill-tooltip';

  const nameEl = document.createElement('div');
  nameEl.className = 'skill-tooltip-name';
  nameEl.textContent = skillInfo.name;

  const statsEl = document.createElement('div');
  statsEl.className = 'skill-tooltip-stats';
  const mpText = skill ? `MP: ${skill.mpCost}` : '';
  const cdText = skill ? `CD: ${(skill.cooldown / 1000).toFixed(1)}s` : '';
  statsEl.textContent = [mpText, cdText].filter(Boolean).join('  |  ');

  const descEl = document.createElement('div');
  descEl.className = 'skill-tooltip-desc';
  descEl.textContent = skillInfo.desc;

  const typeEl = document.createElement('div');
  typeEl.className = 'skill-tooltip-type';
  typeEl.textContent = skillInfo.type;

  tooltip.appendChild(nameEl);
  tooltip.appendChild(statsEl);
  tooltip.appendChild(descEl);
  tooltip.appendChild(typeEl);

  document.body.appendChild(tooltip);

  // Haptic for tooltip
  if (navigator.vibrate) navigator.vibrate(15);
}

function hideSkillTooltip() {
  const existing = document.getElementById('active-skill-tooltip');
  if (existing) existing.remove();
}

function initSkillTooltips() {
  document.querySelectorAll('.action-btn.skill').forEach((btn, i) => {
    let holdTimer;
    btn.addEventListener('touchstart', (e) => {
      holdTimer = setTimeout(() => {
        showSkillTooltip(i, btn);
      }, 500);
    });
    btn.addEventListener('touchend', () => {
      clearTimeout(holdTimer);
      hideSkillTooltip();
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
