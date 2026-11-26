// 전투 공통: 경험치/레벨업 처리, 피해 적용 & 사망 처리(드랍, 스테이지 클리어, 온라인 승자 판정)

Object.assign(ENGINE, {
  grantXp(c, amount, world) {
    if (!c || !c.alive || c.isSmallMob) return;
    if (this.isStageMode() && c.team !== 1) return; // 솔로·파티의 적은 레벨업(=풀회복) 안 함
    c.xp += amount * (c.xpMult || 1); // xpMult: 고대 마도서 유물
    while (c.xp >= c.nextXp) {
      c.xp -= c.nextXp;
      c.lv++;
      c.nextXp = Math.round(c.nextXp * CONFIG.XP.mult + CONFIG.XP.add);
      c.maxHp += CONFIG.HP.perLevel;
      c.hp = c.maxHp; // 레벨업 시 최대 HP 증가 + 풀회복

      if (c.isLocal) SFX.play('levelup');
      if (world) {
        world.rings.push({ x: c.x, y: c.y, r: c.r, maxR: c.r + 52, life: 0.38, maxLife: 0.38, color: '#f59e0b' });
        world.texts.push({ x: c.x, y: c.y - c.r - 18, text: 'LEVEL UP', color: '#d97706', life: 1.0 });
      }

      if (this.mode === 'solo' && c.isLocal) {
        this.soloPendingLevels++;
        if (!this.paused) {
          this.openNextSoloChoice();
        }
      } else if (this.mode === 'online') {
        if (c.isBot) {
          const botChoices = SPELLS.generateChoices(c);
          SPELLS.applyChoice(c, botChoices[randInt(0, botChoices.length - 1)], world);
        } else {
          c.choiceQueue.push({
            isInitial: false,
            rerolls: 1 + (c.extraRerolls || 0),
            choices: SPELLS.generateChoices(c)
          });
          if (c.isLocal) UI.renderOnlineChoiceSlot();
        }
      }
    }
  },

  damageChar(target, rawDmg, attacker, world, ignoreArmor = false) {
    if (!target || !target.alive) return;
    const dmgMult = ignoreArmor ? 1.0 : (1 - (target.armor || 0));
    const finalDmg = Math.max(1, rawDmg * dmgMult);
    target.hp -= finalDmg;
    target.hurtTimer = 0.14;

    if (world && !ignoreArmor) {
      world.texts.push({
        x: target.x + rand(-14, 14),
        y: target.y - target.r - 6,
        text: `-${Math.round(finalDmg)}`,
        color: target.isLocal ? '#dc2626' : '#0f172a',
        life: 0.55
      });
    }

    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
      SPELLS.spawnParticles(world, target.x, target.y, target.color, 18, 210);

      // 작은 슬라임 처치 시 구슬 드랍 (솔로는 난이도에 따라 회복 구슬 유지시간/없음)
      if (target.isSmallMob && world) {
        const healLife = this.isStageMode()
          ? (CONFIG.DIFFICULTY[this.difficulty] || CONFIG.DIFFICULTY.normal).healOrbLife
          : null;
        if (healLife === 0) {
          world.orbs.push({ x: target.x, y: target.y, r: 11, xp: 24, hp: 0, isHeal: false, color: '#f59e0b' });
        } else {
          world.orbs.push({
            x: target.x, y: target.y, r: 13, xp: 24, hp: 18, isHeal: true, color: '#10b981',
            life: healLife ?? undefined, maxLife: healLife ?? undefined
          });
        }
      }

      if (attacker && attacker.alive) {
        this.grantXp(attacker, target.xpReward || 45, world);
      }

      if (this.mode === 'solo') {
        if (target.isLocal) {
          this.paused = true;
          $('#solo-over-desc').textContent = `${(CONFIG.DIFFICULTY[this.difficulty] || {}).label || ''} · STAGE ${this.stage} · Lv.${target.lv}`;
          UI.renderBuildSummary($('#solo-over-build'), target);
          {
            const r = PROFILE.submit(PROFILE.currentId(), 'solo', this.difficulty, this.stage, target.lv);
            TELEMETRY.record(target, { mode: 'solo', cleared: false });
            RANKING.submit({ difficulty: this.difficulty, stage: this.stage, lv: target.lv, cleared: false });
            const D = CONFIG.DIFFICULTY[this.difficulty] || {};
            $('#solo-over-title').textContent = D.loseText || '전투 불능!';
            if (r.isNew) $('#solo-over-desc').textContent += '  🏆 신기록!';
            else if (r.prev) $('#solo-over-desc').textContent += ` (최고 ${r.prev.stage > CONFIG.ENDING_STAGE ? '👑' : 'STAGE ' + r.prev.stage})`;
          }
          $('#modal-solo-over').classList.remove('hidden');
        } else {
          const remainEnemies = world.chars.filter((ch) => ch.alive && ch.team !== 1);
          if (remainEnemies.length === 0) {
            this.soloStageCleared = true;
            this.showSoloStageClearIfReady(); // 레벨업 선택 중이면 선택 끝난 뒤에 뜸
          }
        }
      } else if (this.isParty() && NET.isHost) {
        this.onPartyDeath(target, world);
      } else if (this.mode === 'online' && NET.isHost) {
        const alivePlayers = world.chars.filter((ch) => ch.alive && !ch.isSmallMob);
        if (alivePlayers.length <= 1) {
          const winner = alivePlayers[0];
          const title = winner ? `🏆 ${winner.name} 우승!` : '무승부!';
          const desc = winner ? '' : '';
          NET.broadcast({ type: 'gameover', title, desc });
          UI.showOnlineGameOver(title, desc);
        }
      }
    }
  }
});
