// ─── DevLoop RPG — Phone Controller ──────────────────────────────

const socket = io('/controller', {
  transports: ['websocket', 'polling'],
});

let playerId = null;
let playerStats = null;
let inventoryData = null;
let selectedClass = 'warrior';
let hardcoreMode = false;
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
// Update difficulty badge
function updateDifficultyBadge(difficulty) {
  const badge = document.getElementById('hud-difficulty');
  if (!badge) return;
  if (!difficulty || difficulty === 'normal') {
    badge.classList.add('hidden');
    return;
  }
  badge.classList.remove('hidden');
  badge.textContent = difficulty === 'nightmare' ? 'NM' : 'HELL';
  badge.className = 'diff-badge diff-' + difficulty;
}

let buttonsInitialized = false;
let notificationCount = 0;
let shopData = null;
let questData = [];
let stashData = [];
let currentLootFilter = 'off';
// encounteredElites moved to reconnect.js (Reconnect.encounteredElites)

// ─── DOM Elements ───────────────────────────────────────────────
const joinScreen = document.getElementById('join-screen');
const controller = document.getElementById('controller');
const inventoryScreen = document.getElementById('inventory-screen');
const dialogueScreen = document.getElementById('dialogue-screen');

DeathVictory.init(socket);
TalentsUI.init(socket);
RiftUI.init(socket);

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

// ─── Hardcore Toggle ──────────────────────────────────────────
document.getElementById('hc-toggle').addEventListener('click', () => {
  hardcoreMode = !hardcoreMode;
  document.getElementById('hc-toggle').classList.toggle('active', hardcoreMode);
});
document.getElementById('hc-toggle').addEventListener('touchstart', (e) => {
  e.preventDefault();
  hardcoreMode = !hardcoreMode;
  document.getElementById('hc-toggle').classList.toggle('active', hardcoreMode);
});

document.getElementById('btn-join').addEventListener('touchstart', (e) => {
  e.preventDefault();
  Sound.unlock();
  joinedName = document.getElementById('name-input').value.trim() || 'Hero';
  socket.emit('join', { name: joinedName, characterClass: selectedClass, hardcore: hardcoreMode });
});
// Fallback for desktop testing
document.getElementById('btn-join').addEventListener('click', () => {
  Sound.unlock();
  joinedName = document.getElementById('name-input').value.trim() || 'Hero';
  socket.emit('join', { name: joinedName, characterClass: selectedClass, hardcore: hardcoreMode });
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
  if (data.stats && data.stats.lootFilter) currentLootFilter = data.stats.lootFilter;
  Screens.setQuestContext(questData, socket);

  joinScreen.classList.add('hidden');
  controller.classList.remove('hidden');

  updateHUD(data.stats);
  if (data.stats && data.stats.keystones !== undefined) RiftUI.updateKeystones(data.stats.keystones);
  updateFloorDisplay();
  initJoystick();
  initButtons();

  // Request wake lock after user gesture (join) to keep screen on during play
  if ('wakeLock' in navigator) {
    navigator.wakeLock.request('screen').catch(() => {});
  }
});

socket.on('hardcore:death', (data) => {
  // Show dramatic HC death overlay (DOM construction, no innerHTML — XSS safe)
  const overlay = document.createElement('div');
  overlay.className = 'hc-death-overlay';

  const skull = document.createElement('div');
  skull.className = 'hc-death-skull';
  skull.textContent = '\u2620';

  const title = document.createElement('div');
  title.className = 'hc-death-title';
  title.textContent = 'HARDCORE DEATH';

  const statsDiv = document.createElement('div');
  statsDiv.className = 'hc-death-stats';
  const line1 = document.createElement('div');
  const heroSpan = document.createElement('span');
  heroSpan.textContent = data.name || 'Hero';
  line1.append('Your hero ', heroSpan, ' has fallen forever.');
  const line2 = document.createElement('div');
  const lvSpan = document.createElement('span');
  lvSpan.textContent = data.level || '?';
  const killSpan = document.createElement('span');
  killSpan.textContent = data.kills || 0;
  const goldSpan = document.createElement('span');
  goldSpan.textContent = data.gold || 0;
  line2.append('Level ', lvSpan, ' \u2022 ', killSpan, ' kills \u2022 ', goldSpan, ' gold');
  statsDiv.append(line1, line2);

  overlay.append(skull, title, statsDiv);
  document.body.appendChild(overlay);
  // Return to join screen after 5 seconds
  setTimeout(() => {
    overlay.remove();
    joinScreen.classList.remove('hidden');
    controller.classList.add('hidden');
    playerId = null;
    playerStats = null;
    hardcoreMode = false;
    document.getElementById('hc-toggle').classList.remove('active');
  }, 5000);
});

