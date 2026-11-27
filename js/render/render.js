// 캔버스 렌더러: 리사이즈(1200x800 고정 비율), 화면좌표→아레나좌표, 전체 그리기 순서(장판→구슬→파동→링→투사체→빔→캐릭터→파티클→텍스트)

const RENDER = {
  canvas: null,
  ctx: null,

  init() {
    this.canvas = $('#game-canvas');
    this.ctx = this.canvas.getContext('2d');
    window.addEventListener('resize', () => this.resize());
    this.resize();
  },

  resize() {
    const wrap = $('#canvas-wrap');
    if (!wrap || !this.canvas) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const aspect = CONFIG.W / CONFIG.H;
    let cw = rect.width;
    let ch = rect.width / aspect;
    if (ch > rect.height) {
      ch = rect.height;
      cw = rect.height * aspect;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.style.width = `${Math.floor(cw)}px`;
    this.canvas.style.height = `${Math.floor(ch)}px`;
    this.canvas.width = Math.floor(CONFIG.W * dpr);
    this.canvas.height = Math.floor(CONFIG.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  clientToArena(clientX, clientY) {
    if (!this.canvas) return { x: CONFIG.W * 0.5, y: CONFIG.H * 0.5 };
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: CONFIG.W * 0.5, y: CONFIG.H * 0.5 };
    return {
      x: clamp(((clientX - rect.left) / rect.width) * CONFIG.W, 0, CONFIG.W),
      y: clamp(((clientY - rect.top) / rect.height) * CONFIG.H, 0, CONFIG.H)
    };
  },

  draw() {
    const ctx = this.ctx;
    const w = ENGINE.world;
    if (!ctx) return;

    ctx.clearRect(0, 0, CONFIG.W, CONFIG.H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);

    // 은은한 아레나 그리드
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1.5;
    const step = 60;
    ctx.beginPath();
    for (let x = step; x < CONFIG.W; x += step) {
      ctx.moveTo(x, 0); ctx.lineTo(x, CONFIG.H);
    }
    for (let y = step; y < CONFIG.H; y += step) {
      ctx.moveTo(0, y); ctx.lineTo(CONFIG.W, y);
    }
    ctx.stroke();

    if (!w) return;

    // 화면 흔들림 (보스 필살기)
    ctx.save();
    if (w.shake > 0) {
      const m = Math.min(12, 28 * w.shake);
      ctx.translate(rand(-m, m), rand(-m, m));
    }
    const myTeam = ENGINE.getLocalChar()?.team;

    // 1. 장판(독 / 빙결 / 혼돈 / 술) — 내 편 것과 적 것은 색이 다름
    for (const z of w.zones) {
      if (z.kind === 'blackhole' || z.kind === 'mine') {
        this.drawArtZone(ctx, z, w.time, myTeam);
        continue;
      }
      const ally = myTeam != null && z.team === myTeam;
      const col = this.ZONE_COLORS[z.kind] || this.ZONE_COLORS.poison;
      const [fill, line] = ally ? col.ally : col.enemy;
      ctx.save();
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.lineWidth = ally ? 2.5 : 1.5;
      ctx.setLineDash(ally ? [8, 6] : [6, 8]);
      ctx.strokeStyle = line;
      ctx.stroke();
      if (z.kind === 'frost') { // 눈꽃 무늬
        ctx.setLineDash([]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = ally ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.45)';
        const rr = z.r * 0.35;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (Math.PI / 3) * k;
          ctx.moveTo(z.x - Math.cos(a) * rr, z.y - Math.sin(a) * rr);
          ctx.lineTo(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 1.2 👑 보스 필살기 경고 (빨간 바닥) / 발동 순간 번쩍
    for (const wn of (w.warns || [])) this.drawWarn(ctx, wn, w.time);

    // 1.5 바운스 지뢰 (청록 원 + 스프링 무늬)
    for (const m of (w.bouncers || [])) {
      ctx.save();
      ctx.fillStyle = '#a5f3fc';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#0891b2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const s = m.r * 0.55;
      ctx.moveTo(m.x - s, m.y + s * 0.6);
      ctx.lineTo(m.x - s * 0.5, m.y - s * 0.6);
      ctx.lineTo(m.x, m.y + s * 0.6);
      ctx.lineTo(m.x + s * 0.5, m.y - s * 0.6);
      ctx.lineTo(m.x + s, m.y + s * 0.6);
      ctx.stroke();
      ctx.restore();
    }

    // 2. 경험치 & HP 구슬
    for (const o of w.orbs) {
      ctx.save();
      if (o.life !== undefined && o.life < 2) {
        ctx.globalAlpha = Math.sin(w.time * 18) > 0 ? 1 : 0.25; // 곧 사라짐 → 깜빡
      }
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
      ctx.fillStyle = o.isHeal ? '#10b981' : '#f59e0b';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();
      if (o.isHeal) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(o.x - 5, o.y); ctx.lineTo(o.x + 5, o.y);
        ctx.moveTo(o.x, o.y - 5); ctx.lineTo(o.x, o.y + 5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 3. 멈춰! 파동 (맵 끝까지)
    for (const pl of (w.pulses || [])) {
      const k = 1 - clamp(pl.life / pl.maxLife, 0, 1);
      const r = pl.r0 + (pl.maxR - pl.r0) * (1 - Math.pow(1 - k, 2.2));
      ctx.save();
      ctx.globalAlpha = 0.85 * (1 - k * 0.8);
      ctx.beginPath();
      ctx.arc(pl.x, pl.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.lineWidth = pl.lw || 6;
      ctx.strokeStyle = pl.color || '#f59e0b';
      ctx.stroke();
      ctx.restore();
    }

    // 3.5 (예전 충격파 링 — 지금은 생성 안 함)
    for (const wv of w.waves) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(wv.x, wv.y, wv.r, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = wv.color || '#c026d3';
      ctx.stroke();
      ctx.restore();
    }

    // 4. 폭발/방패 재생성 링
    for (const rg of w.rings) {
      const alpha = clamp(rg.life / (rg.maxLife || 0.3), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(rg.x, rg.y, rg.r, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = rg.color || '#f97316';
      ctx.stroke();
      ctx.restore();
    }

    // 5. 투사체
    for (const p of w.projs) {
      ctx.save();
      ctx.translate(p.x, p.y);
      if (p.kind === 'boomerang') {
        ctx.rotate(p.spin || 0);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-p.r, -p.r * 0.6);
        ctx.lineTo(0, 0);
        ctx.lineTo(-p.r, p.r * 0.6);
        ctx.stroke();
      } else if (p.kind === 'scatter') {
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(p.r + 3, 0);
        ctx.lineTo(-p.r, -p.r * 0.85);
        ctx.lineTo(-p.r, p.r * 0.85);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();
      }
      ctx.restore();
    }

    // 6. 레이저 빔 (glow = 파괴 광선·보스 레이저: 바깥 빛이 천천히 흐려지는 잔상)
    for (const b of w.beams) {
      const alpha = clamp(b.life / (b.maxLife || 0.16), 0, 1);
      ctx.save();
      if (b.glow) {
        ctx.lineCap = 'round';
        ctx.globalAlpha = 0.35 * Math.sqrt(alpha);
        ctx.strokeStyle = b.color || '#ef4444';
        ctx.lineWidth = b.width * (1.5 + (1 - alpha) * 0.9);
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
        ctx.globalAlpha = Math.min(1, alpha * 1.6);
      } else {
        ctx.globalAlpha = alpha;
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = b.color || '#0ea5e9';
      ctx.lineWidth = b.glow ? b.width * (0.4 + 0.6 * alpha) : b.width;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, b.width * (b.glow ? 0.16 * alpha : 0.35));
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.restore();
    }

    // 7. 캐릭터 & 마력 방패
    for (const c of w.chars) {
      if (!c.alive) continue;
      this.drawChar(ctx, c, w.time, myTeam);
    }

    // 8. 파티클
    for (const pt of w.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(pt.life / (pt.maxLife || 0.4), 0, 1);
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 9. 플로팅 텍스트
    for (const tx of w.texts) {
      ctx.save();
      ctx.font = '900 15px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeText(tx.text, tx.x, tx.y);
      ctx.fillStyle = tx.color || '#0f172a';
      ctx.fillText(tx.text, tx.x, tx.y);
      ctx.restore();
    }

    ctx.restore(); // 흔들림 끝

    // 10. 솔로 수동조작 ON 시 마우스 조준 크로스헤어 표시
    if (ENGINE.mode === 'solo' && ENGINE.manualControl && ENGINE.input.hasMouse && !ENGINE.input.touchActive) {
      const mx = ENGINE.input.mouseX;
      const my = ENGINE.input.mouseY;
      ctx.save();
      ctx.strokeStyle = '#f97316';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(mx, my, 12, 0, Math.PI * 2);
      ctx.moveTo(mx - 18, my); ctx.lineTo(mx - 7, my);
      ctx.moveTo(mx + 7, my); ctx.lineTo(mx + 18, my);
      ctx.moveTo(mx, my - 18); ctx.lineTo(mx, my - 7);
      ctx.moveTo(mx, my + 7); ctx.lineTo(mx, my + 18);
      ctx.stroke();
      ctx.restore();
    }
  },

  // 장판 색 [채우기, 테두리] — ally = 내 편(내 화면 기준, 잘 보이게 선명), enemy = 상대 편(눈 안 아프게 채도 낮춤, 11/27j)
  ZONE_COLORS: {
    poison: { ally: ['rgba(22, 163, 74, 0.20)', '#16a34a'],  enemy: ['rgba(138, 150, 110, 0.16)', '#9aa585'] },  // 초록 / 흐린 올리브
    frost:  { ally: ['rgba(56, 189, 248, 0.24)', '#0284c7'], enemy: ['rgba(143, 160, 184, 0.17)', '#a3b1c4'] },  // 하늘 / 흐린 회청
    chaos:  { ally: ['rgba(147, 51, 234, 0.22)', '#9333ea'], enemy: ['rgba(158, 140, 168, 0.16)', '#ad9fb6'] },  // 보라 / 흐린 자주
    booze:  { ally: ['rgba(245, 158, 11, 0.22)', '#d97706'], enemy: ['rgba(196, 176, 130, 0.18)', '#c2ae84'] }   // 술 장판 (보스)
  },

  // 👑 보스 필살기 경고: 발동 전엔 빨간 반투명(점점 진해짐), 발동 순간 주황으로 번쩍
  drawWarn(ctx, wn, t) {
    ctx.save();
    let fill, line;
    if (wn.fired) {
      const a = clamp(wn.life / 0.3, 0, 1);
      fill = `rgba(249, 115, 22, ${0.45 * a})`;
      line = `rgba(220, 38, 38, ${a})`;
    } else {
      const p = 1 - clamp(wn.delay / (wn.maxDelay || 1), 0, 1);  // 0 → 1 (곧 터짐)
      const blink = wn.delay < 0.35 && Math.sin(t * 40) > 0 ? 0.12 : 0;
      fill = `rgba(239, 68, 68, ${0.10 + 0.22 * p + blink})`;
      line = 'rgba(185, 28, 28, 0.9)';
    }
    ctx.fillStyle = fill;
    ctx.strokeStyle = line;
    ctx.lineWidth = 2.5;
    if (!wn.fired) ctx.setLineDash([10, 6]);
    if (wn.shape === 'circle') {
      ctx.beginPath(); ctx.arc(wn.x, wn.y, wn.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (wn.shape === 'sector') {
      ctx.beginPath(); ctx.moveTo(wn.x, wn.y); ctx.arc(wn.x, wn.y, wn.r, wn.a0, wn.a1); ctx.closePath(); ctx.fill(); ctx.stroke();
    } else if (wn.shape === 'line') {
      const ang = Math.atan2(wn.y2 - wn.y1, wn.x2 - wn.x1);
      const len = Math.hypot(wn.x2 - wn.x1, wn.y2 - wn.y1);
      ctx.translate(wn.x1, wn.y1); ctx.rotate(ang);
      ctx.fillRect(0, -wn.width / 2, len, wn.width);
      ctx.strokeRect(0, -wn.width / 2, len, wn.width);
    } else if (wn.shape === 'edge') {
      const W = CONFIG.W, H = CONFIG.H, bx = wn.bx, by = wn.by;
      ctx.beginPath();
      ctx.rect(0, 0, W, by); ctx.rect(0, H - by, W, by);
      ctx.rect(0, by, bx, H - by * 2); ctx.rect(W - bx, by, bx, H - by * 2);
      ctx.fill();
      ctx.strokeRect(bx, by, W - bx * 2, H - by * 2);
    }
    ctx.restore();
  },

  // 💥 블랙홀(소용돌이) / 💣 지뢰(깜빡이는 점: 내 편 초록 / 상대 빨강)
  drawArtZone(ctx, z, t, myTeam = null) {
    ctx.save();
    if (z.kind === 'blackhole') {
      const g = ctx.createRadialGradient(z.x, z.y, 4, z.x, z.y, z.r);
      g.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      g.addColorStop(0.22, 'rgba(76, 29, 149, 0.6)');
      g.addColorStop(1, 'rgba(76, 29, 149, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.9)';
      ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        const a = t * 5 + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * 0.45, a, a + 1.4);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(z.x, z.y, z.r * 0.75, -a * 0.7, -a * 0.7 + 0.9);
        ctx.stroke();
      }
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(z.x, z.y, 16, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#1f2937';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      const allyMine = myTeam != null && z.team === myTeam;
      ctx.fillStyle = allyMine ? (Math.sin(t * 22) > 0 ? '#22c55e' : '#14532d') : (Math.sin(t * 8) > 0 ? '#b08a8a' : '#6b5b5b'); // 상대 지뢰는 흐리고 느리게
      ctx.beginPath();
      ctx.arc(z.x, z.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};
