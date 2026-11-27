// 🗡️ 회전 칼날: 상시 유지형 (쿨타임 없음). 몸 바깥 궤도를 은색 칼날이 돌면서 닿는 적에게 피해
// 칼날 수 = min(MAX_SHOTS, Lv+1), 넘는 레벨은 피해량 (spellOverMult)
// 쿨타임 카드 → 회전 속도 ↑ (÷cdrMult), 범위 카드 → 크기·궤도는 절반만 적용
// 같은 적은 CONFIG.BLADES.hitGap 초에 1번만 맞음. 마력 방패로 막힘 (0.8초마다 방패 1개)

Object.assign(SPELLS, {
  bladeGeom(c) {
    const B = CONFIG.BLADES;
    const lv = c.magics?.blades || 0;
    const half = 1 + ((c.areaMult || 1) - 1) * 0.5;        // 범위 카드 절반만
    return {
      n: spellShotCount(lv),
      R: (c.r + B.orbit + Math.min(lv, 7) * 2) * half,      // 궤도 반지름 (방패 바깥쪽)
      L: (B.len + Math.min(lv, 10) * 0.8) * half,           // 칼날 길이(반)
      omega: (B.omega + Math.min(lv, 7) * 0.08) / Math.max(0.3, c.cdrMult || 1)
    };
  },

  updateBlades(c, dt, world) {
    const lv = c.magics?.blades || 0;
    if (lv <= 0) return;
    const B = CONFIG.BLADES;
    const g = this.bladeGeom(c);
    c.bladeAngle = ((c.bladeAngle || 0) + g.omega * dt) % (Math.PI * 2);
    c.bladeR = Math.round(g.R); c.bladeL = Math.round(g.L); // 렌더(온라인 참가자)용
    if (!c.bladeHits) c.bladeHits = {};
    const now = world.time;
    const enemySide = ENGINE.isStageMode() && c.team !== 1;  // 솔로·파티의 적 (보스 포함)
    const dmg = (B.dmg[0] + lv * B.dmg[1]) * c.atkMult * spellOverMult(lv) * (enemySide ? B.enemyMult : 1);
    const uid = `bl_${c.id}_${Math.floor(now / 0.8)}`;      // 방패는 0.8초에 1개만 깨짐
    for (const t of world.chars) {
      if (!t.alive || t.id === c.id || t.team === c.team) continue;
      if ((c.bladeHits[t.id] || -9) > now - B.hitGap) continue;
      const d = dist(c.x, c.y, t.x, t.y);
      if (Math.abs(d - g.R) > t.r + g.L) continue;           // 궤도 근처에 없음
      for (let i = 0; i < g.n; i++) {
        const a = c.bladeAngle + (Math.PI * 2 * i) / g.n;
        const bx = c.x + Math.cos(a) * g.R;
        const by = c.y + Math.sin(a) * g.R;
        if (dist(bx, by, t.x, t.y) > t.r + g.L * 0.8) continue;
        c.bladeHits[t.id] = now;
        if ((t.magics?.shield || 0) > 0) {                     // 칼날 쪽 방향의 방패에 막히는지
          const sa = Math.atan2(by - t.y, bx - t.x);
          const sr = CONFIG.SHIELD_R[0];
          if (this.tryBlockPoint(t, t.x + Math.cos(sa) * sr, t.y + Math.sin(sa) * sr, world, uid)) break;
        }
        ENGINE.damageChar(t, dmg, c, world);
        this.spawnParticles(world, bx, by, '#cbd5e1', 4, 120);
        break;
      }
    }
  }
});
