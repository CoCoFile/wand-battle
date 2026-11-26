// 아이디 & 최고 기록 (비밀번호 없음, 이 PC 브라우저의 localStorage에 저장)
// 아이디 = 타이틀의 아이디 칸 이름. 같은 이름이면 같은 기록으로 이어짐
// 기록: solo:<난이도> / party:<난이도> → { stage, lv, at }, 대전은 wins(우승 횟수)

const PROFILE = {
  KEY: 'wb-profiles',
  data: { lastId: '', profiles: {} },

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (raw && typeof raw === 'object' && raw.profiles && typeof raw.profiles === 'object') this.data = raw;
    } catch (_) {}
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (_) {}
  },

  // 아이디 칸 값 (비어 있으면 '손님')
  currentId() {
    return sanitizeName($('#input-name')?.value, '손님');
  },

  get(id) {
    if (!this.data.profiles[id]) this.data.profiles[id] = { created: Date.now(), lastPlayed: 0, plays: 0, wins: 0, records: {} };
    return this.data.profiles[id];
  },

  // 게임 시작 시 호출: 마지막 아이디 기억 + 판 수
  touch(id) {
    const p = this.get(id);
    p.plays = (p.plays || 0) + 1;
    p.lastPlayed = Date.now();
    this.data.lastId = id;
    this.save();
  },

  best(id, mode, diff) {
    return this.data.profiles[id]?.records?.[`${mode}:${diff}`] || null;
  },

  // 기록 제출 → { isNew, prev }
  submit(id, mode, diff, stage, lv) {
    const p = this.get(id);
    const key = `${mode}:${diff}`;
    const prev = p.records[key] || null;
    const isNew = !prev || stage > prev.stage || (stage === prev.stage && lv > prev.lv);
    if (isNew) p.records[key] = { stage, lv, at: Date.now() };
    this.save();
    return { isNew, prev };
  },

  addWin(id) {
    const p = this.get(id);
    p.wins = (p.wins || 0) + 1;
    this.save();
  },

  // 최근에 쓴 아이디 순
  recentIds(n = 4) {
    return Object.entries(this.data.profiles)
      .sort((a, b) => (b[1].lastPlayed || 0) - (a[1].lastPlayed || 0))
      .slice(0, n)
      .map(([id]) => id);
  }
};
