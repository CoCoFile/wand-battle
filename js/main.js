// 메인 루프 & 시작점 (가장 마지막에 로드)

let lastTime = 0;
function gameLoop(ts) {
  if (!lastTime) lastTime = ts;
  const dt = Math.min(0.05, (ts - lastTime) / 1000);
  lastTime = ts;

  if (ENGINE.mode === 'solo') {
    ENGINE.update(dt);
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
