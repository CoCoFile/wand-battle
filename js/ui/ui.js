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
    if (name === 'title') { this.renderProfile(); this.renderHardChampion(); }
    ['title', 'lobby', 'game'].forEach((sc) => {
      $(`#screen-${sc}`).classList.toggle('hidden', sc !== name);
    });
  },

  hideAllModals() {
    ['#modal-solo-choice', '#modal-solo-stage', '#modal-solo-over', '#modal-solo-ending', '#modal-on-over', '#modal-relics', '#modal-ranking', '#modal-pause', '#paused-banner'].forEach((sel) => {
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
          <span class="text-xs sm:text-sm font-black text-slate-900 truncate">${titleHtml(p.title)}${escapeHtml(p.name)}</span>
        </div>
        <span class="text-[10px] font-black px-2 py-0.5 rounded-md ${p.isHost ? 'bg-amber-200 text-amber-900' : p.isBot ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'}">
          ${p.isHost ? '방장' : p.isBot ? 'AI 봇' : '플레이어'}
        </span>
      `;
      list.appendChild(item);
    });
  },

  // style: '' 기본 / 'ult' 궁극기(더 크게·빛) / 'jackpot' 잭팟(금색 번쩍)
  showDramatic(text, color = '#f59e0b', sub = '', style = '') {
    const banner = $('#dramatic-banner');
    const txtEl = $('#dramatic-text');
    const subEl = $('#dramatic-sub');
    if (!banner || !txtEl) return;

    txtEl.textContent = text;
    txtEl.style.color = color;
    txtEl.style.setProperty('--glow', color);
    txtEl.classList.toggle('dramatic-ult', style === 'ult' || style === 'jackpot');
    txtEl.classList.remove('animate-pop'); void txtEl.offsetWidth; txtEl.classList.add('animate-pop');
    if (style === 'jackpot') this.goldFlash();
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

  broadcastDramatic(text, color, sub = '', style = '') {
    this.showDramatic(text, color, sub, style);
    if (NET.active && NET.isHost) {
      NET.broadcast({ type: 'dramatic', text, color, sub, style });
    }
  },

  // 💎 잭팟: 화면 금색 번쩍
  goldFlash() {
    const el = $('#gold-flash');
    if (!el) return;
    el.classList.remove('hidden', 'gold-flash-go'); void el.offsetWidth; el.classList.add('gold-flash-go');
    clearTimeout(this.goldFlashTimer);
    this.goldFlashTimer = setTimeout(() => el.classList.add('hidden'), 1000);
  },

  // 👑 보스 필살기 배너 (화면 위쪽, 1.5초)
  showBossUlt(name, text, icon = '💀') {
    const el = $('#boss-ult-banner');
    if (!el) return;
    $('#boss-ult-name').textContent = `💀 ${String(name || '').replace(/^👑\s*/, '')}`;
    $('#boss-ult-text').textContent = `${String(icon || '')} ${String(text || '')}`;
    el.classList.remove('hidden');
    const band = el.firstElementChild;
    band.classList.remove('animate-pop'); void band.offsetWidth; band.classList.add('animate-pop');
    clearTimeout(this.bossUltTimer);
    this.bossUltTimer = setTimeout(() => el.classList.add('hidden'), 1500);
  },

  broadcastBossUlt(name, def) {
    this.showBossUlt(name, def.name, def.icon);
    if (NET.active && NET.isHost) NET.broadcast({ type: 'bossUlt', name, text: def.name, icon: def.icon });
  },

  // 🎰 룰렛 (11/27z3): 빨리 돌다가 점점 느려지며 멈춤. tone: win / jackpot / bust, twist: 똥에 멈췄다가 뒤집힘
  playRoulette(finalLabel, tone = 'win', twist = false) {
    const ov = $('#roulette-overlay');
    const reel = $('#roulette-reel');
    const sub = $('#roulette-sub');
    if (!ov || !reel) return;
    if (typeof tone === 'boolean') tone = tone ? 'win' : 'bust';

    const samples = ['⏱ 멈춰!', '💩 꽝!', '⚡ 파괴 광선', '📈 스탯 +1', '☄️ 하늘이 무너진다!', '👹 적 분노!', '🌀 혼돈! 파괴! 망각!',
      '💎 잭팟!', '👥 분신술!', '🐌 느림보!', '💥 폭발은 예술이다!', '💩 꽝!'];
    const gaps = [60, 60, 60, 60, 60, 60, 70, 80, 95, 115, 140, 170, 210, 260, 330];
    let tick = randInt(0, samples.length - 1);
    clearTimeout(this.rouletteTimer);
    ov.classList.remove('hidden');
    reel.className = reel.className.replace(/\broulette-\w+\b/g, '').trim();
    sub.textContent = '대박? 똥?';
    const land = (text, cls) => {
      reel.textContent = text;
      reel.classList.remove('roulette-win', 'roulette-jackpot', 'roulette-bust', 'animate-pop');
      void reel.offsetWidth;
      reel.classList.add(cls, 'animate-pop');
    };
    const step = (k) => {
      if (k < gaps.length) {
        reel.textContent = samples[tick++ % samples.length];
        if (k >= gaps.length - 4) sub.textContent = '두근…';
        this.rouletteTimer = setTimeout(() => step(k + 1), gaps[k]);
        return;
      }
      sub.textContent = '';
      if (twist) {
        land('💩 꽝!', 'roulette-bust');
        this.rouletteTimer = setTimeout(() => {
          land(finalLabel, 'roulette-jackpot');
          sub.textContent = '…은 훼이크 ㅋㅋ';
          this.rouletteTimer = setTimeout(() => ov.classList.add('hidden'), 1600);
        }, 800);
        return;
      }
      land(finalLabel, `roulette-${tone}`);
      if (tone === 'jackpot') this.goldFlash();
      this.rouletteTimer = setTimeout(() => ov.classList.add('hidden'), 1500);
    };
    step(0);
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

    // 보스 HP바
    const boss = w.chars.find((c) => c.isBoss && c.alive);
    const bossBar = $('#boss-bar');
    if (bossBar) {
      bossBar.classList.toggle('hidden', !boss);
      if (boss) {
        const pct = clamp(boss.hp / boss.maxHp, 0, 1);
        $('#boss-bar-name').textContent = boss.name;
        $('#boss-bar-hp').textContent = `${Math.ceil(pct * 100)}%`;
        $('#boss-bar-fill').style.width = `${pct * 100}%`;
      }
    }

    if (NET.matchType === 'party' && ENGINE.mode === 'online') this.renderDmgMeter();

    const skillsBar = $('#hud-skills-bar');
    if (skillsBar) {
      const html = this.buildBadgesHtml(me, false);
      if (skillsBar.dataset.html !== html) { // 바뀔 때만 다시 그림
        skillsBar.innerHTML = html;
        skillsBar.dataset.html = html;
      }
    }
  },

  // 📊 딜량표: 우리 팀(파티) 플레이어·봇 누적 피해, 많은 순
  dmgRows() {
    const w = ENGINE.world;
    if (!w) return [];
    const me = ENGINE.getLocalChar();
    const team = me ? me.team : 1;
    const rows = w.chars.filter((c) => c.team === team && !c.isSmallMob).map((c) => ({ id: c.id, name: c.name, dmg: Number(c.dmgDealt) || 0, me: c.isLocal || c.id === ENGINE.localId }));
    rows.sort((a, b) => b.dmg - a.dmg);
    return rows;
  },

  dmgTableHtml(rows, big = false) {
    const top = Math.max(1, ...rows.map((r) => r.dmg));
    const total = Math.max(1, rows.reduce((s, r) => s + r.dmg, 0));
    const fmt = (v) => (v >= 10000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)));
    return `<div class="text-[10px] font-black text-slate-500 mb-1">📊 딜량</div>` + rows.map((r, i) => `
      <div class="mb-1">
        <div class="flex justify-between gap-1 ${big ? 'text-xs' : 'text-[10px]'} font-black ${r.me ? 'text-amber-700' : 'text-slate-800'}">
          <span class="truncate">${i === 0 ? '👑 ' : ''}${escapeHtml(r.name)}</span>
          <span class="shrink-0">${fmt(r.dmg)} · ${Math.round((r.dmg / total) * 100)}%</span>
        </div>
        <div class="h-1.5 bg-slate-200 rounded-full overflow-hidden"><div class="h-full ${r.me ? 'bg-amber-400' : 'bg-sky-500'}" style="width:${(r.dmg / top) * 100}%"></div></div>
      </div>`).join('');
  },

  renderDmgMeter() {
    const el = $('#dmg-meter');
    if (!el || el.classList.contains('hidden')) return;
    const now = performance.now();
    if (this.dmgMeterAt && now - this.dmgMeterAt < 500) return;   // 0.5초마다
    this.dmgMeterAt = now;
    el.innerHTML = this.dmgTableHtml(this.dmgRows());
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
      const n = Number((c.ultLv || {})[uid]) || 1;
      badges.push(`<span class="${base} border-amber-500 bg-amber-100 text-amber-900">${u.icon} ${u.name}${n > 1 ? ` ×${n}` : ''}</span>`);
    }
    for (const { cb, tier } of SPELLS.activeCombos(c)) { // 🔗 조합 (단계 = Lv.2/5/8/12, 각성은 ★). HUD(withStats=false)는 짧게
      const lvTxt = tier >= 4 ? '★각성' : 'Lv.' + SPELLS.comboTierLv(tier);
      const label = withStats ? `${cb.icon} ${escapeHtml(cb.name)} ${lvTxt}` : `${cb.icon} ${lvTxt}`;
      badges.push(`<span class="${base} border-slate-900 text-white" style="background:${safeColor(cb.color)}" title="${escapeHtml(cb.name)}">${label}</span>`);
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
      const label = CONFIG.DIFFICULTY[btn.dataset.diff]?.label;
      if (label && btn.textContent !== label) btn.textContent = label;
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

  // ── 계정 영역 (타이틀) ──
  renderAccount() {
    const en = ACCOUNT.enabled();
    const inn = ACCOUNT.loggedIn();
    $('#input-pw').classList.toggle('hidden', !en);
    $('#acc-buttons').classList.toggle('hidden', !en);
    $('#id-hint').textContent = en ? '' : '(비번 없음)';
    $('#acc-out').classList.toggle('hidden', inn);
    $('#acc-in').classList.toggle('hidden', !inn);
    $('#btn-ranking').classList.toggle('hidden', !RANKING.enabled());
    if (inn) {
      $('#acc-name').innerHTML = `${titleHtml(ACCOUNT.myTitle())}${escapeHtml(ACCOUNT.state.id)}`;
      $('#input-name').value = ACCOUNT.state.id;
      const t = ACCOUNT.state.data.tickets;
      $('#acc-tickets').textContent = t ? `(뽑기권 ${t})` : '';
      $('#acc-status').textContent = ACCOUNT.status;
    }
    if (!$('#modal-relics').classList.contains('hidden')) this.renderRelics();
    this.renderProfile();
  },

  async authFlow(action) {
    const btns = [$('#btn-login'), $('#btn-register')];
    btns.forEach((b) => { b.disabled = true; });
    const r = await ACCOUNT[action]($('#input-name').value, $('#input-pw').value);
    btns.forEach((b) => { b.disabled = false; });
    if (!r.ok) { this.toast(r.error || '실패'); return; }
    $('#input-pw').value = '';
    this.toast(action === 'register' ? `가입 완료! 뽑기권 1장 선물 🎟` : `어서 와요, ${ACCOUNT.state.id}!`);
    this.renderAccount();
  },

  // 타이틀: 광기 1위 공개 (광기 기록이 없으면 만용 1위). 1분에 한 번만 새로 불러옴
  async renderHardChampion() {
    const el = $('#hard-champion');
    if (!el || !RANKING.enabled()) return;
    if (this.championAt && Date.now() - this.championAt < 60000) return;
    this.championAt = Date.now();
    try {
      let diff = 'hell';
      let top = (await RANKING.top('hell'))[0];
      if (!top) { diff = 'hard'; top = (await RANKING.top('hard'))[0]; }
      if (!top) { el.classList.add('hidden'); return; }
      const stage = top.cleared ? '👑 클리어' : `STAGE ${Number(top.stage)}`;
      el.innerHTML = `🔥 ${escapeHtml(CONFIG.DIFFICULTY[diff].label)} 1위 · ${titleHtml(top.title)}${escapeHtml(top.id)}${top.manual ? ' 🕹️' : ''} · ${stage} · Lv.${Number(top.lv)}`;
      el.classList.remove('hidden');
    } catch (_) {
      this.championAt = 0; // 실패하면 다음에 다시
    }
  },

  // ── 랭킹 모달 ──
  openRanking(diff) {
    this.rankingDiff = diff || this.rankingDiff || ENGINE.difficulty;
    $('#modal-ranking').classList.remove('hidden');
    this.loadRanking(this.rankingDiff);
  },

  async loadRanking(diff) {
    this.rankingDiff = diff;
    $('#ranking-tabs').innerHTML = Object.entries(CONFIG.DIFFICULTY).map(([k, d]) =>
      `<button data-rank-diff="${k}" class="arcade-btn py-1.5 px-1 rounded-lg text-[11px] font-black cursor-pointer leading-tight ${k === diff ? 'bg-slate-900 text-white' : 'bg-white text-slate-700'}">${d.label}</button>`
    ).join('');
    const box = $('#ranking-list');
    box.innerHTML = '<div class="text-center text-xs font-bold text-slate-400 py-8">불러오는 중…</div>';
    $('#ranking-hint').textContent = ACCOUNT.loggedIn() ? '아이디·난이도별 최고 기록 1개 · 🕹️ = 수동 조작 기록' : '로그인하면 내 기록도 랭킹에 올라가요';
    let list;
    try {
      list = await RANKING.top(diff);
    } catch (_) {
      if (this.rankingDiff === diff) box.innerHTML = '<div class="text-center text-xs font-bold text-rose-500 py-8">랭킹을 불러오지 못했어요 (인터넷 확인)</div>';
      return;
    }
    if (this.rankingDiff !== diff) return; // 그 사이 탭 바뀜
    if (!list.length) { box.innerHTML = '<div class="text-center text-xs font-bold text-slate-400 py-8">아직 기록이 없어요. 1등 해보세요!</div>'; return; }
    const myId = ACCOUNT.loggedIn() ? ACCOUNT.state.id : null;
    const medal = ['🥇', '🥈', '🥉'];
    const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    box.innerHTML = list.map((r, i) => {
      const me = r.id === myId;
      const stage = r.cleared ? '👑 클리어' : `STAGE ${Number(r.stage)}`;
      return `<div class="flex items-center gap-2 px-3 py-1.5 rounded-lg border ${me ? 'border-amber-500 bg-amber-50' : 'border-slate-200 bg-white'}">
        <span class="w-7 text-center text-sm font-black">${medal[i] || i + 1}</span>
        <span class="flex-1 min-w-0 truncate text-xs font-black text-slate-900">${titleHtml(r.title)}${escapeHtml(r.id)}${r.manual ? ' 🕹️' : ''}</span>
        <span class="text-xs font-black ${r.cleared ? 'text-amber-700' : 'text-slate-700'}">${stage}</span>
        <span class="w-12 text-right text-[11px] font-bold text-slate-500">Lv.${Number(r.lv)}</span>
        <span class="w-12 text-right text-[11px] font-bold text-slate-400">${fmtTime(Number(r.playSec) || 0)}</span>
      </div>`;
    }).join('');
  },

  // ── 유물 모달 ──
  openRelics() {
    this.renderRelics();
    $('#modal-relics').classList.remove('hidden');
  },

  renderRelics() {
    const d = ACCOUNT.state?.data;
    if (!d) return;
    $('#relic-hearts').innerHTML = Object.entries(CONFIG.HEARTS).map(([k, h]) => {
      const have = d.fragments[k] || 0;
      const can = have >= h.perTicket;
      return `<div class="rounded-xl border-2 border-slate-200 bg-white p-2 text-center flex flex-col items-center">
        <div class="text-lg">${h.icon}</div>
        <div class="text-[10px] font-black text-slate-600 leading-tight">${h.name}</div>
        <div class="text-xs font-black text-slate-900">${have} / ${h.perTicket}</div>
        <button data-exchange="${k}" class="arcade-btn mt-1 w-full py-0.5 rounded-md text-[10px] font-black ${can ? 'bg-sky-300 hover:bg-sky-200 cursor-pointer' : 'bg-slate-100'}" ${can ? '' : 'disabled'}>뽑기권으로</button>
      </div>`;
    }).join('');
    if (!this.relicSpinning) $('#relic-reel').textContent = `🎟 뽑기권 ${d.tickets}장`;
    $('#btn-relic-draw').disabled = this.relicSpinning || d.tickets <= 0;
    $('#relic-eq-count').textContent = String(d.equipped.length);
    $('#relic-grid').innerHTML = Object.entries(CONFIG.RELICS).map(([id, def]) => {
      const lv = d.relics[id];
      if (!lv) {
        return `<div class="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-2 text-[11px] font-black text-slate-400">❓ ???</div>`;
      }
      const eq = d.equipped.includes(id);
      return `<button data-relic="${id}" class="text-left rounded-xl border-2 p-2 cursor-pointer ${eq ? 'border-amber-500 bg-amber-50' : 'border-slate-300 bg-white hover:bg-slate-50'}">
        <div class="text-xs font-black text-slate-900">${def.icon} ${def.name} <span class="text-amber-700">Lv.${lv}</span></div>
        <div class="text-[10px] font-bold text-slate-600">${RELICS.desc(id, lv)}${eq ? ' · ✔ 장착' : ''}</div>
      </button>`;
    }).join('');
  },

  playRelicDraw() {
    if (this.relicSpinning) return;
    const res = ACCOUNT.draw();
    if (!res) { this.toast(ACCOUNT.state?.data.tickets > 0 ? '모든 유물이 최대 레벨이에요!' : '뽑기권이 없어요'); return; }
    this.relicSpinning = true;
    this.renderRelics();
    // 룰렛: 유물과 꽝을 섞어서 돌림
    const reelItems = Object.values(CONFIG.RELICS).map((r) => `${r.icon} ${r.name}`);
    CONFIG.RELIC_BLANKS.forEach((b, i) => reelItems.splice(i * 2 + 1, 0, b));
    const reel = $('#relic-reel');
    let tick = 0;
    const timer = setInterval(() => {
      reel.textContent = reelItems[(tick * 3) % reelItems.length];
      tick++;
      if (tick >= 18) {
        clearInterval(timer);
        if (res.blank) {
          reel.textContent = `${res.text}… 꽝! ㅋㅋ`;
          SFX.play('poop');
        } else {
          const def = CONFIG.RELICS[res.id];
          reel.textContent = `${def.icon} ${def.name} ${res.isNew ? 'NEW!' : `Lv.${res.lv}!`}`;
          SFX.play('golden');
        }
        setTimeout(() => { this.relicSpinning = false; this.renderAccount(); this.renderRelics(); }, 1300);
      }
    }, 70);
  },

  // 타이틀: 현재 아이디의 최고 기록 + 최근 아이디 버튼
  renderProfile() {
    const id = PROFILE.currentId();
    const diffs = Object.entries(CONFIG.DIFFICULTY);
    const fmt = (mode) => diffs.map(([k, d]) => {
      const b = PROFILE.best(id, mode, k);
      if (!b) return `${d.short} -`;
      return `${d.short} ${d.ending && b.stage > CONFIG.ENDING_STAGE ? '👑' : b.stage}`; // 👑 = 엔딩 클리어 (광기는 숫자)
    }).join(' · ');
    const soloEl = $('#solo-records');
    if (soloEl) soloEl.textContent = `🏆 최고 스테이지  ${fmt('solo')}`;
    const onEl = $('#online-records');
    if (onEl) onEl.textContent = `🤝 파티 ${fmt('party')}  |  ⚔️ 우승 ${PROFILE.data.profiles[id]?.wins || 0}회`;

    const box = $('#recent-ids');
    if (box) {
      box.innerHTML = '';
      for (const rid of PROFILE.recentIds()) {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `px-2 py-0.5 rounded-md border text-[10px] font-black cursor-pointer ${rid === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-300'}`;
        chip.textContent = rid;
        chip.addEventListener('click', () => {
          $('#input-name').value = rid;
          this.renderProfile();
        });
        box.appendChild(chip);
      }
    }
  },

  showOnlineGameOver(title, desc, cleared = false, quit = false) {
    ENGINE.runEnded = true;
    ENGINE.userPaused = false;
    $('#modal-pause').classList.add('hidden');
    $('#paused-banner').classList.add('hidden');
    $('#on-over-title').textContent = desc ? `${title} ${desc}` : title;
    $('#btn-on-rematch').classList.toggle('hidden', !NET.isHost);
    $('#on-over-hint').classList.toggle('hidden', NET.isHost);
    this.renderBuildSummary($('#on-over-build'), ENGINE.getLocalChar());
    const dmgBox = $('#on-over-dmg');                                 // 📊 파티 딜량 결산
    if (dmgBox) {
      const party = NET.matchType === 'party';
      dmgBox.classList.toggle('hidden', !party);
      if (party) dmgBox.innerHTML = this.dmgTableHtml(this.dmgRows(), true);
    }
    // 기록 저장 (경기당 1번)
    if (!ENGINE.recordSubmitted) {
      ENGINE.recordSubmitted = true;
      const me = ENGINE.getLocalChar();
      const id = PROFILE.currentId();
      const players = (ENGINE.world?.chars || []).filter((c) => !c.isSmallMob && (!ENGINE.isParty() || c.team === 1)).length || 1;
      if (ENGINE.isParty()) {
        ENGINE.recordIsNew = PROFILE.submit(id, 'party', ENGINE.difficulty, cleared ? CONFIG.ENDING_STAGE + 1 : Math.max(1, ENGINE.stage), me?.lv || 1).isNew;
        TELEMETRY.record(me, { mode: 'party', cleared, players, result: quit ? 'quit' : '' });
        if (cleared) {
          const frag = ACCOUNT.addFragment(ENGINE.difficulty); // 💛💙 파티 엔딩 조각 (각자)
          if (frag) UI.toast(`+1 ${frag.icon} ${frag.name}`);
        }
      } else {
        if (me && me.alive) PROFILE.addWin(id);
        TELEMETRY.record(me, { mode: 'versus', result: me && me.alive ? 'win' : 'lose', players });
      }
    }
    if (ENGINE.isParty() && ENGINE.recordIsNew) $('#on-over-title').textContent += '  🏆 신기록!';
    $('#modal-on-over').classList.remove('hidden');
  }
};
