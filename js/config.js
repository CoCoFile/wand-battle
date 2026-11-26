// 게임 상수 & 데이터 테이블: 아레나 크기, 색상, 마법 8종 / 스탯 카드 5종 / 궁극기 3종 정보
// 크기·속도·체력·이름은 여기서 조정. ※ 마법별 피해·속도 등 수치는 js/spells/casters.js, 쿨타임은 js/spells/spells.js(baseCooldown)에 있음

const CONFIG = {
  GAME_VERSION: '2026.11.26d', // b: 충격파·화염구 너프, c: 만용 후반 완화 축소, d: 후반 완화 쉼터0.5/타협0.75/만용1.0  // 밸런스 바꿀 때마다 올리기 (수집 데이터에서 버전별 비교용)
  // 플레이 기록 수집 주소 (구글 Apps Script 웹 앱 /exec URL). 비워두면 수집 안 함
  TELEMETRY_URL: 'https://script.google.com/macros/s/AKfycbyCRCqR5cZPodxsXFBUpEwNUSXvQBr1qMMGUGpo5E41HJxSlZWXWgDIqgjhjf8iHdieVQ/exec',

  W: 1200,
  H: 800,

  // ── 크기 · 이동 ──────────────────────────────
  HEAD_R: 30,          // 마법사 몸 반지름
  SLIME_R: 18,         // 작은 슬라임
  BOSS_R: 46,          // 보스
  BASE_SPEED: 240,     // 이동 속도(px/s) — 아레나 가로 1200을 약 5초에 횡단 (빠르게 하고 싶으면 배속 사용)
  SHIELD_R: [50, 68],  // 마력 방패 궤도 반지름 [안쪽(Lv1~3), 바깥(Lv4~6)]
  // 완드 모양 (머리 반지름 r의 배수). tip = 마법이 나가는 위치
  SOLO_SPEEDS: [1, 2, 3], // 솔로 배속 단계 (⏩ 버튼 / F키로 순환)
  NAME_FONT_PX: 18,    // 머리 위 이름 글자 크기 (아레나 1200px 기준)
  WAND: { base: 1.25, tip: 2.45, width: 0.22, tipSize: 0.36, tipColor: '#F07F2E' },

  // ── 체력 ──────────────────────────────────────
  HP: {
    solo: 150,         // 솔로 플레이어 시작 HP
    online: 340,       // 온라인 시작 HP
    perLevel: 12       // 레벨업마다 최대 HP 증가 (레벨업 시 HP 전부 회복)
  },

  PLAYER_COLOR: '#FACC15', // 내 캐릭터 전용 색 (내 화면에서 나만 이 색). 아래 COLORS에 노란 계열 넣지 말 것
  COLORS: ['#2563EB', '#DC2626', '#16A34A', '#9333EA', '#EA580C', '#0891B2'],
  CHAR_COLLISION: true,    // 캐릭터끼리 겹치면 밀어내기 (무거울수록 덜 밀림: 반지름²)
  MAGICS: {
    laser:     { id: 'laser',     name: '레이저',      color: '#0EA5E9', bg: '#E0F2FE', icon: '⚡', desc: '즉발 관통 빔',          up: '굵기·피해·빔 수 ↑' },
    fireball:  { id: 'fireball',  name: '화염구',      color: '#F97316', bg: '#FFEDD5', icon: '🔥', desc: '튕기다 터지는 불덩이',  up: '폭발·피해·발사 수 ↑' },
    icespear:  { id: 'icespear',  name: '얼음 창',     color: '#06B6D4', bg: '#CFFAFE', icon: '❄️', desc: '관통 + 감속',          up: '관통·피해·발사 수 ↑' },
    poison:    { id: 'poison',    name: '독 플라스크', color: '#16A34A', bg: '#DCFCE7', icon: '🧪', desc: '독 장판 투척',          up: '장판·피해·발사 수 ↑' },
    boomerang: { id: 'boomerang', name: '부메랑 칼날', color: '#8B5CF6', bg: '#EDE9FE', icon: '🪃', desc: '갔다가 돌아오는 칼날',  up: '사거리·피해·발사 수 ↑' },
    shockwave: { id: 'shockwave', name: '충격파 링',   color: '#C026D3', bg: '#FAE8FF', icon: '◎', desc: '밀쳐내는 원형 파동',    up: '반경·피해·파동 수 ↑' },
    scatter:   { id: 'scatter',   name: '산탄 파편',   color: '#57534E', bg: '#F5F5F4', icon: '▲', desc: '튕기는 산탄',           up: '파편·피해 ↑' },
    shield:    { id: 'shield',    name: '마력 방패',   color: '#0284C7', bg: '#E0F2FE', icon: '🛡', desc: '공격을 막는 회전 방패', up: '방패 +1' }
  },
  // 스탯 카드 1장당 효과 (밸런스 조정은 여기서. 카드 설명 문구 STATS.desc도 같이 맞출 것)
  STAT_VALUES: {
    atk: 1.25,     // 피해 ×
    armor: 0.13,   // 받는 피해 -비율 (곱연산 누적)
    regen: 2.5,    // 초당 HP 회복 +
    area: 1.22,   // 범위 ×
    cdr: 0.86      // 쿨타임 × (작을수록 빠름)
  },
  STATS: {
    atk:   { id: 'atk',   name: '공격력',     icon: '⚔️', color: '#DC2626', bg: '#FEE2E2', desc: '피해 +25%' },
    armor: { id: 'armor', name: '방어력',     icon: '🛡️', color: '#2563EB', bg: '#DBEAFE', desc: '받는 피해 -13%' },
    regen: { id: 'regen', name: '체력 재생',  icon: '💚', color: '#059669', bg: '#D1FAE5', desc: '초당 HP +2.5' },
    area:  { id: 'area',  name: '마법 크기',  icon: '🔮', color: '#7C3AED', bg: '#EDE9FE', desc: '범위 +22%' },
    cdr:   { id: 'cdr',   name: '쿨타임',     icon: '⏱️', color: '#D97706', bg: '#FEF3C7', desc: '시전 속도 +14%' }
  },
  ULTIMATES: {
    stop:    { id: 'stop',    name: '멈춰!',             icon: '⏱', color: '#F59E0B', desc: '적 전체 3초 스턴' },
    killray: { id: 'killray', name: '파괴 광선',         icon: '⚡', color: '#EF4444', desc: '맞으면 즉사' },
    chaos:   { id: 'chaos',   name: '혼돈! 파괴! 망각!', icon: '🌀', color: '#9333EA', desc: '혼돈 장판 4개' },
    art:     { id: 'art',     name: '폭발은 예술이다!',   icon: '💥', color: '#EA580C', desc: '블랙홀 + 지뢰밭' }
  },

  // ── 솔로 난이도 ─────────────────────────────
  // healOrbLife: 회복 구슬 유지 시간(초). null = 안 사라짐, 0 = 회복 구슬 없음(경험치 구슬만)
  // enemyHp / enemyAtk: 일반 적 HP·공격력 배율, enemyCdr: 쿨타임 배율(작을수록 자주 쏨, 보스에도 적용)
  // bossHp / bossAtk: 보스 전용 배율 (보스엔 약하게 — 어려움 첫 보스가 벽이던 문제 11/26)
  // lateMult/lateFrom: 이 난이도만 후반 성장 완화를 따로 (없으면 SOLO 값)
  // ending: true면 ENDING_STAGE 클리어 시 엔딩 (만용은 끝없음 — 30 넘기면 winText 배너만 뜨고 계속)
  // winText: 엔딩(만용은 30 돌파) 문구, loseText: 게임오버·전멸 문구
  ENDING_STAGE: 30,
  DIFFICULTY: {
    easy:   { label: '겁쟁이들의 쉼터', short: '쉼터', ending: true,  winText: '겁쟁이들의 왕',        loseText: '이걸?ㅋㅋㅋㅋㅋㅋ',           healOrbLife: null, enemyHp: 1.0, enemyAtk: 1.0, enemyCdr: 1.0,  bossHp: 1.0,  bossAtk: 1.0,  lateMult: 0.5 },
    normal: { label: '현실에 타협',     short: '타협', ending: true,  winText: '현실에 안주한놈',      loseText: '걍 쉼터 가셈',               healOrbLife: 6,    enemyHp: 1.15, enemyAtk: 1.12, enemyCdr: 0.95, bossHp: 1.1,  bossAtk: 1.05, lateMult: 0.75 },
    hard:   { label: '만용 그자체',     short: '만용', ending: false, winText: '인정 무한모드 ㄱ?',    loseText: '용기와 만용은 한끗차이다',   healOrbLife: 0,    enemyHp: 1.5, enemyAtk: 1.45, enemyCdr: 0.85, bossHp: 1.25, bossAtk: 1.15, lateMult: 1.0 }
  },

  // ── 화염구 ─────────────────────────────────
  FIREBALL: {
    life: 1.0,         // 비행 시간(초) → 사거리 ≈ 속도(410+15lv) × life. 끝나면 그 자리에서 폭발
    fuse: 36           // 근접 신관: 적 몸에서 이 거리(px) 안에 들어오면 폭발
  },

  // ── 바운스 지뢰 (맵 곳곳, 피해 없음, 밟으면 튕겨나감, 1회용) ──
  // 솔로·파티: 스테이지마다 새로 깔림 / 대전: 경기 시작 때 깔림
  BOUNCE_MINES: {
    count: 7,
    r: 14,
    power: 950,        // 튕겨나가는 초기 속도(px/s)
    decay: 5           // 감속 (클수록 빨리 멈춤). 이동 거리 ≈ power / decay
  },

  // ── 궁극기 '폭발은 예술이다!' (블랙홀 + 지뢰) ──
  // 피해 = (기본 + 레벨당 × 시전자Lv) × 공격력 배율
  ART: {
    holeR: 180,        // 블랙홀 끌어당김 반경
    holeLife: 2.6,     // 블랙홀 유지 시간 → 끝나면 붕괴 대폭발
    pull: 300,         // 끌어당기는 속도(px/s, 가운데 가까울수록 셈)
    collapseR: 150, collapseDmg: [28, 4],
    mines: 8, mineRing: 110,          // 지뢰 개수, 블랙홀 중심에서 거리
    mineR: 85, mineDmg: [18, 3],      // 지뢰 폭발 반경/피해
    mineArm: 0.35                     // 지뢰 설치 후 작동까지(초)
  },

  // ── 계정 & 유물 ────────────────────────────
  // 계정 서버 = TELEMETRY_URL 의 Apps Script (tools/sheets-collector.gs 최신 버전 배포 필요)
  ACCOUNTS_ENABLED: true,    // 서버 스크립트(계정 기능 버전) 배포됨 (11/26)
  RELIC_SLOTS: 3,            // 장착 가능 개수
  RELIC_MAX_LV: 3,
  RELIC_BLANK_CHANCE: 0.25,  // 뽑기 꽝 확률 (뽑기권은 소모됨)
  RELIC_BLANKS: ['💩 똥', '🧦 냄새나는 양말', '🪨 그냥 돌멩이', '🥄 녹슨 숟가락', '📄 심규형의 반성문', '🦴 누군가의 뼈다귀'],
  // 심장 조각: 엔딩(만용은 30스테이지 돌파 + 이후 10스테이지마다) 때 1개. perTicket개 = 뽑기권 1장
  HEARTS: {
    easy:   { name: '겁쟁이의 심장 조각',     icon: '💛', perTicket: 5 },
    normal: { name: '타협한 자의 심장 조각',  icon: '💙', perTicket: 3 },
    hard:   { name: '만용의 심장 조각',       icon: '❤️‍🔥', perTicket: 1 }
  },
  // 유물: 솔로·파티에만 적용 (대전 X). v = Lv.1/2/3 수치
  RELICS: {
    staff:  { name: '파멸의 지팡이',     icon: '🪄', v: [4, 7, 10],    desc: (x) => `공격력 +${x}%` },
    cloak:  { name: '불멸의 망토',       icon: '🧥', v: [3, 5, 7],     desc: (x) => `받는 피해 -${x}%` },
    herb:   { name: '세계수의 잎',       icon: '🍃', v: [0.5, 1, 1.5], desc: (x) => `초당 HP +${x}` },
    coffee: { name: '시간술사의 모래시계', icon: '⏳', v: [3, 5, 7],     desc: (x) => `쿨타임 -${x}%` },
    lens:   { name: '현자의 눈',         icon: '👁️', v: [4, 7, 10],    desc: (x) => `범위 +${x}%` },
    heart:  { name: '거인의 심장',       icon: '🫀', v: [15, 30, 45],  desc: (x) => `최대 HP +${x}` },
    coin:   { name: '운명의 금화',       icon: '🪙', v: [1, 2, 3],     desc: (x) => `리롤 +${x >= 3 ? 2 : 1}${x >= 2 ? ', 황금카드 +5%p' : ''}` },
    shoes:  { name: '질풍의 장화',       icon: '🌪️', v: [5, 10, 15],   desc: (x) => `이동속도 +${x}%` },
    book:   { name: '고대 마도서',       icon: '📜', v: [8, 14, 20],   desc: (x) => `경험치 +${x}%` },
    magnet: { name: '탐욕의 손아귀',     icon: '✋', v: [20, 40, 60],  desc: (x) => `구슬 흡수 범위 +${x}` }
  },

  // ── 파티 모드 (온라인 협동) ─────────────────
  PARTY: {
    prepTime: 5,       // 시작 후 첫 스테이지까지 준비 시간(초) — 시작 마법 고르기
    clearDelay: 3,     // 클리어 후 다음 스테이지까지(초)
    reviveHp: 0.5,     // 쓰러진 동료 부활 시 HP 비율
    enemyCountPer: 0.5, // 인원 1명 늘 때마다 적 마법사 수 +50%
    bossHpPer: 0.6      // 인원 1명 늘 때마다 보스 HP +60%
  },

  // ── 경험치 곡선 ─────────────────────────────
  // 다음 레벨 필요 경험치 = 이전 × mult + add (Lv.1→2는 start)
  XP: { start: 60, mult: 1.1, add: 25 },   // 11/26: 1.24+18 → 후반 성장이 멈춰서 완화

  // ── 솔로 스테이지 밸런스 (= 쉬움 기준, 난이도 배율이 위에 곱해짐) ──
  // [기본값, 스테이지당 증가] → 스테이지 n 값 = 기본값 + 증가 × (n−1)
  SOLO: {
    // 후반 성장 완화: lateFrom 스테이지 이후엔 적 HP·공격력·쿨타임의 스테이지당 증가폭 × lateMult (경험치·마리 수는 그대로)
    lateFrom: 7, lateMult: 0.5,
    mage: {
      count: [2, 1], countMax: 7,     // 일반 스테이지 마법사 수
      bossStageCount: [2, 0.34],      // 보스 스테이지 마법사 수 (보스와 함께)
      hp: [40, 20],
      atk: [0.45, 0.07],
      cdr: [1.55, -0.06], cdrMin: 0.8, // 클수록 느리게 쏨
      xp: [40, 6],
      extraMagicFrom: 3, extraMagicMax: 3 // 이 스테이지부터 레이저 외 랜덤 마법 추가
    },
    boss: {
      every: 3,
      hp: [420, 110],                  // n = 스테이지 번호 그대로 (3, 6, 9...)에 적용
      atk: [0.42, 0.06],              // 밸런스(11/26): 0.6+0.05 → 첫 보스 약하게, 후반 보스는 비슷
      cdr: 1.15,
      xp: 130,
      magics: { laser: 2, fireball: 2, shockwave: 1, shield: 2 }
    },
    slime: { count: 4, hp: [14, 4], xp: 20 }
  },

  // ── 적 이름 (솔로 적 · 온라인 봇) ─────────────
  ENEMY_NAMES: [
    '86세 마법사 오덕세', '3수생 마법사 김재수', '야근 마법사 박과장', '주식 물린 최존버',
    '자칭 대마법사 허세왕', '할부 남은 윤지팡이', '월세 밀린 강체납', '3대 500 마동팔',
    '칼퇴 마법사 정시퇴', '마법 유튜버 구독좀', '거북목 마법사 한목뼈', '길치 마법사 어디야',
    '주문 까먹은 어버버', '코인 몰빵 떡상각', '102세 현역 정정해', '다이어트 중 치킨각',
    '와이파이 찾는 연결중', '짠돌이 마법사 영수증', 'MBTI 신봉자 엔프피', '잠 못 잔 피곤해',
    '퇴사각 마법사 사표씀', '마법학교 중퇴 장퇴학', '냥집사 마법사 츄르', '알람 끈 마법사 늦잠왕'
  ],
  BOSS_NAMES: [
    '👑 동네 대마왕 심규형', '👑 교장선생님 심규형', '👑 은퇴 거부 심규형',
    '👑 랭킹 1위 심규형', '👑 회식왕 심규형', '👑 건물주 심규형',
    '👑 마왕 간부 심규형', '👑 사천왕 심규형', '👑 마왕 심규형', '👑 대마왕 심규형' // 마지막 이름은 이후 계속 유지
  ]
};
