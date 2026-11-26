// 캐릭터 그리기: 마력 방패, 똥 변신, 몸통/상태 링, 팔+완드, HP바/닉네임, 내 캐릭터 화살표

Object.assign(RENDER, {
  drawChar(ctx, c, worldTime = 0) {
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
      // 본체 원형 머리
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
      ctx.fillStyle = c.hurtTimer > 0 ? '#fca5a5' : c.color;
      ctx.fill();
      ctx.lineWidth = 3;
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

      // 작은 슬라임은 귀여운 눈만 표시, 마법사는 팔 & 주황색 완드 표시
      if (c.isSmallMob) {
        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(c.x - 6, c.y - 3, 2.5, 0, Math.PI * 2);
        ctx.arc(c.x + 6, c.y - 3, 2.5, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const cos = Math.cos(c.angle);
        const sin = Math.sin(c.angle);
        const perpX = -sin;
        const perpY = cos;

        const shoulderX = c.x + cos * (c.r * 0.55) + perpX * (c.r * 0.55);
        const shoulderY = c.y + sin * (c.r * 0.55) + perpY * (c.r * 0.55);
        const elbowX = shoulderX + cos * 12 + perpX * 8;
        const elbowY = shoulderY + sin * 12 + perpY * 8;
        const handX = c.x + cos * (c.r + 8);
        const handY = c.y + sin * (c.r + 8);
        const tipX = c.x + cos * (c.r + 28);
        const tipY = c.y + sin * (c.r + 28);

        // 꺾인 막대기 팔
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 3.5;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(shoulderX, shoulderY);
        ctx.lineTo(elbowX, elbowY);
        ctx.lineTo(handX, handY);
        ctx.stroke();

        // 주황색 직선 완드
        ctx.strokeStyle = '#f97316';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(handX, handY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();

        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2);
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
    ctx.fillStyle = c.isLocal ? '#10b981' : (c.isSmallMob ? '#22c55e' : '#ef4444');
    ctx.fillRect(bx, by, barW * clamp(c.hp / c.maxHp, 0, 1), barH);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, barW, barH);

    if (!c.isSmallMob) {
      ctx.font = '800 12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(c.name, c.x, by - 5);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(c.name, c.x, by - 5);
    }

    // 내 캐릭터 위에 선명하게 통통 튀는 노란색 아래 화살표 표시
    if (c.isLocal) {
      const bounce = Math.sin(worldTime * 7) * 5;
      const ay = by - 25 + bounce;
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
  }
});
