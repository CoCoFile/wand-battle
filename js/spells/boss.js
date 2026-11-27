// 👑 보스 필살기: 보스마다 1개 (CONFIG.BOSS_ULT.list[보스 단계]), 경고 표시(warn) → delay초 뒤 발동
// 전부 운빨형: 경고는 그 순간 위치/무작위 위치에 고정 — 따라오거나 끌어당기지 않음, 자동 이동은 안 피함
// 원형·부채꼴은 마력 방패로 막힘, 줄(돌진·빔·레이저)과 가장자리 폭발은 방패 무시
// 시뮬레이션은 방장/솔로에서만. 참가자는 스냅샷의 warns 로 그림만 그림

Object.assign(SPELLS, {
  bossUltDef(c) {
    const L = CONFIG.BOSS_ULT.list;
    return L[Math.max(0, Math.min(L.length - 1, c.bossTier || 0))];
  },

  tickBossUlt(c, dt, w) {
    if (!ENGINE.isStageMode() || c.team === 1) return;
    if (c.stunTimer > 0 || c.poopTimer > 0) return;
    const U = CONFIG.BOSS_ULT;
    const D = CONFIG.DIFFICULTY[ENGINE.difficulty] || CONFIG.DIFFICULTY.normal;
    if (c.ultCd == null) c.ultCd = U.first;
    c.ultCd -= dt;
    if (c.ultCd > 0) return;
    c.ultCd = U.cd * (D.enemyCdr || 1);
    this.startBossUlt(c, w, this.bossUltDef(c));
    // 광기: 30스테이지 넘으면 대마왕이 이전 보스 필살기 하나를 섞어 씀
    if ((c.bossTier || 0) >= U.list.length - 1 && ENGINE.stage > CONFIG.ENDING_STAGE) {
      const extra = U.list[randInt(0, U.list.length - 2)];
      this.bossLater(w, 2.4, () => { if (c.alive) this.startBossUlt(c, w, extra, true); });
    }
  },

  // 몇 초 뒤 실행 (방장/솔로 전용, 스테이지 바뀌면 비움)
  bossLater(w, t, run) {
    (w.bossTimers = w.bossTimers || []).push({ t, run });
  },

  bossTargets(c, w) {
    return w.chars.filter((t) => t.alive && t.team !== c.team && !t.isSmallMob);
  },

  addWarn(w, c, warn, k) {
    (w.warns = w.warns || []).push(Object.assign({
      ownerId: c.id, team: c.team, maxDelay: warn.delay, fired: false, life: 0.3,
      dmg: k * (c.atkMult || 1) * (CONFIG.BOSS_ULT.ultMult[ENGINE.difficulty] ?? 1)
    }, warn));
  },

  startBossUlt(c, w, def, quiet = false) {
    if (!def) return;
    const targets = this.bossTargets(c, w);
    if (!targets.length) return;
    const T = targets[randInt(0, targets.length - 1)];
    const W = CONFIG.W, H = CONFIG.H;
    const k = def.k;
    const rpos = (m = 140) => [rand(m, W - m), rand(m * 0.8, H - m * 0.8)];
    const around = (p, spread) => [clamp(p.x + rand(-spread, spread), 40, W - 40), clamp(p.y + rand(-spread, spread), 40, H - 40)];
    const farLine = (x, y, ang, len = 1500) => ({ x1: x, y1: y, x2: x + Math.cos(ang) * len, y2: y + Math.sin(ang) * len });

    if (!quiet) UI.broadcastBossUlt(c.name, def);
    SFX.play('boom');

    switch (def.id) {
      case 'dash': { // 🛵 경고 줄 3개 → 차례로 돌진 (맞으면 넉백)
        let px = c.x, py = c.y;
        const pts = [[T.x, T.y], rpos(), rpos()];
        pts.forEach(([nx, ny], i) => {
          this.addWarn(w, c, { shape: 'line', x1: px, y1: py, x2: nx, y2: ny, width: c.r * 2.2, delay: 1.2 + i * 0.45, dash: true, kb: 520 }, k);
          px = nx; py = ny;
        });
        break;
      }
      case 'assembly': // 📢 맵 무작위 큰 원 3개
        for (let i = 0; i < 3; i++) { const [x, y] = rpos(); this.addWarn(w, c, { shape: 'circle', x, y, r: 130, delay: 1.5 }, k); }
        break;
      case 'cane': // 🦯 3연타 — 매 타 그 순간 대상 위치 (따라오지 않음)
        for (let i = 0; i < 3; i++) {
          this.bossLater(w, i * 0.8, () => {
            const alive = this.bossTargets(c, w);
            if (!c.alive || !alive.length) return;
            const tg = alive[randInt(0, alive.length - 1)];
            this.addWarn(w, c, { shape: 'circle', x: tg.x, y: tg.y, r: 95, delay: 1.0, shake: 0.25 }, k);
          });
        }
        break;
      case 'trophy': // 🏆 대상 주변 경고 원 7개
        for (let i = 0; i < 7; i++) { const [x, y] = around(T, 210); this.addWarn(w, c, { shape: 'circle', x, y, r: 70, delay: 1.2 }, k); }
        break;
      case 'drink': // 🍺 술병 6개 → 술 장판(감속)
        for (let i = 0; i < 6; i++) { const [x, y] = around(T, 260); this.addWarn(w, c, { shape: 'circle', x, y, r: 80, delay: 1.0, booze: true }, k); }
        break;
      case 'rent': // 💸 맵 가장자리 폭발
        this.addWarn(w, c, { shape: 'edge', bx: Math.round(W * 0.1), by: Math.round(H * 0.1), delay: 1.5, shake: 0.35 }, k);
        break;
      case 'sword': { // ⚔️ 부채꼴 6개 (사이 틈)
        const base = rand(0, Math.PI * 2);
        for (let i = 0; i < 6; i++) {
          const a = base + (Math.PI * 2 * i) / 6;
          this.addWarn(w, c, { shape: 'sector', x: c.x, y: c.y, r: 430, a0: a - 0.26, a1: a + 0.26, delay: 1.2 }, k);
        }
        break;
      }
      case 'cross': { // 🌀 십자 또는 X자 4방향 빔 (고정)
        const base = Math.random() < 0.5 ? 0 : Math.PI / 4;
        for (let i = 0; i < 4; i++) this.addWarn(w, c, Object.assign({ shape: 'line', width: 70, delay: 1.3, beam: '#a855f7' }, farLine(c.x, c.y, base + (Math.PI / 2) * i)), k);
        break;
      }
      case 'king': // 🔴 대상 방향 고정 개큰 레이저 (방패 무시)
        this.addWarn(w, c, Object.assign({ shape: 'line', width: 120, delay: 1.5, beam: '#ef4444', shake: 0.5 }, farLine(c.x, c.y, Math.atan2(T.y - c.y, T.x - c.x))), k);
        break;
      case 'doom': { // ☄️ 무작위 메테오 12개 + 마무리 왕레이저
        for (let i = 0; i < 12; i++) { const [x, y] = rpos(80); this.addWarn(w, c, { shape: 'circle', x, y, r: 85, delay: 1.3 + rand(0, 0.5), shake: 0.15 }, k); }
        const kingK = CONFIG.BOSS_ULT.list.find((u) => u.id === 'king')?.k || k;
        this.bossLater(w, 1.2, () => {
          const alive = this.bossTargets(c, w);
          if (!c.alive || !alive.length) return;
          const tg = alive[randInt(0, alive.length - 1)];
          this.addWarn(w, c, Object.assign({ shape: 'line', width: 120, delay: 1.5, beam: '#ef4444', shake: 0.5 }, farLine(c.x, c.y, Math.atan2(tg.y - c.y, tg.x - c.x))), kingK * 0.8);
        });
        break;
      }
    }
  },

  // 경고 → 발동 판정. 발동한 경고는 0.3초 동안 번쩍이고 사라짐
  updateBossWarns(w, dt) {
    if (w.bossTimers && w.bossTimers.length) {
      for (let i = w.bossTimers.length - 1; i >= 0; i--) {
        const bt = w.bossTimers[i];
        bt.t -= dt;
        if (bt.t <= 0) { w.bossTimers.splice(i, 1); bt.run(); }
      }
    }
    if (!w.warns || !w.warns.length) return;
    for (let i = w.warns.length - 1; i >= 0; i--) {
      const wn = w.warns[i];
      if (wn.fired) {
        wn.life -= dt;
        if (wn.life <= 0) w.warns.splice(i, 1);
        continue;
      }
      wn.delay -= dt;
      if (wn.delay > 0) continue;
      wn.fired = true;
      this.fireBossWarn(wn, w);
    }
  },

  warnHits(wn, t) {
    if (wn.shape === 'circle') return dist(wn.x, wn.y, t.x, t.y) <= wn.r + t.r;
    if (wn.shape === 'line') return distToSegment(t.x, t.y, wn.x1, wn.y1, wn.x2, wn.y2) <= wn.width * 0.5 + t.r;
    if (wn.shape === 'edge') return t.x < wn.bx || t.x > CONFIG.W - wn.bx || t.y < wn.by || t.y > CONFIG.H - wn.by;
    if (wn.shape === 'sector') {
      const d = dist(wn.x, wn.y, t.x, t.y);
      if (d > wn.r + t.r) return false;
      if (d < t.r) return true;
      const mid = (wn.a0 + wn.a1) / 2;
      return Math.abs(angleDiff(Math.atan2(t.y - wn.y, t.x - wn.x), mid)) <= (wn.a1 - wn.a0) / 2 + Math.asin(Math.min(1, t.r / d));
    }
    return false;
  },

  fireBossWarn(wn, w) {
    const boss = w.chars.find((c) => c.id === wn.ownerId);
    if (wn.shake) w.shake = Math.max(w.shake || 0, wn.shake);
    // 연출
    if (wn.shape === 'circle') {
      w.rings.push({ x: wn.x, y: wn.y, r: 10, maxR: wn.r, life: 0.3, maxLife: 0.3, color: '#dc2626' });
      this.spawnParticles(w, wn.x, wn.y, wn.booze ? '#f59e0b' : '#ef4444', 10, 200);
    } else if (wn.shape === 'line') {
      w.beams.push({ x1: wn.x1, y1: wn.y1, x2: wn.x2, y2: wn.y2, width: wn.width, color: wn.beam || '#b91c1c', life: wn.beam ? 0.9 : 0.35, maxLife: wn.beam ? 0.9 : 0.35, glow: !!wn.beam });
      if (wn.dash && boss && boss.alive) { // 🛵 보스가 줄 끝으로 돌진
        boss.x = clamp(wn.x2, boss.r + 12, CONFIG.W - boss.r - 12);
        boss.y = clamp(wn.y2, boss.r + 12, CONFIG.H - boss.r - 12);
        this.spawnParticles(w, boss.x, boss.y, '#94a3b8', 14, 220);
      }
    } else if (wn.shape === 'edge') {
      for (let k = 0; k < 16; k++) {
        const side = k % 4;
        const x = side < 2 ? rand(0, CONFIG.W) : (side === 2 ? rand(0, wn.bx) : rand(CONFIG.W - wn.bx, CONFIG.W));
        const y = side >= 2 ? rand(0, CONFIG.H) : (side === 0 ? rand(0, wn.by) : rand(CONFIG.H - wn.by, CONFIG.H));
        this.spawnParticles(w, x, y, '#16a34a', 5, 160);
      }
    }
    if (wn.booze) {
      w.zones.push({ kind: 'booze', skillUid: ++w.uidSeq, ownerId: wn.ownerId, team: wn.team, x: wn.x, y: wn.y, r: wn.r, dmg: 0, tick: 999, life: 4, maxLife: 4, color: '#f59e0b' });
    }
    const blockable = wn.shape === 'circle' || wn.shape === 'sector';
    const uid = ++w.uidSeq;
    for (const t of w.chars) {
      if (!t.alive || t.team === wn.team || t.isSmallMob) continue;
      if (!this.warnHits(wn, t)) continue;
      if (blockable && (t.magics?.shield || 0) > 0) {
        const ox = wn.x ?? t.x, oy = wn.y ?? t.y;
        const ang = Math.atan2(oy - t.y, ox - t.x);
        const r0 = CONFIG.SHIELD_R[0];
        if (this.tryBlockPoint(t, t.x + Math.cos(ang) * r0, t.y + Math.sin(ang) * r0, w, uid)) continue;
      }
      ENGINE.damageChar(t, wn.dmg, boss, w);
      if (wn.kb) { // 넉백: 줄에서 멀어지는 방향
        const ang = Math.atan2(wn.y2 - wn.y1, wn.x2 - wn.x1);
        const side = Math.sign((t.x - wn.x1) * Math.sin(ang) * -1 + (t.y - wn.y1) * Math.cos(ang)) || 1;
        t.kbVx = -Math.sin(ang) * side * wn.kb;
        t.kbVy = Math.cos(ang) * side * wn.kb;
      }
    }
  }
});
