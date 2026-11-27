// ENGINE 본체: 게임 상태(모드/스테이지/일시정지/입력), 빈 월드 생성, 캐릭터 생성(makeChar)
// 모드별 로직: solo.js / online.js, 전투: combat.js, 프레임 시뮬레이션: update.js

const ENGINE = {
  world: null,
  mode: 'idle', // 'solo' | 'online'
  stage: 1,
  paused: false,
  localId: 'player',
  manualControl: false,
  input: {
    up: false,
    down: false,
    left: false,
    right: false,
    mouseX: CONFIG.W * 0.5,
    mouseY: CONFIG.H * 0.5,
    hasMouse: false,
    touchActive: false,
    touchX: 0,
    touchY: 0
  },
  soloSpeed: 1,         // 솔로 배속 (CONFIG.SOLO_SPEEDS 중 하나)
  difficulty: 'normal', // 솔로 난이도: easy | normal | hard | hell
  userPaused: false,    // ⏸️ 일시정지 (솔로 / 파티 방장)
  soloRerolls: 1,
  soloInitialDrafts: 0,
  soloPendingLevels: 0,
  soloCurrentChoices: [],

  // 솔로 배속 순환 (x1 → x2 → x3 → x1)
  cycleSoloSpeed(force) {
    const list = CONFIG.SOLO_SPEEDS;
    this.soloSpeed = force ?? list[(list.indexOf(this.soloSpeed) + 1) % list.length];
    if (!list.includes(this.soloSpeed)) this.soloSpeed = 1;
    try { localStorage.setItem('wb-speed', String(this.soloSpeed)); } catch (_) {}
    const btn = $('#btn-speed');
    if (btn) {
      btn.textContent = `⏩ x${this.soloSpeed}`;
      btn.classList.toggle('bg-amber-300', this.soloSpeed > 1);
      btn.classList.toggle('bg-slate-100', this.soloSpeed === 1);
    }
  },

  manualAllowed() {
    return this.mode === 'solo' && !!(CONFIG.DIFFICULTY[this.difficulty] || {}).manual; // 쉼터만
  },

  toggleManualControl(forceState) {
    this.manualControl = typeof forceState === 'boolean' ? forceState : !this.manualControl;
    if (!this.manualAllowed()) this.manualControl = false;
    if (this.manualControl) this.usedManual = true; // 이번 판에 수동 조작을 한 번이라도 켰는지 (랭킹 표시)
    const btn = $('#btn-manual-toggle');
    if (btn) {
      btn.textContent = this.manualControl ? '🕹️ 수동 ON' : '🕹️ 수동 OFF';
      btn.className = this.manualControl
        ? 'arcade-btn px-2.5 py-1 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black cursor-pointer'
        : 'arcade-btn px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black cursor-pointer';
      btn.classList.toggle('hidden', !this.manualAllowed()); // 쉼터 아니면 버튼 숨김
    }
    if (typeof forceState !== 'boolean' && this.mode === 'solo') {
      UI.toast(this.manualControl
        ? '수동 조작 ON'
        : '자동 전투 ON');
    }
  },

  // ⏸️ 일시정지: 솔로, 파티는 방장만 (대전 없음)
  canPause() {
    if (!this.world || this.runEnded) return false;
    return this.mode === 'solo' || (this.isParty() && NET.isHost);
  },

  togglePause(force) {
    if (!this.canPause()) return;
    this.userPaused = typeof force === 'boolean' ? force : !this.userPaused;
    this.giveUpArmed = false;
    const btn = $('#btn-give-up');
    if (btn) btn.textContent = '🏳️ 중단하기';
    const D = CONFIG.DIFFICULTY[this.difficulty] || {};
    const desc = $('#pause-desc');
    if (desc) desc.textContent = `${this.isParty() ? '파티 · ' : ''}${D.label || ''} · STAGE ${Math.max(1, this.stage)}`;
    $('#modal-pause')?.classList.toggle('hidden', !this.userPaused);
  },

  // 🏳️ 중단: 한 번 더 눌러야 확정
  giveUp() {
    if (!this.userPaused) return;
    if (!this.giveUpArmed) {
      this.giveUpArmed = true;
      $('#btn-give-up').textContent = '정말 중단? (한 번 더)';
      return;
    }
    this.giveUpArmed = false;
    if (this.mode === 'solo') {
      const me = this.getLocalChar();
      if (me) this.endSoloRun(me, true);
    } else if (this.isParty() && NET.isHost) {
      this.userPaused = false;
      $('#modal-pause').classList.add('hidden');
      this.paused = true; // 판 멈춤 (대기실 복귀 때 풀림)
      if (this.world) this.world.nextStageTimer = 0;
      this.quitFlag = true;
      const D = CONFIG.DIFFICULTY[this.difficulty] || {};
      const title = '🏳️ 중단';
      const desc = `${D.label || ''} · STAGE ${Math.max(1, this.stage)}`;
      NET.broadcast({ type: 'gameover', title, desc, quit: true });
      UI.showOnlineGameOver(title, desc, false, true);
    }
  },

  createEmptyWorld() {
    return {
      uidSeq: 1,
      time: 0,
      orbTimer: 0,
      chars: [],
      projs: [],
      beams: [],
      waves: [],
      zones: [],
      rings: [],
      orbs: [],
      particles: [],
      texts: [],
      bouncers: [],      // 바운스 지뢰
      warns: [],         // 👑 보스 필살기 경고 (발동 전 빨간 표시)
      bossTimers: [],    // 보스 필살기 예약 (방장/솔로만)
      pulses: [],        // 멈춰! 파동 (연출)
      shake: 0           // 화면 흔들림 남은 시간
    };
  },

  makeChar(opts) {
    const isSmallMob = !!opts.isSmallMob;
    const isBoss = !!opts.isBoss;
    const r = isSmallMob ? CONFIG.SLIME_R : isBoss ? CONFIG.BOSS_R : CONFIG.HEAD_R;
    const maxHp = opts.maxHp || 120;
    const magics = isSmallMob ? {} : Object.assign({ laser: 1 }, opts.magics || {});
    const cooldowns = {};
    for (const mid of Object.keys(magics)) {
      if (mid !== 'shield') cooldowns[mid] = rand(0.1, 0.45);
    }
    return {
      id: opts.id,
      name: opts.name || '마법사',
      color: opts.color || CONFIG.COLORS[0],
      team: opts.team ?? 0,
      isLocal: !!opts.isLocal,
      isBot: !!opts.isBot,
      isSmallMob,
      isBoss,
      noAttack: !!opts.noAttack || isSmallMob,
      x: opts.x ?? rand(140, CONFIG.W - 140),
      y: opts.y ?? rand(140, CONFIG.H - 140),
      r,
      hp: maxHp,
      maxHp,
      lv: opts.lv || 1,
      xp: 0,
      nextXp: opts.nextXp || CONFIG.XP.start,
      xpReward: opts.xpReward || 45,
      speed: opts.speed || CONFIG.BASE_SPEED,
      atkMult: opts.atkMult || 1.0,
      areaMult: opts.areaMult || 1.0,
      cdrMult: opts.cdrMult || 1.0,
      armor: opts.armor || 0,
      // 스탯 카드·유물이 얹히기 전 기본값 (SPELLS.recalcStats)
      baseAtk: opts.atkMult || 1.0,
      baseArea: opts.areaMult || 1.0,
      baseCdr: opts.cdrMult || 1.0,
      baseArmor: opts.armor || 0,
      title: sanitizeTitle(opts.title),   // 🏷️ 칭호 {text, style}
      regen: opts.regen || 0,
      angle: rand(0, Math.PI * 2),
      aimTimer: rand(0.1, 0.5),
      aimSpin: rand(-4.5, 4.5),
      moveAng: rand(0, Math.PI * 2),
      moveTimer: rand(0.3, 1.1),
      alive: true,
      magics,
      cooldowns,
      shieldAngle: rand(0, Math.PI * 2),
      shieldCooldowns: [],
      recentShieldSkills: {},
      ultimates: [],
      ultCooldowns: {},
      stunTimer: 0,
      slowTimer: 0,
      poopTimer: 0,
      hurtTimer: 0,
      initialDrafts: opts.initialDrafts || 0,
      statCounts: {},   // 스탯 카드 선택 횟수 (결산용)
      choiceQueue: []
    };
  },

  getLocalChar() {
    if (!this.world) return null;
    return this.world.chars.find((c) => c.id === this.localId) || null;
  }
};
