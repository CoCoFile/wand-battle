// 솔로 아케이드: 시작, 스테이지별 적/보스/슬라임 스폰, 레벨업 선택 모달 흐름, 다음 스테이지

Object.assign(ENGINE, {
  startSolo() {
    SFX.init();
    PROFILE.touch(PROFILE.currentId());
    this.matchStartedAt = Date.now();
    this.usedManual = false;
    this.mode = 'solo';
    this.stage = 1;
    this.paused = false;
    this.userPaused = false;
    this.runEnded = false;
    this.localId = 'player';
    this.soloRerolls = 1;
    this.soloInitialDrafts = 3;
    this.soloPendingLevels = 0;
    this.soloStageCleared = false;
    this.soloNextStageTimer = 0;
    this.soloCurrentChoices = [];

    const w = this.createEmptyWorld();
    const playerName = sanitizeName($('#input-name').value, '나(마법사)');
    const player = this.makeChar({
      id: 'player',
      name: playerName,
      color: CONFIG.PLAYER_COLOR,
      team: 1,
      isLocal: true,
      x: CONFIG.W * 0.5,
      y: CONFIG.H * 0.5,
      maxHp: CONFIG.HP.solo,
      magics: {},
      title: ACCOUNT.myTitle()   // 🏷️
    });
    w.chars.push(player);
    if (ACCOUNT.loggedIn()) {
      RELICS.apply(player, ACCOUNT.equippedList()); // 🎒 유물
      this.soloRerolls += player.extraRerolls || 0;
    }
    this.world = w;

    this.spawnSoloStageEnemies(1);

    UI.hideAllModals();
    UI.showScreen('game');
    $('#online-bottom-dock').classList.add('hidden');
    $('#btn-manual-toggle').classList.toggle('hidden', !this.manualAllowed()); // 수동 조작은 쉼터만
    $('#btn-speed').classList.remove('hidden');
    $('#btn-pause').classList.remove('hidden');      // ⏸️ (중단은 일시정지 창에서)
    $('#btn-quit-game').classList.add('hidden');
    $('#modal-pause').classList.add('hidden');
    this.cycleSoloSpeed(this.soloSpeed);
    this.toggleManualControl(this.manualControl);
    $('#hud-mode-badge').textContent = `SOLO · ${(CONFIG.DIFFICULTY[this.difficulty] || {}).label || ''}`;
    $('#hud-mode-badge').className = 'px-2 py-0.5 rounded-lg bg-orange-500 text-white text-[11px] font-black shrink-0';
    RENDER.resize();
    UI.updateHUD();
    this.openNextSoloChoice();
  },

  spawnSoloStageEnemies(stage) {
    const w = this.world;
    if (!w) return;
    const B = CONFIG.SOLO;
    const D = CONFIG.DIFFICULTY[this.difficulty] || CONFIG.DIFFICULTY.normal;
    const at = ([base, inc]) => base + inc * (stage - 1);
    // 후반 완화된 '체감 스테이지': lateFrom 이후는 lateMult 배속으로만 증가 (HP·공격력·쿨타임에만 사용)
    const lateFrom = D.lateFrom ?? B.lateFrom;
    const lateMult = D.lateMult ?? B.lateMult; // 난이도별로 덮어쓸 수 있음 (만용은 완화 덜 함)
    const eff = stage <= lateFrom ? stage : lateFrom + (stage - lateFrom) * lateMult;
    const atP = ([base, inc]) => base + inc * (eff - 1);
    const allies = w.chars.filter((c) => c.alive && c.team === 1 && !c.isSmallMob);
    const extra = Math.max(0, allies.length - 1); // 파티 인원 추가분
    const isBossStage = stage % B.boss.every === 0;
    const baseCount = isBossStage
      ? Math.floor(at(B.mage.bossStageCount))
      : Math.min(B.mage.countMax, Math.floor(at(B.mage.count)));
    const enemyCount = Math.round(baseCount * (1 + CONFIG.PARTY.enemyCountPer * extra));
    const farFromAllies = () => {
      for (let tries = 0; tries < 12; tries++) {
        const x = rand(120, CONFIG.W - 120);
        const y = rand(120, CONFIG.H - 120);
        if (allies.every((a) => dist(x, y, a.x, a.y) >= 220)) return [x, y];
      }
      return [rand(120, CONFIG.W - 120), rand(120, CONFIG.H - 120)];
    };
    const allMagicIds = Object.keys(CONFIG.MAGICS);
    const usedNames = [];

    for (let i = 0; i < enemyCount; i++) {
      const [ex, ey] = farFromAllies();
      const magics = { laser: 1 };
      if (stage >= B.mage.extraMagicFrom) {
        // 3스테이지 1개 → 6스테이지 2개 → 9스테이지 3개 (11/27: 2스테이지마다 → 3스테이지마다, 7스테이지 벽 완화)
        const extraCnt = Math.min(B.mage.extraMagicMax, 1 + Math.floor((stage - B.mage.extraMagicFrom) / B.mage.extraMagicEvery));
        for (let k = 0; k < extraCnt; k++) {
          const mid = allMagicIds[randInt(0, allMagicIds.length - 1)];
          magics[mid] = (magics[mid] || 0) + 1;
        }
      }
      const name = pickName(CONFIG.ENEMY_NAMES, usedNames);
      usedNames.push(name);
      const enemy = this.makeChar({
        id: `enemy_${stage}_${i}_${Date.now()}`,
        name,
        color: CONFIG.ENEMY_COLORS[i % CONFIG.ENEMY_COLORS.length],
        team: 2,
        isBot: true,
        x: ex,
        y: ey,
        maxHp: Math.round(atP(B.mage.hp) * D.enemyHp),
        atkMult: atP(B.mage.atk) * D.enemyAtk,
        cdrMult: Math.max(B.mage.cdrMin, atP(B.mage.cdr)) * D.enemyCdr,
        xpReward: Math.round(at(B.mage.xp)),
        magics
      });
      SPELLS.ensureShieldSlots(enemy);
      w.chars.push(enemy);
    }

    if (isBossStage) {
      const bossTier = Math.min(stage / B.boss.every - 1, CONFIG.BOSS_NAMES.length - 1); // 0 = 동네 대마왕 … 9 = 대마왕
      const boss = this.makeChar({
        id: `boss_${stage}_${Date.now()}`,
        name: CONFIG.BOSS_NAMES[bossTier],
        color: CONFIG.BOSS_COLOR,
        team: 2,
        isBot: true,
        isBoss: true,
        x: CONFIG.W * 0.5,
        y: 130,
        maxHp: Math.round((B.boss.hp[0] + B.boss.hp[1] * (eff - B.boss.every)) * (D.bossHp ?? D.enemyHp) * (1 + CONFIG.PARTY.bossHpPer * extra)),
        atkMult: (B.boss.atk[0] + B.boss.atk[1] * (eff - B.boss.every)) * (D.bossAtk ?? D.enemyAtk),
        cdrMult: B.boss.cdr * D.enemyCdr,
        xpReward: B.boss.xp,
        magics: { ...B.boss.magics }
      });
      boss.bossTier = bossTier;       // 👑 왕관 모양 + 필살기 종류
      SPELLS.ensureShieldSlots(boss);
      w.chars.push(boss);
    }

    // 작은 슬라임 (공격 안 함, 처치 시 회복 구슬)
    for (let s = 0; s < B.slime.count; s++) {
      w.chars.push(this.makeChar({
        id: `slime_${stage}_${s}_${Date.now()}`,
        name: '작은 슬라임',
        color: '#22C55E',
        team: 2,
        isBot: true,
        isSmallMob: true,
        noAttack: true,
        x: rand(120, CONFIG.W - 120),
        y: rand(120, CONFIG.H - 120),
        maxHp: Math.round(at(B.slime.hp)),
        xpReward: B.slime.xp
      }));
    }

    this.spawnBouncers(w); // 바운스 지뢰 새로 깔기
  },

  openNextSoloChoice() {
    const player = this.getLocalChar();
    if (!player || !player.alive) return;

    const titleEl = $('#solo-choice-title');
    const subEl = $('#solo-choice-sub');

    if (this.soloInitialDrafts > 0) {
      this.paused = true;
      const step = 4 - this.soloInitialDrafts;
      if (titleEl) titleEl.textContent = `시작 마법 선택 (${step} / 3)`;
      this.soloCurrentChoices = SPELLS.generateInitialSpellChoices(player);
      this.renderSoloChoiceModal();
      return;
    }

    if (this.soloPendingLevels > 0) {
      this.paused = true;
      if (titleEl) titleEl.textContent = `레벨 업! Lv.${player.lv}`;
      this.soloCurrentChoices = SPELLS.generateChoices(player);
      this.renderSoloChoiceModal();
      return;
    }

    $('#modal-solo-choice')?.classList.add('hidden');
    this.paused = false;
    this.showSoloStageClearIfReady();
  },

  // 스테이지 클리어 창: 레벨업 선택이 남아 있으면 미뤘다가, 선택이 다 끝나면 띄움
  showSoloStageClearIfReady() {
    if (!this.soloStageCleared) return;
    if (this.soloInitialDrafts > 0 || this.soloPendingLevels > 0) return;
    if (this.soloNextStageTimer > 0) return; // 이미 넘어가는 중
    const D = CONFIG.DIFFICULTY[this.difficulty] || {};
    if (D.ending && this.stage >= CONFIG.ENDING_STAGE) { // 🎉 엔딩
      this.paused = true;
      this.runEnded = true;
      const me = this.getLocalChar();
      const r = PROFILE.submit(PROFILE.currentId(), 'solo', this.difficulty, CONFIG.ENDING_STAGE + 1, me.lv);
      TELEMETRY.record(me, { mode: 'solo', cleared: true });
      RANKING.submit({ difficulty: this.difficulty, stage: CONFIG.ENDING_STAGE + 1, lv: me.lv, cleared: true });
      const frag = ACCOUNT.addFragment(this.difficulty); // 💛 심장 조각
      $('#solo-ending-title').textContent = D.winText || '대마왕 심규형 토벌!';
      $('#solo-ending-desc').textContent = `${D.label} · 대마왕 심규형 토벌 · Lv.${me.lv}${r.isNew ? '  🏆 신기록!' : ''}`;
      UI.renderBuildSummary($('#solo-ending-build'), me);
      $('#solo-ending-reward').textContent = frag ? `+1 ${frag.icon} ${frag.name}` : (ACCOUNT.enabled() ? '로그인하면 심장 조각을 모아 유물을 뽑을 수 있어요' : '');
      $('#modal-solo-ending').classList.remove('hidden');
      SFX.play('golden');
      return;
    }
    if (!D.ending && this.stage === CONFIG.ENDING_STAGE && D.winText) {
      UI.showDramatic(D.winText, '#dc2626', `${CONFIG.ENDING_STAGE}스테이지 돌파`); // 광기: 배너만, 계속 진행
    }
    if (!D.ending && this.stage >= CONFIG.ENDING_STAGE && (this.stage - CONFIG.ENDING_STAGE) % 10 === 0) {
      const frag = ACCOUNT.addFragment(this.difficulty); // 🖤 광기: 30 돌파 + 10스테이지마다
      if (frag) UI.toast(`+1 ${frag.icon} ${frag.name}`);
    }
    // 클리어 창 대신 위쪽 작은 알림 → CONFIG.SOLO_NEXT_DELAY초 뒤 자동으로 다음 스테이지 (update.js에서 카운트)
    this.paused = false;
    UI.toast(`✅ STAGE ${this.stage} 클리어`);
    this.soloNextStageTimer = Math.max(0.001, CONFIG.SOLO_NEXT_DELAY); // 0이어도 다음 프레임에 넘김 (전투 처리 도중 월드를 바꾸지 않게)
  },

  renderSoloChoiceModal() {
    $('#solo-reroll-count').textContent = String(this.soloRerolls);
    const rerollBtn = $('#btn-solo-reroll');
    if (rerollBtn) rerollBtn.disabled = this.soloRerolls <= 0;

    UI.renderChoiceCards($('#solo-choice-cards'), this.soloCurrentChoices, (idx) => {
      this.pickSoloChoice(idx);
    });
    $('#modal-solo-choice').classList.remove('hidden');
  },

  pickSoloChoice(idx) {
    const player = this.getLocalChar();
    const choice = this.soloCurrentChoices[idx];
    if (!player || !choice) return;

    SPELLS.applyChoice(player, choice, this.world);
    if (this.soloInitialDrafts > 0) {
      this.soloInitialDrafts--;
    } else if (this.soloPendingLevels > 0) {
      this.soloPendingLevels--;
    }
    UI.updateHUD();
    this.openNextSoloChoice();
  },

  rerollSoloChoice() {
    const player = this.getLocalChar();
    if (!player || this.soloRerolls <= 0) return;
    this.soloRerolls--;
    if (this.soloInitialDrafts > 0) {
      this.soloCurrentChoices = SPELLS.generateInitialSpellChoices(player);
    } else {
      this.soloCurrentChoices = SPELLS.generateChoices(player);
    }
    this.renderSoloChoiceModal();
  },

  nextSoloStage() {
    const player = this.getLocalChar();
    if (!player || !player.alive) return;
    if (this.soloPendingLevels > 0) { this.openNextSoloChoice(); return; } // 안전장치: 선택 먼저
    this.soloStageCleared = false;
    this.soloNextStageTimer = 0;
    this.stage++;
    player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
    this.world.chars = this.world.chars.filter((c) => c.alive || c.isLocal); // 죽은 적 정리
    this.world.projs = [];
    this.world.beams = [];
    this.world.waves = [];
    this.world.zones = [];
    this.world.warns = [];
    this.world.bossTimers = [];
    this.spawnSoloStageEnemies(this.stage);
    $('#modal-solo-stage').classList.add('hidden');
    this.paused = false;
    UI.updateHUD();
  }
});
