// 🗡️ 회전 칼날 (11/27n: 마력 방패 대신 방어 겸 공격). 쿨타임 없이 몸 바깥 궤도를 돎
// 칼날 수 = min(3, Lv+1) (CONFIG.BLADES.max), 레벨은 피해로 (Lv.8부터 ×(Lv+1)/8)
// 칼날이 적 몸에 닿으면 피해 (같은 적은 hitGap초에 1번) / 적 투사체는 칼날에 닿으면 지워짐 (shield.js tryBlockPoint)
// 칼날은 깨지지 않음 (11/27p). 레이저·장판·폭발은 칼날을 그냥 통과
// 쿨타임 카드 → 회전 빨라짐, 범위 카드 → 크기·궤도는 절반만

Object.assign(SPELLS, {
  bladeGeom(c) {
    const B = CONFIG.BLADES;
    const lv = c.magics?.blades || 0;
    const half = 1 + ((c.areaMult || 1) - 1) * 0.5;        // 범위 카드 절반만
    return {
      n: Math.min(B.max, Math.max(1, lv) + 1),
      R: (c.r + B.orbit + Math.min(lv, 7) * 2) * half,      // 궤도 반지름
      L: (B.len + Math.min(lv, 10) * 0.8) * half,           // 칼날 길이(반)
      omega: (B.omega + Math.min(lv, 7) * 0.08) / Math.max(0.3, c.cdrMult || 1)
    };
  },

  updateBlades(c, dt, world) {
    const lv = c.magics?.blades || 0;
    if (lv <= 0) return;
    const B = CONFIG.BLADES;
    const g = this.bladeGeom(c);
    this.ensureShieldSlots(c);
    c.bladeAngle = ((c.bladeAngle || 0) + g.omega * dt) % (Math.PI * 2);
    c.bladeR = Math.round(g.R); c.bladeL = Math.round(g.L); // 렌더(온라인 참가자)용
    const enemySide = ENGINE.isStageMode() && c.team !== 1;  // 솔로·파티의 적 (보스 포함)
    const lvEff = Math.min(lv, CONFIG.MAX_SHOTS - 1);       // Lv.8부터는 over 배율로만 성장
    const dmg = (B.dmg[0] + lvEff * B.dmg[1]) * c.atkMult * spellOverMult(lv) * spellLevelDamp('blades', lvEff) * (enemySide ? B.enemyMult : 1);
    if (!c.bladeHits) c.bladeHits = {};
    const now = world.time;
    for (const t of world.chars) {
      if (!t.alive || t.id === c.id || t.team === c.team) continue;
      if ((c.bladeHits[t.id] ?? -9) > now - B.hitGap) continue;
      const d = dist(c.x, c.y, t.x, t.y);
      if (Math.abs(d - g.R) > t.r + g.L) continue;           // 궤도 근처에 없음
      for (let i = 0; i < g.n; i++) {
        const a = c.bladeAngle + (Math.PI * 2 * i) / g.n;
        const bx = c.x + Math.cos(a) * g.R;
        const by = c.y + Math.sin(a) * g.R;
        if (dist(bx, by, t.x, t.y) > t.r + g.L * 0.8) continue;
        c.bladeHits[t.id] = now;
        ENGINE.damageChar(t, dmg, c, world);
        this.spawnParticles(world, bx, by, '#cbd5e1', 4, 120);
        break;
      }
    }
  }
});
