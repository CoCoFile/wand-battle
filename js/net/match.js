// 온라인 경기 진행: 게임 시작(캐릭터 배치), 대기실 복귀, 방장→참가자 상태 스냅샷 전송/적용

// 스냅샷 배열 압축용 종류 번호 (방장·참가자 같은 코드라 순서만 맞으면 됨)
const PROJ_KINDS = ['fireball', 'frost', 'poison', 'boomerang', 'scatter'];
const ZONE_KINDS = ['poison', 'frost', 'chaos', 'booze', 'blackhole', 'mine'];
const CHAR_STATIC = ['name', 'color', 'team', 'isSmallMob', 'isBoss', 'bossTier', 'title', 'r', 'magics', 'ultimates', 'ultLv', 'statCounts', 'bladeR', 'bladeL'];

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
    // 데이터 줄이기 (11/27t): 좌표는 정수, 투사체·장판은 배열로, 캐릭터 고정 정보(이름·마법 등)는 0.5초마다만,
    // 선택지 목록은 바뀔 때만 보냄. 예전엔 한 번에 ~28KB × 초당 20번 → 끊김의 주원인
    const ri = (v) => Math.round(v || 0);
    const r2 = (v) => Math.round((v || 0) * 100) / 100;
    const pal = [];                                            // 이번 스냅샷의 색 목록 (색 문자열 대신 번호)
    const ci = (col) => { let k = pal.indexOf(col); if (k < 0) { k = pal.length; pal.push(col); } return k; };
    this.syncTick = (this.syncTick || 0) + 1;
    const ids = w.chars.map((c) => c.id).join(',');
    const full = this.syncTick % 10 === 1 || ids !== this.lastSyncIds; // 고정 정보 포함 (0.5초마다 + 캐릭터가 바뀌면)
    this.lastSyncIds = ids;
    const dyn = (c) => ({
      id: c.id, x: ri(c.x), y: ri(c.y), angle: r2(c.angle), hp: ri(c.hp), alive: c.alive,
      lv: c.lv, xp: ri(c.xp), nextXp: ri(c.nextXp), maxHp: ri(c.maxHp),
      bladeCds: c.bladeCds && c.bladeCds.length ? c.bladeCds.map((v) => Math.round(v * 10) / 10) : undefined,
      dmgDealt: ri(c.dmgDealt) || undefined,
      barrier: ri(c.barrier) || undefined, barrierMax: ri(c.barrierMax) || undefined,
      stunTimer: r2(c.stunTimer) || undefined, slowTimer: r2(c.slowTimer) || undefined,
      shredTimer: r2(c.shredTimer) || undefined, poopTimer: r2(c.poopTimer) || undefined, hurtTimer: r2(c.hurtTimer) || undefined,
      bladeAngle: c.magics?.blades ? r2(c.bladeAngle) : undefined
    });
    const baseSnap = {
      time: r2(w.time),
      stage: ENGINE.stage,
      paused: !!ENGINE.userPaused,
      shake: r2(w.shake),
      matchType: this.matchType,
      full,
      chars: w.chars.map((c) => (full ? Object.assign(dyn(c), {
        name: c.name, color: c.color, team: c.team,
        isSmallMob: c.isSmallMob || undefined, isBoss: c.isBoss || undefined, bossTier: c.bossTier, title: c.title || undefined, r: c.r,
        magics: c.magics, ultimates: c.ultimates && c.ultimates.length ? c.ultimates : undefined,
        ultLv: c.ultLv, statCounts: c.statCounts, bladeR: c.bladeR, bladeL: c.bladeL
      }) : dyn(c))),
      // 투사체: [종류, x, y, vx, vy, r, 색번호, 회전×10]
      projs: w.projs.map((p) => [PROJ_KINDS.indexOf(p.kind), ri(p.x), ri(p.y), ri(p.vx), ri(p.vy), Math.round(p.r * 10) / 10, ci(p.color), Math.round((p.spin || 0) * 10)]),
      // 빔: [x1, y1, x2, y2, 굵기, 색번호, 남은시간×100, 전체시간×100, glow]
      beams: w.beams.map((b) => [ri(b.x1), ri(b.y1), ri(b.x2), ri(b.y2), ri(b.width), ci(b.color), ri(b.life * 100), ri(b.maxLife * 100), b.glow ? 1 : 0]),
      // 장판: [종류, x, y, r, 팀, 색번호]
      zones: w.zones.map((z) => [ZONE_KINDS.indexOf(z.kind), ri(z.x), ri(z.y), ri(z.r), z.team, ci(z.color)]),
      warns: (w.warns || []).map((wn) => ({
        shape: wn.shape, x: wn.x, y: wn.y, r: wn.r, x1: wn.x1, y1: wn.y1, x2: wn.x2, y2: wn.y2, width: wn.width,
        a0: wn.a0, a1: wn.a1, bx: wn.bx, by: wn.by, delay: r2(wn.delay), maxDelay: wn.maxDelay, fired: wn.fired, life: r2(wn.life), ally: wn.ally ? 1 : undefined
      })),
      clones: (w.clones || []).map((k) => [k.ownerId, ri(k.x), ri(k.y), Math.round(k.angle * 100), ri(k.life * 100), ri(k.maxLife * 100)]),
      ultDim: w.ultDim > 0 ? r2(w.ultDim) : undefined,
      pulses: (w.pulses || []).map((p) => ({ x: ri(p.x), y: ri(p.y), r0: ri(p.r0), maxR: ri(p.maxR), life: r2(p.life), maxLife: p.maxLife, color: p.color, lw: p.lw })),
      // 링: [x, y, r, maxR, 남은시간×100, 전체시간×100, 색번호]
      rings: w.rings.map((r) => [ri(r.x), ri(r.y), ri(r.r), ri(r.maxR), ri(r.life * 100), ri(r.maxLife * 100), ci(r.color)]),
      orbs: w.orbs.map((o) => ({ ...o, x: ri(o.x), y: ri(o.y) })),
      texts: w.texts.map((t) => ({ x: ri(t.x), y: ri(t.y), text: t.text, color: t.color, life: r2(t.life) })),
      bouncers: w.bouncers.map((b) => ({ ...b, x: ri(b.x), y: ri(b.y) })),
      pal
    };

    if (!this.lastQueueSent) this.lastQueueSent = new Map();
    for (const [peerId, conn] of this.conns.entries()) {
      if (!conn.open) continue;
      const ch = w.chars.find((c) => c.id === peerId);
      if (!ch) continue;                       // 경기 중에 들어와서 기다리는 사람은 상태 안 보냄
      const q = ch ? ch.choiceQueue : [];
      const qs = JSON.stringify(q);
      const snap = { ...baseSnap };
      if (this.lastQueueSent.get(peerId) !== qs || full) { snap.myQueue = q; this.lastQueueSent.set(peerId, qs); } // 선택지는 바뀔 때만
      conn.send({ type: 'state', snap });
    }
  },

  // 참가자: 매 프레임 스냅샷 사이를 이어 그림 (main.js 에서 호출)
  smoothClient() {
    const w = ENGINE.world;
    if (!w || !this.snapAt) return;
    const t = performance.now() - this.snapAt;
    const a = clamp(t / (this.snapGap || 50), 0, 1);
    const lerpA = (p, q) => (p == null || q == null ? q : p + angleDiff(q, p) * a);
    for (const c of w.chars) {
      if (c._tx == null) continue;
      c.x = c._px + (c._tx - c._px) * a;
      c.y = c._py + (c._ty - c._py) * a;
      c.angle = lerpA(c._pa, c._ta);
      if (c._tb != null) c.bladeAngle = lerpA(c._pb, c._tb);
    }
    const sec = Math.min(0.12, t / 1000) * (CONFIG.ONLINE_SPEED || 1);
    for (const p of w.projs) {
      if (p._x0 == null) continue;
      p.x = p._x0 + (p.vx || 0) * sec;
      p.y = p._y0 + (p.vy || 0) * sec;
    }
  },

  applySnapshot(snap) {
    if (!snap) return;
    const w = ENGINE.world || ENGINE.createEmptyWorld();
    w.time = snap.time;
    if (Number.isInteger(snap.stage)) ENGINE.stage = snap.stage;
    if (snap.matchType === 'party' || snap.matchType === 'versus') this.matchType = snap.matchType;
    // 부드럽게 그리기 (11/27t): 캐릭터는 직전 위치 → 새 위치로 다음 스냅샷까지 보간, 투사체는 속도로 앞으로 그림
    const now = performance.now();
    if (this.snapAt) this.snapGap = this.snapGap ? this.snapGap * 0.8 + (now - this.snapAt) * 0.2 : now - this.snapAt;
    this.snapAt = now;
    const prev = new Map((w.chars || []).map((c) => [c.id, c]));
    w.chars = (snap.chars || []).map((c0) => {
      const p = prev.get(c0.id);
      // 고정 정보는 full 스냅샷에만 옴 → 그 사이엔 직전 값 그대로
      let c = c0;
      if (!snap.full && p) { c = {}; for (const k of CHAR_STATIC) c[k] = p[k]; Object.assign(c, c0); }
      if (!c.ultimates) c.ultimates = [];
      const far = !p || Math.hypot(p.x - c.x, p.y - c.y) > 160;   // 순간이동(부활·돌진)은 보간 안 함
      return {
        ...c,
        isLocal: c.id === ENGINE.localId,
        _px: far ? c.x : p.x, _py: far ? c.y : p.y, _tx: c.x, _ty: c.y,
        _pa: far ? c.angle : p.angle, _ta: c.angle,
        _pb: far ? c.bladeAngle : p.bladeAngle, _tb: c.bladeAngle
      };
    });
    const pal = snap.pal || [];
    w.projs = (snap.projs || []).map((a) => Array.isArray(a)
      ? { kind: PROJ_KINDS[a[0]], x: a[1], y: a[2], vx: a[3], vy: a[4], r: a[5], color: pal[a[6]], spin: a[7] / 10, _x0: a[1], _y0: a[2] }
      : { ...a, _x0: a.x, _y0: a.y });
    w.beams = (snap.beams || []).map((a) => Array.isArray(a)
      ? { x1: a[0], y1: a[1], x2: a[2], y2: a[3], width: a[4], color: pal[a[5]], life: a[6] / 100, maxLife: a[7] / 100, glow: a[8] === 1 }
      : a);
    w.waves = [];
    w.zones = (snap.zones || []).map((a) => Array.isArray(a)
      ? { kind: ZONE_KINDS[a[0]], x: a[1], y: a[2], r: a[3], team: a[4], color: pal[a[5]] }
      : a);
    w.warns = snap.warns || [];
    w.pulses = snap.pulses || [];
    w.clones = (snap.clones || []).map((a) => ({ ownerId: a[0], x: a[1], y: a[2], angle: a[3] / 100, life: a[4] / 100, maxLife: a[5] / 100 }));
    w.ultDim = Number(snap.ultDim) || 0;
    w.shake = Number(snap.shake) || 0;
    $('#paused-banner').classList.toggle('hidden', !snap.paused || NET.isHost); // ⏸️ 방장이 일시정지
    w.rings = (snap.rings || []).map((a) => Array.isArray(a)
      ? { x: a[0], y: a[1], r: a[2], maxR: a[3], life: a[4] / 100, maxLife: a[5] / 100, color: pal[a[6]] }
      : a);
    w.orbs = snap.orbs || [];
    w.particles = w.particles || [];
    w.texts = snap.texts || [];
    w.bouncers = snap.bouncers || [];
    ENGINE.world = w;

    const prevQ = JSON.stringify(this.clientChoiceQueue[0]?.choices?.map((x) => x.id + x.badge) || []);
    if (snap.myQueue !== undefined) this.clientChoiceQueue = snap.myQueue || [];   // 바뀔 때만 옴
    const nextQ = JSON.stringify(this.clientChoiceQueue[0]?.choices?.map((x) => x.id + x.badge) || []);
    if (prevQ !== nextQ || this.clientChoiceQueue.length === 0) {
      UI.renderOnlineChoiceSlot();
    }
    UI.updateHUD();
  }
});
