// 랭킹 (솔로 난이도별, 로그인 계정만) — 서버: Apps Script 'score'(토큰 필요) / 'top'(조회)
// 판이 끝나면 기록을 큐에 넣고 서버로 보냄 (서버가 아이디·난이도별 최고 기록만 유지). 오프라인이면 나중에

const RANKING = {
  KEY: 'wb-rank-pending',
  sending: false,

  enabled() {
    return CONFIG.RANKING_ENABLED && ACCOUNT.enabled();
  },

  _load() {
    try { const q = JSON.parse(localStorage.getItem(this.KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (_) { return []; }
  },
  _save(q) {
    try { localStorage.setItem(this.KEY, JSON.stringify(q.slice(-20))); } catch (_) {}
  },

  // 솔로 한 판 결과 제출 (로그인 상태에서만)
  submit({ difficulty, stage, lv, cleared }) {
    if (!this.enabled() || !ACCOUNT.loggedIn()) return;
    const q = this._load();
    q.push({
      id: ACCOUNT.state.id, mode: 'solo', difficulty, stage, lv, cleared: !!cleared,
      playSec: Math.round((Date.now() - (ENGINE.matchStartedAt || Date.now())) / 1000),
      manual: !!ENGINE.usedManual, version: CONFIG.GAME_VERSION
    });
    this._save(q);
    this.flush();
  },

  async flush() {
    if (!this.enabled() || !ACCOUNT.loggedIn() || this.sending || !navigator.onLine) return;
    this.sending = true;
    try {
      let q = this._load();
      while (q.length) {
        const item = q[0];
        if (item.id !== ACCOUNT.state.id) { q.shift(); this._save(q); continue; } // 다른 계정 기록은 버림
        const r = await ACCOUNT.call('score', { ...item, token: ACCOUNT.state.token });
        if (!r.ok && r.relogin) break;      // 로그인 만료 → 다시 로그인하면 재시도
        q = this._load();
        q.shift();
        this._save(q);
      }
    } catch (_) {
      // 오프라인 → 다음에
    } finally {
      this.sending = false;
    }
  },

  async top(difficulty) {
    const r = await ACCOUNT.call('top', { mode: 'solo', difficulty, limit: 30 });
    if (!r.ok) throw new Error(r.error || 'fail');
    return r.list || [];
  }
};
