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

    // 1. 장판(독 / 혼돈)
    for (const z of w.zones) {
      if (z.kind === 'blackhole' || z.kind === 'mine') {
        this.drawArtZone(ctx, z, w.time);
        continue;
      }
      ctx.save();
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
      ctx.fillStyle = z.kind === 'chaos' ? 'rgba(147, 51, 234, 0.22)' : 'rgba(22, 163, 74, 0.20)';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.strokeStyle = z.color || '#16a34a';
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

    // 3. 충격파 링
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

    // 6. 레이저 빔
    for (const b of w.beams) {
      const alpha = clamp(b.life / (b.maxLife || 0.16), 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';
      ctx.strokeStyle = b.color || '#0ea5e9';
      ctx.lineWidth = b.width;
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, b.width * 0.35);
      ctx.beginPath();
      ctx.moveTo(b.x1, b.y1);
      ctx.lineTo(b.x2, b.y2);
      ctx.stroke();
      ctx.restore();
    }

    const myTeam = ENGINE.getLocalChar()?.team;
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

  // 💥 블랙홀(소용돌이) / 💣 지뢰(깜빡이는 빨간 점)
  drawArtZone(ctx, z, t) {
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
      ctx.fillStyle = Math.sin(t * 22) > 0 ? '#ef4444' : '#7f1d1d';
      ctx.beginPath();
      ctx.arc(z.x, z.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};
