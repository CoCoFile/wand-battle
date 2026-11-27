// 메인 루프 & 시작점 (가장 마지막에 로드)

let lastTime = 0;
function gameLoop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;

  if (ENGINE.mode === 'solo') {
    // 배속: 같은 dt로 여러 번 돌림 (한 번에 큰 dt를 쓰면 충돌이 뚫림)
    for (let i = 0; i < ENGINE.soloSpeed; i++) ENGINE.update(dt);
    UI.updateHUD();
  } else if (ENGINE.mode === 'online' && NET.isHost) {
    // 온라인은 1.5배속 (CONFIG.ONLINE_SPEED): 작은 dt 두 번으로 나눠 돌림 (충돌 뚫림 방지)
    const sp = CONFIG.ONLINE_SPEED || 1;
    ENGINE.update(dt * sp / 2);
    ENGINE.update(dt * sp / 2);
    NET.tickSync(dt);
    UI.updateHUD();
  } else if (ENGINE.mode === 'online' && NET.active) {
    NET.smoothClient();   // 참가자: 스냅샷 사이 보간
  }

  RENDER.draw();
  requestAnimationFrame(gameLoop);
}

window.onload = function () {
  RENDER.init();
  UI.bindEvents();
  requestAnimationFrame(gameLoop);
};
