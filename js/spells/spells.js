// SPELLS 본체: 파티클 생성, 마법별 기본 쿨타임 표, 시전 디스패처
// 나머지 SPELLS 기능은 shield.js / choices.js / ultimates.js 에서 Object.assign 으로 붙임

const SPELLS = {
  spawnParticles(world, x, y, color, count = 8, speed = 130) {
    if (!world) return;
    for (let i = 0; i < count; i++) {
      const ang = rand(0, Math.PI * 2);
      const spd = rand(speed * 0.35, speed);
      const life = rand(0.25, 0.5);
      world.particles.push({
        x, y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: rand(2.5, 5),
        color,
        life,
        maxLife: life
      });
    }
  },

  baseCooldown(mid, lv) {
    const table = {
      laser: 1.05,
      fireball: 1.45,
      frost: 1.8,
      poison: 1.9,
      boomerang: 1.5,
      scatter: 1.35
    };
    const base = table[mid] || 1.3;
    return Math.max(0.45, base * Math.pow(0.96, Math.max(0, lv - 1)));
  },

  cast(c, mid, lv, world) {
    const caster = SPELL_CASTERS[mid];
    if (!caster) return;
    const wandLen = wandTipDist(c);
    const ox = c.x + Math.cos(c.angle) * wandLen;
    const oy = c.y + Math.sin(c.angle) * wandLen;
    const shots = spellShotCount(lv);
    // Lv.8부터는 모양·크기·한 발 피해는 Lv.7 그대로, 남는 레벨은 over 배율로만 (화력이 레벨에 비례하게, 11/27r)
    const lvEff = Math.min(lv, CONFIG.MAX_SHOTS - 1);
    const over = spellOverMult(lv) * spellLevelDamp(mid, lvEff);
    const skillUid = ++world.uidSeq;
    const spreadStep = (count, baseStep, maxTotal) =>
      count <= 1 ? 0 : Math.min(baseStep, maxTotal / (count - 1));
    caster(c, lvEff, world, { wandLen, ox, oy, shots, over, skillUid, spreadStep });
  }
};
