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
    this.active = true;
    this.isHost = true;
    this.roomCode = this.genCode();
    const myName = sanitizeName($('#input-name').value, '방장 마법사');

    this.peer = new Peer(`wand-battle-${this.roomCode}`);
    this.peer.on('open', (id) => {
      ENGINE.localId = id;
      this.players = [{ id, name: myName, isHost: true, isBot: false }];
      UI.openLobby();
      UI.toast(`방 코드: ${this.roomCode}`);
    });

    this.peer.on('connection', (conn) => {
      conn.on('data', (msg) => this.onHostReceive(conn, msg));
      conn.on('close', () => {
        this.conns.delete(conn.peer);
        this.players = this.players.filter((p) => p.id !== conn.peer);
        this.broadcastLobby();
      });
    });

    this.peer.on('error', (err) => {
      UI.toast(`네트워크 오류: ${err.type || err.message}`);
    });
  },

  joinRoom() {
    SFX.init();
    if (typeof Peer === 'undefined') {
      UI.toast('온라인 모듈 로드 실패 (인터넷 확인)');
      return;
    }
    const code = ($('#input-room-code').value || '').trim().toUpperCase();
    if (!code) {
      UI.toast('방 코드를 입력하세요');
      return;
    }
    this.cleanup();
    this.active = true;
    this.isHost = false;
    this.roomCode = code;
    const myName = sanitizeName($('#input-name').value, '도전자');

    this.peer = new Peer();
    this.peer.on('open', (id) => {
      ENGINE.localId = id;
      const conn = this.peer.connect(`wand-battle-${code}`, { reliable: true });
      this.hostConn = conn;
      conn.on('open', () => {
        conn.send({ type: 'join', name: myName });
        UI.openLobby();
      });
      conn.on('data', (msg) => this.onClientReceive(msg));
      conn.on('close', () => {
        UI.toast('방장 연결 끊김');
        this.leaveRoom();
      });
    });

    this.peer.on('error', () => {
      UI.toast('방을 찾을 수 없어요');
      this.leaveRoom();
    });
  },

  addBot() {
    if (!this.isHost || this.players.length >= 6) return;
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
    this.broadcast({ type: 'lobby', players: this.players, matchType: this.matchType, difficulty: ENGINE.difficulty });
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
      if (this.players.length >= 6) {
        conn.send({ type: 'full' });
        return;
      }
      this.conns.set(conn.peer, conn);
      this.players.push({
        id: conn.peer,
        name: sanitizeName(msg.name, '참가자'),
        isHost: false,
        isBot: false
      });
      this.broadcastLobby();
    } else if (msg.type === 'pick') {
      if (Number.isInteger(msg.idx) && msg.idx >= 0 && msg.idx < 3) ENGINE.applyOnlinePick(conn.peer, msg.idx);
    } else if (msg.type === 'reroll') {
      ENGINE.rerollOnlinePick(conn.peer);
    }
  },

  onClientReceive(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'full') {
      UI.toast('방이 꽉 찼어요');
      this.leaveRoom();
    } else if (msg.type === 'lobby') {
      this.players = Array.isArray(msg.players) ? msg.players : [];
      if (msg.matchType === 'party' || msg.matchType === 'versus') this.matchType = msg.matchType;
      if (CONFIG.DIFFICULTY[msg.difficulty]) ENGINE.difficulty = msg.difficulty;
      UI.renderLobbyPlayers();
      UI.renderLobbyMode();
    } else if (msg.type === 'start') {
      if (msg.matchType === 'party' || msg.matchType === 'versus') this.matchType = msg.matchType;
      if (CONFIG.DIFFICULTY[msg.difficulty]) ENGINE.difficulty = msg.difficulty;
      this.clientChoiceQueue = [];
      ENGINE.world = null;
      this.enterMatchScreen();
    } else if (msg.type === 'state') {
      this.applySnapshot(msg.snap);
    } else if (msg.type === 'dramatic') {
      UI.showDramatic(msg.text, msg.color, msg.sub || '');
    } else if (msg.type === 'gameover') {
      UI.showOnlineGameOver(msg.title, msg.desc);
    } else if (msg.type === 'back_lobby') {
      $('#modal-on-over').classList.add('hidden');
      UI.openLobby();
    }
  },

  cleanup() {
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
