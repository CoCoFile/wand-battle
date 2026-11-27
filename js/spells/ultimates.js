// 황금카드 궁극기 4종 발동 (10초마다 자동): 멈춰!(광역 스턴) / 파괴 광선(즉사 빔) / 혼돈!파괴!망각!(장판 4개) / 폭발은 예술이다!
// 스탯 영향 (11/27h): 멈춰! 빼고 전부 — 쿨타임(×cdrMult, update.js) · 범위(×areaMult) · 공격력(혼돈·예술 피해 ×atkMult, 파괴 광선은 즉사라 무관)

Object.assign(SPELLS, {
  triggerUltimate(caster, sid, world) {
    if (sid === 'stop') {
      for (const t of world.chars) {
        if (!t.alive || t.id === caster.id || t.team === caster.team) continue;
        t.stunTimer = Math.max(t.stunTimer || 0, 3.0);
      }
      // 시전자 중심으로 맵 끝까지 퍼지는 파동 2겹 (연출만, 판정 없음)
      const far = Math.hypot(Math.max(caster.x, CONFIG.W - caster.x), Math.max(caster.y, CONFIG.H - caster.y)) + 40;
      world.pulses = world.pulses || [];
      world.pulses.push({ x: caster.x, y: caster.y, r0: caster.r, maxR: far, life: 0.65, maxLife: 0.65, color: '#f59e0b', lw: 10 });
      world.pulses.push({ x: caster.x, y: caster.y, r0: caster.r, maxR: far, life: 0.85, maxLife: 0.85, color: '#fbbf24', lw: 5 });
      SFX.play('golden');
      UI.broadcastDramatic('멈춰!', '#f59e0b', caster.name);
    }
    else if (sid === 'killray') {
      const wandLen = wandTipDist(caster);
      const x1 = caster.x + Math.cos(caster.angle) * wandLen;
      const y1 = caster.y + Math.sin(caster.angle) * wandLen;
      const len = 1450; // 방패 무시 · 경로상 전원 관통 (아레나 대각선 ≈ 1442)
      const x2 = x1 + Math.cos(caster.angle) * len;
      const y2 = y1 + Math.sin(caster.angle) * len;
      const width = CONFIG.HEAD_R * 2 * (caster.areaMult || 1); // 굵기 = 캐릭터 지름 × 범위 카드
      // glow: 바깥 붉은 빛이 ~1초 동안 천천히 흐려지는 잔상
      world.beams.push({ x1, y1, x2, y2, width, color: '#ef4444', life: 1.0, maxLife: 1.0, glow: true });
      SFX.play('killray');

      const cut = (who) => { // "한방 컷 ㅋㅋ" 배너 (맞은 사람 + 쏜 사람)
        if (!who || who.isBot) return;
        if (who.isLocal) UI.showDramatic('한방 컷 ㅋㅋ', '#ef4444');
        else if (NET.active && NET.isHost) NET.sendToPeer(who.id, { type: 'dramatic', text: '한방 컷 ㅋㅋ', color: '#ef4444' });
      };
      let hitAny = false;
      for (const t of world.chars) {
        if (!t.alive || t.id === caster.id || t.team === caster.team) continue;
        if (distToSegment(t.x, t.y, x1, y1, x2, y2) <= t.r + width * 0.5) {
          ENGINE.damageChar(t, 999999, caster, world, true);
          if (!t.isSmallMob) { hitAny = true; cut(t); }
        }
      }
      if (hitAny) cut(caster);
    }
    else if (sid === 'chaos') {
      const skillUid = ++world.uidSeq;
      for (let i = 0; i < 4; i++) {
        const zx = rand(180, CONFIG.W - 180);
        const zy = rand(150, CONFIG.H - 150);
        world.zones.push({
          kind: 'chaos', skillUid, ownerId: caster.id, team: caster.team,
          x: zx, y: zy, r: 115 * (caster.areaMult || 1), dmg: (12 + caster.lv * 2.2) * caster.atkMult,
          tick: 0.25, life: 4.0, maxLife: 4.0, color: '#9333ea'
        });
        this.spawnParticles(world, zx, zy, '#a855f7', 14, 180);
      }
      SFX.play('golden');
      UI.broadcastDramatic('혼돈! 파괴! 망각!', '#9333ea', caster.name);
    }
    else if (sid === 'art') {
      this.castArt(caster, world);
    }
  },

  // 💥 폭발은 예술이다!: 적 하나 근처에 블랙홀 + 주변 지뢰 링. 블랙홀이 닫히면 붕괴 폭발 + 남은 지뢰 일제 폭발
  castArt(caster, world) {
    const A = CONFIG.ART;
    const enemies = world.chars.filter((t) => t.alive && t.team !== caster.team);
    let cx, cy;
    if (enemies.length) {
      const pick = enemies[randInt(0, enemies.length - 1)];
      cx = pick.x; cy = pick.y;
    } else {
      cx = rand(200, CONFIG.W - 200); cy = rand(160, CONFIG.H - 160);
    }
    cx = clamp(cx, 150, CONFIG.W - 150);
    cy = clamp(cy, 130, CONFIG.H - 130);
    const lv = caster.lv || 1;
    const holeUid = ++world.uidSeq;
    world.zones.push({
      kind: 'blackhole', skillUid: holeUid, ownerId: caster.id, team: caster.team,
      x: cx, y: cy, r: A.holeR * caster.areaMult, life: A.holeLife, maxLife: A.holeLife, tick: 999,
      color: '#4c1d95', dmg: (A.collapseDmg[0] + A.collapseDmg[1] * lv) * caster.atkMult
    });
    for (let i = 0; i < A.mines; i++) {
      const ang = (Math.PI * 2 * i) / A.mines + rand(-0.15, 0.15);
      const rr = A.mineRing * (caster.areaMult || 1) * rand(0.85, 1.15);
      world.zones.push({
        kind: 'mine', skillUid: ++world.uidSeq, holeUid, ownerId: caster.id, team: caster.team,
        x: clamp(cx + Math.cos(ang) * rr, 20, CONFIG.W - 20), y: clamp(cy + Math.sin(ang) * rr, 20, CONFIG.H - 20),
        r: 10, blastR: A.mineR * (caster.areaMult || 1), arm: A.mineArm, life: A.holeLife + 0.5, maxLife: A.holeLife + 0.5, tick: 999,
        color: '#ef4444', dmg: (A.mineDmg[0] + A.mineDmg[1] * lv) * caster.atkMult
      });
    }
    this.spawnParticles(world, cx, cy, '#7c3aed', 18, 200);
    SFX.play('golden');
    UI.broadcastDramatic('폭발은 예술이다!', '#ea580c', caster.name);
  },

  // 블랙홀: 범위 안 적을 가운데로 끌어당김
  pullBlackhole(z, world, dt) {
    const A = CONFIG.ART;
    for (const t of world.chars) {
      if (!t.alive || t.team === z.team || t.id === z.ownerId) continue;
      const d = dist(z.x, z.y, t.x, t.y);
      if (d > z.r || d < 4) continue;
      const strength = A.pull * (0.35 + 0.65 * (1 - d / z.r));
      const step = Math.min(d - 2, strength * dt);
      t.x = clamp(t.x + ((z.x - t.x) / d) * step, t.r + 12, CONFIG.W - t.r - 12);
      t.y = clamp(t.y + ((z.y - t.y) / d) * step, t.r + 12, CONFIG.H - t.r - 12);
    }
  },

  // 범위 폭발 (방패로 막을 수 있음)
  explodeAt(x, y, radius, dmg, ownerId, team, skillUid, world, color = '#f97316') {
    const attacker = world.chars.find((c) => c.id === ownerId);
    world.rings.push({ x, y, r: 10, maxR: radius, life: 0.3, maxLife: 0.3, color });
    this.spawnParticles(world, x, y, color, 14, 230);
    for (const t of world.chars) {
      if (!t.alive || t.team === team || t.id === ownerId) continue;
      const d = dist(x, y, t.x, t.y);
      if (d > radius + t.r) continue;
      if ((t.magics?.shield || 0) > 0 && (t.poopTimer || 0) <= 0) {
        const ang = Math.atan2(y - t.y, x - t.x);
        const r0 = CONFIG.SHIELD_R[0];
        if (this.tryBlockPoint(t, t.x + Math.cos(ang) * r0, t.y + Math.sin(ang) * r0, world, skillUid)) continue;
      }
      ENGINE.damageChar(t, dmg, attacker, world);
    }
    SFX.play('boom');
  }
});
