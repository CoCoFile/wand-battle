// 공통 유틸: $ 셀렉터, 난수, clamp, 거리/각도 계산, 레벨별 발사 수
// 의존성: 없음 (가장 먼저 로드)

const $ = (sel) => {
  const el = document.querySelector(sel);
  if (el && typeof el.text !== 'function') {
    el.text = (val) => {
      if (val === undefined) return el.textContent;
      el.textContent = val;
      return el;
    };
  }
  return el;
};
const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

function lerpAngle(a, b, t) {
  let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function angleDiff(a, b) {
  let d = (a - b + Math.PI) % (Math.PI * 2);
  if (d < 0) d += Math.PI * 2;
  return d - Math.PI;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return dist(px, py, x1, y1);
  const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
  return dist(px, py, x1 + t * dx, y1 + t * dy);
}

// 마법 레벨에 따른 동시 발사 수 (Lv.1 2발, 레벨당 +1발)
function spellShotCount(lv) {
  return Math.max(1, lv) + 1;
}

// 보안: innerHTML에 넣는 모든 외부 문자열은 escapeHtml, style 속성의 색은 safeColor 통과 필수
// (온라인에서는 닉네임·선택지 데이터가 다른 사람 PC에서 오기 때문)
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"'`]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;'
  }[ch]));
}

function safeColor(v, fallback = '#0f172a') {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback;
}

// 닉네임 정리: 문자열 강제, 제어문자/꺾쇠 제거, 공백 정리, 최대 10자
function sanitizeName(v, fallback) {
  const s = String(v ?? '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 10);
  return s || fallback;
}

// 이름 풀에서 겹치지 않게 하나 뽑기 (다 쓰면 겹침 허용)
function pickName(pool, used = []) {
  const free = pool.filter((n) => !used.includes(n));
  const src = free.length ? free : pool;
  return src[randInt(0, src.length - 1)];
}

// 머리 중심 → 완드 끝(마법 발사 위치) 거리
function wandTipDist(c) {
  return (c.r || CONFIG.HEAD_R) * CONFIG.WAND.tip;
}
