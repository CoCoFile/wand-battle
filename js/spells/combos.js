// 🔗 조합 시스템 (11/27r): 마법 두 개가 둘 다 Lv.2 / 5 / 8 / 12 이상이면 조합 1~4단계
// 단계가 오를수록 특수효과가 커짐. 4단계(각성)는 12초마다 한 번 크게 터지는 발동형 (상시로 세면 손 놓아도 깨짐)
// 연쇄는 이어질 때마다 피해 ×0.6, 횟수 상한 있음
// 시뮬레이션은 방장/솔로에서만 (comboTimers 는 스냅샷 X). 수치: CONFIG.COMBOS / COMBO_*

Object.assign(SPELLS, {
  // ── 기본 ──
  comboTier(c, id) {
    const cb = this.comboDef(id);
    if (!cb || !c.magics) return 0;
    const lv = Math.min(c.magics[cb.a] || 0, c.magics[cb.b] || 0);
    let t = 0;
    CONFIG.COMBO_TIERS.forEach((need, i) => { if (lv >= need) t = i + 1; });
    return t;
  },

  comboDef(id) {
    return CONFIG.COMBOS.find((x) => x.id === id);
  },

  // 단계 레벨 표시용 (1단계 = Lv.2 …)
  comboTierLv(t) {
    return CONFIG.COMBO_TIERS[t - 1] || 0;
  },

  activeCombos(c) {
    return CONFIG.COMBOS.map((cb) => ({ cb, tier: this.comboTier(c, cb.id) })).filter((x) => x.tier > 0);
  },

  // 카드 고른 뒤: 새로 켜지거나 단계가 오른 조합 알림
  comboCheck(c, world) {
    if (!c.comboTiers) c.comboTiers = {};
    for (const cb of CONFIG.COMBOS) {
      const t = this.comboTier(c, cb.id);
      const old = c.comboTiers[cb.id] || 0;
      if (t > old) {
        c.comboTiers[cb.id] = t;
        const sub = t >= 4 ? `각성! ${cb.awaken} (12초마다)` : `조합 Lv.${this.comboTierLv(t)}`;
        if (world) world.texts.push({ x: c.x, y: c.y - c.r - 30, text: `${cb.name}!`, color: cb.color, life: 1.6 });
        if (c.isBot) continue;
        if (c.isLocal) UI.showDramatic(`${cb.icon} ${cb.name}`, cb.color, sub);
        else if (NET.active && NET.isHost) NET.sendToPeer(c.id, { type: 'dramatic', text: `${cb.icon} ${cb.name}`, color: cb.color, sub });
      }
    }
  },

  // 각 마법의 한 발 피해 (casters.js 공식과 같음) — 조합 효과 피해의 기준
  baseDmg(c, id) {
    const lvRaw = Math.max(1, c.magics?.[id] || 1);
    const lv = Math.min(lvRaw, CONFIG.MAX_SHOTS - 1);       // spells.js cast 와 같은 규칙
    const atk = c.atkMult || 1;
    const over = spellOverMult(lvRaw) * spellLevelDamp(id, lv);
    switch (id) {
      case 'laser': return (45 + 5.4 * lv) * atk * over;
      case 'fireball': return (15.7 + 3.9 * lv) * atk * over;
      case 'scatter': return (4 + 6.3 * lv) * atk * over;
      case 'boomerang': return (13.9 + 1.0 * lv) * atk * over;
      case 'poison': return (8.2 + 0.1 * lv) * atk * over;
      case 'frost': return CONFIG.FROST.dmg[0] * atk * over;
      case 'blades': return (CONFIG.BLADES.dmg[0] + CONFIG.BLADES.dmg[1] * lv) * atk * over;
      case 'barrier': return (CONFIG.BARRIER.dmg[0] + CONFIG.BARRIER.dmg[1] * lv) * atk * spellLevelDamp('barrier', lv);
      default: return 10 * atk;
    }
  },

  comboLater(w, t, run) {
    (w.comboTimers = w.comboTimers || []).push({ t, run });
  },

  updateComboTimers(w, dt) {
    if (!w.comboTimers || !w.comboTimers.length) return;
    for (let i = w.comboTimers.length - 1; i >= 0; i--) {
      const ct = w.comboTimers[i];
      ct.t -= dt;
      if (ct.t <= 0) { w.comboTimers.splice(i, 1); ct.run(); }
    }
  },

  enemiesOf(c, w) {
    return w.chars.filter((t) => t.alive && t.team !== c.team && t.id !== c.id);
  },

  // 범위 피해 (연출 포함). except: 이미 맞은 대상 id
  comboBlast(c, w, x, y, r, dmg, color, except = null) {
    w.rings.push({ x, y, r: 8, maxR: r, life: 0.25, maxLife: 0.25, color });
    this.spawnParticles(w, x, y, color, 8, 170);
    const hit = [];
    for (const t of this.enemiesOf(c, w)) {
      if (except && except === t.id) continue;
      if (dist(x, y, t.x, t.y) <= r + t.r) { ENGINE.damageChar(t, dmg, c, w); hit.push(t); }
    }
    return hit;
  },

  // 직선 즉발 빔 (조합용 레이저)
  comboBeam(c, w, x1, y1, ang, len, width, dmg, color, glow = false) {
    const x2 = x1 + Math.cos(ang) * len, y2 = y1 + Math.sin(ang) * len;
    w.beams.push({ x1, y1, x2, y2, width, color, life: glow ? 0.35 : 0.18, maxLife: glow ? 0.35 : 0.18, glow: glow || undefined });
    for (const t of this.enemiesOf(c, w)) {
      if (distToSegment(t.x, t.y, x1, y1, x2, y2) <= t.r + width * 0.5) ENGINE.damageChar(t, dmg, c, w);
    }
    return [x2, y2];
  },

  // 가시/칼날 조각 투사체 (산탄 모양, 폭발 없음)
  shootThorn(c, w, x, y, ang, dmg) {
    const spd = 620;
    w.projs.push({
      kind: 'scatter', noBlast: true, skillUid: ++w.uidSeq, ownerId: c.id, team: c.team,
      x: clamp(x, 8, CONFIG.W - 8), y: clamp(y, 8, CONFIG.H - 8), vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      r: 6, dmg, bounces: 0, color: '#94a3b8', life: 0.55, hitIds: []
    });
  },

  nearestEnemy(c, w, x, y, maxD = 9999) {
    let best = null, bd = maxD;
    for (const t of this.enemiesOf(c, w)) {
      const d = dist(x, y, t.x, t.y);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  },

  // ── 훅: 다른 코드에서 부름 ──

  // 💥 폭발이 일어났을 때 (화염구 폭발, 산탄 폭발, 보호막 팡). echo = 조합으로 생긴 폭발이면 true (재귀 방지)
  onExplosion(c, w, x, y, r, dmg, echo = false) {
    if (!c || echo) return;
    // 🔥▲ 불! 화염! 폭발!: 1단계 1번 더, 2단계 2번 더, 3단계 옆으로 번지는 연쇄 최대 5번
    const tb = this.comboTier(c, 'boom');
    if (tb > 0) {
      const D = CONFIG.COMBO_CHAIN_DECAY;
      if (tb <= 2) {
        for (let k = 1; k <= tb; k++) {
          this.comboLater(w, 0.25 * k, () => this.comboBlast(c, w, x, y, r, dmg * Math.pow(0.8, k), '#fb923c'));
        }
      } else {
        let px = x, py = y;
        for (let k = 1; k <= 5; k++) {
          const a = rand(0, Math.PI * 2);
          px = clamp(px + Math.cos(a) * r * 0.9, 20, CONFIG.W - 20);
          py = clamp(py + Math.sin(a) * r * 0.9, 20, CONFIG.H - 20);
          const qx = px, qy = py;
          this.comboLater(w, 0.18 * k, () => this.comboBlast(c, w, qx, qy, r, dmg * Math.pow(0.75, k), '#fb923c'));
        }
      }
    }
    // 🔥🧪 독불 화염병: 폭발 자리에 독 장판 (1단계 작게, 2단계+ 크게), 3단계+ 내 독 장판 위 적은 추가 폭발
    const tf = this.comboTier(c, 'firepoison');
    if (tf > 0) {
      const zr = (tf >= 2 ? 80 : 50) * (c.areaMult || 1);
      const life = tf >= 2 ? 3 : 2;
      w.zones.push({ kind: 'poison', stack: 'combo', skillUid: ++w.uidSeq, ownerId: c.id, team: c.team, x, y, r: zr,
        dmg: this.baseDmg(c, 'poison') * (tf >= 3 ? 3 : 2.2), tick: 0.1, life, maxLife: life, color: '#16A34A' });
      if (tf >= 3) {
        for (const t of this.enemiesOf(c, w)) {
          if (dist(x, y, t.x, t.y) > r + t.r) continue;
          const inPoison = w.zones.some((z) => z.kind === 'poison' && z.ownerId === c.id && dist(z.x, z.y, t.x, t.y) <= z.r + t.r);
          if (inPoison) this.comboBlast(c, w, t.x, t.y, 80 * (c.areaMult || 1), dmg * 1.0, '#84cc16', null);
        }
      }
    }
  },

  // ⚡ 레이저가 적을 맞혔을 때
  onLaserHit(c, t, w) {
    const tz = this.comboTier(c, 'zerobeam');
    if (tz <= 0 || !t.alive) return;
    const wasFrozen = (t.frozenTimer || 0) > 0;
    const freeze = tz >= 2 ? 0.6 : 0.3;
    t.stunTimer = Math.max(t.stunTimer || 0, freeze);
    t.frozenTimer = freeze;
    const zs = tz >= 2 ? 0.45 : 0.3;                          // 얼면 받는 피해 증가 (1단계부터)
    t.shred = Math.max(t.shredTimer > 0 ? t.shred || 0 : 0, zs); t.shredTimer = Math.max(t.shredTimer || 0, 1.0);
    if (tz >= 3 && wasFrozen && !(t.shardCd > w.time)) { // 얼어 있는 적 → 얼음 파편 4개
      t.shardCd = w.time + 0.5;
      const d = this.baseDmg(c, 'laser') * 0.3;
      for (let k = 0; k < 4; k++) this.shootThorn(c, w, t.x, t.y, (Math.PI / 2) * k + rand(-0.3, 0.3), d);
    }
  },

  // ⚡ 레이저 한 번 쏠 때 (가운데 빔만): ⚡▲ 프리즘
  onLaserCast(c, w, x1, y1, ang) {
    const tp = this.comboTier(c, 'prism');
    if (tp <= 0) return;
    // 벽에 닿는 지점
    const [hx, hy] = this.wallHit(x1, y1, ang);
    const back = ang + Math.PI;
    const n = tp >= 3 ? 7 : tp >= 2 ? 5 : 3;
    const spread = 1.1;
    for (let k = 0; k < n; k++) {
      const a = back + (k - (n - 1) / 2) * (spread / Math.max(1, n - 1));
      if (tp >= 3) this.comboBeam(c, w, hx, hy, a, 500, 8, this.baseDmg(c, 'scatter') * 1.5, '#f472b6');
      else this.shootThorn(c, w, hx, hy, a, this.baseDmg(c, 'scatter') * 1.5);
    }
  },

  wallHit(x, y, ang) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let t = 1e9;
    if (dx > 0) t = Math.min(t, (CONFIG.W - x) / dx); else if (dx < 0) t = Math.min(t, -x / dx);
    if (dy > 0) t = Math.min(t, (CONFIG.H - y) / dy); else if (dy < 0) t = Math.min(t, -y / dy);
    return [clamp(x + dx * t, 2, CONFIG.W - 2), clamp(y + dy * t, 2, CONFIG.H - 2)];
  },

  // 🪃 부메랑이 적을 맞혔을 때: 🪃🗡️ 칼춤 부메랑 — 맞은 적 주변 땅에서 칼날이 솟구침
  onBoomerangHit(c, t, w) {
    const tb = this.comboTier(c, 'bladeboom');
    if (tb <= 0) return;
    if (t.spikeCd > w.time) return;
    t.spikeCd = w.time + 0.4;
    const n = [0, 2, 4, 6, 6][tb];
    const R = (tb >= 2 ? 110 : 80) * (c.areaMult || 1);
    this.spikeBurst(c, w, t, n, R, this.baseDmg(c, 'blades') * 1.4, tb >= 3 ? 1 : 0);
  },

  // 칼날 솟구침: center 주변 가까운 적 n명 찌름, chain 남으면 찔린 적에서 다시 (피해 ×0.6)
  spikeBurst(c, w, center, n, R, dmg, chain) {
    const targets = this.enemiesOf(c, w)
      .filter((e) => e.id !== center.id && dist(center.x, center.y, e.x, e.y) <= R + e.r)
      .sort((a, b) => dist(center.x, center.y, a.x, a.y) - dist(center.x, center.y, b.x, b.y))
      .slice(0, n);
    for (let k = 0; k < n; k++) { // 연출: 땅에서 솟는 칼날
      const a = (Math.PI * 2 * k) / n + rand(-0.2, 0.2);
      const x1 = center.x + Math.cos(a) * (center.r + 4), y1 = center.y + Math.sin(a) * (center.r + 4);
      w.beams.push({ x1, y1, x2: x1 + Math.cos(a) * R * 0.6, y2: y1 + Math.sin(a) * R * 0.6, width: 5, color: '#cbd5e1', life: 0.22, maxLife: 0.22 });
    }
    for (const e of targets) {
      ENGINE.damageChar(e, dmg, c, w);
      w.beams.push({ x1: center.x, y1: center.y, x2: e.x, y2: e.y, width: 4, color: '#a78bfa', life: 0.2, maxLife: 0.2 });
      if (chain > 0 && e.alive) {
        const ee = e;
        this.comboLater(w, 0.15, () => this.spikeBurst(c, w, ee, Math.max(2, n - 2), R, dmg * CONFIG.COMBO_CHAIN_DECAY, chain - 1));
      }
    }
  },

  // 🪃 부메랑이 벽에 튕길 때: 🪃⚡ 레이저 부메랑
  onBoomerangBounce(c, p, w) {
    const tl = this.comboTier(c, 'laserboom');
    if (tl <= 0) return;
    const n = tl >= 2 ? 2 : 1;
    this.boomLaser(c, p, w, n);
  },

  // 부메랑에서 가까운 적 쪽으로 레이저 n줄
  boomLaser(c, p, w, n) {
    if (c.lzCd > w.time) return;                              // 부메랑이 여러 개라도 0.2초에 한 번만
    c.lzCd = w.time + 0.2;
    const tg = this.nearestEnemy(c, w, p.x, p.y);
    const base = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : rand(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      this.comboBeam(c, w, p.x, p.y, base + (k - (n - 1) / 2) * 0.25, 600, 9, this.baseDmg(c, 'laser') * 0.3, '#a855f7', true);
    }
  },

  // 부메랑 날아가는 동안 (3단계+: 0.45초마다 레이저)
  onBoomerangFly(c, p, w, dt) {
    if (this.comboTier(c, 'laserboom') < 3) return;
    p.lzT = (p.lzT || 0) - dt;
    if (p.lzT > 0) return;
    p.lzT = 0.45;
    this.boomLaser(c, p, w, 1);
  },

  // 🫧 보호막이 깨질 때: 🫧🗡️ 가시 갑옷
  onBarrierBreak(c, w) {
    const tt = this.comboTier(c, 'thorns');
    if (tt <= 0) return;
    const n = tt >= 2 ? 10 : 6;
    const off = rand(0, Math.PI * 2);
    for (let k = 0; k < n; k++) this.shootThorn(c, w, c.x, c.y, off + (Math.PI * 2 * k) / n, this.baseDmg(c, 'blades') * 3);
  },

  // 🫧 보호막이 피해를 흡수할 때 (3단계+: 때린 쪽으로 가시 1개, 0.3초에 한 번)
  onBarrierAbsorb(c, attacker, w) {
    if (this.comboTier(c, 'thorns') < 3 || !w) return;
    if (c.thornCd > w.time) return;
    c.thornCd = w.time + 0.3;
    const tg = attacker && attacker.alive && attacker.team !== c.team ? attacker : this.nearestEnemy(c, w, c.x, c.y);
    const ang = tg ? Math.atan2(tg.y - c.y, tg.x - c.x) : rand(0, Math.PI * 2);
    this.shootThorn(c, w, c.x, c.y, ang, this.baseDmg(c, 'blades') * 3);
  },

  // 🧪 독 장판 틱: 🧊🧪 냉동 독살 — 빙결(방깍) 중인 적은 독 2배, 2단계+ 독 장판도 감속
  poisonTickMult(c, t) {
    const tf = this.comboTier(c, 'frostpoison');
    if (tf <= 0) return 1;
    if (tf >= 2) { t.slowTimer = Math.max(t.slowTimer || 0, 0.4); t.slowMult = Math.min(t.slowMult || 1, 0.7); }
    return t.shredTimer > 0 ? 2 : 1;
  },

  // 적이 죽었을 때: 냉동 독살 3단계+ — 빙결 중 죽으면 그 자리에 독+빙결 장판
  onKill(killer, t, w) {
    if (!killer || !w || !(t.shredTimer > 0)) return;
    if (this.comboTier(killer, 'frostpoison') < 3) return;
    const zr = 70 * (killer.areaMult || 1);
    w.zones.push({ kind: 'poison', stack: 'combo', skillUid: ++w.uidSeq, ownerId: killer.id, team: killer.team, x: t.x, y: t.y, r: zr,
      dmg: this.baseDmg(killer, 'poison'), tick: 0.1, life: 2.5, maxLife: 2.5, color: '#16A34A' });
    w.zones.push({ kind: 'frost', stack: 'combo', skillUid: ++w.uidSeq, ownerId: killer.id, team: killer.team, x: t.x, y: t.y, r: zr,
      dmg: this.baseDmg(killer, 'frost'), shred: 0.25, tick: 0.1, life: 2.5, maxLife: 2.5, color: '#38BDF8' });
  },

  // ── 4단계 각성: 12초마다 한 번 ──
  updateCombos(c, dt, w) {
    if (!c.magics) return;
    for (const cb of CONFIG.COMBOS) {
      if (this.comboTier(c, cb.id) < 4) continue;
      if (!c.awakenT) c.awakenT = {};
      c.awakenT[cb.id] = (c.awakenT[cb.id] ?? 3) - dt;      // 각성 직후 3초 뒤 첫 발동
      if (c.awakenT[cb.id] > 0) continue;
      c.awakenT[cb.id] = CONFIG.COMBO_AWAKEN_EVERY;
      this.awaken(c, cb, w);
    }
  },

  awaken(c, cb, w) {
    const foes = this.enemiesOf(c, w);
    if (!foes.length) return;
    w.shake = Math.max(w.shake || 0, 0.35);
    if (!c.isBot) {
      if (c.isLocal) UI.showDramatic(cb.awaken, cb.color, cb.name);
      else if (NET.active && NET.isHost) NET.sendToPeer(c.id, { type: 'dramatic', text: cb.awaken, color: cb.color, sub: cb.name });
    }
    const pick = () => foes[randInt(0, foes.length - 1)];
    const ar = c.areaMult || 1;
    switch (cb.id) {
      case 'boom': { // 광기의 폭발: 적 위치 8곳에서 큰 폭발 (각각 번짐 없음)
        const d = this.baseDmg(c, 'fireball') * 2;
        for (let k = 0; k < 8; k++) { const t = pick(); this.comboLater(w, 0.08 * k, () => this.comboBlast(c, w, t.x, t.y, 120 * ar, d, '#f97316')); }
        break;
      }
      case 'frostpoison': { // 빙독의 늪: 적 근처에 큰 독+빙결 장판
        const t = pick(), R = 220 * ar;
        w.zones.push({ kind: 'poison', stack: 'combo', skillUid: ++w.uidSeq, ownerId: c.id, team: c.team, x: t.x, y: t.y, r: R, dmg: this.baseDmg(c, 'poison') * 1.5, tick: 0.1, life: 4, maxLife: 4, color: '#16A34A' });
        w.zones.push({ kind: 'frost', stack: 'combo', skillUid: ++w.uidSeq, ownerId: c.id, team: c.team, x: t.x, y: t.y, r: R, dmg: this.baseDmg(c, 'frost'), shred: 0.4, tick: 0.1, life: 4, maxLife: 4, color: '#38BDF8' });
        break;
      }
      case 'zerobeam': { // 절대영도: 굵은 얼음 레이저 + 지나간 길에 빙결 장판 3개
        const t = pick(), ang = Math.atan2(t.y - c.y, t.x - c.x);
        this.comboBeam(c, w, c.x, c.y, ang, 1500, 40, this.baseDmg(c, 'laser') * 1.5, '#7dd3fc');
        for (let k = 1; k <= 3; k++) {
          const x = clamp(c.x + Math.cos(ang) * 220 * k, 30, CONFIG.W - 30), y = clamp(c.y + Math.sin(ang) * 220 * k, 30, CONFIG.H - 30);
          w.zones.push({ kind: 'frost', stack: 'combo', skillUid: ++w.uidSeq, ownerId: c.id, team: c.team, x, y, r: 90 * ar, dmg: this.baseDmg(c, 'frost'), shred: 0.4, tick: 0.1, life: 3.5, maxLife: 3.5, color: '#38BDF8' });
        }
        break;
      }
      case 'firepoison': { // 불바다: 내 독 장판이 커지고 다시 3초 + 장판마다 불꽃 폭발
        for (const z of w.zones) {
          if (z.kind !== 'poison' || z.ownerId !== c.id) continue;
          z.r *= 1.6; z.life = Math.max(z.life, 3); z.maxLife = Math.max(z.maxLife, 3);
          this.comboBlast(c, w, z.x, z.y, z.r, this.baseDmg(c, 'fireball'), '#ef4444');
        }
        break;
      }
      case 'bladeboom': { // 칼날 지옥: 적 3명 주변에서 칼날 8개씩, 연쇄 2번
        for (let k = 0; k < 3; k++) { const t = pick(); this.comboLater(w, 0.12 * k, () => this.spikeBurst(c, w, t, 8, 140 * ar, this.baseDmg(c, 'blades') * 1.5, 2)); }
        break;
      }
      case 'thorns': { // 고슴도치: 사방으로 가시 16개 × 2번
        for (let r2 = 0; r2 < 2; r2++) {
          this.comboLater(w, 0.25 * r2, () => { for (let k = 0; k < 16; k++) this.shootThorn(c, w, c.x, c.y, (Math.PI * 2 * k) / 16 + r2 * 0.2, this.baseDmg(c, 'blades')); });
        }
        break;
      }
      case 'prism': { // 무지개 감옥: 벽마다 반사되는 레이저 (5번 꺾임)
        let x = c.x, y = c.y, ang = rand(0, Math.PI * 2);
        const cols = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7'];
        for (let k = 0; k < 6; k++) {
          const [hx, hy] = this.wallHit(x, y, ang);
          this.comboBeam(c, w, x, y, ang, Math.hypot(hx - x, hy - y), 10, this.baseDmg(c, 'laser'), cols[k]);
          if (hx <= 3 || hx >= CONFIG.W - 3) ang = Math.PI - ang; else ang = -ang;
          ang += rand(-0.2, 0.2);
          x = hx; y = hy;
        }
        break;
      }
      case 'laserboom': { // 회전 레이저 원반: 내 자리에서 1.5초 동안 도는 레이저 4줄
        const cx = c.x, cy = c.y, a0 = rand(0, Math.PI * 2);
        for (let k = 0; k < 6; k++) {
          this.comboLater(w, 0.25 * k, () => {
            for (let j = 0; j < 4; j++) this.comboBeam(c, w, cx, cy, a0 + k * 0.5 + (Math.PI / 2) * j, 600, 10, this.baseDmg(c, 'laser') * 0.5, '#a855f7', true);
          });
        }
        break;
      }
    }
  }
});
