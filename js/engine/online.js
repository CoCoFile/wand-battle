// 온라인 레벨업 선택 처리 (방장 PC에서 실행; 클라이언트는 pick/reroll 메시지만 보냄)

Object.assign(ENGINE, {
  applyOnlinePick(charId, idx) {
    if (!this.world) return;
    const c = this.world.chars.find((ch) => ch.id === charId);
    if (!c || c.choiceQueue.length === 0) return;
    const item = c.choiceQueue[0];
    const chosen = item.choices[idx];
    if (!chosen) return;

    SPELLS.applyChoice(c, chosen, this.world);
    c.choiceQueue.shift();

    if (c.initialDrafts > 0) {
      c.initialDrafts--;
      if (c.initialDrafts > 0) {
        c.choiceQueue.unshift({
          isInitial: true,
          rerolls: 1 + (c.extraRerolls || 0),
          choices: SPELLS.generateInitialSpellChoices(c)
        });
      }
    }
  },

  rerollOnlinePick(charId) {
    if (!this.world) return;
    const c = this.world.chars.find((ch) => ch.id === charId);
    if (!c || c.choiceQueue.length === 0) return;
    const item = c.choiceQueue[0];
    if ((item.rerolls || 0) <= 0) return;
    item.rerolls--;
    item.choices = item.isInitial
      ? SPELLS.generateInitialSpellChoices(c)
      : SPELLS.generateChoices(c);
  }
});
