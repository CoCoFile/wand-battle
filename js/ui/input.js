// 이벤트 바인딩: 버튼 클릭, 키보드(WASD/방향키 이동, 1·2·3 선택, R 리롤), 마우스 조준, 터치 드래그

Object.assign(UI, {
  bindEvents() {
    // 아이디: 마지막 아이디 복원, 입력할 때마다 기록 표시 갱신
    PROFILE.load();
    TELEMETRY.flush(); // 오프라인 때 밀린 기록 전송
    // 계정 & 유물
    ACCOUNT.restore();
    $('#btn-login').addEventListener('click', () => UI.authFlow('login'));
    $('#btn-register').addEventListener('click', () => UI.authFlow('register'));
    $('#input-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') UI.authFlow('login'); });
    $('#btn-logout').addEventListener('click', () => { ACCOUNT.logout(); UI.renderAccount(); });
    $('#btn-relics').addEventListener('click', () => UI.openRelics());
    $('#btn-ranking').addEventListener('click', () => UI.openRanking());
    $('#btn-ranking-close').addEventListener('click', () => $('#modal-ranking').classList.add('hidden'));
    $('#ranking-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('[data-rank-diff]');
      if (t) UI.loadRanking(t.dataset.rankDiff);
    });
    RANKING.flush(); // 밀린 랭킹 기록 전송
    UI.renderHardChampion();
    $('#btn-relics-close').addEventListener('click', () => $('#modal-relics').classList.add('hidden'));
    $('#btn-relic-draw').addEventListener('click', () => UI.playRelicDraw());
    $('#modal-relics').addEventListener('click', (e) => {
      const ex = e.target.closest('[data-exchange]');
      if (ex && !ex.disabled) { ACCOUNT.exchange(ex.dataset.exchange); UI.renderAccount(); UI.renderRelics(); return; }
      const rl = e.target.closest('[data-relic]');
      if (rl) { ACCOUNT.toggleEquip(rl.dataset.relic); UI.renderRelics(); }
    });
    UI.renderAccount();
    ACCOUNT.refresh().then(() => UI.renderAccount());
    $('#telemetry-note')?.classList.toggle('hidden', !TELEMETRY.enabled());
    if (PROFILE.data.lastId) $('#input-name').value = PROFILE.data.lastId;
    $('#input-name').addEventListener('input', () => UI.renderProfile());
    UI.renderProfile();
    // 타이틀 마법 도감 렌더링
    const spellList = $('#title-spell-list');
    if (spellList) {
      spellList.innerHTML = Object.values(CONFIG.MAGICS).map((m) => `
        <div class="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-slate-300" style="background:${m.bg}">
          <span>${m.icon}</span>
          <span class="truncate text-slate-900">${m.name}</span>
        </div>
      `).join('');
    }

    // 솔로 난이도 선택 (마지막 선택 기억)
    try {
      const saved = localStorage.getItem('wb-difficulty');
      if (saved && CONFIG.DIFFICULTY[saved]) ENGINE.difficulty = saved;
    } catch (_) {}
    document.querySelectorAll('.diff-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const inLobby = !!btn.closest('#lobby-diff-picker');
        if (inLobby && !NET.isHost) return;
        ENGINE.difficulty = btn.dataset.diff;
        try { localStorage.setItem('wb-difficulty', ENGINE.difficulty); } catch (_) {}
        UI.renderDifficulty();
        if (inLobby) NET.broadcastLobby();
      });
    });
    // 대기실 모드 선택 (방장만)
    document.querySelectorAll('#lobby-mode-picker .mode-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (!NET.isHost) return;
        NET.matchType = btn.dataset.mode;
        NET.broadcastLobby();
      });
    });
    UI.renderDifficulty();

    $('#btn-solo').addEventListener('click', () => ENGINE.startSolo());
    $('#btn-create-room').addEventListener('click', () => NET.createRoom());
    $('#btn-join-room').addEventListener('click', () => NET.joinRoom());

    $('#btn-copy-code').addEventListener('click', () => {
      const ta = document.createElement('textarea');
      ta.value = NET.roomCode;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      UI.toast('코드 복사됨');
    });

    $('#btn-add-bot').addEventListener('click', () => NET.addBot());
    $('#btn-rem-bot').addEventListener('click', () => NET.removeBot());
    $('#btn-leave-lobby').addEventListener('click', () => NET.leaveRoom());
    $('#btn-start-online').addEventListener('click', () => NET.startGame());

    $('#btn-sound').addEventListener('click', () => {
      SFX.enabled = !SFX.enabled;
      $('#btn-sound').textContent = SFX.enabled ? '🔊 ON' : '🔇 OFF';
    });

    try {
      const sp = Number(localStorage.getItem('wb-speed'));
      if (CONFIG.SOLO_SPEEDS.includes(sp)) ENGINE.soloSpeed = sp;
    } catch (_) {}
    $('#btn-speed').addEventListener('click', () => {
      if (ENGINE.mode === 'solo') ENGINE.cycleSoloSpeed();
    });

    $('#btn-manual-toggle').addEventListener('click', () => {
      if (ENGINE.manualAllowed()) ENGINE.toggleManualControl();
    });

    // ⏸️ 일시정지 / 🏳️ 중단
    $('#btn-pause').addEventListener('click', () => ENGINE.togglePause());
    $('#btn-resume').addEventListener('click', () => ENGINE.togglePause(false));
    $('#btn-give-up').addEventListener('click', () => ENGINE.giveUp());
    document.addEventListener('visibilitychange', () => {   // 다른 탭으로 가면 솔로 자동 일시정지
      if (document.hidden && ENGINE.mode === 'solo') ENGINE.togglePause(true);
    });

    $('#btn-quit-game').addEventListener('click', () => {
      if (ENGINE.mode === 'online') {
        NET.leaveRoom();
      } else {
        ENGINE.mode = 'idle';
        ENGINE.world = null;
        UI.hideAllModals();
        UI.showScreen('title');
      }
    });

    $('#btn-solo-reroll').addEventListener('click', () => ENGINE.rerollSoloChoice());
    $('#btn-on-reroll').addEventListener('click', () => {
      if (NET.isHost) {
        ENGINE.rerollOnlinePick(ENGINE.localId);
        UI.renderOnlineChoiceSlot();
      } else if (NET.hostConn && NET.hostConn.open) {
        NET.hostConn.send({ type: 'reroll' });
      }
    });

    // 키보드 단축키 (WASD/방향키 수동조작 + 1/2/3 선택 + R 리롤)
    window.addEventListener('keydown', (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const key = e.key;
      const lower = key.toLowerCase();

      if (lower === 'w' || key === 'ArrowUp') {
        ENGINE.input.up = true;
        if (ENGINE.mode === 'solo' && ENGINE.manualControl) e.preventDefault();
      } else if (lower === 's' || key === 'ArrowDown') {
        ENGINE.input.down = true;
        if (ENGINE.mode === 'solo' && ENGINE.manualControl) e.preventDefault();
      } else if (lower === 'a' || key === 'ArrowLeft') {
        ENGINE.input.left = true;
        if (ENGINE.mode === 'solo' && ENGINE.manualControl) e.preventDefault();
      } else if (lower === 'd' || key === 'ArrowRight') {
        ENGINE.input.right = true;
        if (ENGINE.mode === 'solo' && ENGINE.manualControl) e.preventDefault();
      }

      if ((key === 'Escape' || lower === 'p') && ENGINE.canPause()) {
        e.preventDefault();
        ENGINE.togglePause();
        return;
      }
      if (ENGINE.userPaused) return; // 일시정지 중엔 선택·리롤 단축키 막음

      if (key === '1' || key === '2' || key === '3') {
        const idx = Number(key) - 1;
        if (ENGINE.mode === 'solo' && !$('#modal-solo-choice').classList.contains('hidden')) {
          e.preventDefault();
          ENGINE.pickSoloChoice(idx);
        } else if (ENGINE.mode === 'online') {
          if (NET.isHost) {
            const me = ENGINE.getLocalChar();
            if (me && me.choiceQueue.length > 0 && me.choiceQueue[0].choices[idx]) {
              e.preventDefault();
              ENGINE.applyOnlinePick(ENGINE.localId, idx);
              UI.renderOnlineChoiceSlot();
            }
          } else if (NET.hostConn && NET.hostConn.open) {
            if (NET.clientChoiceQueue.length > 0 && NET.clientChoiceQueue[0].choices?.[idx]) {
              e.preventDefault();
              NET.hostConn.send({ type: 'pick', idx });
            }
          }
        }
      }


      if (lower === 'f' && ENGINE.mode === 'solo') {
        ENGINE.cycleSoloSpeed();
      }

      if (lower === 'r') {
        if (ENGINE.mode === 'solo' && !$('#modal-solo-choice').classList.contains('hidden')) {
          ENGINE.rerollSoloChoice();
        } else if (ENGINE.mode === 'online') {
          $('#btn-on-reroll').click();
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key;
      const lower = key.toLowerCase();
      if (lower === 'w' || key === 'ArrowUp') ENGINE.input.up = false;
      else if (lower === 's' || key === 'ArrowDown') ENGINE.input.down = false;
      else if (lower === 'a' || key === 'ArrowLeft') ENGINE.input.left = false;
      else if (lower === 'd' || key === 'ArrowRight') ENGINE.input.right = false;
    });

    window.addEventListener('blur', () => {
      ENGINE.input.up = false;
      ENGINE.input.down = false;
      ENGINE.input.left = false;
      ENGINE.input.right = false;
      ENGINE.input.touchActive = false;
    });

    // 캔버스 마우스 조준 & 터치 드래그 조작
    const canvasEl = $('#game-canvas');
    canvasEl.addEventListener('mousemove', (e) => {
      const pos = RENDER.clientToArena(e.clientX, e.clientY);
      ENGINE.input.mouseX = pos.x;
      ENGINE.input.mouseY = pos.y;
      ENGINE.input.hasMouse = true;
    });

    canvasEl.addEventListener('touchstart', (e) => {
      if (ENGINE.mode === 'solo' && ENGINE.manualControl && e.touches.length > 0) {
        e.preventDefault();
        const pos = RENDER.clientToArena(e.touches[0].clientX, e.touches[0].clientY);
        ENGINE.input.touchActive = true;
        ENGINE.input.touchX = pos.x;
        ENGINE.input.touchY = pos.y;
      }
    }, { passive: false });

    canvasEl.addEventListener('touchmove', (e) => {
      if (ENGINE.mode === 'solo' && ENGINE.manualControl && e.touches.length > 0) {
        e.preventDefault();
        const pos = RENDER.clientToArena(e.touches[0].clientX, e.touches[0].clientY);
        ENGINE.input.touchActive = true;
        ENGINE.input.touchX = pos.x;
        ENGINE.input.touchY = pos.y;
      }
    }, { passive: false });

    const endTouch = () => { ENGINE.input.touchActive = false; };
    canvasEl.addEventListener('touchend', endTouch);
    canvasEl.addEventListener('touchcancel', endTouch);

    $('#btn-next-stage').addEventListener('click', () => ENGINE.nextSoloStage());
    $('#btn-solo-retry').addEventListener('click', () => ENGINE.startSolo());
    $('#btn-ending-retry').addEventListener('click', () => ENGINE.startSolo());
    $('#btn-ending-home').addEventListener('click', () => {
      ENGINE.mode = 'idle';
      ENGINE.world = null;
      UI.hideAllModals();
      UI.showScreen('title');
    });
    $('#btn-solo-home').addEventListener('click', () => {
      ENGINE.mode = 'idle';
      ENGINE.world = null;
      UI.hideAllModals();
      UI.showScreen('title');
    });

    $('#btn-on-exit').addEventListener('click', () => NET.leaveRoom());
    $('#btn-on-rematch').addEventListener('click', () => NET.returnToLobby());
  }
});
