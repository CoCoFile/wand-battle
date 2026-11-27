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
      if (id === 'shield' && cur >= 6) continue;
      const info = CONFIG.MAGICS[id];
      const maxGain = id === 'shield' ? (6 - cur) : 2;
      const isEpic = cur > 0 && maxGain >= 2 && Math.random() < 0.22;
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

    // 10% 확률로 마지막 슬롯을 황금 카드로 교체
    if (Math.random() < 0.10 + (c.goldenBonus || 0) && choices.length === 3) { // goldenBonus: 운명의 금화 유물
      choices[2] = {
        type: 'golden', id: 'golden', isGolden: true,
        name: '황금 카드', icon: '🃏', color: '#B45309', bg: '#FEF3C7',
        badge: '도박',
        desc: '궁극기 or 똥'
      };
    }
    return choices;
  },

  applyChoice(c, choice, world) {
    if (!choice) return;
    if (choice.type === 'magic') {
      const gain = choice.gain || 1;
      if (choice.id === 'shield') {
        c.magics.shield = Math.min(6, (c.magics.shield || 0) + gain);
        this.ensureShieldSlots(c);
      } else {
        c.magics[choice.id] = (c.magics[choice.id] || 0) + gain;
        if (!c.cooldowns[choice.id]) c.cooldowns[choice.id] = 0.08;
      }
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

  // 황금 카드: 궁극기 50% / 랜덤 스탯 +1장 20% / 똥 30% (11/27i: 똥 50→30%) + 슬롯 룰렛 연출
  // 이미 있는 궁극기가 또 나오면 ×2, ×3 … (개수·피해 ↑, ultimates.js)
  resolveGoldenCard(c, world) {
    const roll = Math.random();
    const success = roll < 0.5;
    const isStat = !success && roll < 0.7;
    const ultKeys = Object.keys(CONFIG.ULTIMATES);
    const pickedUlt = ultKeys[randInt(0, ultKeys.length - 1)];
    const statKeys = Object.keys(CONFIG.STATS);
    const pickedStat = statKeys[randInt(0, statKeys.length - 1)];
    const nextLv = ((c.ultLv || {})[pickedUlt] || 0) + 1;
    const resultLabel = success
      ? `🎉 ${CONFIG.ULTIMATES[pickedUlt].name}${nextLv > 1 ? ` ×${nextLv}` : ''}`
      : isStat
        ? `📈 ${CONFIG.STATS[pickedStat].icon} ${CONFIG.STATS[pickedStat].name} +1`
        : '💩 꽝!';

    if (c.isLocal) {
      UI.playRoulette(resultLabel, success || isStat);
    }

    const applyResult = () => {
      if (!c.alive) return;
      if (success) {
        if (!c.ultLv) c.ultLv = {};
        if (!c.ultimates.includes(pickedUlt)) c.ultimates.push(pickedUlt);
        c.ultLv[pickedUlt] = (c.ultLv[pickedUlt] || 0) + 1;
        c.ultCooldowns[pickedUlt] = 0.4;
        SFX.play('golden');
        if (world) {
          const n = c.ultLv[pickedUlt];
          world.texts.push({ x: c.x, y: c.y - c.r - 22, text: `${CONFIG.ULTIMATES[pickedUlt].name}${n > 1 ? ` ×${n}` : ''}!`, color: '#d97706', life: 1.4 });
        }
      } else if (isStat) {
        this.applyChoice(c, { type: 'stat', id: pickedStat }, world);
        SFX.play('golden');
        if (world) world.texts.push({ x: c.x, y: c.y - c.r - 22, text: `${CONFIG.STATS[pickedStat].name} +1`, color: '#16a34a', life: 1.4 });
      } else {
        c.poopTimer = 5.0;
        if (c.isLocal) {
          SFX.play('poop');
          UI.showDramatic('똥!똥!똥!', '#92400e', '5초간 행동 불가');
        } else if (NET.active && NET.isHost && !c.isBot) {
          NET.sendToPeer(c.id, { type: 'dramatic', text: '똥!똥!똥!', color: '#92400e', sub: '5초간 행동 불가' });
        }
      }
    };

    if (c.isLocal) {
      setTimeout(applyResult, 1150);
    } else {
      applyResult();
    }
  }
});
