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
    this.renderLobbyMode();
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

    const samples = ['⏱ 멈춰!', '💩 똥!똥!똥!', '⚡ 파괴 광선', '💩 똥!똥!똥!', '🌀 혼돈! 파괴! 망각!', '💩 똥!똥!똥!', '💥 폭발은 예술이다!'];
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
    const stageMode = ENGINE.mode === 'solo' || ENGINE.isParty();
    $('#hud-stage-info').textContent = stageMode ? `STAGE ${Math.max(1, ENGINE.stage)}` : `ROOM ${NET.roomCode}`;
    if (ENGINE.isParty()) {
      const enemies = w.chars.filter((c) => c.alive && c.team !== 1 && !c.isSmallMob).length;
      $('#hud-alive-info').textContent = `적 ${enemies}`;
    } else {
      $('#hud-alive-info').textContent = `생존 ${aliveCount}`;
    }

    $('#hud-lv-text').textContent = `Lv.${me.lv}`;
    $('#hud-hp-text').textContent = `${Math.ceil(me.hp)} / ${Math.ceil(me.maxHp)}`;
    $('#hud-hp-bar').style.width = `${clamp((me.hp / me.maxHp) * 100, 0, 100)}%`;
    $('#hud-xp-bar').style.width = `${clamp((me.xp / me.nextXp) * 100, 0, 100)}%`;

    const skillsBar = $('#hud-skills-bar');
    if (skillsBar) {
      const html = this.buildBadgesHtml(me, false);
      if (skillsBar.dataset.html !== html) { // 바뀔 때만 다시 그림
        skillsBar.innerHTML = html;
        skillsBar.dataset.html = html;
      }
    }
  },

  // 보유 마법(Lv) · 궁극기 · (withStats면) 스탯 선택 횟수 뱃지 HTML. 데이터는 CONFIG 기준이라 이스케이프 불필요
  buildBadgesHtml(c, withStats) {
    const base = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-black shrink-0';
    const badges = [];
    for (const [mid, lv] of Object.entries(c.magics || {})) {
      const info = CONFIG.MAGICS[mid];
      if (!info || !(lv > 0)) continue;
      badges.push(`<span class="${base} border-slate-900" style="background:${info.bg}; color:${info.color}">${info.icon} ${info.name} Lv.${Number(lv)}</span>`);
    }
    for (const uid of (c.ultimates || [])) {
      const u = CONFIG.ULTIMATES[uid];
      if (!u) continue;
      badges.push(`<span class="${base} border-amber-500 bg-amber-100 text-amber-900">${u.icon} ${u.name}</span>`);
    }
    if (withStats) {
      for (const [sid, n] of Object.entries(c.statCounts || {})) {
        const st = CONFIG.STATS[sid];
        if (!st || !(n > 0)) continue;
        badges.push(`<span class="${base} border-slate-400" style="background:${st.bg}; color:${st.color}">${st.icon} ${st.name} ×${Number(n)}</span>`);
      }
    }
    return badges.join('');
  },

  // 사망/종료 결산: 레벨 + 획득한 기술 목록
  renderBuildSummary(container, c) {
    if (!container) return;
    if (!c) { container.innerHTML = ''; return; }
    container.innerHTML = `
      <div class="text-[11px] font-black text-slate-500 mb-1.5">내 빌드 · Lv.${Number(c.lv) || 1}</div>
      <div class="flex flex-wrap justify-center gap-1.5">${this.buildBadgesHtml(c, true) || '<span class="text-xs text-slate-400">없음</span>'}</div>
    `;
  },

  renderDifficulty() {
    document.querySelectorAll('.diff-btn').forEach((btn) => {
      const on = btn.dataset.diff === ENGINE.difficulty;
      btn.classList.toggle('bg-slate-900', on);
      btn.classList.toggle('text-white', on);
      btn.classList.toggle('bg-white', !on);
      btn.classList.toggle('text-slate-700', !on);
    });
  },

  // 대기실 모드/난이도 표시 (참가자는 보기만)
  renderLobbyMode() {
    const party = NET.matchType === 'party';
    document.querySelectorAll('#lobby-mode-picker .mode-btn').forEach((btn) => {
      const on = btn.dataset.mode === NET.matchType;
      btn.classList.toggle('bg-slate-900', on);
      btn.classList.toggle('text-white', on);
      btn.classList.toggle('bg-white', !on);
      btn.classList.toggle('text-slate-700', !on);
    });
    $('#lobby-diff-picker').classList.toggle('hidden', !party);
    $('#lbl-neutral-mobs').classList.toggle('hidden', party);
    $('#lobby-mode-row').classList.toggle('pointer-events-none', !NET.isHost);
    this.renderDifficulty();
  },

  showOnlineGameOver(title, desc) {
    $('#on-over-title').textContent = desc ? `${title} ${desc}` : title;
    $('#btn-on-rematch').classList.toggle('hidden', !NET.isHost);
    $('#on-over-hint').classList.toggle('hidden', NET.isHost);
    this.renderBuildSummary($('#on-over-build'), ENGINE.getLocalChar());
    $('#modal-on-over').classList.remove('hidden');
  }
};
