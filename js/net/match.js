// 온라인 경기 진행: 게임 시작(캐릭터 배치), 대기실 복귀, 방장→참가자 상태 스냅샷 전송/적용

Object.assign(NET, {
  startGame() {
    if (!this.isHost) return;
    const party = this.matchType === 'party';
    if (this.players.length < (party ? 1 : 2)) {
      UI.toast('2명 이상 필요 (봇 추가 가능)');
      return;
    }
    ENGINE.goldenOnly = !!$('#chk-golden-only')?.checked;   // 🃏 황카만 뽑기 모드
    this.broadcast({ type: 'start', matchType: this.matchType, difficulty: ENGINE.difficulty, goldenOnly: ENGINE.goldenOnly });
    if (party) {
      ENGINE.startParty(this.players);
    } else {
      this.startVersusWorld();
    }
    this.enterMatchScreen();
  },

  // 대전(개인전) 월드 구성
  startVersusWorld() {
    ENGINE.mode = 'online';
    ENGINE.paused = false;
    const w = ENGINE.createEmptyWorld();

    this.players.forEach((p, idx) => {
      const ang = (Math.PI * 2 * idx) / this.players.length;
      const c = ENGINE.makeChar({
        id: p.id,
        name: p.name,
        color: CONFIG.COLORS[idx % CONFIG.COLORS.length],
        team: idx + 1,
        isLocal: p.id === ENGINE.localId,
        isBot: p.isBot,
        x: CONFIG.W * 0.5 + Math.cos(ang) * 280,
        y: CONFIG.H * 0.5 + Math.sin(ang) * 200,
        maxHp: CONFIG.HP.online,
        magics: {},
        initialDrafts: p.isBot ? 0 : 3,
        title: p.title
      });
      if (p.isBot) {
        c.magics = { laser: 1, fireball: 1 };
      } else {
        c.choiceQueue.push({
          isInitial: true,
          rerolls: 1 + (c.extraRerolls || 0),
          choices: SPELLS.generateInitialSpellChoices(c)
        });
      }
      w.chars.push(c);
    });

    if ($('#chk-neutral-mobs')?.checked) {
      for (let s = 0; s < 4; s++) {
        w.chars.push(ENGINE.makeChar({
          id: `on_slime_${s}_${Date.now()}`,
          name: '작은 슬라임',
          color: '#22C55E',
          team: 99,
          isBot: true,
          isSmallMob: true,
          noAttack: true,
          x: rand(120, CONFIG.W - 120),
          y: rand(120, CONFIG.H - 120),
          maxHp: 22,
          xpReward: 26
        }));
      }
    }

    ENGINE.world = w;
    ENGINE.spawnBouncers(w);
  },

  // 경기 화면 진입 (방장·참가자 공통)
  enterMatchScreen() {
    ENGINE.recordSubmitted = false;
    ENGINE.recordIsNew = false;
    PROFILE.touch(PROFILE.currentId());
    ENGINE.matchStartedAt = Date.now();
    ENGINE.mode = 'online';
    ENGINE.paused = false;
    ENGINE.userPaused = false;
    ENGINE.runEnded = false;
    ENGINE.quitFlag = false;
    const party = this.matchType === 'party';
    $('#modal-on-over').classList.add('hidden');
    $('#modal-pause').classList.add('hidden');
    $('#paused-banner').classList.add('hidden');
    // ⏸️ 일시정지는 파티 방장만 (중단도 거기서) / 나머지는 나가기
    $('#btn-pause').classList.toggle('hidden', !(party && this.isHost));
    $('#btn-quit-game').classList.toggle('hidden', party && this.isHost);
    UI.showScreen('game');
    $('#online-bottom-dock').classList.remove('hidden');
    $('#btn-manual-toggle').classList.add('hidden');
    $('#btn-speed').classList.add('hidden');
    $('#hud-mode-badge').textContent = party
      ? `파티 · ${(CONFIG.DIFFICULTY[ENGINE.difficulty] || {}).label || ''}`
      : '대전';
    if (ENGINE.goldenOnly) $('#hud-mode-badge').textContent += ' · 🃏황카';
    $('#dmg-meter').classList.toggle('hidden', !party);
    $('#dmg-meter').innerHTML = '';
    $('#hud-mode-badge').className = `px-2 py-0.5 rounded-lg ${party ? 'bg-emerald-500' : 'bg-sky-500'} text-white text-[11px] font-black shrink-0`;
    RENDER.resize();
    UI.renderOnlineChoiceSlot();
    UI.updateHUD();
  },

  returnToLobby() {
    $('#modal-on-over').classList.add('hidden');
    if (this.isHost) {
      this.broadcast({ type: 'back_lobby' });
      UI.openLobby();
    }
  },

  tickSync(dt) {
    if (!this.active || !this.isHost || !ENGINE.world) return;
    this.syncTimer += dt;
    if (this.syncTimer < 0.05) return;
    this.syncTimer = 0;

    const w = ENGINE.world;
    const baseSnap = {
      time: w.time,
      stage: ENGINE.stage,
      paused: !!ENGINE.userPaused,
      shake: Number((w.shake || 0).toFixed(2)),
      matchType: this.matchType,
      chars: w.chars.map((c) => ({
        id: c.id, name: c.name, color: c.color, team: c.team,
        isSmallMob: c.isSmallMob, isBoss: c.isBoss, bossTier: c.bossTier, title: c.title,
        x: Math.round(c.x), y: Math.round(c.y), r: c.r,
        hp: Math.round(c.hp), maxHp: Math.round(c.maxHp),
        lv: c.lv, xp: Math.round(c.xp), nextXp: Math.round(c.nextXp),
        angle: Number(c.angle.toFixed(2)), alive: c.alive,
        magics: c.magics,
        ultimates: c.ultimates,
        ultLv: c.ultLv,
        statCounts: c.statCounts,
        shieldAngle: Number((c.shieldAngle || 0).toFixed(2)),
        bladeCds: c.bladeCds,
        dmgDealt: Math.round(c.dmgDealt || 0),
        barrier: Math.round(c.barrier || 0), barrierMax: Math.round(c.barrierMax || 0),
        stunTimer: Number((c.stunTimer || 0).toFixed(1)),
        slowTimer: Number((c.slowTimer || 0).toFixed(1)),
        shredTimer: Number((c.shredTimer || 0).toFixed(1)),
        bladeAngle: Number((c.bladeAngle || 0).toFixed(2)), bladeR: c.bladeR, bladeL: c.bladeL,
        poopTimer: Number((c.poopTimer || 0).toFixed(1)),
        hurtTimer: c.hurtTimer
      })),
      projs: w.projs.map((p) => ({
        kind: p.kind, x: Math.round(p.x), y: Math.round(p.y),
        vx: Math.round(p.vx), vy: Math.round(p.vy),
        r: p.r, color: p.color, spin: p.spin || 0
      })),
      beams: w.beams,
      waves: w.waves.map((wv) => ({ x: wv.x, y: wv.y, r: wv.r, color: wv.color })),
      zones: w.zones.map((z) => ({ kind: z.kind, x: z.x, y: z.y, r: z.r, color: z.color, team: z.team })),
      warns: (w.warns || []).map((wn) => ({
        shape: wn.shape, x: wn.x, y: wn.y, r: wn.r, x1: wn.x1, y1: wn.y1, x2: wn.x2, y2: wn.y2, width: wn.width,
        a0: wn.a0, a1: wn.a1, bx: wn.bx, by: wn.by, delay: Number(wn.delay.toFixed(2)), maxDelay: wn.maxDelay, fired: wn.fired, life: Number(wn.life.toFixed(2))
      })),
      pulses: w.pulses || [],
      rings: w.rings,
      orbs: w.orbs,
      texts: w.texts,
      bouncers: w.bouncers
    };

    for (const [peerId, conn] of this.conns.entries()) {
      if (!conn.open) continue;
      const ch = w.chars.find((c) => c.id === peerId);
      conn.send({
        type: 'state',
        snap: {
          ...baseSnap,
          myQueue: ch ? ch.choiceQueue : []
        }
      });
    }
  },

  applySnapshot(snap) {
    if (!snap) return;
    const w = ENGINE.world || ENGINE.createEmptyWorld();
    w.time = snap.time;
    if (Number.isInteger(snap.stage)) ENGINE.stage = snap.stage;
    if (snap.matchType === 'party' || snap.matchType === 'versus') this.matchType = snap.matchType;
    w.chars = (snap.chars || []).map((c) => ({
      ...c,
      isLocal: c.id === ENGINE.localId
    }));
    w.projs = snap.projs || [];
    w.beams = snap.beams || [];
    w.waves = snap.waves || [];
    w.zones = snap.zones || [];
    w.warns = snap.warns || [];
    w.pulses = snap.pulses || [];
    w.shake = Number(snap.shake) || 0;
    $('#paused-banner').classList.toggle('hidden', !snap.paused || NET.isHost); // ⏸️ 방장이 일시정지
    w.rings = snap.rings || [];
    w.orbs = snap.orbs || [];
    w.particles = w.particles || [];
    w.texts = snap.texts || [];
    w.bouncers = snap.bouncers || [];
    ENGINE.world = w;

    const prevQ = JSON.stringify(this.clientChoiceQueue[0]?.choices?.map((x) => x.id + x.badge) || []);
    this.clientChoiceQueue = snap.myQueue || [];
    const nextQ = JSON.stringify(this.clientChoiceQueue[0]?.choices?.map((x) => x.id + x.badge) || []);
    if (prevQ !== nextQ || this.clientChoiceQueue.length === 0) {
      UI.renderOnlineChoiceSlot();
    }
    UI.updateHUD();
  }
});
