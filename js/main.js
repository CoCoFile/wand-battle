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
    ENGINE.update(dt);
    NET.tickSync(dt);
    UI.updateHUD();
  }

  RENDER.draw();
  requestAnimationFrame(gameLoop);
}

window.onload = function () {
  RENDER.init();
  UI.bindEvents();
  requestAnimationFrame(gameLoop);
};
