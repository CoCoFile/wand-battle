// 🛡 막기 판정 (11/27n: 마력 방패 삭제 → 🗡️ 회전 칼날이 방패 역할)
// 적 투사체(화염구·빙결/독 플라스크·산탄·부메랑)가 살아 있는 칼날에 닿으면 막히고 그 칼날은 깨짐 → 재생 쿨 뒤 다시 생김
// 레이저·파괴 광선·장판·폭발·보스 필살기는 칼날을 그냥 통과 (칼날도 안 깨짐)
// 함수 이름은 예전(방패) 그대로 둠: 호출하는 쪽 코드를 덜 바꾸려고

Object.assign(SPELLS, {
  // 칼날 재생 쿨 배열 길이 맞추기
  ensureShieldSlots(c) {
    const n = (c.magics?.blades || 0) > 0 ? this.bladeGeom(c).n : 0;
    if (!Array.isArray(c.bladeCds)) c.bladeCds = [];
    while (c.bladeCds.length < n) c.bladeCds.push(0);
    if (c.bladeCds.length > n) c.bladeCds.length = n;
  },

  // 칼날 재생 쿨 감소 (다시 생기면 작은 링)
  updateShields(c, dt, world) {
    if (!((c.magics?.blades || 0) > 0)) return;
    this.ensureShieldSlots(c);
    const g = this.bladeGeom(c);
    for (let i = 0; i < c.bladeCds.length; i++) {
      if (c.bladeCds[i] > 0) {
        c.bladeCds[i] = Math.max(0, c.bladeCds[i] - dt);
        if (c.bladeCds[i] === 0 && world) {
          const a = (c.bladeAngle || 0) + (Math.PI * 2 * i) / g.n;
          world.rings.push({ x: c.x + Math.cos(a) * g.R, y: c.y + Math.sin(a) * g.R, r: 4, maxR: g.L, life: 0.22, maxLife: 0.22, color: '#94a3b8' });
          if (c.isLocal) SFX.play('shieldUp');
        }
      }
    }
  },

  // 칼날 하나 깨기 (쿨 시작)
  breakBlade(c, i, world, px, py) {
    const B = CONFIG.BLADES;
    const lv = c.magics?.blades || 1;
    c.bladeCds[i] = Math.max(B.regenMin, B.regen[0] - B.regen[1] * lv) * (c.cdrMult || 1);
    if (world) this.spawnParticles(world, px, py, '#cbd5e1', 8, 160);
    if (c.isLocal) SFX.play('shieldHit');
  },

  // 점(px,py)이 target의 살아 있는 칼날에 닿았나 → 닿으면 그 칼날 깨고 true (투사체 막힘)
  tryBlockPoint(target, px, py, world) {
    if (!((target.magics?.blades || 0) > 0) || (target.poopTimer || 0) > 0) return false;
    this.ensureShieldSlots(target);
    const g = this.bladeGeom(target);
    for (let i = 0; i < g.n; i++) {
      if ((target.bladeCds[i] || 0) > 0) continue;
      const a = (target.bladeAngle || 0) + (Math.PI * 2 * i) / g.n;
      const bx = target.x + Math.cos(a) * g.R;
      const by = target.y + Math.sin(a) * g.R;
      if (dist(bx, by, px, py) <= g.L * 0.9 + 8) {
        this.breakBlade(target, i, world, bx, by);
        return true;
      }
    }
    return false;
  },

  // 레이저는 칼날에 안 막힘 (예전 방패용 함수, 항상 끝까지)
  clipBeamByShields(caster, x1, y1, angle, maxLen) {
    return maxLen;
  }
});
