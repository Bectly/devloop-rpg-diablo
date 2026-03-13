// ─── Death & Victory Screen Module ──────────────────────────────
const DeathVictory = (() => {
  let _socket = null;
  let _isDead = false;
  let _deathCountdown = 0;
  let _deathInterval = null;
  let _currentDifficulty = 'normal';

  function init(socket) {
    _socket = socket;
  }

  function isDead() {
    return _isDead;
  }

  // ─── Death Screen ───────────────────────────────────────────────
  function showDeathScreen(timerMs, goldDropped) {
    _isDead = true;
    _deathCountdown = timerMs || 5000;

    const deathEl = document.getElementById('death-overlay');
    if (!deathEl) return;
    deathEl.classList.remove('hidden');

    const goldText = goldDropped > 0 ? `Lost ${goldDropped} gold` : '';
    document.getElementById('death-gold-text').textContent = goldText;

    // Strong haptic
    if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);

    // Countdown
    if (_deathInterval) clearInterval(_deathInterval);
    _deathInterval = setInterval(() => {
      _deathCountdown -= 100;
      if (_deathCountdown < 0) _deathCountdown = 0;
      const secs = (_deathCountdown / 1000).toFixed(1);
      document.getElementById('death-timer-text').textContent = `Reviving in ${secs}s`;

      if (_deathCountdown <= 0) {
        hideDeathScreen();
      }
    }, 100);
  }

  function hideDeathScreen() {
    _isDead = false;
    if (_deathInterval) {
      clearInterval(_deathInterval);
      _deathInterval = null;
    }
    const deathEl = document.getElementById('death-overlay');
    if (deathEl) deathEl.classList.add('hidden');
  }

  // ─── Victory Screen ──────────────────────────────────────────────
  function showVictoryScreen(data) {
    const victoryEl = document.getElementById('victory-overlay');
    if (!victoryEl) return;
    victoryEl.classList.remove('hidden');

    // Time display
    const totalSecs = Math.floor((data.totalTime || 0) / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    document.getElementById('victory-time').textContent = `Time: ${mins}m ${secs.toString().padStart(2, '0')}s`;

    // Player stats
    const statsEl = document.getElementById('victory-stats');
    statsEl.innerHTML = '';
    const classIcons = { warrior: '\u2694\uFE0F', ranger: '\uD83C\uDFF9', mage: '\uD83D\uDD2E' };

    // Find MVP (most kills)
    const players = data.players || [];
    let mvpIndex = -1;
    let maxKills = -1;
    for (let i = 0; i < players.length; i++) {
      if ((players[i].kills || 0) > maxKills) {
        maxKills = players[i].kills || 0;
        mvpIndex = i;
      }
    }

    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      const card = document.createElement('div');
      card.className = 'victory-player-card';
      if (p.characterClass) card.setAttribute('data-class', p.characterClass);
      if (i === mvpIndex && maxKills > 0) card.classList.add('mvp');

      const icon = document.createElement('div');
      icon.className = 'victory-player-icon';
      icon.textContent = classIcons[p.characterClass] || '\u2694\uFE0F';

      const info = document.createElement('div');
      info.className = 'victory-player-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'victory-player-name';
      nameEl.textContent = p.name;
      const classEl = document.createElement('div');
      classEl.className = 'victory-player-class';
      classEl.textContent = p.characterClass;
      const statEl = document.createElement('div');
      statEl.className = 'victory-player-stats';
      statEl.textContent = `\u2B06\uFE0F Lv.${p.level} \u00B7 \uD83D\uDC80 ${p.kills} \u00B7 \uD83E\uDE99 ${p.gold}`;
      info.appendChild(nameEl);
      info.appendChild(classEl);
      info.appendChild(statEl);

      card.appendChild(icon);
      card.appendChild(info);
      statsEl.appendChild(card);
    }

    // Difficulty selector — replaces single NEW GAME button
    _currentDifficulty = data.difficulty || 'normal';
    const unlockedNext = data.unlockedNext || null;

    const newGameBtn = document.getElementById('btn-new-game');
    // Build difficulty selector container
    const selector = document.createElement('div');
    selector.className = 'difficulty-selector';

    const DIFFS = [
      { key: 'normal', label: 'NORMAL', color: '#aaa' },
      { key: 'nightmare', label: 'NIGHTMARE', color: '#e88a2a' },
      { key: 'hell', label: 'HELL', color: '#e83a3a' },
    ];
    const DIFF_ORDER = ['normal', 'nightmare', 'hell'];

    // Determine unlocked set: current + newly unlocked
    const unlockedSet = new Set(['normal']);
    const currentIdx = DIFF_ORDER.indexOf(_currentDifficulty);
    for (let i = 0; i <= currentIdx; i++) unlockedSet.add(DIFF_ORDER[i]);
    if (unlockedNext) unlockedSet.add(unlockedNext);

    for (const diff of DIFFS) {
      const btn = document.createElement('button');
      btn.className = 'diff-btn';
      btn.setAttribute('data-diff', diff.key);
      const isUnlocked = unlockedSet.has(diff.key);
      const isNew = diff.key === unlockedNext;

      if (!isUnlocked) {
        btn.classList.add('locked');
        btn.textContent = diff.label + ' \uD83D\uDD12';
        btn.disabled = true;
      } else {
        btn.textContent = diff.label;
        if (isNew) btn.classList.add('newly-unlocked');
        btn.style.borderColor = diff.color;
        const startGame = () => {
          Sound.uiClick();
          if (navigator.vibrate) navigator.vibrate(50);
          _socket.emit('game:restart', { difficulty: diff.key });
          hideVictoryScreen();
        };
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); startGame(); });
        btn.addEventListener('click', startGame);
      }
      selector.appendChild(btn);
    }

    // Show unlock message
    if (unlockedNext) {
      const unlockMsg = document.createElement('div');
      unlockMsg.className = 'unlock-message';
      unlockMsg.textContent = unlockedNext.toUpperCase() + ' UNLOCKED!';
      selector.insertBefore(unlockMsg, selector.firstChild);
    }

    // Replace the old button with difficulty selector
    newGameBtn.parentNode.replaceChild(selector, newGameBtn);

    // "View Leaderboard" button on victory screen
    const ldbVicBtn = document.getElementById('btn-victory-leaderboard');
    if (ldbVicBtn) {
      const freshLdbBtn = ldbVicBtn.cloneNode(true);
      ldbVicBtn.parentNode.replaceChild(freshLdbBtn, ldbVicBtn);
      const openLdb = () => {
        Sound.uiClick();
        Screens.toggleLeaderboard(_socket);
      };
      freshLdbBtn.addEventListener('touchstart', (e) => { e.preventDefault(); openLdb(); });
      freshLdbBtn.addEventListener('click', openLdb);
    }
  }

  function hideVictoryScreen() {
    const victoryEl = document.getElementById('victory-overlay');
    if (victoryEl) victoryEl.classList.add('hidden');
    // Restore the btn-new-game placeholder for next victory
    const selector = document.querySelector('.difficulty-selector');
    if (selector) {
      const btn = document.createElement('button');
      btn.id = 'btn-new-game';
      btn.textContent = 'NEW GAME';
      selector.parentNode.replaceChild(btn, selector);
    }
  }

  return {
    init,
    isDead,
    showDeathScreen,
    hideDeathScreen,
    showVictoryScreen,
    hideVictoryScreen,
  };
})();