socket.on('stash:update', (data) => {
  stashData = data.items || [];
  const stashScreen = document.getElementById('stash-screen');
  if (stashScreen && !stashScreen.classList.contains('hidden')) {
    renderStash();
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
  if (data.keystones !== undefined) RiftUI.updateKeystones(data.keystones);
  // Sync loot filter mode from server
  if (data.lootFilter) {
    currentLootFilter = data.lootFilter;
    if (typeof updateFilterButton === 'function') updateFilterButton();
  }
});

socket.on('inventory:update', (data) => {
  inventoryData = data;
  if (!inventoryScreen.classList.contains('hidden')) {
    renderInventory();
  }
  // Update crafting screen if open
  Screens.updateCraftingInventory(data);
  // Feed inventory to StatsUI so gem picker has access to current gems
  StatsUI.setInventoryData(data);
});

// ── Stash ──────────────────────────────────────────────────────

function renderStash() {
  const grid = document.getElementById('stash-grid');
  const countEl = document.getElementById('stash-count');
  if (!grid) return;

  const items = stashData || [];
  const slotMap = new Map();
  for (const entry of items) {
    slotMap.set(entry.slot, entry.item);
  }

  if (countEl) countEl.textContent = items.length + ' / 20';
  grid.innerHTML = '';

  for (let i = 0; i < 20; i++) {
    const slotEl = document.createElement('div');
    slotEl.className = 'stash-slot';

    const item = slotMap.get(i);
    if (item) {
      slotEl.classList.add('filled');
      const nameEl = document.createElement('div');
      nameEl.className = 'item-name';
      nameEl.textContent = item.name || 'Item';
      nameEl.style.color = item.rarityColor || '#aaa';
      slotEl.appendChild(nameEl);

      slotEl.addEventListener('click', () => {
        socket.emit('stash:retrieve', { slot: i });
      });
      slotEl.addEventListener('touchstart', (e) => {
        e.preventDefault();
        socket.emit('stash:retrieve', { slot: i });
      });
    } else {
      slotEl.classList.add('empty');
      const emptyEl = document.createElement('div');
      emptyEl.className = 'item-name';
      emptyEl.textContent = '\u2014';
      slotEl.appendChild(emptyEl);
    }

    grid.appendChild(slotEl);
  }

  // Render inventory items below for quick store access
  _renderStashInvPanel();
}

function _renderStashInvPanel() {
  let panel = document.getElementById('stash-inv-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'stash-inv-panel';
    const heading = document.createElement('h3');
    heading.textContent = 'Store from Inventory';
    panel.appendChild(heading);
    const listDiv = document.createElement('div');
    listDiv.id = 'stash-inv-list';
    panel.appendChild(listDiv);
    const gridEl = document.getElementById('stash-grid');
    if (gridEl && gridEl.parentNode) gridEl.parentNode.appendChild(panel);
  }
  const listEl = document.getElementById('stash-inv-list');
  if (!listEl || !inventoryData) return;

  const items = inventoryData.items || [];
  listEl.innerHTML = '';
  if (items.length === 0) {
    const emptyMsg = document.createElement('p');
    emptyMsg.className = 'stash-empty';
    emptyMsg.textContent = 'Inventory empty';
    listEl.appendChild(emptyMsg);
    return;
  }
  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'stash-inv-row';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.name;
    nameSpan.style.color = item.rarityColor || '#aaa';
    row.appendChild(nameSpan);
    const storeBtn = document.createElement('button');
    storeBtn.className = 'stash-store-btn';
    storeBtn.textContent = 'Store';
    storeBtn.addEventListener('click', () => {
      socket.emit('stash:store', { inventoryIndex: idx });
    });
    row.appendChild(storeBtn);
    listEl.appendChild(row);
  });
}

