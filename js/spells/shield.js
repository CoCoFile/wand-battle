// 마력 방패: 궤도(최대 Lv.6, 3개씩 2겹), 회전, 파괴/재생성 쿨타임, 투사체·빔·파동 차단 판정
// 규칙: 같은 스킬(skillUid) 한 번에는 방패 1개만 파괴. 똥 변신 중에는 방패 무효

Object.assign(SPELLS, {
  shieldCfg(lv) {
    const capped = Math.min(6, Math.max(0, lv));
    return {
      count: capped,
      omega: 2.3 + capped * 0.25,
      cooldown: Math.max(1.5, 3.6 - capped * 0.35) // 밸런스(11/26): 재생 빨라짐 (Lv3 3.56초 → 2.55초)
    };
  },

  // 최대 Lv.6: Lv.1~3은 안쪽 궤도(최대 3개), Lv.4~6은 바깥쪽 궤도(최대 3개) 2겹 배치
  getShieldSlots(c) {
    const lv = Math.min(6, c.magics?.shield || 0);
    if (lv <= 0) return [];
    const baseAng = c.shieldAngle || 0;
    const slots = [];
    for (let i = 0; i < lv; i++) {
      const layer = i < 3 ? 0 : 1;
      const radius = CONFIG.SHIELD_R[layer];
      const layerCount = layer === 0 ? Math.min(3, lv) : (lv - 3);
      const layerIdx = layer === 0 ? i : (i - 3);
      const arc = Math.min(1.2, (Math.PI * 1.6) / layerCount); // 밸런스(11/26): 방패 폭 넓힘 (Lv3 기준 원의 ~57% 커버)
      const angle = layer === 0
        ? baseAng + (Math.PI * 2 * layerIdx) / layerCount
        : -baseAng * 0.85 + Math.PI / 3 + (Math.PI * 2 * layerIdx) / layerCount;
      slots.push({ index: i, layer, radius, arc, angle });
    }
    return slots;
  },

  ensureShieldSlots(c) {
    const lv = Math.min(6, c.magics.shield || 0);
    if (c.magics.shield > 6) c.magics.shield = 6;
    if (lv <= 0) { c.shieldCooldowns = []; return; }
    if (!Array.isArray(c.shieldCooldowns)) c.shieldCooldowns = [];
    while (c.shieldCooldowns.length < lv) c.shieldCooldowns.push(0);
    if (c.shieldCooldowns.length > lv) c.shieldCooldowns.length = lv;
  },

  updateShields(c, dt, world) {
    if (c.recentShieldSkills) {
      for (const k of Object.keys(c.recentShieldSkills)) {
        c.recentShieldSkills[k] -= dt;
        if (c.recentShieldSkills[k] <= 0) delete c.recentShieldSkills[k];
      }
    }
    const lv = Math.min(6, c.magics.shield || 0);
    if (lv <= 0) return;
    this.ensureShieldSlots(c);
    const { omega } = this.shieldCfg(lv);
    c.shieldAngle = (c.shieldAngle || 0) + omega * dt;
    for (let i = 0; i < c.shieldCooldowns.length; i++) {
      if (c.shieldCooldowns[i] > 0) {
        c.shieldCooldowns[i] = Math.max(0, c.shieldCooldowns[i] - dt);
        if (c.shieldCooldowns[i] === 0 && world) {
          const r = CONFIG.SHIELD_R[i < 3 ? 0 : 1];
          world.rings.push({ x: c.x, y: c.y, r, maxR: r + 16, life: 0.25, maxLife: 0.25, color: '#38bdf8' });
          if (c.isLocal) SFX.play('shieldUp');
        }
      }
    }
  },

  // 동일한 스킬(skillUid)에 의해 이미 방패가 1개 깨졌다면 추가 방패를 부수지 않음
  breakShieldSlot(target, slot, px, py, world, skillUid = null) {
    const lv = Math.min(6, target.magics?.shield || 0);
    if (lv <= 0) return false;
    this.ensureShieldSlots(target);
    if ((target.shieldCooldowns[slot.index] || 0) > 0) return false;

    if (!target.recentShieldSkills) target.recentShieldSkills = {};
    if (skillUid && target.recentShieldSkills[skillUid] > 0) {
      return true;
    }

    const { cooldown } = this.shieldCfg(lv);
    target.shieldCooldowns[slot.index] = cooldown;
    if (skillUid) target.recentShieldSkills[skillUid] = 5.0;

    this.spawnParticles(world, px, py, '#38bdf8', 10, 150);
    // 반격 충격: 방패가 깨질 때 주변 적에게 피해 (밸런스 11/26 — 막기만 하던 방패가 너무 약해서)
    if (world) {
      const burstR = 110;
      const burstDmg = (14 + lv * 4) * (target.atkMult || 1);
      world.rings.push({ x: target.x, y: target.y, r: target.r, maxR: burstR, life: 0.25, maxLife: 0.25, color: '#38bdf8' });
      for (const e of world.chars) {
        if (!e.alive || e.team === target.team || e.id === target.id) continue;
        if (dist(e.x, e.y, target.x, target.y) <= burstR + e.r) ENGINE.damageChar(e, burstDmg, target, world);
      }
    }
    if (world) {
      world.texts.push({ x: target.x, y: target.y - target.r - 16, text: '방패!', color: '#0284c7', life: 0.75 });
    }
    if (target.isLocal) SFX.play('shieldHit');
    return true;
  },

  tryBlockPoint(target, px, py, world, skillUid = null) {
    const lv = Math.min(6, target.magics?.shield || 0);
    if (lv <= 0 || (target.poopTimer || 0) > 0) return false;
    this.ensureShieldSlots(target);
    const d = dist(target.x, target.y, px, py);
    const ptAng = Math.atan2(py - target.y, px - target.x);
    const slots = this.getShieldSlots(target);

    for (const slot of slots) {
      if ((target.shieldCooldowns[slot.index] || 0) > 0) continue;
      if (Math.abs(d - slot.radius) <= 15 && Math.abs(angleDiff(ptAng, slot.angle)) <= slot.arc * 0.56) {
        return this.breakShieldSlot(target, slot, px, py, world, skillUid);
      }
    }
    return false;
  },

  clipBeamByShields(caster, x1, y1, angle, maxLen, world, destroyShield = true, skillUid = null) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let d = 12; d <= maxLen; d += 8) {
      const px = x1 + cos * d;
      const py = y1 + sin * d;
      for (const t of world.chars) {
        if (!t.alive || t.id === caster.id || t.team === caster.team) continue;
        if ((t.magics?.shield || 0) <= 0 || (t.poopTimer || 0) > 0) continue;
        if (destroyShield) {
          if (this.tryBlockPoint(t, px, py, world, skillUid)) return d;
        } else {
          const distC = dist(t.x, t.y, px, py);
          const ptAng = Math.atan2(py - t.y, px - t.x);
          for (const slot of this.getShieldSlots(t)) {
            if ((t.shieldCooldowns?.[slot.index] || 0) <= 0 &&
                Math.abs(distC - slot.radius) <= 14 &&
                Math.abs(angleDiff(ptAng, slot.angle)) <= slot.arc * 0.56) {
              return d;
            }
          }
        }
      }
    }
    return maxLen;
  }
});
