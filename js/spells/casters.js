// 마법 6종 시전 로직 (상시 유지형: 마력 방패 = js/spells/shield.js, 회전 칼날 = js/spells/blades.js)
// 새 마법 추가: 1) config.js MAGICS에 정보 추가  2) 여기 같은 이름으로 함수 추가
//              3) spells.js baseCooldown 표에 쿨타임 추가  4) 투사체면 engine/update.js updateProjectiles + render 에 kind 처리
// k = { wandLen, ox, oy(완드 끝 좌표), shots(동시 발사 수, 최대 8), over(발사 수 상한 넘은 레벨의 피해 배율), skillUid(방패 1개 파괴 판정용), spreadStep(부채꼴 간격 함수) }

const SPELL_CASTERS = {
  laser(c, lv, world, k) {
    const { wandLen, ox, oy, shots, over, skillUid, spreadStep } = k;
    const maxLen = 1500;
    const width = (6 + lv * 1.4) * c.areaMult;
    // 11/27c 평균딜 맞춤: 15+4.5lv → 45+5.4lv. 솔로·파티의 적은 예전 공식 그대로 (전원 레이저 기본 보유라)
    const enemySide = ENGINE.isStageMode() && c.team !== 1;
    const dmg = (enemySide ? 15 + lv * 4.5 : 45 + lv * 5.4) * c.atkMult * over;
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
    const { wandLen, ox, oy, shots, over, skillUid, spreadStep } = k;
    const spd = 410 + lv * 15;
    const r = (9 + lv * 0.7) * c.areaMult;
    const expR = (62 + lv * 9) * c.areaMult;
    const dmg = (15.7 + lv * 3.9) * c.atkMult * over; // 11/27c 평균딜 맞춤 (12.5+3.5lv → 15.7+3.9lv)
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

  // 🧊 빙결 장판: 플라스크처럼 던짐 → 떨어진 곳에 얼음 장판 (감속 + 받는 피해 증가 + 약한 지속 피해)
  frost(c, lv, world, k) {
    const { wandLen, ox, oy, shots, over, skillUid, spreadStep } = k;
    const F = CONFIG.FROST;
    const spd = 380 + lv * 12;
    const zoneR = (56 + Math.min(lv, 12) * 6) * c.areaMult;
    const life = Math.min(4.5, 2.4 + lv * 0.15);
    const shred = F.shredMax * lv / (lv + 4);              // 받는 피해 +%, 최대 40%로 수렴
    const dmg = (F.dmg[0] + lv * F.dmg[1]) * c.atkMult * over;
    const r = 8 * c.areaMult;
    const step = spreadStep(shots, 0.26, Math.PI * 1.5);
    for (let i = 0; i < shots; i++) {
      const ang = c.angle + (i - (shots - 1) / 2) * step;
      world.projs.push({
        kind: 'frost', skillUid, ownerId: c.id, team: c.team,
        x: clamp(ox, r + 4, CONFIG.W - r - 4), y: clamp(oy, r + 4, CONFIG.H - r - 4),
        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
        r, zoneR, zoneLife: life, shred, dmg, bounces: 2, color: '#38BDF8', life: 0.75 + rand(0, 0.35), hitIds: []
      });
    }
    if (c.isLocal) SFX.play('ice');
  },

  poison(c, lv, world, k) {
    const { wandLen, ox, oy, shots, over, skillUid, spreadStep } = k;
    const spd = 360 + lv * 12;
    const zoneR = (58 + lv * 8) * c.areaMult;
    const dmg = (8.2 + lv * 0.1) * c.atkMult * over;   // 11/27c 평균딜 맞춤 (8+1.9lv → 8.2+0.1lv: 장판 크기·개수가 레벨 따라 커져서 피해는 거의 고정)
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
    const { wandLen, ox, oy, shots, over, skillUid, spreadStep } = k;
    const spd = 720 + lv * 20;                        // 11/27d: 500+15lv → 빠르게
    const r = (11 + lv * 0.7) * c.areaMult;
    const dmg = (19.6 + lv * 1.3) * c.atkMult * over; // 11/27d: 빨라지고 멀리 가고 벽 반사라 더 자주 맞음 → 평균딜 맞춤 (25+5lv → 19.6+1.3lv)
    const maxLife = (1.45 + lv * 0.12) * Math.sqrt(c.areaMult); // 11/27d: 사거리 ↑ (빠른 속도 × 긴 수명, 벽에 닿으면 반사)
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

  scatter(c, lv, world, k) {
    const { wandLen, ox, oy, shots, over, skillUid, spreadStep } = k;
    const pellets = 3 + shots;                  // 밸런스(11/26): 2+shots → 3+shots
    const totalSpread = Math.min(Math.PI * 1.35, 0.65 + shots * 0.08);
    const dmg = (7 + lv * 7.3) * c.atkMult * over;    // 11/27c 평균딜 맞춤 (10+3lv → 7+7.3lv)
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
