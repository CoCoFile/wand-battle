// 파티 모드 (온라인 협동): 솔로 스테이지를 여럿이 같은 팀(team 1)으로 돌파
// 선택지는 대전처럼 하단 선택창에서 실시간 (게임 안 멈춤). 시뮬레이션은 방장 PC에서만.
// 흐름: 시작 → 준비 5초(시작 마법 고르기) → 스테이지 → 전멸 시 종료 / 클리어 시 3초 뒤 다음 스테이지(죽은 사람 부활)

Object.assign(ENGINE, {
  isParty() {
    return this.mode === 'online' && NET.matchType === 'party';
  },

  // 솔로 + 파티 = 스테이지형 (적은 레벨업 안 함, 회복 구슬 난이도 규칙 적용 등)
  isStageMode() {
    return this.mode === 'solo' || this.isParty();
  },

  startParty(players) {
    this.mode = 'online';
    this.paused = false;
    this.stage = 0;
    const w = this.createEmptyWorld();
    players.forEach((p, idx) => {
      const ang = (Math.PI * 2 * idx) / players.length;
      const c = this.makeChar({
        id: p.id,
        name: p.name,
        color: CONFIG.COLORS[idx % CONFIG.COLORS.length],
        team: 1,
        isLocal: p.id === this.localId,
        isBot: p.isBot,
        x: CONFIG.W * 0.5 + Math.cos(ang) * 110,
        y: CONFIG.H * 0.5 + Math.sin(ang) * 90,
        maxHp: CONFIG.HP.solo,
        magics: {},
        initialDrafts: p.isBot ? 0 : 3
      });
      if (p.isBot) {
        c.magics = { laser: 1, fireball: 1 };
      } else {
        c.choiceQueue.push({ isInitial: true, rerolls: 1, choices: SPELLS.generateInitialSpellChoices(c) });
      }
      w.chars.push(c);
    });
    w.nextStage = 1;
    w.nextStageTimer = CONFIG.PARTY.prepTime;
    this.world = w;
    UI.broadcastDramatic('준비!', '#0284c7', `${CONFIG.PARTY.prepTime}초 뒤 시작`);
  },

  // 방장만: 다음 스테이지 카운트다운
  updatePartyFlow(w, dt) {
    if (!this.isParty() || !NET.isHost || !(w.nextStageTimer > 0)) return;
    w.nextStageTimer -= dt;
    if (w.nextStageTimer <= 0) {
      w.nextStageTimer = 0;
      this.beginPartyStage(w.nextStage);
    }
  },

  beginPartyStage(n) {
    const w = this.world;
    if (!w) return;
    this.stage = n;
    const allies = w.chars.filter((c) => c.team === 1 && !c.isSmallMob);
    for (const c of allies) {
      if (!c.alive) {
        // 부활
        c.alive = true;
        c.hp = c.maxHp * CONFIG.PARTY.reviveHp;
        c.stunTimer = 0; c.poopTimer = 0; c.slowTimer = 0;
        c.x = CONFIG.W * 0.5 + rand(-120, 120);
        c.y = CONFIG.H * 0.5 + rand(-90, 90);
      } else if (n > 1) {
        c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.35);
      }
    }
    w.chars = w.chars.filter((c) => c.alive || c.team === 1);
    w.projs = []; w.beams = []; w.waves = []; w.zones = [];
    this.spawnSoloStageEnemies(n);
    UI.broadcastDramatic(`STAGE ${n}`, '#0f172a');
  },

  // 방장만: 파티 중 누군가 죽었을 때
  onPartyDeath(target, world) {
    if (target.team === 1 && !target.isSmallMob) {
      const aliveAllies = world.chars.filter((c) => c.alive && c.team === 1 && !c.isSmallMob);
      if (aliveAllies.length === 0) {
        const title = `💀 ${(CONFIG.DIFFICULTY[this.difficulty] || {}).loseText || '전멸!'}`;
        const desc = `${(CONFIG.DIFFICULTY[this.difficulty] || {}).label || ''} · STAGE ${this.stage}`;
        world.nextStageTimer = 0;
        NET.broadcast({ type: 'gameover', title, desc });
        UI.showOnlineGameOver(title, desc);
        return;
      }
      if (target.isLocal) {
        UI.showDramatic('전투 불능', '#475569', '클리어하면 부활');
      } else if (!target.isBot) {
        NET.sendToPeer(target.id, { type: 'dramatic', text: '전투 불능', color: '#475569', sub: '클리어하면 부활' });
      }
      return;
    }
    if (world.nextStageTimer > 0) return; // 이미 클리어 처리됨
    const remain = world.chars.filter((c) => c.alive && c.team !== 1);
    if (remain.length === 0) {
      const D = CONFIG.DIFFICULTY[this.difficulty] || {};
      if (D.ending && this.stage >= CONFIG.ENDING_STAGE) { // 🎉 파티 엔딩
        const title = `🎉 ${D.winText || '대마왕 심규형 토벌!'}`;
        const desc = `${D.label} · 대마왕 심규형 토벌`;
        NET.broadcast({ type: 'gameover', title, desc, cleared: true });
        UI.showOnlineGameOver(title, desc, true);
        return;
      }
      if (!D.ending && this.stage === CONFIG.ENDING_STAGE && D.winText) {
        UI.broadcastDramatic(D.winText, '#dc2626', `${CONFIG.ENDING_STAGE}스테이지 돌파`); // 만용: 배너만
      } else {
        UI.broadcastDramatic(`STAGE ${this.stage} 클리어!`, '#16a34a', '쓰러진 동료 부활');
      }
      world.nextStage = this.stage + 1;
      world.nextStageTimer = CONFIG.PARTY.clearDelay;
    }
  }
});
