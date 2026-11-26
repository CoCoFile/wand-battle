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
  soloRerolls: 1,
  soloInitialDrafts: 0,
  soloPendingLevels: 0,
  soloCurrentChoices: [],

  toggleManualControl(forceState) {
    this.manualControl = typeof forceState === 'boolean' ? forceState : !this.manualControl;
    const btn = $('#btn-manual-toggle');
    if (btn) {
      btn.textContent = this.manualControl ? '🕹️ 수동 ON' : '🕹️ 수동 OFF';
      btn.className = this.manualControl
        ? 'arcade-btn px-2.5 py-1 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-slate-950 text-xs font-black cursor-pointer'
        : 'arcade-btn px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black cursor-pointer';
    }
    if (typeof forceState !== 'boolean' && this.mode === 'solo') {
      UI.toast(this.manualControl
        ? '수동 조작 ON'
        : '자동 전투 ON');
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
      texts: []
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
      nextXp: opts.nextXp || 60,
      xpReward: opts.xpReward || 45,
      speed: opts.speed || CONFIG.BASE_SPEED,
      atkMult: opts.atkMult || 1.0,
      areaMult: opts.areaMult || 1.0,
      cdrMult: opts.cdrMult || 1.0,
      armor: opts.armor || 0,
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
      choiceQueue: []
    };
  },

  getLocalChar() {
    if (!this.world) return null;
    return this.world.chars.find((c) => c.id === this.localId) || null;
  }
};
