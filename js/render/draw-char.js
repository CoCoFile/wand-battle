// 캐릭터 그리기: 회전 칼날, 똥 변신, 몸통/상태 링, 팔+완드, HP바/닉네임, 내 캐릭터 화살표

Object.assign(RENDER, {
  drawChar(ctx, c, worldTime = 0, myTeam = null) {
    ctx.save();

    // 🗡️ 회전 칼날 (방패 바깥 궤도, 은색)
    if ((c.magics?.blades || 0) > 0 && (c.poopTimer || 0) <= 0) this.drawBlades(ctx, c);

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
      } else if ((c.shredTimer || 0) > 0) { // 🧊 방깍 중 (빙결 장판)
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      } else if ((c.slowTimer || 0) > 0) {
        ctx.beginPath();
        ctx.arc(c.x, c.y, c.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // 👑 보스 왕관
      if (c.isBoss) this.drawCrown(ctx, c, worldTime);

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

    if (!c.isSmallMob) this.drawName(ctx, c, by - 5, worldTime);

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

  // 이름 (칭호가 있으면 앞에 [칭호]를 그라데이션 글자로)
  drawName(ctx, c, y, t) {
    ctx.save();
    ctx.font = `800 ${CONFIG.NAME_FONT_PX}px Inter, sans-serif`;
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ffffff';
    ctx.lineJoin = 'round';
    const title = c.title && c.title.text ? `[${c.title.text}] ` : '';
    if (!title) {
      ctx.textAlign = 'center';
      ctx.strokeText(c.name, c.x, y);
      ctx.fillStyle = '#0f172a';
      ctx.fillText(c.name, c.x, y);
      ctx.restore();
      return;
    }
    const tw = ctx.measureText(title).width;
    const nw = ctx.measureText(c.name).width;
    const x0 = c.x - (tw + nw) / 2;
    ctx.textAlign = 'left';
    ctx.strokeText(title, x0, y);
    ctx.strokeText(c.name, x0 + tw, y);
    const cols = CONFIG.TITLE_STYLES[c.title.style] || ['#7C3AED', '#C084FC'];
    const shift = ((t * 0.6) % 1) * tw;                        // 반짝이며 흐르는 그라데이션
    const g = ctx.createLinearGradient(x0 - tw + shift, 0, x0 + tw + shift, 0);
    const all = cols.concat(cols);
    all.forEach((col, i) => g.addColorStop(i / (all.length - 1), col));
    ctx.fillStyle = g;
    ctx.fillText(title, x0, y);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(c.name, x0 + tw, y);
    ctx.restore();
  },

  drawBlades(ctx, c) {
    const lv = c.magics.blades;
    const n = Math.min(CONFIG.BLADES.max, Math.max(1, lv) + 1);
    const R = c.bladeR || (c.r + CONFIG.BLADES.orbit);
    const L = c.bladeL || CONFIG.BLADES.len;
    const base = c.bladeAngle || 0;
    ctx.save();
    // 궤도 흔적
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < n; i++) {
      const a = base + (Math.PI * 2 * i) / n;
      if ((c.bladeCds?.[i] || 0) > 0) continue;            // 깨진 칼날은 안 그림 (다시 생길 때까지)
      ctx.save();
      ctx.translate(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R);
      ctx.rotate(a + Math.PI / 2);                         // 진행 방향으로 칼날
      ctx.beginPath();
      ctx.moveTo(L, 0);
      ctx.quadraticCurveTo(0, -L * 0.42, -L, 0);
      ctx.quadraticCurveTo(0, L * 0.12, L, 0);
      ctx.closePath();
      ctx.fillStyle = '#e2e8f0';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#334155';
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  },

  // 👑 보스 왕관: 단계(bossTier)가 오를수록 보석↑, 마왕 간부(6)~ 붉은 보석, 대마왕(9) 불꽃
  drawCrown(ctx, c, t) {
    const tier = c.bossTier || 0;
    const r = c.r;
    const w = r * 1.25, h = r * 0.62;
    const cx = c.x, top = c.y - r * 0.95, base = top + h;
    ctx.save();
    ctx.lineJoin = 'round';
    const pts = 5;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(cx - w / 2, base);
      for (let i = 0; i <= pts - 1; i++) {
        const x = cx - w / 2 + (w * i) / (pts - 1);
        const peakY = top + (i % 2 === 0 ? 0 : h * 0.38);
        if (i > 0) ctx.lineTo(x - w / (pts - 1) / 2, top + h * 0.62);
        ctx.lineTo(x, peakY);
      }
      ctx.lineTo(cx + w / 2, base);
      ctx.closePath();
    };
    if (tier >= 9) { // 대마왕: 불꽃
      for (let i = 0; i < pts; i += 2) {
        const x = cx - w / 2 + (w * i) / (pts - 1);
        const fl = 7 + Math.sin(t * 14 + i) * 3;
        ctx.fillStyle = Math.sin(t * 20 + i) > 0 ? '#f97316' : '#ef4444';
        ctx.beginPath(); ctx.moveTo(x - 5, top + 2); ctx.quadraticCurveTo(x, top - fl * 2, x + 5, top + 2); ctx.fill();
      }
    }
    path();
    const g = ctx.createLinearGradient(0, top, 0, base);
    g.addColorStop(0, '#fde047'); g.addColorStop(1, '#ca8a04');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0f172a';
    ctx.stroke();
    // 띠 + 보석
    ctx.fillStyle = '#a16207';
    ctx.fillRect(cx - w / 2, base - h * 0.28, w, h * 0.28);
    ctx.strokeRect(cx - w / 2, base - h * 0.28, w, h * 0.28);
    const gems = Math.min(5, 1 + Math.floor(tier / 2));
    ctx.fillStyle = tier >= 6 ? '#dc2626' : '#2563eb';
    for (let i = 0; i < gems; i++) {
      const x = cx + (i - (gems - 1) / 2) * (w / 5.2);
      ctx.beginPath(); ctx.arc(x, base - h * 0.14, Math.max(2.5, r * 0.07), 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 1; ctx.stroke();
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
