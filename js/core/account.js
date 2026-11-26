// 계정(아이디+비밀번호) & 유물 데이터 — 서버: 구글 Apps Script (CONFIG.TELEMETRY_URL)
// 비밀번호는 서버에서 해시로만 저장. 로그인하면 토큰을 받아 이 브라우저에 보관(60일)
// 데이터: { fragments:{easy,normal,hard}, tickets, relics:{id:lv}, equipped:[id...] }
// 변경은 로컬에 먼저 저장(dirty) → 서버 저장. 오프라인이면 다음에 다시 시도

const ACCOUNT = {
  KEY: 'wb-account',
  state: null,          // { id, token, data, dirty }
  syncing: false,
  status: '',           // 저장 상태 표시용

  enabled() {
    return CONFIG.ACCOUNTS_ENABLED && TELEMETRY.enabled();
  },

  loggedIn() {
    return !!(this.enabled() && this.state && this.state.token);
  },

  restore() {
    try {
      const s = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (s && typeof s.id === 'string' && typeof s.token === 'string') {
        this.state = { id: s.id, token: s.token, data: this.clean(s.data), dirty: !!s.dirty };
      }
    } catch (_) {}
  },

  persist() {
    try {
      if (this.state) localStorage.setItem(this.KEY, JSON.stringify(this.state));
      else localStorage.removeItem(this.KEY);
    } catch (_) {}
  },

  // 서버에서 온/로컬 데이터 정리
  clean(d) {
    d = d && typeof d === 'object' ? d : {};
    const n = (v) => Math.max(0, Math.floor(Number(v) || 0));
    const relics = {};
    for (const [id, lv] of Object.entries(d.relics || {})) {
      if (CONFIG.RELICS[id]) relics[id] = Math.max(1, Math.min(CONFIG.RELIC_MAX_LV, n(lv)));
    }
    const equipped = (Array.isArray(d.equipped) ? d.equipped : []).filter((id) => relics[id]).slice(0, CONFIG.RELIC_SLOTS);
    return {
      fragments: { easy: n(d.fragments?.easy), normal: n(d.fragments?.normal), hard: n(d.fragments?.hard) },
      tickets: n(d.tickets),
      relics,
      equipped: [...new Set(equipped)]
    };
  },

  async call(action, payload) {
    const res = await fetch(CONFIG.TELEMETRY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...payload })
    });
    return res.json();
  },

  async auth(action, id, pw) {
    id = sanitizeName(id, '');
    if (!id) return { ok: false, error: '아이디를 입력하세요' };
    if (!pw || pw.length < 4) return { ok: false, error: '비밀번호는 4자 이상' };
    try {
      const r = await this.call(action, { id, pw });
      if (!r.ok) return r;
      this.state = { id, token: r.token, data: this.clean(r.data), dirty: false };
      this.persist();
      return { ok: true };
    } catch (_) {
      return { ok: false, error: '서버 연결 실패 (인터넷 확인)' };
    }
  },

  register(id, pw) { return this.auth('register', id, pw); },
  login(id, pw) { return this.auth('login', id, pw); },

  logout() {
    this.state = null;
    this.persist();
  },

  // 로그인 상태면 서버 최신 데이터로 갱신 (로컬에 안 보낸 변경이 있으면 먼저 저장)
  async refresh() {
    if (!this.loggedIn()) return;
    if (this.state.dirty) return this.sync();
    try {
      const r = await this.call('load', { id: this.state.id, token: this.state.token });
      if (r.ok) { this.state.data = this.clean(r.data); this.persist(); }
      else if (r.relogin) this.expire();
    } catch (_) {}
  },

  expire() {
    UI.toast('로그인이 만료됐어요. 다시 로그인해 주세요');
    this.logout();
    UI.renderAccount();
  },

  async sync() {
    if (!this.loggedIn() || !this.state.dirty || this.syncing) return;
    this.syncing = true;
    this.status = '저장 중…';
    UI.renderAccount();
    const sentRev = this.state.rev || 0; // 저장하는 동안 또 바뀌면 다시 저장
    try {
      const r = await this.call('save', { id: this.state.id, token: this.state.token, data: this.state.data });
      if (r.ok) { if ((this.state?.rev || 0) === sentRev) this.state.dirty = false; this.persist(); this.status = '저장됨'; }
      else if (r.relogin) { this.syncing = false; this.expire(); return; }
      else this.status = '저장 실패';
    } catch (_) {
      this.status = '오프라인 (나중에 저장)';
    }
    this.syncing = false;
    UI.renderAccount();
    if (this.state?.dirty && this.status === '저장됨') setTimeout(() => this.sync(), 0);
  },

  mutate(fn) {
    if (!this.loggedIn()) return;
    fn(this.state.data);
    this.state.data = this.clean(this.state.data);
    this.state.dirty = true;
    this.state.rev = (this.state.rev || 0) + 1;
    this.persist();
    this.sync();
  },

  // ── 유물 ──
  equippedList() {
    if (!this.loggedIn()) return [];
    const d = this.state.data;
    return d.equipped.map((id) => ({ id, lv: d.relics[id] || 1 }));
  },

  // 심장 조각 획득 → 반환: 조각 정보 (표시용)
  addFragment(diff, n = 1) {
    if (!this.loggedIn() || !CONFIG.HEARTS[diff]) return null;
    this.mutate((d) => { d.fragments[diff] = (d.fragments[diff] || 0) + n; });
    return CONFIG.HEARTS[diff];
  },

  exchange(diff) {
    const h = CONFIG.HEARTS[diff];
    if (!this.loggedIn() || !h || (this.state.data.fragments[diff] || 0) < h.perTicket) return false;
    this.mutate((d) => { d.fragments[diff] -= h.perTicket; d.tickets += 1; });
    return true;
  },

  // 뽑기: 최대 레벨 아닌 유물 중 랜덤 → 없으면 Lv.1, 있으면 레벨업. 반환 {id, lv, isNew} 또는 null
  draw() {
    if (!this.loggedIn() || this.state.data.tickets <= 0) return null;
    const d = this.state.data;
    const pool = Object.keys(CONFIG.RELICS).filter((id) => (d.relics[id] || 0) < CONFIG.RELIC_MAX_LV);
    if (!pool.length) return null;
    const id = pool[randInt(0, pool.length - 1)];
    const isNew = !d.relics[id];
    let lv = 0;
    this.mutate((dd) => {
      dd.tickets -= 1;
      dd.relics[id] = (dd.relics[id] || 0) + 1;
      lv = dd.relics[id];
      if (isNew && dd.equipped.length < CONFIG.RELIC_SLOTS) dd.equipped.push(id); // 빈 슬롯 있으면 자동 장착
    });
    return { id, lv, isNew };
  },

  toggleEquip(id) {
    if (!this.loggedIn() || !this.state.data.relics[id]) return;
    this.mutate((d) => {
      const i = d.equipped.indexOf(id);
      if (i >= 0) d.equipped.splice(i, 1);
      else if (d.equipped.length < CONFIG.RELIC_SLOTS) d.equipped.push(id);
      else UI.toast(`장착은 ${CONFIG.RELIC_SLOTS}개까지`);
    });
  }
};
