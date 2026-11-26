// 플레이 기록 수집 (밸런스 조정용) → 구글 시트 (Apps Script 웹 앱)
// CONFIG.TELEMETRY_URL 이 비어 있으면 아무것도 안 보냄.
// 판이 끝날 때마다 기록을 localStorage 큐에 넣고, 인터넷 되면 전송 → 성공한 것만 큐에서 뺌 (오프라인이면 다음에 보냄)

const TELEMETRY = {
  KEY: 'wb-telemetry-queue',
  MAX_QUEUE: 200,
  sending: false,

  enabled() {
    return typeof CONFIG.TELEMETRY_URL === 'string' && /^https:\/\//.test(CONFIG.TELEMETRY_URL);
  },

  _load() {
    try { const q = JSON.parse(localStorage.getItem(this.KEY) || '[]'); return Array.isArray(q) ? q : []; } catch (_) { return []; }
  },
  _save(q) {
    try { localStorage.setItem(this.KEY, JSON.stringify(q.slice(-this.MAX_QUEUE))); } catch (_) {}
  },

  // 한 판 결과 기록. c = 내 캐릭터, extra = { mode, cleared, result, players }
  record(c, extra = {}) {
    if (!this.enabled() || !c) return;
    const list = (obj) => Object.entries(obj || {}).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(',');
    const rec = {
      ts: new Date().toISOString(),
      version: CONFIG.GAME_VERSION,
      id: PROFILE.currentId(),
      mode: extra.mode || ENGINE.mode,
      difficulty: extra.mode === 'versus' ? '' : ENGINE.difficulty,
      stage: Math.max(1, ENGINE.stage || 1),
      cleared: !!extra.cleared,
      result: extra.result || '',
      lv: c.lv || 1,
      playSec: Math.round((Date.now() - (ENGINE.matchStartedAt || Date.now())) / 1000),
      gameSec: Math.round(ENGINE.world?.time || 0),
      magics: list(c.magics),
      stats: list(c.statCounts),
      ultimates: (c.ultimates || []).join(','),
      players: extra.players || 1,
      manual: ENGINE.mode === 'solo' ? !!ENGINE.manualControl : '',
      speed: ENGINE.mode === 'solo' ? ENGINE.soloSpeed : '',
      relics: (c.relics || []).map((r) => `${r.id}:${r.lv}`).join(',')
    };
    const q = this._load();
    q.push(rec);
    this._save(q);
    this.flush();
  },

  // 큐 전송 (no-cors: 응답은 못 읽지만, 네트워크로 나갔으면 성공으로 보고 큐에서 뺌)
  async flush() {
    if (!this.enabled() || this.sending || !navigator.onLine) return;
    this.sending = true;
    try {
      let q = this._load();
      while (q.length) {
        await fetch(CONFIG.TELEMETRY_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(q[0])
        });
        q = this._load();
        q.shift();
        this._save(q);
      }
    } catch (_) {
      // 오프라인/실패 → 다음 기회에
    } finally {
      this.sending = false;
    }
  }
};

window.addEventListener('online', () => TELEMETRY.flush());
