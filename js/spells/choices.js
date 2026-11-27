// 레벨업 카드: 시작 마법 3지선다, 일반 레벨업 3지선다(대성공 +2 / 황금카드 10%), 선택 적용, 황금카드 50:50 추첨

Object.assign(SPELLS, {
  // 시작 시 3회 연속 마법 선택용 3지선다 생성
  generateInitialSpellChoices(c) {
    const ids = Object.keys(CONFIG.MAGICS);
    const picked = [];
    while (picked.length < 3 && ids.length > 0) {
      const idx = randInt(0, ids.length - 1);
      const id = ids.splice(idx, 1)[0];
      const cur = c.magics[id] || 0;
      const info = CONFIG.MAGICS[id];
      picked.push({
        type: 'magic', id, isEpic: false, gain: 1,
        name: info.name, icon: info.icon, color: info.color, bg: info.bg,
        badge: cur === 0 ? '신규' : `Lv.${cur}→${cur + 1}`,
        desc: cur === 0 ? info.desc : info.up
      });
    }
    return picked;
  },

  // 일반 레벨업 3지선다 (10% 확률로 황금 카드 포함, +2단계 업그레이드는 보라색)
  generateChoices(c) {
    const pool = [];
    for (const id of Object.keys(CONFIG.MAGICS)) {
      const cur = c.magics[id] || 0;
      const info = CONFIG.MAGICS[id];
      const isEpic = cur > 0 && Math.random() < 0.22;
      const gain = isEpic ? 2 : 1;
      const nextLv = cur + gain;
      pool.push({
        type: 'magic', id, isEpic, gain,
        name: info.name, icon: info.icon, color: isEpic ? '#7e22ce' : info.color, bg: isEpic ? '#f3e8ff' : info.bg,
        badge: cur === 0 ? '신규' : isEpic ? `대성공! Lv.${cur}→${nextLv}` : `Lv.${cur}→${nextLv}`,
        desc: cur === 0 ? info.desc : info.up
      });
    }
    for (const id of Object.keys(CONFIG.STATS)) {
      const st = CONFIG.STATS[id];
      pool.push({
        type: 'stat', id, isEpic: false, gain: 1,
        name: st.name, icon: st.icon, color: st.color, bg: st.bg,
        badge: '스탯',
        desc: st.desc   // 수치는 안 보여줌 (11/27)
      });
    }

    const choices = [];
    while (choices.length < 3 && pool.length > 0) {
      const idx = randInt(0, pool.length - 1);
      choices.push(pool.splice(idx, 1)[0]);
    }

    const golden = () => ({
      type: 'golden', id: 'golden', isGolden: true,
      name: '황금 카드', icon: '🃏', color: '#B45309', bg: '#FEF3C7',
      badge: '도박',
      desc: '궁극기 / 잭팟 / 스탯 / 꽝 여러 가지'
    });
    // 🃏 황카만 뽑기 모드 (온라인 옵션): 레벨업 선택지 3장이 전부 황금 카드
    if (ENGINE.mode === 'online' && ENGINE.goldenOnly) return [golden(), golden(), golden()];
    // 10% 확률로 마지막 슬롯을 황금 카드로 교체
    if (Math.random() < 0.10 + (c.goldenBonus || 0) && choices.length === 3) { // goldenBonus: 운명의 금화 유물
      choices[2] = golden();
    }
    return choices;
  },

  applyChoice(c, choice, world) {
    if (!choice) return;
    if (choice.type === 'magic') {
      const gain = choice.gain || 1;
      c.magics[choice.id] = (c.magics[choice.id] || 0) + gain;
      if (!c.cooldowns[choice.id]) c.cooldowns[choice.id] = 0.08;
      if (choice.id === 'blades') this.ensureShieldSlots(c);
      this.comboCheck(c, world);   // 🔗 조합 켜짐/단계업 알림
    } else if (choice.type === 'stat') {
      if (!c.statCounts) c.statCounts = {};
      c.statCounts[choice.id] = (c.statCounts[choice.id] || 0) + 1;
      if (choice.id === 'regen') c.regen = (c.regen || 0) + CONFIG.STAT_VALUES.regen;
      this.recalcStats(c);
    } else if (choice.type === 'golden') {
      this.resolveGoldenCard(c, world);
    }
  },

  // 스탯 카드 장수 + 유물 보너스 → 실제 배율 다시 계산
  // 공격·범위: 1 + 0.25n (덧셈), 방어·쿨감: max × n/(n+k) (수렴). 유물(%)은 각각 더하기/곱하기로 얹음
  statParts(n, id) {
    const V = CONFIG.STAT_VALUES;
    if (id === 'atk') return V.atk * n;
    if (id === 'area') return V.area * n;
    if (id === 'armor') return V.armorMax * n / (n + V.armorK);
    if (id === 'cdr') return V.cdrMax * n / (n + V.cdrK);
    return 0;
  },

  recalcStats(c) {
    if (!c) return;
    const V = CONFIG.STAT_VALUES;
    const n = (id) => (c.statCounts && c.statCounts[id]) || 0;
    const rb = c.relicBonus || {};
    if (c.baseAtk == null) { c.baseAtk = c.atkMult || 1; c.baseArea = c.areaMult || 1; c.baseCdr = c.cdrMult || 1; c.baseArmor = c.armor || 0; }
    c.atkMult = c.baseAtk * (1 + this.statParts(n('atk'), 'atk') + (rb.atk || 0) / 100);
    c.areaMult = c.baseArea * (1 + this.statParts(n('area'), 'area') + (rb.area || 0) / 100);
    const arm = 1 - (1 - c.baseArmor) * (1 - this.statParts(n('armor'), 'armor')) * (1 - (rb.armor || 0) / 100);
    c.armor = Math.min(V.armorMax, arm);
    const cdrRed = 1 - (1 - this.statParts(n('cdr'), 'cdr')) * (1 - (rb.cdr || 0) / 100);
    c.cdrMult = c.baseCdr * (1 - Math.min(V.cdrMax, cdrRed));
  },

  // 🃏 황금 카드 결과 (11/27z3): CONFIG.GOLDEN_ODDS — 궁극기 30 / 💎잭팟 5 / 스탯 30 / 🎁반전 5 | 💩똥 15 / 👹적 분노 8 / 🐌느림보 7
  // 이미 있는 궁극기가 또 나오면 ×2, ×3 … (개수·피해 ↑, ultimates.js)
  rollGolden() {
    const O = CONFIG.GOLDEN_ODDS;
    const total = Object.values(O).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [k, v] of Object.entries(O)) { if ((r -= v) < 0) return k; }
    return 'stat';
  },

  resolveGoldenCard(c, world) {
    const kind = this.rollGolden();
    const ultKeys = Object.keys(CONFIG.ULTIMATES);
    const pickedUlt = ultKeys[randInt(0, ultKeys.length - 1)];
    const statKeys = Object.keys(CONFIG.STATS);
    const pickedStat = statKeys[randInt(0, statKeys.length - 1)];
    const owned = Object.keys(c.magics || {}).filter((m) => (c.magics[m] || 0) > 0 && CONFIG.MAGICS[m]);
    const magicPool = owned.length ? owned : Object.keys(CONFIG.MAGICS);
    const pickedMagic = magicPool[randInt(0, magicPool.length - 1)];
    const nextLv = ((c.ultLv || {})[pickedUlt] || 0) + 1;
    const U = CONFIG.ULTIMATES[pickedUlt];
    const ultLabel = `${U.icon} ${U.name}${nextLv > 1 ? ` ×${nextLv}` : ''}`;
    const M = CONFIG.MAGICS[pickedMagic] || {};
    const label = {
      ult: `🎉 ${ultLabel}`,
      twist: `🎁 꽝인 줄 알았지? ${ultLabel}`,
      jackpot: `💎 잭팟! ${M.icon || ''} ${M.name || pickedMagic} +2`,
      stat: `📈 ${CONFIG.STATS[pickedStat].icon} ${CONFIG.STATS[pickedStat].name} +1`,
      poop: '💩 꽝!',
      enrage: '👹 적 분노!',
      snail: '🐌 느림보!'
    }[kind];
    const tone = kind === 'jackpot' ? 'jackpot' : (kind === 'poop' || kind === 'enrage' || kind === 'snail') ? 'bust' : 'win';

    if (c.isLocal) {
      UI.playRoulette(label, tone, kind === 'twist');
    } else if (!c.isBot && typeof NET !== 'undefined' && NET.active && NET.isHost) {
      // 참가자에게 결과 알림 (룰렛 연출은 방장 화면에만 있음)
      NET.sendToPeer(c.id, { type: 'dramatic', text: label, color: tone === 'bust' ? '#78350f' : '#d97706', sub: '🃏 황금 카드', style: tone === 'jackpot' ? 'jackpot' : '' });
    }
    const tell = (text, color, sub) => { // 본인에게 큰 배너
      if (c.isLocal) UI.showDramatic(text, color, sub);
      else if (!c.isBot && NET.active && NET.isHost) NET.sendToPeer(c.id, { type: 'dramatic', text, color, sub });
    };

    const applyResult = () => {
      if (!c.alive) return;
      const say = (text, color) => { if (world) world.texts.push({ x: c.x, y: c.y - c.r - 22, text, color, life: 1.4 }); };
      if (kind === 'ult' || kind === 'twist') {
        if (!c.ultLv) c.ultLv = {};
        if (!c.ultimates.includes(pickedUlt)) c.ultimates.push(pickedUlt);
        c.ultLv[pickedUlt] = (c.ultLv[pickedUlt] || 0) + 1;
        c.ultCooldowns[pickedUlt] = 0.4;
        SFX.play('golden');
        const n = c.ultLv[pickedUlt];
        say(`${U.name}${n > 1 ? ` ×${n}` : ''}!`, '#d97706');
      } else if (kind === 'jackpot') {
        this.applyChoice(c, { type: 'magic', id: pickedMagic, gain: 2 }, world);
        SFX.play('golden');
        say(`💎 ${M.name || pickedMagic} +2`, '#d97706');
        if (world) { // 동전 파티클 + 금색 링
          for (let k = 0; k < 3; k++) world.rings.push({ x: c.x, y: c.y, r: 10, maxR: 90 + k * 50, life: 0.35 + k * 0.12, maxLife: 0.35 + k * 0.12, color: '#f59e0b' });
          this.spawnParticles(world, c.x, c.y, '#fbbf24', 30, 300);
          this.spawnParticles(world, c.x, c.y, '#f59e0b', 20, 200);
        }
        if (c.isLocal) UI.goldFlash();
      } else if (kind === 'stat') {
        this.applyChoice(c, { type: 'stat', id: pickedStat }, world);
        SFX.play('golden');
        say(`${CONFIG.STATS[pickedStat].name} +1`, '#16a34a');
      } else if (kind === 'poop') {
        c.poopTimer = 5.0;
        if (c.isLocal) SFX.play('poop');
        tell('똥!똥!똥!', '#92400e', '5초간 행동 불가');
      } else if (kind === 'enrage') { // 👹 적(상대) 전원 10초간 공격 속도 ×1.5
        for (const t of (world ? world.chars : [])) {
          if (!t.alive || t.team === c.team) continue;
          t.enrageT = 10;
          if (!t.isSmallMob) world.texts.push({ x: t.x, y: t.y - t.r - 16, text: '👹', color: '#dc2626', life: 1.2 });
        }
        if (c.isLocal) SFX.play('poop');
        tell('적 분노!', '#dc2626', '10초간 적 공격 속도 ×1.5');
      } else if (kind === 'snail') { // 🐌 8초간 내 마법 쿨타임 2배
        c.snailT = 8;
        if (c.isLocal) SFX.play('poop');
        say('🐌', '#78350f');
        tell('느림보!', '#78350f', '8초간 내 마법 쿨타임 2배');
      }
    };

    if (c.isLocal) {
      setTimeout(applyResult, kind === 'twist' ? 2750 : 1950); // 룰렛 멈춘 뒤
    } else {
      applyResult();
    }
  }
});
