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
        desc: st.desc
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
      if (choice.id === 'atk') {
        c.atkMult *= CONFIG.STAT_VALUES.atk;
      } else if (choice.id === 'armor') {
        c.armor = 1 - (1 - (c.armor || 0)) * (1 - CONFIG.STAT_VALUES.armor);
      } else if (choice.id === 'regen') {
        c.regen = (c.regen || 0) + CONFIG.STAT_VALUES.regen;
      } else if (choice.id === 'area') {
        c.areaMult *= CONFIG.STAT_VALUES.area;
      } else if (choice.id === 'cdr') {
        c.cdrMult *= CONFIG.STAT_VALUES.cdr;
      }
    } else if (choice.type === 'golden') {
      this.resolveGoldenCard(c, world);
    }
  },

  // 황금 카드 50:50 추첨 + 슬롯 룰렛 연출
  resolveGoldenCard(c, world) {
    const success = Math.random() < 0.5;
    const ultKeys = Object.keys(CONFIG.ULTIMATES);
    const pickedUlt = ultKeys[randInt(0, ultKeys.length - 1)];
    const resultLabel = success
      ? `🎉 ${CONFIG.ULTIMATES[pickedUlt].name}`
      : '💩 꽝!';

    if (c.isLocal) {
      UI.playRoulette(resultLabel, success);
    }

    const applyResult = () => {
      if (!c.alive) return;
      if (success) {
        if (!c.ultimates.includes(pickedUlt)) {
          c.ultimates.push(pickedUlt);
        }
        c.ultCooldowns[pickedUlt] = 0.4;
        SFX.play('golden');
        if (world) {
          world.texts.push({ x: c.x, y: c.y - c.r - 22, text: `${CONFIG.ULTIMATES[pickedUlt].name}!`, color: '#d97706', life: 1.4 });
        }
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
