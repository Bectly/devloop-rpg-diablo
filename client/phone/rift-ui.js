// ─── Rift UI Module ───────────────────────────────────────────────
const RiftUI = (() => {
  let _socket       = null;
  let _visible      = false;
  let _keystones    = 0;
  let _maxUnlockedTier = 1;
  let _riftActive   = false;
  let _riftTimer    = 0;
  let _riftModifiers = [];
  let _riftTier     = 0;
  let _selectedTier = 1;
  let _timerInterval = null;

  // Modifier display data
  const MOD_ICONS = {
    deadly:    '💀',
    fortified: '🛡️',
    hasty:     '⚡',
    shielded:  '🔰',
    burning:   '🔥',
    vampiric:  '🧛',
    cursed:    '☠️',
    chaotic:   '🌀',
    armored:   '🪖',
    empowered: '✨',
  };

  const MOD_COLORS = {
    deadly:    '#ff4444',
    fortified: '#4488ff',
    hasty:     '#ffcc00',
    shielded:  '#88ccff',
    burning:   '#ff8800',
    vampiric:  '#cc44cc',
    cursed:    '#88ff44',
    chaotic:   '#ff44ff',
    armored:   '#aaaaaa',
    empowered: '#ffaa00',
  };

  // Tier definitions mirror server: timeLimit = 180 - (t-1)*5, modCount = 1+floor(t/3)
  function _tierDef(t) {
    return {
      tier: t,
      modifierCount: 1 + Math.floor(t / 3),
      timeLimit: 180 - (t - 1) * 5,
      xpReward: t * 500,
      goldReward: t * 200,
      keystoneReward: t >= 5 ? 1 : 0,
    };
  }

  // ─── init ───────────────────────────────────────────────────────
  function init(socket) {
    _socket = socket;

    socket.on('rift:status', (data) => {
      // Backend sends state: 'pending' | 'active' | 'cancelled'
      if (data.state === 'cancelled') {
        _riftActive = false;
        _stopTimerInterval();
        _hideTimerBar();
        if (_visible) render();
        return;
      }
      _riftActive    = data.state === 'active';
      _riftTier      = data.tier   || 0;
      _riftModifiers = data.modifiers || [];
      _riftTimer     = data.timeLimit || 0;
      if (data.keystones !== undefined) _keystones = data.keystones;

      _updateTimerBar();
      _updateKeystoneBadge();

      // If pending, show waiting message
      if (data.state === 'pending') {
        _showPendingOverlay(data);
      }

      if (_visible) render();
    });

    socket.on('rift:timer', (data) => {
      _riftTimer = data.remaining;
      updateTimer(data.remaining);
    });

    socket.on('rift:complete', (data) => {
      _riftActive = false;
      _stopTimerInterval();
      _hideTimerBar();
      // Flatten rewards for overlay: backend sends { rewards: { xp, gold, keystones, ... }, timeRemaining, ... }
      const rewardData = {
        ...(data.rewards || {}),
        timeRemaining: data.timeRemaining,
        timeLimit: data.tier ? _tierDef(data.tier).timeLimit : 0,
      };
      _showRewardsOverlay(rewardData, false);
      if (data.rewards && data.rewards.keystones !== undefined) {
        _keystones += data.rewards.keystones;
      }
      _updateKeystoneBadge();
    });

    socket.on('rift:failed', (data) => {
      _riftActive = false;
      _stopTimerInterval();
      _hideTimerBar();
      _showRewardsOverlay(data, true);
    });

    socket.on('rift:guardian', (data) => {
      _flashGuardianAlert(data);
    });
  }

  // ─── show / hide ─────────────────────────────────────────────────
  function show() {
    _visible = true;
    const el = document.getElementById('rift-screen');
    if (el) el.classList.remove('hidden');
    if (_socket) _socket.emit('rift:request_status');
    render();
  }

  function hide() {
    _visible = false;
    const el = document.getElementById('rift-screen');
    if (el) el.classList.add('hidden');
  }

  function isVisible() { return _visible; }

  // ─── keystones ───────────────────────────────────────────────────
  function updateKeystones(n) {
    _keystones = n;
    _updateKeystoneBadge();
    if (_visible) render();
  }

  function _updateKeystoneBadge() {
    const badge = document.getElementById('rift-keystone-badge');
    if (badge) badge.textContent = `🔑 ${_keystones}`;
  }

  // ─── render ──────────────────────────────────────────────────────
  function render() {
    const container = document.getElementById('rift-screen-content');
    if (!container) return;
    container.innerHTML = '';

    if (_riftActive) {
      renderActiveRift(container);
    } else {
      renderTierSelector(container);
    }
  }

  // ─── Tier Selector ───────────────────────────────────────────────
  function renderTierSelector(container) {
    // Header
    const header = document.createElement('div');
    header.className = 'rift-selector-header';

    const title = document.createElement('div');
    title.className = 'rift-title';
    title.textContent = '⚔️ NEPHALEM RIFTS';

    const keyBadge = document.createElement('div');
    keyBadge.className = 'rift-keystone-count';
    keyBadge.textContent = `🔑 ${_keystones} keystone${_keystones !== 1 ? 's' : ''}`;
    if (_keystones === 0) keyBadge.classList.add('empty');

    header.appendChild(title);
    header.appendChild(keyBadge);
    container.appendChild(header);

    // Tier grid (2×5)
    const grid = document.createElement('div');
    grid.className = 'rift-tier-grid';

    for (let t = 1; t <= 10; t++) {
      const def = _tierDef(t);
      const locked = t > _maxUnlockedTier;
      const selected = t === _selectedTier;

      const btn = document.createElement('button');
      btn.className = 'rift-tier-btn';
      if (locked)    btn.classList.add('locked');
      if (selected)  btn.classList.add('selected');

      const tierLabel = document.createElement('div');
      tierLabel.className = 'rift-tier-label';
      tierLabel.textContent = locked ? `🔒 T${t}` : `Tier ${t}`;

      const modCount = document.createElement('div');
      modCount.className = 'rift-tier-mods';
      modCount.textContent = `${def.modifierCount} mod${def.modifierCount !== 1 ? 's' : ''}`;

      const timeEl = document.createElement('div');
      timeEl.className = 'rift-tier-time';
      timeEl.textContent = `⏱ ${def.timeLimit}s`;

      btn.appendChild(tierLabel);
      btn.appendChild(modCount);
      btn.appendChild(timeEl);

      if (!locked) {
        const select = () => {
          _selectedTier = t;
          if (_visible) render();
        };
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); select(); });
        btn.addEventListener('click', select);
      }

      grid.appendChild(btn);
    }

    container.appendChild(grid);

    // Modifier preview for selected tier
    const preview = document.createElement('div');
    preview.className = 'rift-mod-preview';

    const def = _tierDef(_selectedTier);
    const previewTitle = document.createElement('div');
    previewTitle.className = 'rift-preview-title';
    previewTitle.textContent = `Tier ${_selectedTier} — up to ${def.modifierCount} modifier${def.modifierCount !== 1 ? 's' : ''}`;
    preview.appendChild(previewTitle);

    const allMods = ['deadly','fortified','hasty','shielded','burning','vampiric','cursed','chaotic','armored','empowered'];
    const modRow = document.createElement('div');
    modRow.className = 'rift-preview-mods';

    // Show how many mod slots, with placeholders
    for (let i = 0; i < def.modifierCount; i++) {
      const pill = document.createElement('div');
      pill.className = 'rift-mod-pill placeholder';
      pill.textContent = '?';
      modRow.appendChild(pill);
    }
    preview.appendChild(modRow);

    const rewardRow = document.createElement('div');
    rewardRow.className = 'rift-preview-rewards';
    rewardRow.innerHTML =
      `<span class="rift-reward-xp">✨ ${def.xpReward} XP</span>` +
      `<span class="rift-reward-gold">💰 ${def.goldReward}g</span>` +
      (def.keystoneReward ? `<span class="rift-reward-key">🔑 +1</span>` : '');
    preview.appendChild(rewardRow);

    container.appendChild(preview);

    // Open Rift button
    const openRow = document.createElement('div');
    openRow.className = 'rift-open-row';

    const costLabel = document.createElement('div');
    costLabel.className = 'rift-cost-label';
    costLabel.textContent = '🔑 1 Keystone';

    const openBtn = document.createElement('button');
    openBtn.className = 'rift-open-btn';
    const isLocked = _selectedTier > _maxUnlockedTier;
    const noKeys   = _keystones < 1;
    openBtn.disabled = isLocked || noKeys;
    if (isLocked || noKeys) openBtn.classList.add('disabled');
    openBtn.textContent = isLocked ? '🔒 LOCKED' : noKeys ? 'NO KEYSTONES' : 'OPEN RIFT';

    const doOpen = () => {
      if (openBtn.disabled) return;
      if (_socket) {
        Sound.uiClick();
        if (navigator.vibrate) navigator.vibrate([50, 30, 80]);
        _socket.emit('rift:open', { tier: _selectedTier });
        hide();
      }
    };
    openBtn.addEventListener('touchstart', (e) => { e.preventDefault(); doOpen(); });
    openBtn.addEventListener('click', doOpen);

    openRow.appendChild(costLabel);
    openRow.appendChild(openBtn);
    container.appendChild(openRow);
  }

  // ─── Active Rift HUD ─────────────────────────────────────────────
  function renderActiveRift(container) {
    const hudHeader = document.createElement('div');
    hudHeader.className = 'rift-active-header';

    const tierBadge = document.createElement('div');
    tierBadge.className = 'rift-active-tier-badge';
    tierBadge.textContent = `Tier ${_riftTier}`;

    const timerEl = document.createElement('div');
    timerEl.id = 'rift-inline-timer';
    timerEl.className = 'rift-inline-timer';
    timerEl.textContent = _formatTime(_riftTimer);
    _applyTimerColor(timerEl, _riftTimer);

    hudHeader.appendChild(tierBadge);
    hudHeader.appendChild(timerEl);
    container.appendChild(hudHeader);

    // Modifier pills
    if (_riftModifiers.length > 0) {
      const modRow = document.createElement('div');
      modRow.className = 'rift-active-mods';

      for (const mod of _riftModifiers) {
        const key = mod.key || mod.name?.toLowerCase() || '';
        const pill = document.createElement('div');
        pill.className = 'rift-mod-pill active';
        pill.style.borderColor = MOD_COLORS[key] || '#888';
        pill.style.color = MOD_COLORS[key] || '#ddd';

        const icon = document.createElement('span');
        icon.textContent = MOD_ICONS[key] || '●';

        const name = document.createElement('span');
        name.textContent = mod.name || key;

        pill.appendChild(icon);
        pill.appendChild(name);
        modRow.appendChild(pill);
      }

      container.appendChild(modRow);
    }

    // Mod descriptions
    if (_riftModifiers.length > 0) {
      const descList = document.createElement('div');
      descList.className = 'rift-mod-descs';

      for (const mod of _riftModifiers) {
        const key = mod.key || mod.name?.toLowerCase() || '';
        const row = document.createElement('div');
        row.className = 'rift-mod-desc-row';
        row.innerHTML = `<span style="color:${MOD_COLORS[key] || '#ddd'}">${MOD_ICONS[key] || '●'} ${mod.name || key}</span><span class="rift-mod-desc-text">${mod.desc || ''}</span>`;
        descList.appendChild(row);
      }

      container.appendChild(descList);
    }

    // "Leave" note — can't abandon, but give context
    const note = document.createElement('div');
    note.className = 'rift-active-note';
    note.textContent = 'Kill the Rift Guardian to complete the rift.';
    container.appendChild(note);
  }

  // ─── Timer updates ───────────────────────────────────────────────
  function updateTimer(remaining) {
    _riftTimer = remaining;
    _updateTimerBar();

    // Update inline timer inside rift screen if open
    const inlineTimer = document.getElementById('rift-inline-timer');
    if (inlineTimer) {
      inlineTimer.textContent = _formatTime(remaining);
      _applyTimerColor(inlineTimer, remaining);
    }
  }

  function _updateTimerBar() {
    const bar = document.getElementById('rift-timer-bar');
    const fill = document.getElementById('rift-timer-fill');
    if (!bar || !fill) return;

    if (!_riftActive || _riftTimer <= 0) {
      bar.classList.add('hidden');
      fill.classList.remove('pulse-red');
      return;
    }

    bar.classList.remove('hidden');

    const def = _tierDef(_riftTier || 1);
    const pct = Math.max(0, Math.min(100, (_riftTimer / def.timeLimit) * 100));
    fill.style.width = pct + '%';

    // Color transitions
    if (_riftTimer < 15) {
      fill.style.background = '#cc2222';
      fill.classList.add('pulse-red');
    } else if (_riftTimer < 30) {
      fill.style.background = '#cc4400';
      fill.classList.remove('pulse-red');
    } else if (_riftTimer < 60) {
      fill.style.background = '#ccaa00';
      fill.classList.remove('pulse-red');
    } else {
      fill.style.background = 'linear-gradient(90deg, #44cc44, #66ff66)';
      fill.classList.remove('pulse-red');
    }
  }

  function _hideTimerBar() {
    const bar = document.getElementById('rift-timer-bar');
    if (bar) bar.classList.add('hidden');
  }

  function _stopTimerInterval() {
    if (_timerInterval) {
      clearInterval(_timerInterval);
      _timerInterval = null;
    }
  }

  function _applyTimerColor(el, remaining) {
    el.classList.remove('timer-green', 'timer-yellow', 'timer-red', 'timer-pulse');
    if (remaining < 15) {
      el.classList.add('timer-red', 'timer-pulse');
    } else if (remaining < 30) {
      el.classList.add('timer-red');
    } else if (remaining < 60) {
      el.classList.add('timer-yellow');
    } else {
      el.classList.add('timer-green');
    }
  }

  function _formatTime(seconds) {
    if (seconds <= 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ─── Rewards Overlay ─────────────────────────────────────────────
  function _showRewardsOverlay(data, failed) {
    // Remove any existing overlay
    const existing = document.getElementById('rift-rewards-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rift-rewards-overlay';
    overlay.className = 'rift-rewards-overlay';

    const card = document.createElement('div');
    card.className = 'rift-rewards-card' + (failed ? ' failed' : ' complete');

    const titleEl = document.createElement('div');
    titleEl.className = 'rift-rewards-title';
    titleEl.textContent = failed ? 'RIFT FAILED 💀' : 'RIFT COMPLETE ⚔️';

    card.appendChild(titleEl);

    if (!failed) {
      // Time info
      if (data.timeRemaining !== undefined && data.timeLimit) {
        const timeTaken = data.timeLimit - data.timeRemaining;
        const timeRow = document.createElement('div');
        timeRow.className = 'rift-rewards-row';
        timeRow.innerHTML = `<span>Time</span><span>${_formatTime(timeTaken)} / ${_formatTime(data.timeLimit)}</span>`;
        card.appendChild(timeRow);

        if (data.timeBonus) {
          const bonusEl = document.createElement('div');
          bonusEl.className = 'rift-rewards-bonus';
          bonusEl.textContent = '⚡ SPEED BONUS ×1.5';
          card.appendChild(bonusEl);
        }
      }

      // Rewards
      if (data.xp) {
        const xpRow = document.createElement('div');
        xpRow.className = 'rift-rewards-row';
        xpRow.innerHTML = `<span>✨ XP</span><span class="rift-reward-xp">+${data.xp}</span>`;
        card.appendChild(xpRow);
      }
      if (data.gold) {
        const goldRow = document.createElement('div');
        goldRow.className = 'rift-rewards-row';
        goldRow.innerHTML = `<span>💰 Gold</span><span class="rift-reward-gold">+${data.gold}</span>`;
        card.appendChild(goldRow);
      }
      if (data.keystones && data.keystones > 0) {
        const keyRow = document.createElement('div');
        keyRow.className = 'rift-rewards-row';
        keyRow.innerHTML = `<span>🔑 Keystones</span><span class="rift-reward-key">+${data.keystones}</span>`;
        card.appendChild(keyRow);
      }
      if (data.bonusItems && data.bonusItems > 0) {
        const itemRow = document.createElement('div');
        itemRow.className = 'rift-rewards-row';
        itemRow.innerHTML = `<span>📦 Bonus Items</span><span class="rift-reward-items">+${data.bonusItems}</span>`;
        card.appendChild(itemRow);
      }
    } else {
      const failMsg = document.createElement('div');
      failMsg.className = 'rift-rewards-fail-msg';
      failMsg.textContent = 'Time ran out. No rewards.';
      card.appendChild(failMsg);
    }

    // Continue button
    const continueBtn = document.createElement('button');
    continueBtn.className = 'rift-rewards-continue';
    continueBtn.textContent = 'CONTINUE';

    const doClose = () => {
      overlay.remove();
      Sound.uiClick();
    };
    continueBtn.addEventListener('touchstart', (e) => { e.preventDefault(); doClose(); });
    continueBtn.addEventListener('click', doClose);
    card.appendChild(continueBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Vibration
    if (failed) {
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
      if (navigator.vibrate) navigator.vibrate([50, 30, 80, 30, 120]);
    }
  }

  // ─── Pending Overlay (waiting for co-op partner) ─────────────────
  function _showPendingOverlay(data) {
    const existing = document.getElementById('rift-pending-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'rift-pending-overlay';
    overlay.className = 'rift-pending-overlay';

    const card = document.createElement('div');
    card.className = 'rift-pending-card';

    const title = document.createElement('div');
    title.className = 'rift-pending-title';
    title.textContent = `⚔️ Rift Tier ${data.tier || 1}`;

    const status = document.createElement('div');
    status.className = 'rift-pending-status';
    status.textContent = `Waiting for players... (${data.readyCount || 1}/${data.totalPlayers || 2})`;

    const enterBtn = document.createElement('button');
    enterBtn.className = 'rift-pending-enter';
    enterBtn.textContent = 'ENTER RIFT';
    const doEnter = () => {
      if (_socket) {
        Sound.uiClick();
        _socket.emit('rift:enter');
        enterBtn.disabled = true;
        enterBtn.textContent = 'READY ✓';
        enterBtn.classList.add('ready');
      }
    };
    enterBtn.addEventListener('touchstart', (e) => { e.preventDefault(); doEnter(); });
    enterBtn.addEventListener('click', doEnter);

    card.appendChild(title);
    card.appendChild(status);
    card.appendChild(enterBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Auto-remove when rift becomes active (handled by rift:status active)
    const cleanup = () => {
      const el = document.getElementById('rift-pending-overlay');
      if (el) el.remove();
    };
    if (_socket) _socket.once('rift:status', (d) => { if (d.state === 'active' || d.state === 'cancelled') cleanup(); });
  }

  // ─── Guardian Alert Flash ─────────────────────────────────────────
  function _flashGuardianAlert(data) {
    const existing = document.getElementById('rift-guardian-alert');
    if (existing) existing.remove();

    const alert = document.createElement('div');
    alert.id = 'rift-guardian-alert';
    alert.className = 'rift-guardian-alert';
    alert.textContent = `👹 RIFT GUARDIAN SPAWNED!`;
    document.body.appendChild(alert);

    if (navigator.vibrate) navigator.vibrate([80, 40, 80, 40, 150]);

    setTimeout(() => {
      if (alert.parentNode) alert.remove();
    }, 3000);
  }

  return { init, show, hide, isVisible, updateKeystones, updateTimer, render };
})();
