// DOM UI: 토스트, 화면 전환, 대기실 목록, 연출 배너, 황금카드 룰렛, 선택 카드, 온라인 하단 선택창, HUD

const UI = {
  bannerTimer: null,

  toast(msg) {
    const box = $('#toast-box');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'px-4 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-extrabold shadow-lg animate-pop';
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  },

  showScreen(name) {
    ['title', 'lobby', 'game'].forEach((sc) => {
      $(`#screen-${sc}`).classList.toggle('hidden', sc !== name);
    });
  },

  hideAllModals() {
    ['#modal-solo-choice', '#modal-solo-stage', '#modal-solo-over', '#modal-on-over'].forEach((sel) => {
      $(sel).classList.add('hidden');
    });
  },

  openLobby() {
    this.hideAllModals();
    this.showScreen('lobby');
    $('#lobby-room-code').textContent = NET.roomCode;
    $('#lobby-host-controls').classList.toggle('hidden', !NET.isHost);
    $('#btn-start-online').classList.toggle('hidden', !NET.isHost);
    $('#lobby-status-msg').textContent = NET.isHost
      ? '코드를 공유하거나 봇을 추가하세요'
      : '방장 대기 중...';
    this.renderLobbyPlayers();
  },

  renderLobbyPlayers() {
    const list = $('#lobby-player-list');
    if (!list) return;
    list.innerHTML = '';
    NET.players.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'flex items-center justify-between px-3 py-2 rounded-xl bg-white border-2 border-slate-900';
      item.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-3.5 h-3.5 rounded-full border border-slate-900 shrink-0" style="background:${CONFIG.COLORS[idx % CONFIG.COLORS.length]}"></span>
          <span class="text-xs sm:text-sm font-black text-slate-900 truncate">${escapeHtml(p.name)}</span>
        </div>
        <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${p.isHost ? 'bg-amber-200 text-amber-900' : p.isBot ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}">
          ${p.isHost ? '방장' : p.isBot ? 'AI 봇' : '플레이어'}
        </span>
      `;
      list.appendChild(item);
    });
  },

  showDramatic(text, color = '#f59e0b', sub = '') {
    const banner = $('#dramatic-banner');
    const txtEl = $('#dramatic-text');
    const subEl = $('#dramatic-sub');
    if (!banner || !txtEl) return;

    txtEl.textContent = text;
    txtEl.style.color = color;
    if (sub) {
      subEl.textContent = sub;
      subEl.classList.remove('hidden');
    } else {
      subEl.classList.add('hidden');
    }
    banner.classList.remove('hidden');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      banner.classList.add('hidden');
    }, 1900);
  },

  broadcastDramatic(text, color, sub = '') {
    this.showDramatic(text, color, sub);
    if (NET.active && NET.isHost) {
      NET.broadcast({ type: 'dramatic', text, color, sub });
    }
  },

  playRoulette(finalLabel, isWin) {
    const ov = $('#roulette-overlay');
    const reel = $('#roulette-reel');
    const sub = $('#roulette-sub');
    if (!ov || !reel) return;

    const samples = ['⏱ 멈춰!', '💩 똥!똥!똥!', '⚡ 파괴 광선', '💩 똥!똥!똥!', '🌀 혼돈! 파괴! 망각!'];
    let tick = 0;
    ov.classList.remove('hidden');
    sub.textContent = '대박? 똥?';

    const timer = setInterval(() => {
      reel.textContent = samples[tick % samples.length];
      tick++;
      if (tick >= 12) {
        clearInterval(timer);
        reel.textContent = finalLabel;
        sub.textContent = '';
        setTimeout(() => ov.classList.add('hidden'), 1400);
      }
    }, 85);
  },

  renderChoiceCards(container, choices, onPick) {
    if (!container) return;
    container.innerHTML = '';
    choices.forEach((ch, idx) => {
      const btn = document.createElement('button');
      const extraClass = ch.isGolden
        ? 'bg-amber-50 gold-card-glow'
        : ch.isEpic
          ? 'bg-purple-50 border-purple-700'
          : 'bg-white hover:bg-slate-50';
      btn.className = `arcade-btn rounded-xl p-2.5 sm:p-3 text-left flex flex-col justify-between gap-1 cursor-pointer ${extraClass}`;
      btn.innerHTML = `
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1">
            <span class="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-900 text-white text-[10px] font-black">${idx + 1}</span>
            <span class="text-lg sm:text-xl">${escapeHtml(ch.icon)}</span>
          </div>
          <span class="text-[10px] font-black px-1.5 py-0.5 rounded-md" style="background:${safeColor(ch.bg, '#f1f5f9')}; color:${safeColor(ch.color)}">
            ${escapeHtml(ch.badge)}
          </span>
        </div>
        <div class="text-xs sm:text-sm font-black text-slate-900 leading-tight">${escapeHtml(ch.name)}</div>
        <div class="text-[10px] sm:text-[11px] font-semibold text-slate-600 leading-snug line-clamp-2">${escapeHtml(ch.desc)}</div>
      `;
      btn.addEventListener('click', () => onPick(idx));
      container.appendChild(btn);
    });
  },

  renderOnlineChoiceSlot() {
    const slotsEl = $('#online-choice-slots');
    const badgeEl = $('#online-queue-badge');
    const rerollCntEl = $('#on-reroll-count');
    const rerollBtn = $('#btn-on-reroll');
    if (!slotsEl) return;

    const queue = NET.isHost ? (ENGINE.getLocalChar()?.choiceQueue || []) : NET.clientChoiceQueue;
    const qLen = queue.length;

    if (qLen === 0) {
      badgeEl.textContent = '대기 중';
      badgeEl.className = 'text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600';
      rerollCntEl.textContent = '0';
      rerollBtn.disabled = true;
      slotsEl.innerHTML = [1, 2, 3].map((n) => `
        <div class="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-xs font-bold text-slate-400">
        </div>
      `).join('');
      return;
    }

    const current = queue[0];
    badgeEl.textContent = current.isInitial
      ? `시작 마법 (${4 - qLen}/3)`
      : qLen > 1 ? `선택 ×${qLen}` : '선택!';
    badgeEl.className = 'text-[11px] font-black px-2 py-0.5 rounded-full bg-amber-300 text-slate-900';
    rerollCntEl.textContent = String(current.rerolls || 0);
    rerollBtn.disabled = (current.rerolls || 0) <= 0;

    this.renderChoiceCards(slotsEl, current.choices || [], (idx) => {
      if (NET.isHost) {
        ENGINE.applyOnlinePick(ENGINE.localId, idx);
        this.renderOnlineChoiceSlot();
      } else if (NET.hostConn && NET.hostConn.open) {
        NET.hostConn.send({ type: 'pick', idx });
      }
    });
  },

  updateHUD() {
    const w = ENGINE.world;
    const me = ENGINE.getLocalChar();
    if (!w || !me) return;

    const aliveCount = w.chars.filter((c) => c.alive && !c.isSmallMob).length;
    $('#hud-stage-info').textContent = ENGINE.mode === 'solo' ? `STAGE ${ENGINE.stage}` : `ROOM ${NET.roomCode}`;
    $('#hud-alive-info').textContent = `생존 ${aliveCount}`;

    $('#hud-lv-text').textContent = `Lv.${me.lv}`;
    $('#hud-hp-text').textContent = `${Math.ceil(me.hp)} / ${Math.ceil(me.maxHp)}`;
    $('#hud-hp-bar').style.width = `${clamp((me.hp / me.maxHp) * 100, 0, 100)}%`;
    $('#hud-xp-bar').style.width = `${clamp((me.xp / me.nextXp) * 100, 0, 100)}%`;

    const skillsBar = $('#hud-skills-bar');
    if (skillsBar) {
      const badges = [];
      for (const [mid, lv] of Object.entries(me.magics || {})) {
        if (lv <= 0) continue;
        const info = CONFIG.MAGICS[mid];
        if (!info) continue;
        badges.push(`
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-slate-900 text-[11px] font-black shrink-0"
                style="background:${info.bg}; color:${info.color}">
            ${info.icon} ${info.name} Lv.${lv}
          </span>
        `);
      }
      for (const uid of (me.ultimates || [])) {
        const u = CONFIG.ULTIMATES[uid];
        if (!u) continue;
        badges.push(`
          <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-amber-500 bg-amber-100 text-amber-900 text-[11px] font-black shrink-0">
            ${u.icon} ${u.name}
          </span>
        `);
      }
      skillsBar.innerHTML = badges.join('');
    }
  },

  showOnlineGameOver(title, desc) {
    $('#on-over-title').textContent = title;
    $('#btn-on-rematch').classList.toggle('hidden', !NET.isHost);
    $('#on-over-hint').classList.toggle('hidden', NET.isHost);
    $('#modal-on-over').classList.remove('hidden');
  }
};
