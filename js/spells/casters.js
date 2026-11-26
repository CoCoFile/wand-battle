// 마법 7종 시전 로직 (마력 방패는 상시 유지형이라 js/spells/shield.js 에 있음)
// 새 마법 추가: 1) config.js MAGICS에 정보 추가  2) 여기 같은 이름으로 함수 추가
//              3) spells.js baseCooldown 표에 쿨타임 추가  4) 투사체면 engine/update.js updateProjectiles + render 에 kind 처리
// k = { wandLen, ox, oy(완드 끝 좌표), shots(동시 발사 수), skillUid(방패 1개 파괴 판정용), spreadStep(부채꼴 간격 함수) }

const SPELL_CASTERS = {
  laser(c, lv, world, k) {
    const { wandLen, ox, oy, shots, skillUid, spreadStep } = k;
    const maxLen = 1500;
    const width = (6 + lv * 1.4) * c.areaMult;
    const dmg = (15 + lv * 4.5) * c.atkMult;
    const step = spreadStep(shots, 0.13, Math.PI * 1.35);
    for (let i = 0; i < shots; i++) {
      const ang = c.angle + (i - (shots - 1) / 2) * step;
      const x1 = c.x + Math.cos(ang) * wandLen;
      const y1 = c.y + Math.sin(ang) * wandLen;
      const len = SPELLS.clipBeamByShields(c, x1, y1, ang, maxLen, world, true, skillUid);
      const x2 = x1 + Math.cos(ang) * len;
      const y2 = y1 + Math.sin(ang) * len;
      world.beams.push({ x1, y1, x2, y2, width, color: '#0EA5E9', life: 0.16, maxLife: 0.16 });
      for (const t of world.chars) {
        if (!t.alive || t.id === c.id || t.team === c.team) continue;
        if (distToSegment(t.x, t.y, x1, y1, x2, y2) <= t.r + width * 0.5) {
          ENGINE.damageChar(t, dmg, c, world);
        }
      }
    }
    if (c.isLocal) SFX.play('laser');
  },

  fireball(c, lv, world, k) {
    const { wandLen, ox, oy, shots, skillUid, spreadStep } = k;
    const spd = 410 + lv * 15;
    const r = (9 + lv * 0.7) * c.areaMult;
    const expR = (62 + lv * 9) * c.areaMult;
    const dmg = (14 + lv * 4) * c.atkMult; // 근접 신관으로 명중률이 높아서 직격형보다 낮게
    const step = spreadStep(shots, 0.16, Math.PI * 1.4);
    for (let i = 0; i < shots; i++) {
      const ang = c.angle + (i - (shots - 1) / 2) * step;
      world.projs.push({
        kind: 'fireball', skillUid, ownerId: c.id, team: c.team,
        x: clamp(ox, r + 4, CONFIG.W - r - 4), y: clamp(oy, r + 4, CONFIG.H - r - 4),
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        r, expR, dmg, bounces: 2, color: '#F97316', life: CONFIG.FIREBALL.life, hitIds: []
      });
    }
    if (c.isLocal) SFX.play('fire');
  },

  icespear(c, lv, world, k) {
    const { wandLen, ox, oy, shots, skillUid, spreadStep } = k;
    const spd = 600 + lv * 22;
    const r = (8 + lv * 0.5) * c.areaMult;
    const pierce = 1 + Math.floor(lv / 2);
    const dmg = (14 + lv * 4) * c.atkMult;
    const step = spreadStep(shots, 0.12, Math.PI * 1.35);
    for (let i = 0; i < shots; i++) {
      const ang = c.angle + (i - (shots - 1) / 2) * step;
      world.projs.push({
        kind: 'icespear', skillUid, ownerId: c.id, team: c.team,
        x: clamp(ox, r + 4, CONFIG.W - r - 4), y: clamp(oy, r + 4, CONFIG.H - r - 4),
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        r, pierce, dmg, bounces: 2, color: '#06B6D4', life: 2.1, hitIds: []
      });
    }
    if (c.isLocal) SFX.play('ice');
  },

  poison(c, lv, world, k) {
    const { wandLen, ox, oy, shots, skillUid, spreadStep } = k;
    const spd = 360 + lv * 12;
    const zoneR = (58 + lv * 8) * c.areaMult;
    const dmg = (8 + lv * 1.9) * c.atkMult;     // 밸런스(11/26): 10+2.5lv → 너프
    const r = 8 * c.areaMult;
    const step = spreadStep(shots, 0.22, Math.PI * 1.45);
    for (let i = 0; i < shots; i++) {
      const ang = c.angle + (i - (shots - 1) / 2) * step;
      world.projs.push({
        kind: 'poison', skillUid, ownerId: c.id, team: c.team,
        x: clamp(ox, r + 4, CONFIG.W - r - 4), y: clamp(oy, r + 4, CONFIG.H - r - 4),
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        r, zoneR, dmg, bounces: 2, color: '#16A34A', life: 0.9 + rand(0, 0.35), hitIds: []
      });
    }
    if (c.isLocal) SFX.play('fire');
  },

  boomerang(c, lv, world, k) {
    const { wandLen, ox, oy, shots, skillUid, spreadStep } = k;
    const spd = 500 + lv * 15;
    const r = (11 + lv * 0.7) * c.areaMult;
    const dmg = (17 + lv * 4.5) * c.atkMult;   // 밸런스(11/26): 15+4lv → 버프
    const maxLife = (1.25 + lv * 0.12) * Math.sqrt(c.areaMult);
    const step = spreadStep(shots, 0.22, Math.PI * 1.45);
    for (let i = 0; i < shots; i++) {
      const ang = c.angle + (i - (shots - 1) / 2) * step;
      world.projs.push({
        kind: 'boomerang', skillUid, ownerId: c.id, team: c.team,
        x: ox, y: oy, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        r, dmg, color: '#8B5CF6', life: maxLife, maxLife, returning: false, spin: 0, hitIds: []
      });
    }
    if (c.isLocal) SFX.play('ricochet');
  },

  shockwave(c, lv, world, k) {
    const { wandLen, ox, oy, shots, skillUid, spreadStep } = k;
    const maxR = (150 + lv * 22) * c.areaMult;
    const speed = 340 + lv * 20;
    const dmg = (11 + lv * 3) * c.atkMult;     // 밸런스(11/26): 14+3.8lv → 너프
    for (let i = 0; i < shots; i++) {
      world.waves.push({
        skillUid, ownerId: c.id, team: c.team,
        x: c.x, y: c.y, r: 22 + i * 18, maxR: maxR + i * 16,
        speed, dmg, color: '#C026D3', hitIds: [], blockedIds: []
      });
    }
    if (c.isLocal) SFX.play('fire');
  },

  scatter(c, lv, world, k) {
    const { wandLen, ox, oy, shots, skillUid, spreadStep } = k;
    const pellets = 3 + shots;                  // 밸런스(11/26): 2+shots → 3+shots
    const totalSpread = Math.min(Math.PI * 1.35, 0.65 + shots * 0.08);
    const dmg = (10 + lv * 3) * c.atkMult;     // 밸런스(11/26): 7+2.1lv → 버프
    const life = (0.95 + lv * 0.04) * c.areaMult;
    const r = 6.5 * c.areaMult;
    for (let i = 0; i < pellets; i++) {
      const ang = c.angle + (i - (pellets - 1) / 2) * (totalSpread / Math.max(1, pellets - 1)) + rand(-0.04, 0.04);
      const spd = rand(520, 640);
      world.projs.push({
        kind: 'scatter', skillUid, ownerId: c.id, team: c.team,
        x: clamp(ox, r + 4, CONFIG.W - r - 4), y: clamp(oy, r + 4, CONFIG.H - r - 4),
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        r, dmg, bounces: 2, color: '#57534E', life, hitIds: []
      });
    }
    if (c.isLocal) SFX.play('laser');
  }
};
