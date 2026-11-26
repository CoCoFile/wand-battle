// 프레임 업데이트: 경험치 구슬 스폰 → 캐릭터(상태이상/이동/구슬/조준/자동시전/궁극기) → 투사체 → 충격파 → 장판 → 이펙트 감쇠

Object.assign(ENGINE, {
  // 매 프레임 월드 시뮬레이션 (솔로: 항상 / 온라인: 방장만 실행 → 클라이언트는 스냅샷만 받음)
  update(dt) {
    const w = this.world;
    if (!w || this.paused) return;
    w.time += dt;

    this.spawnOnlineOrbs(w, dt);
    this.updateCharacters(w, dt);
    this.updateProjectiles(w, dt);
    this.updateWaves(w, dt);
    this.updateZones(w, dt);
    this.updateEffects(w, dt);
  },

  spawnOnlineOrbs(w, dt) {
    // 온라인 대전 시 맵 경험치 구슬 주기적 생성 (2배 스폰)
    if (this.mode === 'online') {
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
      if (c.slowTimer > 0) c.slowTimer = Math.max(0, c.slowTimer - dt);
      if (c.poopTimer > 0) c.poopTimer = Math.max(0, c.poopTimer - dt);

      if (c.regen > 0 && c.hp < c.maxHp) {
        c.hp = Math.min(c.maxHp, c.hp + c.regen * dt);
      }

      SPELLS.updateShields(c, dt, w);

      const isIncapacitated = c.stunTimer > 0 || c.poopTimer > 0;
      const isManual = (this.mode === 'solo' && this.manualControl && c.isLocal);

      // 이동 처리 (솔로 수동조작 ON이면 키보드/터치 이동, 그 외에는 100% 올랜덤 이동)
      if (!isIncapacitated) {
        const spdMult = c.slowTimer > 0 ? 0.55 : 1.0;
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

      // 구슬 흡수 (슬라임 제외, 솔로에선 플레이어만)
      if (!c.isSmallMob && (this.mode !== 'solo' || c.isLocal)) {
        for (let i = w.orbs.length - 1; i >= 0; i--) {
          const o = w.orbs[i];
          if (dist(c.x, c.y, o.x, o.y) <= c.r + o.r + 10) {
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
        if (lv <= 0 || mid === 'shield') continue;
        c.cooldowns[mid] = (c.cooldowns[mid] ?? 0.2) - dt;
        if (c.cooldowns[mid] <= 0) {
          c.cooldowns[mid] = SPELLS.baseCooldown(mid, lv) * c.cdrMult;
          SPELLS.cast(c, mid, lv, w);
        }
      }

      // 황금 카드 궁극기 자동 시전 (10초 쿨타임)
      for (const uid of c.ultimates) {
        c.ultCooldowns[uid] = (c.ultCooldowns[uid] ?? 10.0) - dt;
        if (c.ultCooldowns[uid] <= 0) {
          c.ultCooldowns[uid] = 10.0;
          SPELLS.triggerUltimate(c, uid, w);
        }
      }
    }
  },

  updateProjectiles(w, dt) {
    // 2. 투사체 업데이트 (벽 도탄 · 마력 방패 차단 · 적중)
    for (let i = w.projs.length - 1; i >= 0; i--) {
      const p = w.projs[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.kind === 'poison') {
          w.zones.push({
            kind: 'poison', skillUid: p.skillUid, ownerId: p.ownerId, team: p.team,
            x: p.x, y: p.y, r: p.zoneR, dmg: p.dmg, tick: 0.32, life: 3.4, maxLife: 3.4, color: '#16A34A'
          });
        }
        w.projs.splice(i, 1);
        continue;
      }

      if (p.kind === 'boomerang') {
        p.spin = (p.spin || 0) + 16 * dt;
        if (!p.returning && p.life < p.maxLife * 0.52) {
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
        if (SPELLS.tryBlockPoint(t, p.x, p.y, w, p.skillUid)) {
          if (p.kind === 'fireball') {
            w.rings.push({ x: p.x, y: p.y, r: 10, maxR: p.expR, life: 0.25, maxLife: 0.25, color: '#f97316' });
          } else if (p.kind === 'poison') {
            w.zones.push({
              kind: 'poison', skillUid: p.skillUid, ownerId: p.ownerId, team: p.team,
              x: p.x, y: p.y, r: p.zoneR, dmg: p.dmg, tick: 0.32, life: 3.4, maxLife: 3.4, color: '#16A34A'
            });
          }
          w.projs.splice(i, 1);
          removed = true;
          break;
        }

        if (p.hitIds.includes(t.id)) continue;
        if (dist(p.x, p.y, t.x, t.y) <= t.r + p.r) {
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
          } else if (p.kind === 'icespear') {
            t.slowTimer = Math.max(t.slowTimer || 0, 2.0);
            if (p.pierce > 0) {
              p.pierce--;
            } else {
              w.projs.splice(i, 1);
              removed = true;
              break;
            }
          } else if (p.kind === 'poison') {
            w.zones.push({
              kind: 'poison', skillUid: p.skillUid, ownerId: p.ownerId, team: p.team,
              x: p.x, y: p.y, r: p.zoneR, dmg: p.dmg, tick: 0.32, life: 3.4, maxLife: 3.4, color: '#16A34A'
            });
            w.projs.splice(i, 1);
            removed = true;
            break;
          } else if (p.kind === 'scatter') {
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
        if ((t.magics?.shield || 0) > 0 && (t.poopTimer || 0) <= 0) {
          const ang = Math.atan2(t.y - wv.y, t.x - wv.x);
          const sr = (CONFIG.SHIELD_R[0] + CONFIG.SHIELD_R[1]) / 2;
          const bx = t.x - Math.cos(ang) * Math.min(sr, d);
          const by = t.y - Math.sin(ang) * Math.min(sr, d);
          if (Math.abs(d - wv.r) <= 75 && SPELLS.tryBlockPoint(t, bx, by, w, wv.skillUid)) {
            wv.blockedIds.push(t.id);
            continue;
          }
        }

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
      if (z.life <= 0) {
        w.zones.splice(i, 1);
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
            if ((t.magics?.shield || 0) > 0 && (t.poopTimer || 0) <= 0) {
              const ang = Math.atan2(z.y - t.y, z.x - t.x);
              const bx = t.x + Math.cos(ang) * CONFIG.SHIELD_R[0];
              const by = t.y + Math.sin(ang) * CONFIG.SHIELD_R[0];
              if (SPELLS.tryBlockPoint(t, bx, by, w, z.skillUid)) continue;
            }
            this.damageChar(t, z.dmg, attacker, w);
          }
        }
      }
    }
  },

  updateEffects(w, dt) {
    // 5. 단발 이펙트(레이저 빔, 링, 파티클, 플로팅 텍스트) 감쇠
    for (let i = w.beams.length - 1; i >= 0; i--) {
      w.beams[i].life -= dt;
      if (w.beams[i].life <= 0) w.beams.splice(i, 1);
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
