// 🫧 보호막 (상시 유지형, 11/27q): 최대 HP의 일부만큼 받는 피해를 먼저 흡수 (방어력 계산 뒤)
// 다 깨지면 주변 적에게 폭발 피해 → delay초 뒤(레벨·쿨타임 카드로 빨라짐) 다시 꽉 참
// 흡수는 combat.js damageChar 에서. 파괴 광선(즉사)은 못 막음

Object.assign(SPELLS, {
  barrierCfg(c) {
    const B = CONFIG.BARRIER;
    const lv = c.magics?.barrier || 0;
    return {
      max: Math.round(c.maxHp * Math.min(B.capMax, B.cap[0] + B.cap[1] * lv)),
      delay: Math.max(B.delayMin, B.delay[0] - B.delay[1] * lv) * (c.cdrMult || 1)
    };
  },

  updateBarrier(c, dt, world) {
    if (!((c.magics?.barrier || 0) > 0)) { c.barrier = 0; c.barrierMax = 0; return; }
    const cfg = this.barrierCfg(c);
    c.barrierMax = cfg.max;
    if (c.barrier == null) c.barrier = cfg.max;             // 처음 얻으면 바로 꽉 참
    if (c.barrier > cfg.max) c.barrier = cfg.max;
    if (c.barrierCd > 0) {
      c.barrierCd = Math.max(0, c.barrierCd - dt);
      if (c.barrierCd === 0) {
        c.barrier = cfg.max;                                  // 재충전
        if (world) world.rings.push({ x: c.x, y: c.y, r: c.r, maxR: c.r + 22, life: 0.3, maxLife: 0.3, color: '#22d3ee' });
        if (c.isLocal) SFX.play('shieldUp');
      }
    }
  },

  // damageChar 에서 호출: 흡수하고 남은 피해 반환
  absorbBarrier(c, dmg, world) {
    if (!(c.barrier > 0)) return dmg;
    const used = Math.min(c.barrier, dmg);
    c.barrier -= used;
    if (c.barrier <= 0.5) this.breakBarrier(c, world);
    return dmg - used;
  },

  // 다 깨짐 → 주변 폭발 + 재충전 대기
  breakBarrier(c, world) {
    const B = CONFIG.BARRIER;
    const lv = c.magics?.barrier || 1;
    c.barrier = 0;
    c.barrierCd = this.barrierCfg(c).delay;
    if (!world) return;
    const R = B.burstR * (c.areaMult || 1);
    const enemySide = ENGINE.isStageMode() && c.team !== 1;
    const dmg = (B.dmg[0] + B.dmg[1] * lv) * (c.atkMult || 1) * (enemySide ? 0.5 : 1);
    world.rings.push({ x: c.x, y: c.y, r: c.r, maxR: R, life: 0.3, maxLife: 0.3, color: '#06b6d4' });
    this.spawnParticles(world, c.x, c.y, '#67e8f9', 14, 220);
    world.texts.push({ x: c.x, y: c.y - c.r - 20, text: '팡!', color: '#0891b2', life: 0.6 });
    for (const t of world.chars) {
      if (!t.alive || t.team === c.team || t.id === c.id) continue;
      if (dist(c.x, c.y, t.x, t.y) <= R + t.r) ENGINE.damageChar(t, dmg, c, world);
    }
    if (c.isLocal) SFX.play('shieldHit');
  }
});
