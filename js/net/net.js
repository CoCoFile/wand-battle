// 온라인(PeerJS P2P): 방 생성/참가, 대기실(봇 추가·제거), 메시지 송수신 라우팅, 정리/나가기
// 구조: 방장(host)이 시뮬레이션 전담 → 20Hz 스냅샷 전송 / 참가자는 렌더링 + pick·reroll 전송만

const NET = {
  active: false,
  isHost: false,
  peer: null,
  roomCode: '',
  conns: new Map(),
  hostConn: null,
  players: [],
  clientChoiceQueue: [],
  syncTimer: 0,
  matchType: 'versus', // 'versus'(대전) | 'party'(파티 협동)
  MAX_PLAYERS: 6,      // 실제로 싸우는 사람 (관전자 제외)
  MAX_TOTAL: 12,       // 관전자 포함 (11/27z9)

  // 👀 관전 (11/27z9): 관전자는 캐릭터 없이 경기 화면만 봄. 경기 중에 들어온 사람은 자동 관전 → 대기실로 돌아가면 참가자로
  activePlayers() { return this.players.filter((p) => !p.spectator); },
  amSpectator() { return !!this.players.find((p) => p.id === ENGINE.localId)?.spectator; },
  isRunning() {
    return ENGINE.mode === 'online' && ENGINE.world && !ENGINE.runEnded && $('#screen-game') && !$('#screen-game').classList.contains('hidden');
  },
  // 대기실 '👀 관전하기' 버튼
  toggleSpectate() {
    if (!this.active) return;
    const me = this.players.find((p) => p.id === ENGINE.localId);
    const want = !(me && me.spectator);
    if (this.isHost) this.setSpectator(ENGINE.localId, want);
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ type: 'spectate', on: want });
  },
  setSpectator(id, on) {
    const p = this.players.find((x) => x.id === id);
    if (!p || p.isBot) return;
    if (!on && this.activePlayers().length >= this.MAX_PLAYERS) {
      if (id === ENGINE.localId) UI.toast('참가 자리가 꽉 찼어요 (최대 6명)');
      else this.sendToPeer(id, { type: 'toast', text: '참가 자리가 꽉 찼어요 (최대 6명)' });
      return;
    }
    p.spectator = !!on;
    p.midJoin = false;
    this.broadcastLobby();
  },

  genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[randInt(0, chars.length - 1)];
    return code;
  },

  createRoom() {
    SFX.init();
    if (typeof Peer === 'undefined') {
      UI.toast('온라인 모듈 로드 실패 (인터넷 확인)');
      return;
    }
    this.cleanup();
    if ($('#chk-golden-only')) $('#chk-golden-only').disabled = false; // 방장만 바꿀 수 있음
    this.active = true;
    this.isHost = true;
    this.roomCode = this.genCode();
    const myName = sanitizeName($('#input-name').value, '방장 마법사');

    this.peer = new Peer(`wand-battle-${this.roomCode}`);
    // 중계 서버 연결이 끊기면(탭 백그라운드·네트워크 흔들림) 같은 방 코드로 다시 붙음 — 안 그러면 새 참가자가 방을 못 찾음 (11/27u)
    this.peer.on('disconnected', () => {
      if (this.peer && !this.peer.destroyed && this.isHost) {
        setTimeout(() => { try { if (this.peer && !this.peer.destroyed && this.peer.disconnected) this.peer.reconnect(); } catch (_) {} }, 1000);
      }
    });
    this.peer.on('open', (id) => {
      if (this.players.length) return;            // 재연결로 다시 open 된 경우
      ENGINE.localId = id;
      this.players = [{ id, name: myName, isHost: true, isBot: false, relics: ACCOUNT.equippedList(), title: ACCOUNT.myTitle() }];
      UI.openLobby();
      UI.toast(`방 코드: ${this.roomCode}`);
    });

    this.peer.on('connection', (conn) => {
      conn.on('data', (msg) => this.onHostReceive(conn, msg));
      conn.on('close', () => {
        this.conns.delete(conn.peer);
        this.players = this.players.filter((p) => p.id !== conn.peer);
        ENGINE.removeLeaver(conn.peer); // 경기 중에 나간 사람 정리
        this.broadcastLobby();
      });
    });

    this.peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && !this.players.length) { this.createRoom(); return; } // 방 코드 겹침 → 새 코드
      if (err.type === 'peer-unavailable') return;  // (방장 쪽에선 의미 없음)
      UI.toast(`네트워크 오류: ${err.type || err.message}`);
    });
  },

  // 참가: 10초 안에 방장과 연결 안 되면 한 번 더 시도, 그래도 안 되면 이유 안내 (11/27u)
  joinRoom(retry = 0) {
    SFX.init();
    if (typeof Peer === 'undefined') {
      UI.toast('온라인 모듈 로드 실패 (인터넷 확인)');
      return;
    }
    const code = ($('#input-room-code').value || '').replace(/[\s-]/g, '').toUpperCase();
    if (!code) {
      UI.toast('방 코드를 입력하세요');
      return;
    }
    this.cleanup();
    this.active = true;
    this.isHost = false;
    this.roomCode = code;
    const myName = sanitizeName($('#input-name').value, '도전자');

    if (retry === 0) UI.toast('방에 연결하는 중…');
    let opened = false;
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => {
      if (opened || !this.active || this.isHost) return;
      if (retry < 1) {
        UI.toast('연결이 느려요… 다시 시도 중');
        this.joinRoom(retry + 1);
      } else {
        UI.toast('방장과 직접 연결이 안 돼요 (와이파이↔데이터를 바꾸거나 방장이 방을 다시 열어 보세요)');
        this.leaveRoom();
      }
    }, 10000);

    this.peer = new Peer();
    this.peer.on('open', (id) => {
      ENGINE.localId = id;
      const conn = this.peer.connect(`wand-battle-${code}`, { reliable: true, serialization: 'json' }); // json: binarypack보다 빠름 (11/27t)
      this.hostConn = conn;
      conn.on('open', () => {
        opened = true;
        clearTimeout(this.joinTimer);
        conn.send({ type: 'join', name: myName, relics: ACCOUNT.equippedList(), title: ACCOUNT.myTitle() });
        UI.openLobby();
      });
      conn.on('data', (msg) => this.onClientReceive(msg));
      conn.on('close', () => {
        if (!this.active) return;
        UI.toast('방장 연결 끊김');
        this.leaveRoom();
      });
    });

    this.peer.on('error', (err) => {
      if (opened) { UI.toast(`네트워크 오류: ${err.type || ''}`); return; }
      clearTimeout(this.joinTimer);
      const t = err && err.type;
      if (t === 'peer-unavailable') UI.toast('방을 찾을 수 없어요 (코드 확인 / 방장이 방을 열어 뒀는지)');
      else if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') UI.toast('중계 서버 연결 실패 — 잠시 뒤 다시 시도');
      else if (t === 'browser-incompatible') UI.toast('이 브라우저는 온라인을 지원하지 않아요');
      else UI.toast(`참가 실패 (${t || '알 수 없음'})`);
      this.leaveRoom();
    });
  },

  addBot() {
    if (!this.isHost || this.activePlayers().length >= this.MAX_PLAYERS) return;
    const idx = this.players.filter((p) => p.isBot).length + 1;
    this.players.push({
      id: `bot_${Date.now()}_${idx}`,
      name: pickName(CONFIG.ENEMY_NAMES, this.players.map((p) => p.name)),
      isHost: false,
      isBot: true
    });
    this.broadcastLobby();
  },

  removeBot() {
    if (!this.isHost) return;
    for (let i = this.players.length - 1; i >= 0; i--) {
      if (this.players[i].isBot) {
        this.players.splice(i, 1);
        this.broadcastLobby();
        return;
      }
    }
  },

  broadcastLobby() {
    UI.renderLobbyPlayers();
    UI.renderLobbyMode();
    this.broadcast({ type: 'lobby', players: this.players, matchType: this.matchType, difficulty: ENGINE.difficulty, goldenOnly: !!$('#chk-golden-only')?.checked });
  },

  broadcast(msg) {
    for (const conn of this.conns.values()) {
      if (conn.open) conn.send(msg);
    }
  },

  sendToPeer(peerId, msg) {
    const conn = this.conns.get(peerId);
    if (conn && conn.open) conn.send(msg);
  },

  onHostReceive(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'join') {
      if (this.conns.has(conn.peer)) return; // 중복 join 무시
      if (this.players.length >= this.MAX_TOTAL) {
        conn.send({ type: 'full' });
        return;
      }
      this.conns.set(conn.peer, conn);
      // 경기 중에 들어오면: 이번 판은 관전, 대기실로 돌아가면 참가 (11/27z9 — 전엔 대기실에서 기다리기만 했음)
      const inGame = this.isRunning();
      const seatFull = this.activePlayers().length >= this.MAX_PLAYERS;
      this.players.push({
        id: conn.peer,
        name: sanitizeName(msg.name, '참가자'),
        relics: RELICS.sanitize(msg.relics),
        title: sanitizeTitle(msg.title),
        isHost: false,
        isBot: false,
        spectator: inGame || seatFull,
        midJoin: inGame && !seatFull
      });
      this.broadcastLobby();
      if (inGame) {
        conn.send({ type: 'start', matchType: this.matchType, difficulty: ENGINE.difficulty, goldenOnly: ENGINE.goldenOnly, spectate: true });
        this.forceFull = true; // 다음 스냅샷에 캐릭터 정보 전부
      } else if (seatFull) {
        conn.send({ type: 'toast', text: '참가 자리가 꽉 차서 관전으로 들어왔어요' });
      }
    } else if (msg.type === 'pick') {
      if (Number.isInteger(msg.idx) && msg.idx >= 0 && msg.idx < 3) ENGINE.applyOnlinePick(conn.peer, msg.idx);
    } else if (msg.type === 'reroll') {
      ENGINE.rerollOnlinePick(conn.peer);
    } else if (msg.type === 'spectate') {
      if (!this.isRunning()) this.setSpectator(conn.peer, msg.on === true);
    }
  },

  onClientReceive(msg) {
    if (!msg || typeof msg !== 'object') return;
    // 대기 중(경기 화면 아님)이면 경기 연출·종료 메시지는 무시
    const onGame = $('#screen-game') && !$('#screen-game').classList.contains('hidden');
    if (!onGame && (msg.type === 'dramatic' || msg.type === 'ultMini' || msg.type === 'roulette' || msg.type === 'bossUlt' || msg.type === 'gameover' || msg.type === 'state')) return;
    if (msg.type === 'full') {
      UI.toast('방이 꽉 찼어요');
      this.leaveRoom();
    } else if (msg.type === 'wait') {
      UI.toast('지금 게임 중이에요 — 이번 판이 끝나면 같이 해요');
    } else if (msg.type === 'toast') {
      if (typeof msg.text === 'string') UI.toast(msg.text.slice(0, 80));
    } else if (msg.type === 'lobby') {
      this.players = Array.isArray(msg.players) ? msg.players : [];
      if (msg.matchType === 'party' || msg.matchType === 'versus') this.matchType = msg.matchType;
      if (CONFIG.DIFFICULTY[msg.difficulty]) ENGINE.difficulty = msg.difficulty;
      const g = $('#chk-golden-only');
      if (g) { g.checked = msg.goldenOnly === true; g.disabled = true; }
      UI.renderLobbyPlayers();
      UI.renderLobbyMode();
    } else if (msg.type === 'start') {
      if (msg.matchType === 'party' || msg.matchType === 'versus') this.matchType = msg.matchType;
      if (CONFIG.DIFFICULTY[msg.difficulty]) ENGINE.difficulty = msg.difficulty;
      ENGINE.goldenOnly = msg.goldenOnly === true;
      this.clientChoiceQueue = [];
      ENGINE.world = null;
      this.enterMatchScreen();
      if (msg.spectate) UI.toast('👀 게임 중이라 관전으로 들어왔어요 — 이번 판 끝나면 같이 해요');
    } else if (msg.type === 'state') {
      this.applySnapshot(msg.snap);
    } else if (msg.type === 'fragment') {
      if (CONFIG.HEARTS[msg.diff]) {
        const frag = ACCOUNT.addFragment(msg.diff);
        if (frag) UI.toast(`+1 ${frag.icon} ${frag.name}`);
      }
    } else if (msg.type === 'dramatic') {
      UI.showDramatic(msg.text, msg.color, msg.sub || '', msg.style || '');
    } else if (msg.type === 'roulette') {
      UI.playRoulette(msg.label, msg.tone, msg.twist === true);
    } else if (msg.type === 'ultMini') {
      UI.showUltMini(msg.text, msg.color, msg.who || '');
    } else if (msg.type === 'bossUlt') {
      UI.showBossUlt(msg.name, msg.text, msg.icon);
    } else if (msg.type === 'gameover') {
      UI.showOnlineGameOver(msg.title, msg.desc, msg.cleared === true, msg.quit === true);
    } else if (msg.type === 'back_lobby') {
      $('#modal-on-over').classList.add('hidden');
      UI.openLobby();
    }
  },

  cleanup() {
    clearTimeout(this.joinTimer);
    this.active = false;
    this.isHost = false;
    this.conns.clear();
    this.players = [];
    this.clientChoiceQueue = [];
    if (this.hostConn) {
      try { this.hostConn.close(); } catch (_) {}
      this.hostConn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
    }
  },

  leaveRoom() {
    this.cleanup();
    ENGINE.mode = 'idle';
    ENGINE.world = null;
    UI.hideAllModals();
    UI.showScreen('title');
  }
};
