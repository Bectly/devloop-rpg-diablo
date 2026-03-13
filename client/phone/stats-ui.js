// ─── DevLoop RPG — Stats & Item Tooltip UI ──────────────────────
// Extracted from controller.js (Cycle #82) to keep controller.js under 1000 LOC.

const StatsUI = (() => {

  function renderStats(playerStats, socket) {
    if (!playerStats) return;

    const statList = document.getElementById('stat-list');
    statList.innerHTML = '';
    const oldResist = statList.parentNode.querySelector('.resist-section');
    if (oldResist) oldResist.remove();

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
        btn.addEventListener('click', () => {
          socket.emit('levelup:stat', { stat: s.key });
        });
      }

      statList.appendChild(row);
    }

    // Resistance display
    const resistances = playerStats.resistances;
    if (resistances) {
      const resistSection = document.createElement('div');
      resistSection.className = 'resist-section';

      const resistTitle = document.createElement('div');
      resistTitle.className = 'resist-title';
      resistTitle.textContent = 'Resistances';
      resistSection.appendChild(resistTitle);

      const resistTypes = [
        { key: 'fire', icon: '\uD83D\uDD25', label: 'Fire', cls: 'resist-fire' },
        { key: 'cold', icon: '\u2744', label: 'Cold', cls: 'resist-cold' },
        { key: 'poison', icon: '\uD83E\uDDEA', label: 'Poison', cls: 'resist-poison' },
      ];

      for (const r of resistTypes) {
        const val = resistances[r.key] || 0;
        const row = document.createElement('div');
        row.className = 'resist-row';
        row.innerHTML = `<span class="${r.cls}">${r.icon} ${r.label}</span><span class="${r.cls}">${val}%</span>`;
        resistSection.appendChild(row);
      }

      statList.parentNode.appendChild(resistSection);
    }

    // Active sets display
    if (playerStats.activeSets && playerStats.activeSets.length > 0) {
      const oldSets = statList.parentNode.querySelector('.sets-section');
      if (oldSets) oldSets.remove();

      const setsSection = document.createElement('div');
      setsSection.className = 'sets-section';

      const setsTitle = document.createElement('div');
      setsTitle.className = 'sets-title';
      setsTitle.textContent = 'Sets';
      setsSection.appendChild(setsTitle);

      for (const as of playerStats.activeSets) {
        const setRow = document.createElement('div');
        setRow.className = 'set-row';

        const setName = document.createElement('div');
        setName.className = 'set-row-name';
        setName.textContent = `${as.name} (${as.pieces}/${as.totalPieces})`;
        setRow.appendChild(setName);

        if (!as.bonuses) continue;
        for (const b of as.bonuses) {
          const bonusEl = document.createElement('div');
          bonusEl.className = b.active ? 'set-bonus-active' : 'set-bonus-inactive';
          bonusEl.textContent = `(${b.threshold}) ${b.description}`;
          setRow.appendChild(bonusEl);
        }

        setsSection.appendChild(setRow);
      }

      statList.parentNode.appendChild(setsSection);
    } else {
      const oldSets = statList.parentNode.querySelector('.sets-section');
      if (oldSets) oldSets.remove();
    }
  }

  function showTooltip(item, anchor, isEquipped, slotName, playerStats, socket) {
    const tt = document.getElementById('item-tooltip');
    tt.classList.remove('hidden');

    let html = `<div class="tt-name" style="color:${item.rarityColor || '#aaa'}">${item.name}</div>`;
    html += `<div class="tt-type">${(item.rarity || '').toUpperCase()} ${item.type || ''} ${item.subType ? '(' + item.subType + ')' : ''}</div>`;

    if (item.damage) html += `<div class="tt-stat">Damage: ${item.damage}</div>`;
    if (item.armor) html += `<div class="tt-stat">Armor: ${item.armor}</div>`;
    if (item.bonuses) {
      const resistMap = {
        fire_resist:   { icon: '\uD83D\uDD25', label: 'Fire Resist',   cls: 'resist-fire' },
        cold_resist:   { icon: '\u2744',       label: 'Cold Resist',   cls: 'resist-cold' },
        poison_resist: { icon: '\uD83E\uDDEA', label: 'Poison Resist', cls: 'resist-poison' },
        all_resist:    { icon: '\uD83D\uDEE1',  label: 'All Resist',    cls: 'resist-all' },
      };
      for (const [stat, val] of Object.entries(item.bonuses)) {
        const resist = resistMap[stat];
        if (resist) {
          html += `<div class="tt-stat ${resist.cls}">${resist.icon} +${val} ${resist.label}</div>`;
        } else {
          html += `<div class="tt-stat">+${val} ${stat.toUpperCase()}</div>`;
        }
      }
    }
    // Socket display (interactive buttons added below via DOM)
    if (item.sockets && item.sockets.length > 0) {
      html += '<div class="tt-sockets" id="tt-sockets-area"></div>';
    }

    if (item.description) html += `<div style="color:#888;margin-top:4px;font-size:10px">${item.description}</div>`;

    // ── Quick-compare vs equipped item ──
    if (!isEquipped && item.slot && playerStats && playerStats.equipment) {
      const equipped = playerStats.equipment[item.slot];
      if (equipped) {
        html += '<div class="compare-section">';
        html += `<div class="compare-header">vs ${equipped.name}</div>`;

        // Compare damage
        if (item.damage || equipped.damage) {
          const diff = (item.damage || 0) - (equipped.damage || 0);
          if (diff !== 0) {
            const cls = diff > 0 ? 'compare-better' : 'compare-worse';
            html += `<div class="${cls}">${diff > 0 ? '+' : ''}${diff} DMG</div>`;
          }
        }
        // Compare armor
        if (item.armor || equipped.armor) {
          const diff = (item.armor || 0) - (equipped.armor || 0);
          if (diff !== 0) {
            const cls = diff > 0 ? 'compare-better' : 'compare-worse';
            html += `<div class="${cls}">${diff > 0 ? '+' : ''}${diff} ARM</div>`;
          }
        }
        // Compare bonuses
        const allStats = new Set([
          ...Object.keys(item.bonuses || {}),
          ...Object.keys(equipped.bonuses || {}),
        ]);
        for (const stat of allStats) {
          const newVal = (item.bonuses && item.bonuses[stat]) || 0;
          const oldVal = (equipped.bonuses && equipped.bonuses[stat]) || 0;
          const diff = newVal - oldVal;
          if (diff === 0) continue;
          const cls = diff > 0 ? 'compare-better' : 'compare-worse';
          html += `<div class="${cls}">${diff > 0 ? '+' : ''}${diff} ${stat.toUpperCase()}</div>`;
        }
        html += '</div>';
      }
    }

    // Set item info
    if (item.isSetItem && item.setId && playerStats && playerStats.activeSets) {
      const setInfo = playerStats.activeSets.find(s => s.setId === item.setId);
      const pieces = setInfo ? setInfo.pieces : 0;
      const total = setInfo ? setInfo.totalPieces : 3;
      html += `<div class="tt-set-header">Set: ${setInfo ? setInfo.name : item.setId} (${pieces}/${total})</div>`;

      if (playerStats.equipment) {
        html += '<div class="tt-set-pieces">';
        for (const [slot, eq] of Object.entries(playerStats.equipment)) {
          if (eq && eq.setId === item.setId) {
            html += `<div class="set-piece-owned">\u2713 ${eq.name}</div>`;
          }
        }
        html += '</div>';
      }

      html += '<div class="tt-set-bonuses">';
      const activeBonuses = (setInfo && setInfo.bonuses) ? setInfo.bonuses : [];
      const b2 = activeBonuses.find(b => b.threshold === 2);
      const b3 = activeBonuses.find(b => b.threshold === 3);
      html += `<div class="${b2 ? 'set-bonus-active' : 'set-bonus-inactive'}">(2) ${b2 ? b2.description : '???'}</div>`;
      html += `<div class="${b3 ? 'set-bonus-active' : 'set-bonus-inactive'}">(3) ${b3 ? b3.description : '???'}</div>`;
      html += '</div>';
    }

    tt.innerHTML = html;

    // ── Socket UI (DOM-built, XSS-safe) ──
    const socketsArea = tt.querySelector('#tt-sockets-area');
    if (socketsArea && item.sockets) {
      for (let i = 0; i < item.sockets.length; i++) {
        const gem = item.sockets[i];
        const row = document.createElement('div');
        row.className = 'tt-socket-row';

        if (gem) {
          // Filled socket: show gem + unsocket button
          const label = document.createElement('span');
          label.className = 'tt-socket filled';
          label.style.color = gem.color || '#aaa';
          label.textContent = '\u25C6 ' + (gem.name || 'Gem');
          row.appendChild(label);

          const unsocketBtn = document.createElement('button');
          unsocketBtn.className = 'tt-socket-btn unsocket';
          const itemLevel = item.level || item.itemLevel || 1;
          unsocketBtn.textContent = 'Unsocket (' + (50 * itemLevel) + 'g)';
          unsocketBtn.addEventListener('click', ((idx) => () => {
            if (_socket) {
              _socket.emit('gem:unsocket', { itemId: item.id, socketIndex: idx });
              hideTooltip();
            }
          })(i));
          row.appendChild(unsocketBtn);
        } else {
          // Empty socket: show empty label + "Socket Gem" button
          const label = document.createElement('span');
          label.className = 'tt-socket empty';
          label.textContent = '\u25CB Empty Socket';
          row.appendChild(label);

          const socketBtn = document.createElement('button');
          socketBtn.className = 'tt-socket-btn socket';
          socketBtn.textContent = 'Socket Gem';
          socketBtn.addEventListener('click', ((idx) => () => {
            _showGemPicker(item.id, idx);
          })(i));
          row.appendChild(socketBtn);
        }

        socketsArea.appendChild(row);
      }
    }

    // Action buttons — appended via DOM to avoid ID injection in onclick strings
    const actions = document.createElement('div');
    actions.className = 'tt-actions';
    if (isEquipped) {
      const btn = document.createElement('button');
      btn.textContent = 'Unequip';
      btn.addEventListener('click', () => StatsUI.unequipItem(slotName));
      actions.appendChild(btn);
    } else if (item.slot) {
      const btn = document.createElement('button');
      btn.textContent = 'Equip';
      btn.addEventListener('click', () => StatsUI.equipItem(item.id));
      actions.appendChild(btn);
    }
    const dropBtn = document.createElement('button');
    dropBtn.textContent = 'Drop';
    dropBtn.addEventListener('click', () => StatsUI.dropItem(item.id));
    actions.appendChild(dropBtn);
    if (!isEquipped && _socket) {
      const stashBtn = document.createElement('button');
      stashBtn.textContent = 'Stash';
      stashBtn.addEventListener('click', () => {
        _socket.emit('stash:store', { itemId: item.id });
        hideTooltip();
      });
      actions.appendChild(stashBtn);
    }
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => StatsUI.hideTooltip());
    actions.appendChild(closeBtn);
    tt.appendChild(actions);

    const rect = anchor.getBoundingClientRect();
    tt.style.top = Math.min(rect.bottom + 5, window.innerHeight - 200) + 'px';
    tt.style.left = Math.max(10, Math.min(rect.left, window.innerWidth - 260)) + 'px';
  }

  function hideTooltip() {
    document.getElementById('item-tooltip').classList.add('hidden');
  }

  // Action helpers — need socket reference, set from controller.js
  let _socket = null;
  function setSocket(s) { _socket = s; }

  function equipItem(itemId) {
    if (_socket) _socket.emit('inventory:equip', { itemId });
    hideTooltip();
  }

  function unequipItem(slot) {
    if (_socket) _socket.emit('inventory:unequip', { slot });
    hideTooltip();
  }

  function dropItem(itemId) {
    if (_socket) _socket.emit('inventory:drop', { itemId });
    hideTooltip();
  }

  // ── Gem Picker Overlay ──
  let _lastInventoryData = null;
  function setInventoryData(data) { _lastInventoryData = data; }

  function _showGemPicker(itemId, socketIndex) {
    hideTooltip();

    // Get gems from inventory
    const items = _lastInventoryData ? (_lastInventoryData.items || []) : [];
    const gems = items.filter(i => i.type === 'gem');

    if (gems.length === 0) {
      if (typeof showNotification === 'function') showNotification('No gems in inventory', 'info');
      return;
    }

    // Create overlay
    let overlay = document.getElementById('gem-picker-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'gem-picker-overlay';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
    overlay.classList.remove('hidden');

    const title = document.createElement('div');
    title.className = 'gem-picker-title';
    title.textContent = 'Select a Gem';
    overlay.appendChild(title);

    const list = document.createElement('div');
    list.className = 'gem-picker-list';

    for (const gem of gems) {
      const row = document.createElement('div');
      row.className = 'gem-picker-row';

      const icon = document.createElement('span');
      icon.className = 'gem-picker-icon';
      icon.style.color = gem.color || '#aaa';
      icon.textContent = '\u25C6';
      row.appendChild(icon);

      const name = document.createElement('span');
      name.className = 'gem-picker-name';
      name.textContent = gem.name;
      row.appendChild(name);

      const bonus = document.createElement('span');
      bonus.className = 'gem-picker-bonus';
      if (gem.bonuses) {
        bonus.textContent = Object.entries(gem.bonuses).map(([k, v]) => '+' + v + ' ' + k.toUpperCase()).join(', ');
      }
      row.appendChild(bonus);

      row.addEventListener('click', () => {
        if (_socket) {
          _socket.emit('gem:socket', { itemId: itemId, gemId: gem.id });
        }
        overlay.classList.add('hidden');
      });

      list.appendChild(row);
    }
    overlay.appendChild(list);

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gem-picker-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.classList.add('hidden'));
    overlay.appendChild(cancelBtn);
  }

  return { renderStats, showTooltip, hideTooltip, setSocket, setInventoryData, equipItem, unequipItem, dropItem };
})();
