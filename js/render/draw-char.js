// 캐릭터 그리기: 마력 방패, 똥 변신, 몸통/상태 링, 팔+완드, HP바/닉네임, 내 캐릭터 화살표

Object.assign(RENDER, {
  drawChar(ctx, c, worldTime = 0, myTeam = null) {
    ctx.save();

    // 마력 방패 렌더링 (최대 Lv.6 · 2겹)
    if ((c.magics?.shield || 0) > 0 && (c.poopTimer || 0) <= 0) {
      const slots = SPELLS.getShieldSlots(c);
      for (const slot of slots) {
        const cd = c.shieldCooldowns?.[slot.index] || 0;
        ctx.save();
        ctx.beginPath();
        ctx.arc(c.x, c.y, slot.radius, slot.angle - slot.arc * 0.5, slot.angle + slot.arc * 0.5);
        if (cd <= 0) {
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.strokeStyle = slot.layer === 0 ? '#0284c7' : '#38bdf8';
        } else {
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 5]);
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 똥 변신 상태 렌더링
    if ((c.poopTimer || 0) > 0) {
      ctx.font = `${Math.round(c.r * 1.9)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('💩', c.x, c.y);
    } else {
      const baseColor = c.isLocal ? CONFIG.PLAYER_COLOR : c.color; // 내 화면에선 나만 노란색
      const bodyColor = c.hurtTimer > 0 ? '#fca5a5' : baseColor;

      // 내 캐릭터 후광
      if (c.isLocal) {
        ctx.save();
        ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 팔 + 완드 (머리 밑에 깔리도록 먼저 그림)
      if (!c.isSmallMob) this.drawArmsAndWand(ctx, c, bodyColor);

      // 머리 (위에서 본 동그라미)
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = bodyColor;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // 스턴 / 빙결 상태 링
      if ((c.stunTimer || 0) > 0) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if ((c.slowTimer || 0) > 0) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 작은 슬라임은 눈만
      if (c.isSmallMob) {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(c.x - 6, c.y - 3, 2.5, 0, Math.PI * 2);
        ctx.arc(c.x + 6, c.y - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 미니 HP 바 & 닉네임
    const barW = Math.max(44, c.r * 1.5);
    const barH = 6;
    const bx = c.x - barW * 0.5;
    const by = c.y - c.r - 15;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(bx, by, barW, barH);
    const isAlly = !c.isLocal && myTeam != null && c.team === myTeam;
    ctx.fillStyle = c.isLocal ? '#10b981' : isAlly ? '#0ea5e9' : (c.isSmallMob ? '#22c55e' : '#ef4444');
    ctx.fillRect(bx, by, barW * clamp(c.hp / c.maxHp, 0, 1), barH);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, barW, barH);

    if (!c.isSmallMob) {
      ctx.font = `800 ${CONFIG.NAME_FONT_PX}px Inter, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(c.name, c.x, by - 5);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(c.name, c.x, by - 5);
    }

    // 내 캐릭터 위에 선명하게 통통 튀는 노란색 아래 화살표 표시
    if (c.isLocal) {
      const bounce = Math.sin(worldTime * 7) * 5;
      const ay = by - CONFIG.NAME_FONT_PX - 14 + bounce;
      ctx.save();
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(c.x, ay);
      ctx.lineTo(c.x - 11, ay - 13);
      ctx.lineTo(c.x - 4, ay - 13);
      ctx.lineTo(c.x - 4, ay - 22);
      ctx.lineTo(c.x + 4, ay - 22);
      ctx.lineTo(c.x + 4, ay - 13);
      ctx.lineTo(c.x + 11, ay - 13);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  },

  // 위에서 본 팔 2개(직각으로 꺾인 막대) + 두꺼운 완드 + 주황 끝.
  // 좌표는 머리 반지름 r 단위, u = 조준 방향(앞), v = 오른쪽 옆
  drawArmsAndWand(ctx, c, bodyColor) {
    const r = c.r;
    const W = CONFIG.WAND;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    const P = (u, v) => [u * r, v * r];

    // 팔 (몸 색 막대, 직각으로 꺾임)
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = Math.max(3, r * 0.11);
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    const arms = [
      [P(0.91, -0.42), P(1.38, -0.78), P(1.62, 0)],     // 왼팔: 머리 위쪽 → 위로 꺾여 완드 중간
      [P(0.78, 0.63), P(1.12, 0.92), P(1.66, 0.12)]     // 오른팔: 머리 옆 → 옆으로 갔다 완드 쪽으로
    ];
    for (const pts of arms) {
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(...pts[i]);
      ctx.stroke();
    }

    // 완드 몸통 (몸 색 두꺼운 막대)
    const half = (W.width * r) / 2;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#0f172a';
    ctx.fillStyle = bodyColor;
    ctx.fillRect(W.base * r, -half, (W.tip - W.base) * r, half * 2);
    ctx.strokeRect(W.base * r, -half, (W.tip - W.base) * r, half * 2);

    // 완드 끝 (주황 네모)
    const ts = W.tipSize * r;
    ctx.fillStyle = W.tipColor;
    ctx.fillRect(W.tip * r - ts, -ts / 2, ts, ts);
    ctx.strokeRect(W.tip * r - ts, -ts / 2, ts, ts);

    ctx.restore();
  }
});
