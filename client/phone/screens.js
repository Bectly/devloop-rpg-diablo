// ─── DevLoop RPG — Phone Screens (Quest, Shop, Skill Tooltips) ───
// Loaded BEFORE controller.js. Exposes window.Screens.

window.Screens = (() => {

  // ─── Quest Icons ─────────────────────────────────────────────
  const QUEST_ICONS = {
    kill_count: '\u2694\uFE0F',
    kill_type: '\uD83C\uDFAF',
    clear_rooms: '\uD83D\uDDFA\uFE0F',
    collect_gold: '\uD83D\uDCB0',
    reach_floor: '\u2B07\uFE0F',
    use_shrine: '\u26EA',
    buy_item: '\uD83D\uDED2',
  };

  // ─── Quest State (set by controller before toggling) ────────
  let _questData = [];
  let _socket = null;

  function setQuestContext(questData, socket) {
    _questData = questData;
    _socket = socket;
  }

  // ─── Quest Screen ───────────────────────────────────────────
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
      renderQuests(_questData, _socket);
    }
  }

  function renderQuests(questData, socket) {
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
          <span class="quest-item-title"><span class="quest-icon">${QUEST_ICONS[quest.type] || '\uD83D\uDCDC'}</span> ${quest.title}</span>
          <span class="quest-item-progress">${quest.progress}/${quest.target}</span>
        </div>
        <div class="quest-item-desc">${quest.description}</div>
        <div class="quest-progress-bar">
          <div class="quest-progress-fill" style="width: ${pct}%"></div>
        </div>
        <div class="quest-reward">
          <span class="quest-reward-gold">${quest.reward.gold}g</span>
          ${quest.reward.item ? `<span class="quest-reward-item ${quest.reward.item.rarity || ''}">${quest.reward.item.name}</span>` : ''}
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

  function updateQuestBadge(questData) {
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

  // ─── Shop Screen ────────────────────────────────────────────
  let shopTab = 'buy';

  function createShopScreen() {
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

    // Tab handlers — capture refs for renderShopItems call via stored callback
    shopEl.querySelectorAll('.shop-tab').forEach(tab => {
      const handler = () => {
        shopTab = tab.dataset.tab;
        shopEl.querySelectorAll('.shop-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // Call the stored render callback (set by toggleShop)
        if (shopEl._renderCallback) shopEl._renderCallback();
      };
      tab.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); });
      tab.addEventListener('click', handler);
    });

    // Close handler
    const closeHandler = () => {
      shopEl.classList.add('hidden');
      if (shopEl._onClose) shopEl._onClose();
    };
    document.getElementById('shop-close').addEventListener('touchstart', (e) => { e.preventDefault(); closeHandler(); });
    document.getElementById('shop-close').addEventListener('click', closeHandler);
  }

  function toggleShop(shopData, inventoryData, socket, hapticFeedback, onClose) {
    createShopScreen();
    const shopEl = document.getElementById('shop-screen');
    shopEl.classList.remove('hidden');
    shopTab = 'buy';
    // Reset active tab UI
    shopEl.querySelectorAll('.shop-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === 'buy');
    });
    // Store render callback so tab switching can re-render
    shopEl._renderCallback = () => renderShopItems(shopData, shopTab, inventoryData, socket, hapticFeedback);
    shopEl._onClose = onClose;
    renderShopItems(shopData, shopTab, inventoryData, socket, hapticFeedback);
  }

  function renderShopItems(shopData, tab, inventoryData, socket, hapticFeedback) {
    if (!shopData) return;
    const shopEl = document.getElementById('shop-screen');
    if (!shopEl || shopEl.classList.contains('hidden')) return;

    document.getElementById('shop-gold').textContent = `${shopData.playerGold || 0}g`;

    const container = document.getElementById('shop-items');
    container.innerHTML = '';

    if (tab === 'buy') {
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

  // ─── Skill Tooltip System ──────────────────────────────────
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

  function showSkillTooltip(index, btn, playerStats, selectedClass) {
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

  // ─── Crafting Screen ──────────────────────────────────────
  let craftTab = 'salvage';
  let _craftSocket = null;
  let _craftInvData = null;
  let _craftHaptic = null;
  let _craftOnClose = null;
  let _pendingReforge = null; // { original, reforged, itemId }

  function createCraftingScreen() {
    if (document.getElementById('craft-screen')) return;

    const el = document.createElement('div');
    el.id = 'craft-screen';
    el.className = 'hidden';
    el.innerHTML = `
      <div class="craft-header">
        <span class="craft-title">CRAFTING</span>
        <span class="craft-materials" id="craft-mats"></span>
        <button class="craft-close" id="craft-close">&times;</button>
      </div>
      <div class="craft-tabs">
        <button class="craft-tab active" data-tab="salvage">Salvage</button>
        <button class="craft-tab" data-tab="reforge">Reforge</button>
        <button class="craft-tab" data-tab="upgrade">Upgrade</button>
      </div>
      <div class="craft-items" id="craft-items"></div>
    `;
    document.body.appendChild(el);

    // Tab handlers
    el.querySelectorAll('.craft-tab').forEach(tab => {
      const handler = () => {
        craftTab = tab.dataset.tab;
        el.querySelectorAll('.craft-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        _pendingReforge = null;
        if (el._renderCallback) el._renderCallback();
      };
      tab.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); });
      tab.addEventListener('click', handler);
    });

    // Close handler
    const closeHandler = () => {
      el.classList.add('hidden');
      _pendingReforge = null;
      if (_craftOnClose) _craftOnClose();
    };
    document.getElementById('craft-close').addEventListener('touchstart', (e) => { e.preventDefault(); closeHandler(); });
    document.getElementById('craft-close').addEventListener('click', closeHandler);
  }

  function toggleCrafting(inventoryData, socket, hapticFeedback, onClose) {
    createCraftingScreen();
    const el = document.getElementById('craft-screen');
    el.classList.remove('hidden');
    craftTab = 'salvage';
    _craftSocket = socket;
    _craftInvData = inventoryData;
    _craftHaptic = hapticFeedback;
    _craftOnClose = onClose;
    _pendingReforge = null;
    // Reset tab UI
    el.querySelectorAll('.craft-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === 'salvage');
    });
    el._renderCallback = () => renderCraftingItems();
    renderCraftingItems();
  }

  function updateCraftingInventory(inventoryData) {
    _craftInvData = inventoryData;
    const el = document.getElementById('craft-screen');
    if (el && !el.classList.contains('hidden')) {
      renderCraftingItems();
    }
  }

  function _formatMaterials(items) {
    let dust = 0, essence = 0, crystal = 0;
    if (items) {
      for (const item of items) {
        if (item.type === 'material') {
          if (item.subType === 'arcane_dust') dust += (item.quantity || 1);
          else if (item.subType === 'magic_essence') essence += (item.quantity || 1);
          else if (item.subType === 'rare_crystal') crystal += (item.quantity || 1);
        }
      }
    }
    return { dust, essence, crystal };
  }

  function renderCraftingItems() {
    const container = document.getElementById('craft-items');
    if (!container) return;
    container.innerHTML = '';

    const items = _craftInvData && _craftInvData.items ? _craftInvData.items : [];
    const mats = _formatMaterials(items);

    // Update materials display
    const matsEl = document.getElementById('craft-mats');
    if (matsEl) {
      matsEl.innerHTML = `<span class="mat-dust">${mats.dust}</span> <span class="mat-essence">${mats.essence}</span> <span class="mat-crystal">${mats.crystal}</span>`;
    }

    // Show pending reforge result
    if (craftTab === 'reforge' && _pendingReforge) {
      _renderReforgeResult(container);
      return;
    }

    // Filter to craftable items (equipment only)
    const equipment = items.filter(i => i.type === 'weapon' || i.type === 'armor' || i.type === 'accessory');

    if (equipment.length === 0) {
      container.innerHTML = '<div class="craft-empty">No items to craft with</div>';
      return;
    }

    for (const item of equipment) {
      const el = document.createElement('div');
      el.className = 'craft-item';
      const rarityClass = (item.rarity || 'common').toLowerCase();

      // Item info
      let statsText = '';
      if (item.damage) statsText += `DMG:${item.damage} `;
      if (item.armor) statsText += `ARM:${item.armor} `;
      if (item.bonuses) {
        for (const [stat, val] of Object.entries(item.bonuses)) {
          statsText += `+${val} ${stat.toUpperCase()} `;
        }
      }
      const upgradeTag = item.upgradeLevel ? ` [+${item.upgradeLevel}]` : '';

      const infoEl = document.createElement('div');
      infoEl.className = 'craft-item-info';
      infoEl.innerHTML = `
        <div class="shop-item-name ${rarityClass}">${item.name}${upgradeTag}</div>
        <div class="shop-item-type">${(item.rarity || '').toUpperCase()} ${item.type || ''}</div>
        ${statsText.trim() ? `<div class="shop-item-stats">${statsText.trim()}</div>` : ''}
      `;

      el.appendChild(infoEl);

      if (craftTab === 'salvage') {
        _renderSalvageAction(el, item, mats);
      } else if (craftTab === 'reforge') {
        _renderReforgeAction(el, item, mats);
      } else if (craftTab === 'upgrade') {
        _renderUpgradeAction(el, item, mats);
      }

      container.appendChild(el);
    }
  }

  function _renderSalvageAction(el, item, mats) {
    // Estimate yields client-side (server has final say)
    const yields = {
      common: { d: 1 }, uncommon: { d: 2 }, rare: { d: 3, e: 1 },
      epic: { d: 5, e: 2 }, legendary: { d: 8, e: 3, c: 1 }, set: { d: 3, e: 2, c: 1 },
    };
    const y = yields[item.rarity || 'common'] || yields.common;
    const yieldText = [
      y.d ? `${y.d} dust` : '',
      y.e ? `${y.e} ess.` : '',
      y.c ? `${y.c} crys.` : '',
    ].filter(Boolean).join(', ');

    const costEl = document.createElement('div');
    costEl.className = 'craft-cost';
    costEl.textContent = yieldText;

    const btn = document.createElement('button');
    btn.className = 'craft-btn salvage';
    btn.textContent = 'SALVAGE';

    const handler = () => {
      _craftSocket.emit('craft:salvage', { itemId: item.id });
      if (_craftHaptic) _craftHaptic();
    };
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); });
    btn.addEventListener('click', handler);

    el.appendChild(costEl);
    el.appendChild(btn);
  }

  function _renderReforgeAction(el, item, mats) {
    const reforgeCount = item.reforgeCount || 0;
    const dustCost = 3 + reforgeCount;
    const goldCost = 50 + reforgeCount * 25;
    const hasBonuses = item.bonuses && Object.keys(item.bonuses).length > 0;
    const canDo = hasBonuses && mats.dust >= dustCost;

    const costEl = document.createElement('div');
    costEl.className = 'craft-cost';
    costEl.innerHTML = `<span class="mat-dust">${dustCost}</span> + ${goldCost}g`;

    const btn = document.createElement('button');
    btn.className = 'craft-btn reforge';
    btn.textContent = 'REFORGE';
    if (!canDo) btn.disabled = true;

    const handler = () => {
      if (!canDo) return;
      _craftSocket.emit('craft:reforge', { itemId: item.id });
      if (_craftHaptic) _craftHaptic();
    };
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); });
    btn.addEventListener('click', handler);

    el.appendChild(costEl);
    el.appendChild(btn);
  }

  function _renderUpgradeAction(el, item, mats) {
    const level = item.upgradeLevel || 0;
    const costs = {
      1: { e: 2, gold: 100 },
      2: { e: 4, c: 1, gold: 250 },
      3: { e: 8, c: 3, gold: 500 },
    };
    const nextLevel = level + 1;
    if (nextLevel > 3) {
      const maxEl = document.createElement('div');
      maxEl.className = 'craft-cost';
      maxEl.textContent = 'MAX LEVEL';
      el.appendChild(maxEl);
      return;
    }
    const cost = costs[nextLevel];
    const canDo = mats.essence >= (cost.e || 0) && mats.crystal >= (cost.c || 0);

    const costEl = document.createElement('div');
    costEl.className = 'craft-cost';
    const parts = [];
    if (cost.e) parts.push(`<span class="mat-essence">${cost.e}</span>`);
    if (cost.c) parts.push(`<span class="mat-crystal">${cost.c}</span>`);
    parts.push(`${cost.gold}g`);
    costEl.innerHTML = parts.join(' + ');

    const btn = document.createElement('button');
    btn.className = 'craft-btn upgrade';
    btn.textContent = `+${nextLevel}`;
    if (!canDo) btn.disabled = true;

    const handler = () => {
      if (!canDo) return;
      _craftSocket.emit('craft:upgrade', { itemId: item.id });
      if (_craftHaptic) _craftHaptic();
    };
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); });
    btn.addEventListener('click', handler);

    el.appendChild(costEl);
    el.appendChild(btn);
  }

  function _renderReforgeResult(container) {
    const data = _pendingReforge;
    container.innerHTML = '';

    const wrapper = document.createElement('div');
    wrapper.className = 'reforge-result';

    // Original bonuses
    const origEl = document.createElement('div');
    origEl.className = 'reforge-side';
    origEl.innerHTML = '<div class="reforge-label">ORIGINAL</div>';
    for (const [stat, val] of Object.entries(data.original.bonuses)) {
      origEl.innerHTML += `<div class="reforge-stat">+${val} ${stat.toUpperCase()}</div>`;
    }

    // Reforged bonuses
    const newEl = document.createElement('div');
    newEl.className = 'reforge-side reforged';
    newEl.innerHTML = '<div class="reforge-label">REFORGED</div>';
    for (const [stat, val] of Object.entries(data.reforged.bonuses)) {
      const changed = !data.original.bonuses[stat] || data.original.bonuses[stat] !== val;
      const cls = changed ? 'reforge-stat changed' : 'reforge-stat';
      newEl.innerHTML += `<div class="${cls}">+${val} ${stat.toUpperCase()}</div>`;
    }

    wrapper.appendChild(origEl);
    wrapper.appendChild(newEl);
    container.appendChild(wrapper);

    // Accept / Reject buttons
    const btnRow = document.createElement('div');
    btnRow.className = 'reforge-buttons';

    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'craft-btn upgrade';
    acceptBtn.textContent = 'ACCEPT';
    const acceptHandler = () => {
      _craftSocket.emit('craft:reforge_accept', { itemId: data.itemId, accept: true });
      _pendingReforge = null;
      if (_craftHaptic) _craftHaptic();
    };
    acceptBtn.addEventListener('touchstart', (e) => { e.preventDefault(); acceptHandler(); });
    acceptBtn.addEventListener('click', acceptHandler);

    const rejectBtn = document.createElement('button');
    rejectBtn.className = 'craft-btn salvage';
    rejectBtn.textContent = 'REJECT';
    const rejectHandler = () => {
      _craftSocket.emit('craft:reforge_accept', { itemId: data.itemId, accept: false });
      _pendingReforge = null;
      if (_craftHaptic) _craftHaptic();
      renderCraftingItems(); // Re-render item list
    };
    rejectBtn.addEventListener('touchstart', (e) => { e.preventDefault(); rejectHandler(); });
    rejectBtn.addEventListener('click', rejectHandler);

    btnRow.appendChild(acceptBtn);
    btnRow.appendChild(rejectBtn);
    container.appendChild(btnRow);
  }

  function handleReforgeResult(data) {
    _pendingReforge = data;
    const el = document.getElementById('craft-screen');
    if (el && !el.classList.contains('hidden') && craftTab === 'reforge') {
      renderCraftingItems();
    }
  }

  // ─── Leaderboard Screen ──────────────────────────────────────
  function createLeaderboardScreen() {
    if (document.getElementById('leaderboard-screen')) return;

    const screen = document.createElement('div');
    screen.id = 'leaderboard-screen';
    screen.className = 'hidden';
    screen.innerHTML = `
      <div class="ldb-header">
        <span class="ldb-title">\uD83C\uDFC6 LEADERBOARD</span>
        <button class="ldb-close" id="ldb-close">&times;</button>
      </div>
      <div class="ldb-tabs">
        <button class="ldb-tab active" id="ldb-tab-top">Top 10</button>
        <button class="ldb-tab" id="ldb-tab-personal">My Runs</button>
      </div>
      <div class="ldb-list" id="ldb-list"></div>
    `;
    document.body.appendChild(screen);

    document.getElementById('ldb-close').addEventListener('touchstart', (e) => {
      e.preventDefault();
      toggleLeaderboard();
    });
    document.getElementById('ldb-close').addEventListener('click', (e) => {
      e.preventDefault();
      toggleLeaderboard();
    });
  }

  let _ldbSocket = null;

  let _ldbTabsWired = false;

  function toggleLeaderboard(socket) {
    createLeaderboardScreen();
    if (socket) _ldbSocket = socket;
    const screen = document.getElementById('leaderboard-screen');
    screen.classList.toggle('hidden');

    if (!screen.classList.contains('hidden')) {
      // Wire tab buttons ONCE (avoid memory leak from re-wiring every toggle)
      if (!_ldbTabsWired) {
        const topTab = document.getElementById('ldb-tab-top');
        const personalTab = document.getElementById('ldb-tab-personal');

        topTab.onclick = () => {
          topTab.classList.add('active');
          personalTab.classList.remove('active');
          if (_ldbSocket) _ldbSocket.emit('leaderboard:get');
        };
        personalTab.onclick = () => {
          personalTab.classList.add('active');
          topTab.classList.remove('active');
          if (_ldbSocket) _ldbSocket.emit('leaderboard:personal');
        };
        _ldbTabsWired = true;
      }

      // Request top runs by default
      if (_ldbSocket) _ldbSocket.emit('leaderboard:get');
    }
  }

  function renderLeaderboard(entries, type) {
    const container = document.getElementById('ldb-list');
    if (!container) return;
    container.innerHTML = '';

    if (!entries || entries.length === 0) {
      container.innerHTML = '<div class="ldb-empty">No runs recorded yet. Conquer the dungeon!</div>';
      return;
    }

    // Table header
    const header = document.createElement('div');
    header.className = 'ldb-row ldb-header-row';
    header.innerHTML = '<span class="ldb-rank">#</span><span class="ldb-name">Name</span><span class="ldb-class">Class</span><span class="ldb-lvl">Lvl</span><span class="ldb-floor">Flr</span><span class="ldb-kills">Kills</span><span class="ldb-time">Time</span>';
    container.appendChild(header);

    entries.forEach((entry, i) => {
      const row = document.createElement('div');
      row.className = 'ldb-row' + (entry.victory ? ' ldb-victory' : '');

      const mins = Math.floor(entry.time_seconds / 60);
      const secs = entry.time_seconds % 60;
      const timeStr = `${mins}:${secs.toString().padStart(2, '0')}`;

      const rankEl = document.createElement('span');
      rankEl.className = 'ldb-rank';
      rankEl.textContent = `${i + 1}`;

      const nameEl = document.createElement('span');
      nameEl.className = 'ldb-name';
      nameEl.textContent = entry.player_name;

      const classEl = document.createElement('span');
      classEl.className = 'ldb-class';
      classEl.textContent = entry.character_class ? entry.character_class.substring(0, 3).toUpperCase() : '???';

      const lvlEl = document.createElement('span');
      lvlEl.className = 'ldb-lvl';
      lvlEl.textContent = entry.level;

      const floorEl = document.createElement('span');
      floorEl.className = 'ldb-floor';
      floorEl.textContent = entry.floor_reached;

      const killsEl = document.createElement('span');
      killsEl.className = 'ldb-kills';
      killsEl.textContent = entry.kills;

      const timeEl = document.createElement('span');
      timeEl.className = 'ldb-time';
      timeEl.textContent = timeStr;

      // Difficulty badge on name
      if (entry.difficulty && entry.difficulty !== 'normal') {
        const diffBadge = document.createElement('span');
        diffBadge.className = 'ldb-diff ldb-diff-' + entry.difficulty;
        diffBadge.textContent = entry.difficulty === 'nightmare' ? 'NM' : 'HELL';
        nameEl.appendChild(diffBadge);
      }

      row.appendChild(rankEl);
      row.appendChild(nameEl);
      row.appendChild(classEl);
      row.appendChild(lvlEl);
      row.appendChild(floorEl);
      row.appendChild(killsEl);
      row.appendChild(timeEl);

      if (entry.victory) {
        const badge = document.createElement('span');
        badge.className = 'ldb-badge';
        badge.textContent = '\u2728';
        row.appendChild(badge);
      }

      container.appendChild(row);
    });

    // Update active tab highlight
    const topTab = document.getElementById('ldb-tab-top');
    const personalTab = document.getElementById('ldb-tab-personal');
    if (topTab && personalTab) {
      if (type === 'top') {
        topTab.classList.add('active');
        personalTab.classList.remove('active');
      } else {
        personalTab.classList.add('active');
        topTab.classList.remove('active');
      }
    }
  }

  // ─── Public API ─────────────────────────────────────────────
  return {
    // Quest
    QUEST_ICONS,
    setQuestContext,
    createQuestScreen,
    toggleQuestLog,
    renderQuests,
    updateQuestBadge,

    // Shop
    createShopScreen,
    toggleShop,
    renderShopItems,
    estimateSellPrice,

    // Crafting
    createCraftingScreen,
    toggleCrafting,
    updateCraftingInventory,
    handleReforgeResult,

    // Skill tooltips
    SKILL_DESCRIPTIONS,
    showSkillTooltip,
    hideSkillTooltip,

    // Leaderboard
    createLeaderboardScreen,
    toggleLeaderboard,
    renderLeaderboard,
  };

})();
