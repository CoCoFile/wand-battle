// 유물 효과 적용 & 데이터 정리 (정의는 CONFIG.RELICS)
// 적용 시점: 솔로 시작(내 캐릭터), 파티 시작(각 플레이어가 보낸 장착 목록). 대전엔 적용 안 함

const RELICS = {
  // [{id, lv}] 형태로 정리 (모르는 id 제거, 레벨 1~MAX, 최대 슬롯 수, 중복 제거)
  sanitize(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const r of list) {
      const id = r && typeof r.id === 'string' ? r.id : null;
      if (!id || !CONFIG.RELICS[id] || seen.has(id)) continue;
      const lv = Math.max(1, Math.min(CONFIG.RELIC_MAX_LV, Math.floor(Number(r.lv) || 1)));
      seen.add(id);
      out.push({ id, lv });
      if (out.length >= CONFIG.RELIC_SLOTS) break;
    }
    return out;
  },

  value(id, lv) {
    const def = CONFIG.RELICS[id];
    return def ? def.v[Math.max(0, Math.min(def.v.length - 1, lv - 1))] : 0;
  },

  desc(id, lv) {
    const def = CONFIG.RELICS[id];
    return def ? def.desc(this.value(id, lv)) : '';
  },

  // 캐릭터에 유물 효과 적용
  apply(c, list) {
    if (!c) return;
    c.relics = this.sanitize(list);
    const rb = (c.relicBonus = {});   // 공격·방어·쿨감·범위(%)는 SPELLS.recalcStats 에서 카드와 합쳐 계산
    for (const { id, lv } of c.relics) {
      const x = this.value(id, lv);
      if (id === 'staff') rb.atk = x;
      else if (id === 'cloak') rb.armor = x;
      else if (id === 'herb') c.regen = (c.regen || 0) + x;
      else if (id === 'coffee') rb.cdr = x;
      else if (id === 'lens') rb.area = x;
      else if (id === 'heart') { c.maxHp += x; c.hp = c.maxHp; }
      else if (id === 'coin') { c.extraRerolls = 1; c.rerollsLeft = 2; c.goldenBonus = lv >= 2 ? 0.05 : 0; }
      else if (id === 'shoes') c.speed *= 1 + x / 100;
      else if (id === 'book') c.xpMult = 1 + x / 100;
      else if (id === 'magnet') c.pickupBonus = x;
    }
    SPELLS.recalcStats(c);
  }
};
