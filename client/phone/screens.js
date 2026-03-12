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

    // Skill tooltips
    SKILL_DESCRIPTIONS,
    showSkillTooltip,
    hideSkillTooltip,
  };

})();