// ── Gem Combine Panel ──────────────────────────────────────────
function showGemCombinePanel() {
  let panel = document.getElementById('gem-combine-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'gem-combine-panel';
    panel.classList.add('hidden');
    document.body.appendChild(panel);
  }
  panel.innerHTML = '';
  panel.classList.remove('hidden');

  const title = document.createElement('div');
  title.className = 'combine-title';
  title.textContent = 'Combine Gems (3 \u2192 1)';
  panel.appendChild(title);

  // Gather gems from inventory, group by gemType + gemTier
  const items = inventoryData ? (inventoryData.items || []) : [];
  const gems = items.filter(i => i.type === 'gem');
  const groups = {};
  for (const gem of gems) {
    const key = gem.gemType + ':' + gem.gemTier;
    if (!groups[key]) {
      groups[key] = { gemType: gem.gemType, gemTier: gem.gemTier, name: gem.name, color: gem.color || '#aaa', ids: [] };
    }
    groups[key].ids.push(gem.id);
  }

  const groupArr = Object.values(groups);
  if (groupArr.length === 0) {
    const empty = document.createElement('div');
    empty.style.color = '#888';
    empty.style.fontSize = '12px';
    empty.style.marginBottom = '12px';
    empty.textContent = 'No gems in inventory.';
    panel.appendChild(empty);
  }

  for (const g of groupArr) {
    const row = document.createElement('div');
    row.className = 'combine-group';

    const info = document.createElement('div');
    info.className = 'combine-group-info';

    const icon = document.createElement('span');
    icon.className = 'combine-group-icon';
    icon.style.color = g.color;
    icon.textContent = '\u25C6';
    info.appendChild(icon);

    const nameEl = document.createElement('span');
    nameEl.className = 'combine-group-name';
    nameEl.textContent = g.name;
    info.appendChild(nameEl);

    const count = document.createElement('span');
    count.className = 'combine-group-count';
    count.textContent = ' x' + g.ids.length;
    info.appendChild(count);

    row.appendChild(info);

    const cost = g.gemTier === 1 ? 100 : 500;
    const canCombine = g.ids.length >= 3 && g.gemTier < 3;
    const btn = document.createElement('button');
    btn.className = 'combine-btn';
    btn.textContent = canCombine ? 'Combine (' + cost + 'g)' : (g.gemTier >= 3 ? 'Max tier' : 'Need 3');
    btn.disabled = !canCombine;
    if (canCombine) {
      btn.addEventListener('click', () => {
        const threeIds = g.ids.slice(0, 3);
        socket.emit('gem:combine', { gemIds: threeIds });
        panel.classList.add('hidden');
      });
    }
    row.appendChild(btn);
    panel.appendChild(row);
  }

  const closeBtn = document.createElement('button');
  closeBtn.className = 'combine-close';
  closeBtn.textContent = 'Close';
  closeBtn.addEventListener('click', () => panel.classList.add('hidden'));
  panel.appendChild(closeBtn);
}

