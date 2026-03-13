// ─── Talent Tree UI Module ───────────────────────────────────────
const TalentsUI = (() => {
  let _socket = null;
  let _treeData = null;    // full tree from server
  let _talents = {};       // player's allocated talents { id: rank }
  let _availablePoints = 0;
  let _skillLevels = [1, 1, 1]; // Skill levels 1-5
  let _visible = false;

  // Branch color themes per class
  const BRANCH_COLORS = {
    warrior: { berserker: '#e83a3a', sentinel: '#4488ff', warlord: '#ffcc00' },
    ranger:  { marksman: '#e88a2a', trapper: '#44cc44', beastmaster: '#bb44ff' },
    mage:    { pyromancer: '#ff4444', frost: '#66ccff', arcane: '#bb44ff' },
  };

  // Branch icons
  const BRANCH_ICONS = {
    berserker: '\u2694\uFE0F', sentinel: '\uD83D\uDEE1\uFE0F', warlord: '\uD83D\uDC51',
    marksman: '\uD83C\uDFAF', trapper: '\uD83E\uDE64', beastmaster: '\uD83D\uDC3A',
    pyromancer: '\uD83D\uDD25', frost: '\u2744\uFE0F', arcane: '\u2728',
  };

  function init(socket) {
    _socket = socket;

    // Listen for talent tree data from server
    socket.on('talent:tree', (data) => {
      _treeData = data.tree;
      _talents = data.talents || {};
      _availablePoints = data.availablePoints || 0;
      _skillLevels = data.skillLevels || [1, 1, 1];
      if (_visible) render();
    });
  }

  function show() {
    _visible = true;
    const el = document.getElementById('talent-screen');
    if (el) el.classList.remove('hidden');
    // Request fresh data
    if (_socket) _socket.emit('talent:tree');
  }

  function hide() {
    _visible = false;
    const el = document.getElementById('talent-screen');
    if (el) el.classList.add('hidden');
  }

  function isVisible() { return _visible; }

  function render() {
    const container = document.getElementById('talent-tree-container');
    if (!container || !_treeData) return;
    container.innerHTML = '';

    // Header with points
    const header = document.createElement('div');
    header.className = 'talent-header';

    const title = document.createElement('div');
    title.className = 'talent-title';
    title.textContent = 'TALENT TREE';

    const points = document.createElement('div');
    points.className = 'talent-points';
    points.textContent = _availablePoints > 0
      ? `${_availablePoints} point${_availablePoints > 1 ? 's' : ''} available`
      : 'No points available';
    if (_availablePoints > 0) points.classList.add('has-points');

    header.appendChild(title);
    header.appendChild(points);
    container.appendChild(header);

    const charClass = _treeData.className || 'warrior';

    // ── Skill Leveling Section ──
    const skillSection = document.createElement('div');
    skillSection.className = 'skill-level-section';

    const skillTitle = document.createElement('div');
    skillTitle.className = 'skill-section-title';
    skillTitle.textContent = 'SKILL LEVELS';
    skillSection.appendChild(skillTitle);

    const skillGrid = document.createElement('div');
    skillGrid.className = 'skill-level-grid';

    // We need to know the class to get skill names
    const skillNames = {
      warrior: ['Whirlwind', 'Charging Strike', 'Battle Shout'],
      ranger: ['Arrow Volley', 'Sniper Shot', 'Shadow Step'],
      mage: ['Meteor Strike', 'Blizzard', 'Chain Lightning'],
    };
    const classNames = skillNames[charClass] || skillNames.warrior;
    const shortNames = {
      warrior: ['WHL', 'CHG', 'SHT'],
      ranger: ['VOL', 'SNP', 'SHD'],
      mage: ['MTR', 'BLZ', 'CLN'],
    };
    const classShort = shortNames[charClass] || shortNames.warrior;

    for (let i = 0; i < 3; i++) {
      const lv = _skillLevels[i] || 1;
      const isMax = lv >= 5;
      const canLevel = _availablePoints > 0 && !isMax;

      const card = document.createElement('div');
      card.className = 'skill-level-card';
      if (isMax) card.classList.add('maxed');
      if (canLevel) card.classList.add('available');

      const sName = document.createElement('div');
      sName.className = 'skill-level-name';
      sName.textContent = classShort[i];

      const sLevel = document.createElement('div');
      sLevel.className = 'skill-level-display';
      sLevel.textContent = `${lv}/5`;
      if (isMax) sLevel.style.color = '#ffd700';

      const sBar = document.createElement('div');
      sBar.className = 'skill-level-bar';
      const sFill = document.createElement('div');
      sFill.className = 'skill-level-fill';
      sFill.style.width = `${(lv / 5) * 100}%`;
      sBar.appendChild(sFill);

      card.appendChild(sName);
      card.appendChild(sLevel);
      card.appendChild(sBar);

      if (canLevel) {
        const levelUp = () => {
          if (_socket) {
            Sound.uiClick();
            if (navigator.vibrate) navigator.vibrate(30);
            _socket.emit('skill:level-up', { skillIndex: i });
          }
        };
        card.addEventListener('touchstart', (e) => { e.preventDefault(); levelUp(); });
        card.addEventListener('click', levelUp);

        const upBtn = document.createElement('div');
        upBtn.className = 'skill-level-up-btn';
        upBtn.textContent = '+';
        card.appendChild(upBtn);
      }

      skillGrid.appendChild(card);
    }

    skillSection.appendChild(skillGrid);
    container.appendChild(skillSection);

    // Branch columns
    const branchGrid = document.createElement('div');
    branchGrid.className = 'talent-branches';

    const branches = _treeData.branches;
    if (!branches) return;

    const branchKeys = Object.keys(branches);
    const classColors = BRANCH_COLORS[charClass] || {};

    for (const branchKey of branchKeys) {
      const branch = branches[branchKey];
      const color = classColors[branchKey] || '#ff8800';
      const icon = BRANCH_ICONS[branchKey] || '\u2B50';

      const col = document.createElement('div');
      col.className = 'talent-branch';

      // Branch header
      const bHead = document.createElement('div');
      bHead.className = 'branch-header';
      bHead.style.borderColor = color;

      const bIcon = document.createElement('span');
      bIcon.className = 'branch-icon';
      bIcon.textContent = icon;

      const bName = document.createElement('span');
      bName.className = 'branch-name';
      bName.textContent = branch.name;
      bName.style.color = color;

      bHead.appendChild(bIcon);
      bHead.appendChild(bName);
      col.appendChild(bHead);

      // Talent nodes (sorted by tier)
      const talents = branch.talents || [];
      const sorted = [...talents].sort((a, b) => a.tier - b.tier);

      for (const talent of sorted) {
        const rank = _talents[talent.id] || 0;
        const maxRank = talent.maxRank;
        const isMaxed = rank >= maxRank;
        const tierGate = { 1: 0, 2: 3, 3: 6, 4: 8 }[talent.tier] || 0;

        // Count points in this branch
        let branchPoints = 0;
        for (const t of talents) {
          branchPoints += _talents[t.id] || 0;
        }

        const canAlloc = _availablePoints > 0 && !isMaxed && branchPoints >= tierGate;
        const isLocked = branchPoints < tierGate;

        const node = document.createElement('div');
        node.className = 'talent-node';
        if (rank > 0) node.classList.add('allocated');
        if (isMaxed) node.classList.add('maxed');
        if (isLocked) node.classList.add('locked');
        if (canAlloc) node.classList.add('available');
        node.style.setProperty('--branch-color', color);

        // Tier indicator
        const tierEl = document.createElement('div');
        tierEl.className = 'talent-tier';
        tierEl.textContent = `T${talent.tier}`;

        // Name + rank
        const nameEl = document.createElement('div');
        nameEl.className = 'talent-name';
        nameEl.textContent = talent.name;

        const rankEl = document.createElement('div');
        rankEl.className = 'talent-rank';
        rankEl.textContent = `${rank}/${maxRank}`;
        if (isMaxed) rankEl.style.color = color;

        // Description
        const descEl = document.createElement('div');
        descEl.className = 'talent-desc';
        descEl.textContent = talent.description;

        // Lock message
        if (isLocked) {
          const lockEl = document.createElement('div');
          lockEl.className = 'talent-lock-msg';
          lockEl.textContent = `\uD83D\uDD12 ${tierGate} pts in branch`;
          node.appendChild(lockEl);
        }

        node.appendChild(tierEl);
        node.appendChild(nameEl);
        node.appendChild(rankEl);
        node.appendChild(descEl);

        // Click to allocate
        if (canAlloc) {
          const allocate = () => {
            if (_socket) {
              Sound.uiClick();
              if (navigator.vibrate) navigator.vibrate(30);
              _socket.emit('talent:allocate', { talentId: talent.id });
            }
          };
          node.addEventListener('touchstart', (e) => { e.preventDefault(); allocate(); });
          node.addEventListener('click', allocate);
        }

        col.appendChild(node);
      }

      branchGrid.appendChild(col);
    }

    container.appendChild(branchGrid);

    // Respec button
    const respecRow = document.createElement('div');
    respecRow.className = 'talent-respec-row';

    const totalAllocated = Object.values(_talents).reduce((sum, r) => sum + r, 0);
    if (totalAllocated > 0) {
      const respecBtn = document.createElement('button');
      respecBtn.className = 'talent-respec-btn';
      respecBtn.textContent = 'RESPEC ALL';

      const doRespec = () => {
        Sound.uiClick();
        if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
        _socket.emit('talent:respec');
      };
      respecBtn.addEventListener('touchstart', (e) => { e.preventDefault(); doRespec(); });
      respecBtn.addEventListener('click', doRespec);
      respecRow.appendChild(respecBtn);
    }

    container.appendChild(respecRow);
  }

  return { init, show, hide, isVisible, render };
})();
