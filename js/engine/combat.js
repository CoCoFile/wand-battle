// 전투 공통: 경험치/레벨업 처리, 피해 적용 & 사망 처리(드랍, 스테이지 클리어, 온라인 승자 판정)

Object.assign(ENGINE, {
  grantXp(c, amount, world) {
    if (!c || !c.alive || c.isSmallMob) return;
    if (this.mode === 'solo' && !c.isLocal) return; // 솔로 적은 레벨업(=풀회복) 안 함
    c.xp += amount;
    while (c.xp >= c.nextXp) {
      c.xp -= c.nextXp;
      c.lv++;
      c.nextXp = Math.round(c.nextXp * 1.24 + 18);
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
            rerolls: 1,
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

      // 작은 슬라임 처치 시 HP + XP 구슬 드랍
      if (target.isSmallMob && world) {
        world.orbs.push({
          x: target.x,
          y: target.y,
          r: 13,
          xp: 24,
          hp: 18,
          isHeal: true,
          color: '#10b981'
        });
      }

      if (attacker && attacker.alive) {
        this.grantXp(attacker, target.xpReward || 45, world);
      }

      if (this.mode === 'solo') {
        if (target.isLocal) {
          this.paused = true;
          $('#solo-over-desc').textContent = `STAGE ${this.stage} · Lv.${target.lv}`;
          $('#modal-solo-over').classList.remove('hidden');
        } else {
          const remainEnemies = world.chars.filter((ch) => ch.alive && ch.team !== 1);
          if (remainEnemies.length === 0) {
            this.paused = true;
            $('#stage-clear-title').textContent = `STAGE ${this.stage} 클리어!`;
            $('#modal-solo-stage').classList.remove('hidden');
          }
        }
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
