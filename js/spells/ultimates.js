// 황금카드 궁극기 3종 발동 (10초마다 자동): 멈춰!(광역 스턴) / 파괴 광선(즉사 빔) / 혼돈!파괴!망각!(장판 4개)

Object.assign(SPELLS, {
  triggerUltimate(caster, sid, world) {
    if (sid === 'stop') {
      for (const t of world.chars) {
        if (!t.alive || t.id === caster.id || t.team === caster.team) continue;
        t.stunTimer = Math.max(t.stunTimer || 0, 3.0);
      }
      SFX.play('golden');
      UI.broadcastDramatic('멈춰!', '#f59e0b', caster.name);
    }
    else if (sid === 'killray') {
      const wandLen = (caster.r || CONFIG.HEAD_R) + 28;
      const x1 = caster.x + Math.cos(caster.angle) * wandLen;
      const y1 = caster.y + Math.sin(caster.angle) * wandLen;
      const len = 1450; // 방패 무시 · 경로상 전원 관통 (아레나 대각선 ≈ 1442)
      const x2 = x1 + Math.cos(caster.angle) * len;
      const y2 = y1 + Math.sin(caster.angle) * len;
      world.beams.push({ x1, y1, x2, y2, width: 14, color: '#ef4444', life: 0.42, maxLife: 0.42 });
      SFX.play('killray');

      for (const t of world.chars) {
        if (!t.alive || t.id === caster.id || t.team === caster.team) continue;
        if (distToSegment(t.x, t.y, x1, y1, x2, y2) <= t.r + 8) {
          ENGINE.damageChar(t, 999999, caster, world, true);
          if (t.isLocal) {
            UI.showDramatic('한방 컷 ㅋㅋ', '#ef4444');
          } else if (NET.active && NET.isHost && !t.isBot) {
            NET.sendToPeer(t.id, { type: 'dramatic', text: '한방 컷 ㅋㅋ', color: '#ef4444' });
          }
        }
      }
    }
    else if (sid === 'chaos') {
      const skillUid = ++world.uidSeq;
      for (let i = 0; i < 4; i++) {
        const zx = rand(180, CONFIG.W - 180);
        const zy = rand(150, CONFIG.H - 150);
        world.zones.push({
          kind: 'chaos', skillUid, ownerId: caster.id, team: caster.team,
          x: zx, y: zy, r: 115, dmg: (12 + caster.lv * 2.2) * caster.atkMult,
          tick: 0.25, life: 4.0, maxLife: 4.0, color: '#9333ea'
        });
        this.spawnParticles(world, zx, zy, '#a855f7', 14, 180);
      }
      SFX.play('golden');
      UI.broadcastDramatic('혼돈! 파괴! 망각!', '#9333ea', caster.name);
    }
  }
});