// ── Enchant Panel ─────────────────────────────────────────────
function showEnchantPanel(items, gold) {
  // Remove any existing panel
  const existing = document.getElementById('enchant-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'enchant-panel';
  panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:10000;overflow-y:auto;padding:12px;box-sizing:border-box;';

  const header = document.createElement('div');
  header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;';

  const title = document.createElement('div');
  title.textContent = '✧ Mystic Enchanting';
  title.style.cssText = 'color:#cc44ff;font-size:18px;font-weight:bold;font-family:Courier New;';

  const goldText = document.createElement('div');
  goldText.id = 'enchant-gold';
  goldText.textContent = gold + 'g';
  goldText.style.cssText = 'color:#ffdd44;font-size:14px;font-family:Courier New;';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'X';
  closeBtn.style.cssText = 'background:#333;color:#fff;border:1px solid #666;padding:6px 12px;font-size:14px;border-radius:4px;';
  closeBtn.onclick = () => panel.remove();

  header.appendChild(title);
  header.appendChild(goldText);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  if (items.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No enchantable items';
    empty.style.cssText = 'color:#888;text-align:center;margin-top:40px;font-family:Courier New;';
    panel.appendChild(empty);
  }

  const RARITY_COLORS = {
    common: '#aaaaaa', uncommon: '#44cc44', rare: '#4488ff',
    epic: '#bb44ff', legendary: '#ff8800', set: '#00cc66',
  };

  for (const item of items) {
    const row = document.createElement('div');
    row.style.cssText = 'background:#1a1a2e;border:1px solid #333;border-radius:6px;padding:10px;margin-bottom:8px;cursor:pointer;';

    const nameEl = document.createElement('div');
    const prefix = item.enchantCount > 0 ? '✧ ' : '';
    nameEl.textContent = prefix + item.name + (item.equipped ? ' [E]' : '');
    nameEl.style.cssText = 'color:' + (RARITY_COLORS[item.rarity] || '#aaa') + ';font-size:14px;font-weight:bold;font-family:Courier New;margin-bottom:6px;';
    row.appendChild(nameEl);

    // Show bonuses as selectable rows
    for (const [key, value] of Object.entries(item.bonuses)) {
      const statRow = document.createElement('div');
      statRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 8px;margin:2px 0;background:#252540;border-radius:4px;cursor:pointer;';

      const statName = document.createElement('span');
      statName.textContent = key;
      statName.style.cssText = 'color:#ddd;font-size:12px;font-family:Courier New;';

      const statVal = document.createElement('span');
      statVal.textContent = '+' + value;
      statVal.style.cssText = 'color:#88ff88;font-size:12px;font-family:Courier New;';

      statRow.appendChild(statName);
      statRow.appendChild(statVal);

      statRow.addEventListener('click', (e) => {
        e.stopPropagation();
        socket.emit('enchant:preview', { itemId: item.id, bonusKey: key });
      });

      row.appendChild(statRow);
    }

    panel.appendChild(row);
  }

  document.body.appendChild(panel);
}

function showEnchantPreview(data) {
  // Remove existing preview
  const existing = document.getElementById('enchant-preview');
  if (existing) existing.remove();

  const preview = document.createElement('div');
  preview.id = 'enchant-preview';
  preview.style.cssText = 'position:fixed;bottom:0;left:0;width:100%;background:#1a1a2e;border-top:2px solid #cc44ff;padding:16px;box-sizing:border-box;z-index:10001;';

  const info = document.createElement('div');
  info.style.cssText = 'color:#ddd;font-size:13px;font-family:Courier New;margin-bottom:8px;';
  info.textContent = data.bonusKey + ': ' + data.currentValue + ' → ???';
  preview.appendChild(info);

  const costEl = document.createElement('div');
  costEl.style.cssText = 'color:#ffdd44;font-size:12px;font-family:Courier New;margin-bottom:10px;';
  costEl.textContent = 'Cost: ' + data.cost + ' gold';
  preview.appendChild(costEl);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:10px;';

  const enchantBtn = document.createElement('button');
  enchantBtn.textContent = '✧ ENCHANT';
  enchantBtn.style.cssText = 'flex:1;background:#6a2a8a;color:#fff;border:1px solid #cc44ff;padding:10px;font-size:14px;font-weight:bold;border-radius:6px;font-family:Courier New;';
  enchantBtn.onclick = () => {
    socket.emit('enchant:execute', { itemId: data.itemId, bonusKey: data.bonusKey });
    enchantBtn.disabled = true;
    enchantBtn.textContent = '...';
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'CANCEL';
  cancelBtn.style.cssText = 'flex:1;background:#333;color:#aaa;border:1px solid #555;padding:10px;font-size:14px;border-radius:6px;font-family:Courier New;';
  cancelBtn.onclick = () => preview.remove();

  btnRow.appendChild(enchantBtn);
  btnRow.appendChild(cancelBtn);
  preview.appendChild(btnRow);

  document.body.appendChild(preview);
}

function showEnchantResult(data) {
  const preview = document.getElementById('enchant-preview');
  if (!preview) return;

  preview.innerHTML = '';

  const result = document.createElement('div');
  result.style.cssText = 'text-align:center;padding:10px;';

  const statLine = document.createElement('div');
  statLine.style.cssText = 'font-size:16px;font-family:Courier New;margin-bottom:8px;';
  const better = data.newValue > data.oldValue;
  const same = data.newValue === data.oldValue;
  statLine.style.color = better ? '#44ff44' : same ? '#ffdd44' : '#ff4444';
  statLine.textContent = data.bonusKey + ': ' + data.oldValue + ' → ' + data.newValue + (better ? ' ▲' : same ? ' =' : ' ▼');
  result.appendChild(statLine);

  const costLine = document.createElement('div');
  costLine.textContent = '−' + data.cost + 'g';
  costLine.style.cssText = 'color:#ffdd44;font-size:12px;font-family:Courier New;margin-bottom:10px;';
  result.appendChild(costLine);

  const okBtn = document.createElement('button');
  okBtn.textContent = 'OK';
  okBtn.style.cssText = 'background:#333;color:#fff;border:1px solid #666;padding:8px 24px;font-size:14px;border-radius:6px;font-family:Courier New;';
  okBtn.onclick = () => {
    preview.remove();
    // Refresh the enchant panel by re-requesting interact
    socket.emit('interact', {});
  };
  result.appendChild(okBtn);

  preview.appendChild(result);

  // Update gold display immediately using the known cost
  // (playerStats.gold is stale — the player:stats event hasn't arrived yet)
  const goldEl = document.getElementById('enchant-gold');
  if (goldEl && playerStats) {
    goldEl.textContent = Math.max(0, (playerStats.gold || 0) - data.cost) + 'g';
  }
}

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
  if (data.difficulty) updateDifficultyBadge(data.difficulty);
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

// Defensive proc notifications (Phase 15.0)
socket.on('combat:proc', (data) => {
  if (data.effect === 'block') {
    showNotification(`Shield Wall! Blocked ${data.value} damage`, 'info');
    if (navigator.vibrate) navigator.vibrate([30, 20, 50]);
  } else if (data.effect === 'last_stand') {
    showNotification('Last Stand! 50% damage reduction', 'levelup');
  } else if (data.effect === 'freeze') {
    showNotification('Ice Barrier! Attacker frozen', 'info');
  } else if (data.effect === 'caltrops') {
    showNotification('Caltrops! Attacker slowed', 'info');
  } else if (data.effect === 'heal_on_kill') {
    showNotification(`Heal on kill! +${data.heal} HP`, 'info');
  } else if (data.effect === 'summon_spirit_wolf') {
    showNotification('Spirit Wolf summoned!', 'levelup');
    if (navigator.vibrate) navigator.vibrate([40, 30, 40, 30, 60]);
  }
});

socket.on('player:death', (data) => {
  DeathVictory.showDeathScreen(data.deathTimer, data.goldDropped, data.damageLog);
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

// ── Enchant events ──
socket.on('enchant:open', (data) => {
  showEnchantPanel(data.items, data.playerGold);
});

socket.on('enchant:preview', (data) => {
  showEnchantPreview(data);
});

socket.on('enchant:result', (data) => {
  showEnchantResult(data);
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

socket.on('rift:leaderboard', (data) => {
  Screens.renderRiftLeaderboard(data.records || []);
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

socket.on('game:restarted', (data) => {
  DeathVictory.hideVictoryScreen();
  if (data && data.difficulty) updateDifficultyBadge(data.difficulty);
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

  const hudName = document.getElementById('hud-name');
  hudName.textContent = stats.name;
  // Append HC badge if hardcore character
  if (stats.hardcore) {
    const badge = document.createElement('span');
    badge.className = 'hc-badge';
    badge.textContent = 'HC';
    hudName.appendChild(badge);
  }

  // Level display — show paragon suffix when at max level
  const MAX_LEVEL = 30;
  const hudLevel = document.getElementById('hud-level');
  if (stats.paragonLevel > 0) {
    hudLevel.innerHTML = `Lv.${stats.level} <span class="paragon-level">(P${stats.paragonLevel})</span>`;
  } else {
    hudLevel.textContent = `Lv.${stats.level}`;
  }

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

  // XP bar — switch to paragon XP display when at max level
  const xpBar = document.getElementById('xp-bar');
  const xpLabel = document.getElementById('xp-label');
  const isParagon = stats.paragonLevel > 0 || stats.level >= MAX_LEVEL;
  if (isParagon && stats.paragonXpToNext > 0) {
    const pxpPct = Math.round((stats.paragonXp / stats.paragonXpToNext) * 100);
    xpBar.style.width = pxpPct + '%';
    xpBar.className = 'stat-bar xp paragon-xp-bar';
    xpLabel.textContent = `P${stats.paragonLevel} ${pxpPct}%`;
  } else {
    const xpPct = stats.xpToNext > 0 ? Math.round((stats.xp / stats.xpToNext) * 100) : 0;
    xpBar.style.width = xpPct + '%';
    xpBar.className = 'stat-bar xp';
    xpLabel.textContent = `${xpPct}%`;
  }

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
        // Level badge
        if (skill.level && skill.level > 1) {
          const lvBadge = document.createElement('span');
          lvBadge.className = 'skill-level-badge';
          lvBadge.textContent = `L${skill.level}`;
          if (skill.level >= 5) lvBadge.classList.add('max-level');
          btn.appendChild(lvBadge);
        }
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
        // Level badge
        if (skill.level && skill.level > 1) {
          const lvBadge = document.createElement('span');
          lvBadge.className = 'skill-level-badge';
          lvBadge.textContent = `L${skill.level}`;
          if (skill.level >= 5) lvBadge.classList.add('max-level');
          btn.appendChild(lvBadge);
        }
      }
    }
  }

  // Check if respawned
  if (DeathVictory.isDead() && stats.alive && !stats.isDying) {
    DeathVictory.hideDeathScreen();
  }

  // Update debuff and buff indicators
  Reconnect.updateDebuffDisplay(stats.debuffs || []);
  Reconnect.updateBuffDisplay(stats);

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

  // Talents
  const tlnBtn = document.getElementById('btn-talents');
  if (tlnBtn) {
    tlnBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      Sound.uiClick();
      TalentsUI.show();
    });
    tlnBtn.addEventListener('click', () => { Sound.uiClick(); TalentsUI.show(); });
  }
  const talentClose = document.getElementById('talent-close');
  if (talentClose) {
    talentClose.addEventListener('touchstart', (e) => { e.preventDefault(); TalentsUI.hide(); });
    talentClose.addEventListener('click', () => TalentsUI.hide());
  }

  // Rift
  const riftBtn = document.getElementById('btn-rift');
  if (riftBtn) {
    riftBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      Sound.uiClick();
      RiftUI.show();
    });
    riftBtn.addEventListener('click', () => { Sound.uiClick(); RiftUI.show(); });
  }
  const riftClose = document.getElementById('rift-close');
  if (riftClose) {
    riftClose.addEventListener('touchstart', (e) => { e.preventDefault(); RiftUI.hide(); });
    riftClose.addEventListener('click', () => RiftUI.hide());
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

  // Stash — accessible from inventory header tab
  const stashBtn = document.getElementById('btn-stash');
  if (stashBtn) {
    const openStash = () => {
      inventoryScreen.classList.add('hidden');
      const stashScreen = document.getElementById('stash-screen');
      if (stashScreen) stashScreen.classList.remove('hidden');
      socket.emit('stash:list');
    };
    stashBtn.addEventListener('touchstart', (e) => { e.preventDefault(); openStash(); });
    stashBtn.addEventListener('click', openStash);
  }

  const stashClose = document.getElementById('stash-close');
  if (stashClose) {
    const closeStash = () => {
      const stashScreen = document.getElementById('stash-screen');
      if (stashScreen) stashScreen.classList.add('hidden');
      inventoryScreen.classList.remove('hidden');
    };
    stashClose.addEventListener('touchstart', (e) => { e.preventDefault(); closeStash(); });
    stashClose.addEventListener('click', closeStash);
  }

  // Gem Combine — accessible from inventory header tab
  const gemsBtn = document.getElementById('btn-gems');
  if (gemsBtn) {
    gemsBtn.addEventListener('touchstart', (e) => { e.preventDefault(); showGemCombinePanel(); });
    gemsBtn.addEventListener('click', () => showGemCombinePanel());
  }

  // Loot Filter — cycles off → basic → smart → off
  const filterBtn = document.getElementById('loot-filter-btn');
  if (filterBtn) {
    const FILTER_MODES = ['off', 'basic', 'smart'];
    const FILTER_COLORS = { off: '#666', basic: '#ffdd44', smart: '#44ff44' };
    const FILTER_LABELS = { off: 'FILTER', basic: 'BASIC', smart: 'SMART' };

    window.updateFilterButton = function updateFilterButton() {
      const color = FILTER_COLORS[currentLootFilter] || '#666';
      filterBtn.textContent = FILTER_LABELS[currentLootFilter] || 'FILTER';
      filterBtn.style.color = color;
      filterBtn.style.borderColor = color;
      filterBtn.style.textShadow = currentLootFilter !== 'off' ? `0 0 6px ${color}` : 'none';
    };

    function cycleLootFilter() {
      const idx = FILTER_MODES.indexOf(currentLootFilter);
      currentLootFilter = FILTER_MODES[(idx + 1) % FILTER_MODES.length];
      socket.emit('loot:filter', { mode: currentLootFilter });
      updateFilterButton();
    }

    filterBtn.addEventListener('touchstart', (e) => { e.preventDefault(); cycleLootFilter(); });
    filterBtn.addEventListener('click', cycleLootFilter);
    updateFilterButton();
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

// (Stash open/close/render consolidated above — see initializeButtons + renderStash)

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
  if (e.target.closest('#inv-content') || e.target.closest('.quest-list') || e.target.closest('.shop-items') || e.target.closest('.ldb-list') || e.target.closest('#rift-screen-content') || e.target.closest('#stash-screen')) return;
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
