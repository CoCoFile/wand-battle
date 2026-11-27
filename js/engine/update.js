// 프레임 업데이트: 경험치 구슬 스폰 → 캐릭터(상태이상/이동/구슬/조준/자동시전/궁극기) → 투사체 → 충격파 → 장판 → 이펙트 감쇠

Object.assign(ENGINE, {
  // 매 프레임 월드 시뮬레이션 (솔로: 항상 / 온라인: 방장만 실행 → 클라이언트는 스냅샷만 받음)
  update(dt) {
    const w = this.world;
    if (!w || this.paused || this.userPaused) return; // userPaused: ⏸️ 일시정지 (솔로 / 파티 방장)
    w.time += dt;
    if (w.shake > 0) w.shake = Math.max(0, w.shake - dt); // 화면 흔들림 (보스 필살기)

    this.updatePartyFlow(w, dt);
    // 솔로: 스테이지 클리어 후 자동 진행 카운트 (게임 시간 기준 → 배속·일시정지 반영)
    if (this.mode === 'solo' && this.soloNextStageTimer > 0) {
      this.soloNextStageTimer -= dt;
      if (this.soloNextStageTimer <= 0) { this.soloNextStageTimer = 0; this.nextSoloStage(); return; }
    }
    this.spawnOnlineOrbs(w, dt);
    this.updateCharacters(w, dt);
    this.resolveCollisions(w);
    this.updateBouncers(w);
    this.updateProjectiles(w, dt);
    this.updateWaves(w, dt);
    this.updateZones(w, dt);
    SPELLS.updateBossWarns(w, dt);
    this.updateEffects(w, dt);
  },

  spawnOnlineOrbs(w, dt) {
    // 온라인 대전 시 맵 경험치 구슬 주기적 생성 (2배 스폰)
    if (this.mode === 'online' && !this.isParty()) {
      w.orbTimer += dt;
      if (w.orbTimer >= 1.1 && w.orbs.length < 36) {
        w.orbTimer = 0;
        for (let k = 0; k < 2; k++) {
          w.orbs.push({
            x: rand(70, CONFIG.W - 70),
            y: rand(70, CONFIG.H - 70),
            r: 9,
            xp: 22,
            hp: 0,
            isHeal: false,
            color: '#f59e0b'
          });
        }
      }
    }
  },

  updateCharacters(w, dt) {
    // 1. 캐릭터 업데이트
    for (const c of w.chars) {
      if (!c.alive) continue;

      if (c.hurtTimer > 0) c.hurtTimer = Math.max(0, c.hurtTimer - dt);
      if (c.stunTimer > 0) c.stunTimer = Math.max(0, c.stunTimer - dt);
      if (c.slowTimer > 0) { c.slowTimer = Math.max(0, c.slowTimer - dt); if (c.slowTimer === 0) c.slowMult = 0; }
      if (c.shredTimer > 0) { c.shredTimer = Math.max(0, c.shredTimer - dt); if (c.shredTimer === 0) c.shred = 0; } // 🧊 방깍
      if (c.poopTimer > 0) c.poopTimer = Math.max(0, c.poopTimer - dt);

      if (c.regen > 0 && c.hp < c.maxHp) {
        c.hp = Math.min(c.maxHp, c.hp + c.regen * dt);
      }

      // 튕겨나가는 중 (바운스 지뢰): 속도만큼 밀리고 점점 감속, 벽에 닿으면 반사
      if (c.kbVx || c.kbVy) {
        const pad = c.r + 12;
        c.x += c.kbVx * dt;
        c.y += c.kbVy * dt;
        if (c.x < pad || c.x > CONFIG.W - pad) { c.kbVx = -c.kbVx; c.x = clamp(c.x, pad, CONFIG.W - pad); }
        if (c.y < pad || c.y > CONFIG.H - pad) { c.kbVy = -c.kbVy; c.y = clamp(c.y, pad, CONFIG.H - pad); }
        const f = Math.exp(-CONFIG.BOUNCE_MINES.decay * dt);
        c.kbVx *= f; c.kbVy *= f;
        if (Math.hypot(c.kbVx, c.kbVy) < 25) { c.kbVx = 0; c.kbVy = 0; }
      }

      SPELLS.updateShields(c, dt, w);
      if (!(c.poopTimer > 0)) SPELLS.updateBlades(c, dt, w); // 🗡️ 회전 칼날 (똥 상태면 멈춤)

      const isIncapacitated = c.stunTimer > 0 || c.poopTimer > 0;
      const isManual = (this.mode === 'solo' && this.manualControl && c.isLocal);

      // 이동 처리 (솔로 수동조작 ON이면 키보드/터치 이동, 그 외에는 100% 올랜덤 이동)
      if (!isIncapacitated) {
        const spdMult = c.slowTimer > 0 ? (c.slowMult || 0.55) : 1.0;
        const spd = c.speed * spdMult;
        const pad = c.r + 12;

        if (isManual) {
          let mx = (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0);
          let my = (this.input.down ? 1 : 0) - (this.input.up ? 1 : 0);
          if (this.input.touchActive) {
            const dx = this.input.touchX - c.x;
            const dy = this.input.touchY - c.y;
            const d = Math.hypot(dx, dy);
            if (d > 12) {
              mx = dx / d;
              my = dy / d;
            }
          }
          if (mx !== 0 || my !== 0) {
            const len = Math.hypot(mx, my);
            c.x = clamp(c.x + (mx / len) * spd * dt, pad, CONFIG.W - pad);
            c.y = clamp(c.y + (my / len) * spd * dt, pad, CONFIG.H - pad);
          }
        } else {
          c.moveTimer -= dt;
          if (c.moveTimer <= 0) {
            c.moveAng = rand(0, Math.PI * 2);
            c.moveTimer = rand(0.45, 1.35);
          }
          c.x += Math.cos(c.moveAng) * spd * dt;
          c.y += Math.sin(c.moveAng) * spd * dt;

          if (c.x < pad) {
            c.x = pad;
            c.moveAng = Math.PI - c.moveAng + rand(-0.35, 0.35);
          } else if (c.x > CONFIG.W - pad) {
            c.x = CONFIG.W - pad;
            c.moveAng = Math.PI - c.moveAng + rand(-0.35, 0.35);
          }
          if (c.y < pad) {
            c.y = pad;
            c.moveAng = -c.moveAng + rand(-0.35, 0.35);
          } else if (c.y > CONFIG.H - pad) {
            c.y = CONFIG.H - pad;
            c.moveAng = -c.moveAng + rand(-0.35, 0.35);
          }
        }
      }

      // 구슬 흡수 (슬라임 제외, 솔로·파티에선 플레이어 팀만)
      if (!c.isSmallMob && (!this.isStageMode() || c.team === 1)) {
        for (let i = w.orbs.length - 1; i >= 0; i--) {
          const o = w.orbs[i];
          if (dist(c.x, c.y, o.x, o.y) <= c.r + o.r + 10 + (c.pickupBonus || 0)) { // pickupBonus: 탐욕의 손아귀 유물
            w.orbs.splice(i, 1);
            if (o.hp > 0) {
              c.hp = Math.min(c.maxHp, c.hp + o.hp);
              w.texts.push({ x: c.x, y: c.y - c.r - 12, text: `+${o.hp} HP`, color: '#10b981', life: 0.65 });
            }
            if (o.xp > 0) {
              this.grantXp(c, o.xp, w);
            }
          }
        }
      }

      // 공격 불가 유닛(작은 슬라임)이나 행동 불가 상태면 공격 생략
      if (c.noAttack || isIncapacitated) continue;

      // 조준 처리 (솔로 수동조작 ON이면 마우스/터치 방향 조준, 그 외에는 360도 올랜덤 회전)
      if (isManual) {
        if (this.input.touchActive) {
          c.angle = Math.atan2(this.input.touchY - c.y, this.input.touchX - c.x);
        } else if (this.input.hasMouse) {
          c.angle = Math.atan2(this.input.mouseY - c.y, this.input.mouseX - c.x);
        }
      } else {
        c.aimTimer = (c.aimTimer ?? 0) - dt;
        if (c.aimTimer <= 0) {
          c.aimSpin = rand(-5.2, 5.2);
          if (Math.random() < 0.35) {
            c.angle = rand(0, Math.PI * 2);
          }
          c.aimTimer = rand(0.25, 0.85);
        }
        c.angle += (c.aimSpin ?? 2.5) * dt;
      }

      // 보유 마법 자동 시전
      for (const [mid, lv] of Object.entries(c.magics)) {
        if (lv <= 0 || mid === 'blades') continue; // 칼날은 상시 유지형
        c.cooldowns[mid] = (c.cooldowns[mid] ?? 0.2) - dt;
        if (c.cooldowns[mid] <= 0) {
          c.cooldowns[mid] = SPELLS.baseCooldown(mid, lv) * c.cdrMult;
          SPELLS.cast(c, mid, lv, w);
        }
      }

      // 👑 보스 필살기 (솔로·파티 보스만)
      if (c.isBoss) SPELLS.tickBossUlt(c, dt, w);

      // 황금 카드 궁극기 자동 시전 (10초 쿨타임)
      for (const uid of c.ultimates) {
        c.ultCooldowns[uid] = (c.ultCooldowns[uid] ?? 10.0) - dt;
        if (c.ultCooldowns[uid] <= 0) {
          // 쿨타임 카드 영향 (⏱ 멈춰!만 고정 10초) — 11/27h
          c.ultCooldowns[uid] = uid === 'stop' ? 10.0 : 10.0 * (c.cdrMult || 1);
          SPELLS.triggerUltimate(c, uid, w);
        }
      }
    }
  },

  // 캐릭터끼리 겹침 해소: 겹친 만큼 서로 밀어냄 (반지름² 비율로 무거운 쪽이 덜 밀림)
  // 자동 이동 중인 캐릭터는 부딪힌 반대 방향으로 진행 방향을 틀어줌
  resolveCollisions(w) {
    if (!CONFIG.CHAR_COLLISION) return;
    const cs = w.chars.filter((c) => c.alive);
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const minD = a.r + b.r;
        if (d >= minD) continue;
        if (d < 0.01) { const ang = rand(0, Math.PI * 2); dx = Math.cos(ang); dy = Math.sin(ang); d = 1; }
        const nx = dx / d, ny = dy / d;
        const overlap = minD - d;
        const ma = a.r * a.r, mb = b.r * b.r;
        const pa = overlap * (mb / (ma + mb));
        const pb = overlap * (ma / (ma + mb));
        a.x = clamp(a.x - nx * pa, a.r + 12, CONFIG.W - a.r - 12);
        a.y = clamp(a.y - ny * pa, a.r + 12, CONFIG.H - a.r - 12);
        b.x = clamp(b.x + nx * pb, b.r + 12, CONFIG.W - b.r - 12);
        b.y = clamp(b.y + ny * pb, b.r + 12, CONFIG.H - b.r - 12);
        const away = Math.atan2(ny, nx);
        const manual = this.mode === 'solo' && this.manualControl;
        if (!(manual && a.isLocal)) a.moveAng = away + Math.PI + rand(-0.6, 0.6);
        if (!(manual && b.isLocal)) b.moveAng = away + rand(-0.6, 0.6);
      }
    }
  },

  // 바운스 지뢰: 아무나(적·아군·슬라임) 밟으면 반대 방향으로 튕겨나가고 지뢰는 사라짐
  updateBouncers(w) {
    const B = CONFIG.BOUNCE_MINES;
    for (let i = w.bouncers.length - 1; i >= 0; i--) {
      const m = w.bouncers[i];
      const c = w.chars.find((ch) => ch.alive && dist(ch.x, ch.y, m.x, m.y) <= ch.r + m.r);
      if (!c) continue;
      const d = dist(c.x, c.y, m.x, m.y);
      const ang = d > 2 ? Math.atan2(c.y - m.y, c.x - m.x) : rand(0, Math.PI * 2);
      c.kbVx = Math.cos(ang) * B.power;
      c.kbVy = Math.sin(ang) * B.power;
      c.moveAng = ang;
      w.bouncers.splice(i, 1);
      w.rings.push({ x: m.x, y: m.y, r: m.r, maxR: m.r + 40, life: 0.3, maxLife: 0.3, color: '#06b6d4' });
      SPELLS.spawnParticles(w, m.x, m.y, '#22d3ee', 10, 200);
      w.texts.push({ x: m.x, y: m.y - 20, text: '뿅!', color: '#0891b2', life: 0.6 });
      if (c.isLocal) SFX.play('ricochet');
    }
  },

  // 맵 곳곳에 바운스 지뢰 새로 깔기 (기존 것은 지움). 캐릭터·다른 지뢰와 떨어진 곳에
  spawnBouncers(w) {
    const B = CONFIG.BOUNCE_MINES;
    w.bouncers = [];
    for (let k = 0; k < B.count; k++) {
      for (let tries = 0; tries < 20; tries++) {
        const x = rand(80, CONFIG.W - 80);
        const y = rand(80, CONFIG.H - 80);
        if (w.chars.some((c) => c.alive && dist(x, y, c.x, c.y) < c.r + 90)) continue;
        if (w.bouncers.some((m) => dist(x, y, m.x, m.y) < 120)) continue;
        w.bouncers.push({ x, y, r: B.r });
        break;
      }
    }
  },

  // 화염구 폭발 (사거리 끝에서) — 반경 안 적 전원에게 65% 피해
  explodeFireball(p, w) {
    const attacker = w.chars.find((ch) => ch.id === p.ownerId);
    w.rings.push({ x: p.x, y: p.y, r: 12, maxR: p.expR, life: 0.28, maxLife: 0.28, color: '#f97316' });
    SPELLS.spawnParticles(w, p.x, p.y, '#f97316', 12, 180);
    for (const t of w.chars) {
      if (!t.alive || t.id === p.ownerId || t.team === p.team) continue;
      if (dist(p.x, p.y, t.x, t.y) <= p.expR + t.r) this.damageChar(t, p.dmg * 0.65, attacker, w);
    }
  },

  // 독/빙결 플라스크가 떨어진 자리에 장판 생성
  dropFlaskZone(p, w) {
    if (p.kind === 'poison') {
      w.zones.push({
        kind: 'poison', skillUid: p.skillUid, ownerId: p.ownerId, team: p.team,
        x: p.x, y: p.y, r: p.zoneR, dmg: p.dmg, tick: 0.32, life: 3.0, maxLife: 3.0, color: '#16A34A'
      });
    } else if (p.kind === 'frost') {
      w.zones.push({
        kind: 'frost', skillUid: p.skillUid, ownerId: p.ownerId, team: p.team,
        x: p.x, y: p.y, r: p.zoneR, dmg: p.dmg, shred: p.shred, tick: 0.05, life: p.zoneLife, maxLife: p.zoneLife, color: '#38BDF8'
      });
      SPELLS.spawnParticles(w, p.x, p.y, '#bae6fd', 8, 120);
    }
  },

  updateProjectiles(w, dt) {
    // 2. 투사체 업데이트 (벽 도탄 · 마력 방패 차단 · 적중)
    for (let i = w.projs.length - 1; i >= 0; i--) {
      const p = w.projs[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 'fireball') this.explodeFireball(p, w); // 사거리 끝 → 그 자리 폭발
        this.dropFlaskZone(p, w);
        w.projs.splice(i, 1);
        continue;
      }

      if (p.kind === 'boomerang') {
        p.spin = (p.spin || 0) + 16 * dt;
        if (!p.returning && p.life < p.maxLife * 0.3) { // 11/27g: 0.52 → 0.3 (벽에서 튕기며 더 돌아다니다 귀환)
          p.returning = true;
          p.hitIds = [];
        }
        if (p.returning) {
          const owner = w.chars.find((ch) => ch.id === p.ownerId && ch.alive);
          if (owner) {
            const ang = Math.atan2(owner.y - p.y, owner.x - p.x);
            const spd = Math.hypot(p.vx, p.vy);
            p.vx = Math.cos(ang) * spd;
            p.vy = Math.sin(ang) * spd;
            if (dist(p.x, p.y, owner.x, owner.y) <= owner.r + p.r) {
              w.projs.splice(i, 1);
              continue;
            }
          }
        }
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 부메랑: 벽에 닿으면 난반사 (반사각 ±25° 랜덤, 횟수 제한 없음). 귀환 중엔 주인 쪽으로 가므로 해당 없음
      if (p.kind === 'boomerang' && !p.returning) {
        let hit = false;
        if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); hit = true; }
        else if (p.x > CONFIG.W - p.r) { p.x = CONFIG.W - p.r; p.vx = -Math.abs(p.vx); hit = true; }
        if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy); hit = true; }
        else if (p.y > CONFIG.H - p.r) { p.y = CONFIG.H - p.r; p.vy = -Math.abs(p.vy); hit = true; }
        if (hit) {
          const sp = Math.hypot(p.vx, p.vy);
          let a = Math.atan2(p.vy, p.vx) + rand(-0.44, 0.44);
          // 벽 쪽으로 다시 꺾이지 않게: 반사 후 방향 성분 부호 유지
          const nx = Math.cos(a), ny = Math.sin(a);
          p.vx = (Math.sign(nx) === Math.sign(p.vx) || !p.vx ? nx : -nx) * sp;
          p.vy = (Math.sign(ny) === Math.sign(p.vy) || !p.vy ? ny : -ny) * sp;
          p.hitIds = [];                                   // 튕긴 뒤엔 다시 맞을 수 있음
          SPELLS.spawnParticles(w, p.x, p.y, p.color, 4, 80);
        }
      }

      // 부메랑 제외 전 투사체 기본 벽 도탄
      if (p.kind !== 'boomerang') {
        let bounced = false;
        if (p.x < p.r) { p.x = p.r; p.vx = Math.abs(p.vx); bounced = true; }
        else if (p.x > CONFIG.W - p.r) { p.x = CONFIG.W - p.r; p.vx = -Math.abs(p.vx); bounced = true; }
        if (p.y < p.r) { p.y = p.r; p.vy = Math.abs(p.vy); bounced = true; }
        else if (p.y > CONFIG.H - p.r) { p.y = CONFIG.H - p.r; p.vy = -Math.abs(p.vy); bounced = true; }

        if (bounced) {
          if ((p.bounces || 0) > 0) {
            p.bounces--;
            p.hitIds = [];
            SPELLS.spawnParticles(w, p.x, p.y, p.color, 4, 80);
          } else {
            w.projs.splice(i, 1);
            continue;
          }
        }
      }

      const attacker = w.chars.find((ch) => ch.id === p.ownerId);
      let removed = false;

      for (const t of w.chars) {
        if (!t.alive || t.id === p.ownerId || t.team === p.team) continue;

        // 마력 방패 충돌 판정
        // 🪃 부메랑: 칼날 막기도 관통 (상대 칼날은 깨지지만 부메랑은 계속 날아감)
        if (p.kind === 'boomerang') SPELLS.tryBlockPoint(t, p.x, p.y, w, p.skillUid);
        else if (SPELLS.tryBlockPoint(t, p.x, p.y, w, p.skillUid)) {
          if (p.kind === 'fireball') {
            w.rings.push({ x: p.x, y: p.y, r: 10, maxR: p.expR, life: 0.25, maxLife: 0.25, color: '#f97316' });
          } else {
            this.dropFlaskZone(p, w);
          }
          w.projs.splice(i, 1);
          removed = true;
          break;
        }

        if (p.hitIds.includes(t.id)) continue;
        const fuse = p.kind === 'fireball' ? CONFIG.FIREBALL.fuse : 0; // 화염구는 근처만 와도 터짐
        if (dist(p.x, p.y, t.x, t.y) <= t.r + p.r + fuse) {
          p.hitIds.push(t.id);
          this.damageChar(t, p.dmg, attacker, w);

          if (p.kind === 'fireball') {
            w.rings.push({ x: p.x, y: p.y, r: 12, maxR: p.expR, life: 0.28, maxLife: 0.28, color: '#f97316' });
            SPELLS.spawnParticles(w, p.x, p.y, '#f97316', 12, 180);
            for (const splash of w.chars) {
              if (!splash.alive || splash.id === p.ownerId || splash.team === p.team || splash.id === t.id) continue;
              if (dist(p.x, p.y, splash.x, splash.y) <= p.expR + splash.r) {
                this.damageChar(splash, p.dmg * 0.65, attacker, w);
              }
            }
            w.projs.splice(i, 1);
            removed = true;
            break;
          } else if (p.kind === 'poison' || p.kind === 'frost') {
            this.dropFlaskZone(p, w);
            w.projs.splice(i, 1);
            removed = true;
            break;
          } else if (p.kind === 'boomerang') {
            // 관통 연출: 보라 불꽃 + 작은 링 (적중 목록으로 같은 적은 한 번만)
            SPELLS.spawnParticles(w, t.x, t.y, '#a78bfa', 6, 160);
            w.rings.push({ x: t.x, y: t.y, r: t.r * 0.6, maxR: t.r + 14, life: 0.18, maxLife: 0.18, color: '#8b5cf6' });
          } else if (p.kind === 'scatter') {
            // 💥 산탄 파편이 적에 닿으면 작은 폭발 (주변 다른 적 60%, 11/27k)
            w.rings.push({ x: p.x, y: p.y, r: 6, maxR: p.expR, life: 0.2, maxLife: 0.2, color: '#78716c' });
            SPELLS.spawnParticles(w, p.x, p.y, '#a8a29e', 6, 150);
            for (const sp of w.chars) {
              if (!sp.alive || sp.id === p.ownerId || sp.team === p.team || sp.id === t.id) continue;
              if (dist(p.x, p.y, sp.x, sp.y) <= p.expR + sp.r) this.damageChar(sp, p.dmg * 0.6, attacker, w);
            }
            w.projs.splice(i, 1);
            removed = true;
            break;
          }
        }
      }
      if (removed) continue;
    }
  },

  updateWaves(w, dt) {
    // 3. 충격파 링 업데이트
    for (let i = w.waves.length - 1; i >= 0; i--) {
      const wv = w.waves[i];
      wv.r += wv.speed * dt;
      if (wv.r >= wv.maxR) {
        w.waves.splice(i, 1);
        continue;
      }
      const attacker = w.chars.find((ch) => ch.id === wv.ownerId);
      for (const t of w.chars) {
        if (!t.alive || t.id === wv.ownerId || t.team === wv.team) continue;
        if (wv.hitIds.includes(t.id) || wv.blockedIds.includes(t.id)) continue;

        const d = dist(wv.x, wv.y, t.x, t.y);
        if (Math.abs(d - wv.r) <= t.r + 12) {
          wv.hitIds.push(t.id);
          this.damageChar(t, wv.dmg, attacker, w);
          const pushAng = Math.atan2(t.y - wv.y, t.x - wv.x);
          t.x = clamp(t.x + Math.cos(pushAng) * 38, t.r + 12, CONFIG.W - t.r - 12);
          t.y = clamp(t.y + Math.sin(pushAng) * 38, t.r + 12, CONFIG.H - t.r - 12);
        }
      }
    }
  },

  updateZones(w, dt) {
    // 4. 장판(독 / 혼돈) 업데이트
    for (let i = w.zones.length - 1; i >= 0; i--) {
      const z = w.zones[i];
      z.life -= dt;

      // 💥 블랙홀: 끌어당기다 시간이 끝나면 붕괴 폭발 + 같은 시전의 지뢰 일제 폭발
      if (z.kind === 'blackhole') {
        SPELLS.pullBlackhole(z, w, dt);
        if (z.life <= 0) {
          SPELLS.explodeAt(z.x, z.y, CONFIG.ART.collapseR * (z.r / CONFIG.ART.holeR), z.dmg, z.ownerId, z.team, z.skillUid, w, '#7c3aed');
          for (const m of w.zones) if (m.kind === 'mine' && m.holeUid === z.skillUid) m.detonate = true;
          w.zones.splice(i, 1);
        }
        continue;
      }
      // 💣 지뢰: 작동 후 적이 밟거나, 블랙홀 붕괴 신호/시간 끝이면 폭발
      if (z.kind === 'mine') {
        z.arm -= dt;
        let boom = z.detonate || z.life <= 0;
        if (!boom && z.arm <= 0) {
          boom = w.chars.some((t) => t.alive && t.team !== z.team && t.id !== z.ownerId && dist(z.x, z.y, t.x, t.y) <= t.r + z.r + 14);
        }
        if (boom) {
          SPELLS.explodeAt(z.x, z.y, z.blastR || CONFIG.ART.mineR, z.dmg, z.ownerId, z.team, z.skillUid, w, '#f97316');
          w.zones.splice(i, 1);
        }
        continue;
      }

      if (z.life <= 0) {
        w.zones.splice(i, 1);
        continue;
      }
      // 🍺 술 장판 (보스 필살기 '2차 가자!'): 피해 없이 감속만, 방패 무시
      if (z.kind === 'booze') {
        for (const t of w.chars) {
          if (!t.alive || t.team === z.team) continue;
          if (dist(z.x, z.y, t.x, t.y) <= z.r + t.r) { t.slowTimer = Math.max(t.slowTimer || 0, 0.3); t.slowMult = 0.5; }
        }
        continue;
      }
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.35;
        const attacker = w.chars.find((ch) => ch.id === z.ownerId);
        for (const t of w.chars) {
          if (!t.alive || t.id === z.ownerId || t.team === z.team) continue;
          const d = dist(z.x, z.y, t.x, t.y);
          if (d <= z.r + t.r) {
            // 중첩 X: 같은 사람이 깐 같은 종류 장판은 여러 개 겹쳐 있어도 0.3초에 한 번만 피해 (11/27f)
            const stackKey = `${z.ownerId}:${z.kind}`;
            if (!t.zoneHits) t.zoneHits = {};
            if ((t.zoneHits[stackKey] ?? -9) > w.time - 0.3) continue;
            t.zoneHits[stackKey] = w.time;
            if (z.kind === 'frost') { // 🧊 감속 + 받는 피해 증가 (장판 안에 있는 동안 + 잠깐)
              t.slowTimer = Math.max(t.slowTimer || 0, 0.5);
              t.slowMult = Math.min(t.slowMult || 1, CONFIG.FROST.slow);
              t.shred = Math.max(t.shredTimer > 0 ? (t.shred || 0) : 0, z.shred || 0);
              t.shredTimer = 0.5;
            }
            this.damageChar(t, z.dmg, attacker, w);
          }
        }
      }
    }
  },

  updateEffects(w, dt) {
    // 수명 있는 구슬(중간 난이도 회복 구슬) 소멸
    for (let i = w.orbs.length - 1; i >= 0; i--) {
      const o = w.orbs[i];
      if (o.life === undefined) continue;
      o.life -= dt;
      if (o.life <= 0) w.orbs.splice(i, 1);
    }
    // 5. 단발 이펙트(레이저 빔, 링, 파티클, 플로팅 텍스트) 감쇠
    for (let i = w.beams.length - 1; i >= 0; i--) {
      w.beams[i].life -= dt;
      if (w.beams[i].life <= 0) w.beams.splice(i, 1);
    }
    for (let i = (w.pulses || []).length - 1; i >= 0; i--) {
      w.pulses[i].life -= dt;
      if (w.pulses[i].life <= 0) w.pulses.splice(i, 1);
    }
    for (let i = w.rings.length - 1; i >= 0; i--) {
      const rg = w.rings[i];
      rg.life -= dt;
      rg.r += ((rg.maxR - rg.r) * 10) * dt;
      if (rg.life <= 0) w.rings.splice(i, 1);
    }
    for (let i = w.particles.length - 1; i >= 0; i--) {
      const pt = w.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      if (pt.life <= 0) w.particles.splice(i, 1);
    }
    for (let i = w.texts.length - 1; i >= 0; i--) {
      const tx = w.texts[i];
      tx.life -= dt;
      tx.y -= 28 * dt;
      if (tx.life <= 0) w.texts.splice(i, 1);
    }
  }
});
