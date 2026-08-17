/* =========================================================
 * 복지마을 타이쿤 — 정적 데이터
 * (시설, 프로그램 키워드, 사례관리, 지역자원, 이벤트, 이름 풀)
 * ========================================================= */
'use strict';

const DATA = {};

/* ---------- 지도 / 토지 / 도로 ----------
 * 28×28 타일을 4타일짜리 구역(파셀) 7×7로 나눈다.
 * 시작은 중앙 3×3 구역(12×12 타일)만 우리 마을 소유.
 */
DATA.MAP = {
  GRID: 28,          // 한 변의 타일 수
  TILE: 4,           // 타일 한 변(3D 월드 단위)
  PARCEL: 4,         // 구역 한 변의 타일 수
  PARCELS: 7,        // 한 변의 구역 수
  INIT_MIN: 2,       // 처음 보유한 구역 범위 (인덱스)
  INIT_MAX: 4,
};

/* 토지 매입가: 이미 넓힐수록 비싸진다 */
DATA.LAND = {
  base: 2e8,         // 첫 구역 2억
  step: 8e7,         // 구역 하나 늘 때마다 +8,000만
};

/* 도로 공사비 (한 칸 기준) */
DATA.ROAD = {
  cost: 5e6,         // 500만 원
  refund: 1e6,       // 철거 시 100만 원 환급
};

/* ---------- 주거 수용량 ----------
 * 인구가 늘어나도 살 곳이 없으면 더 늘어나기 어렵다. 밸런스 수치는
 * 여기 한 곳에서만 관리한다 (sim.js에 흩어놓지 않는다).
 */
DATA.HOUSING = {
  capPerHouse: 60,      // 원래 살던 민가 한 채가 수용하는 인구 (시작 인구 500명 · 민가 14채 기준으로
                         // 시작 수용률이 약 60%가 되도록 잡은 값 — 처음부터 빠듯하지 않게)
  warnRatio: 0.80,      // 수용률이 이 비율을 넘으면 "주거공간 확충 필요" 경고
  squeezeRatio: 0.95,   // 이 비율을 넘으면 전입이 크게 줄어듦
  squeezeFactor: 0.25,  // squeezeRatio 초과 시 전입 인원에 곱하는 배율
};

/* ---------- 복지 접근성 ----------
 * 지도를 7×7 구역(파셀)으로 나눠 구역마다 접근성 점수(0~100)를 매긴다.
 * 인구는 그 구역의 "주거 수용량 비중"만큼 산다고 본다 — 민가·아파트가
 * 많은 구역일수록 실제로 사람이 많이 사는 구역으로 취급된다.
 */
DATA.ACCESS = {
  radiusTiles: 11,      // 이 거리(타일) 안의 host 시설이 구역을 커버한다고 본다
  coldThreshold: 40,    // 이 점수 미만 + 인구가 있는 구역은 복지사각지대
  goodThreshold: 70,    // 이 점수 이상이면 서비스가 넉넉한 구역
  satBonusMax: 1.0,     // 접근성 100점일 때 매달 만족도에 더해지는 최대치
  satPenaltyMax: 0.4,   // 접근성 0점일 때 매달 만족도에서 빼는 최대치
};

/* ---------- 도시등급 ----------
 * 인구를 기준으로 한 간단한 성장 단계. 해금 조건(unlock.cityTier)과
 * 통계 패널의 "도시등급" 표시에 쓰인다.
 */
DATA.CITY_TIERS = [
  { tier: 1, name: '작은 마을', pop: 0 },
  { tier: 2, name: '성장하는 마을', pop: 800 },
  { tier: 3, name: '복지 소도시', pop: 1800 },
  { tier: 4, name: '복지 중견도시', pop: 3500 },
  { tier: 5, name: '복지 광역도시', pop: 6000 },
];

/* ---------- 주민 그룹 ----------
 * 색은 dataviz 검증기(명도밴드·채도·색각·대비)를 나열 순서까지 포함해 통과한 조합이다.
 * 순서를 바꾸면 인접 색 대비가 달라지므로 다시 검증해야 한다.
 * 어디서든 색과 함께 그룹 이름을 같이 표시한다 — 색만으로 구분하지 않는다.
 */
DATA.GROUPS = {
  senior:        { id: 'senior',        label: '독거노인',       short: '노인',   color: '#4a86dd' },
  disabled:      { id: 'disabled',      label: '발달장애인',     short: '장애',   color: '#d36c00' },
  youth:         { id: 'youth',         label: '위기청소년',     short: '청소년', color: '#d1408f' },
  basic:         { id: 'basic',         label: '기초생활수급자', short: '수급',   color: '#3fa621' },
  multicultural: { id: 'multicultural', label: '다문화이주민',   short: '다문화', color: '#0096af' },
  defector:      { id: 'defector',      label: '북한이탈주민',   short: '탈북',   color: '#8f8a2e' },
  general:       { id: 'general',       label: '일반 주민',      short: '일반',   color: '#9f63b9' },
};
DATA.GROUP_IDS = ['senior', 'disabled', 'youth', 'basic', 'multicultural', 'defector', 'general'];

/* 일반 주민을 뺀 취약계층 (통계·공모사업에서 묶어 쓴다) */
DATA.VULNERABLE_IDS = ['senior', 'disabled', 'youth', 'basic', 'multicultural', 'defector'];

/* ---------- 복지시설 ----------
 * cost/upkeep: 원 단위. size: 타일 변 길이(1 또는 2). cap: 프로그램 수용 정원.
 * host: 프로그램 운영 가능 여부. goodFor: 잘 맞는 대상 그룹.
 * passive: 매월 그룹별 만족도 소폭 상승치.
 */
DATA.BUILDINGS = [
  {
    id: 'welfare', name: '종합사회복지관', icon: '🏢',
    cost: 12e8, upkeep: 3.0e7, size: 2, cap: 120, host: true,
    goodFor: ['senior', 'disabled', 'youth', 'basic', 'multicultural', 'defector', 'general'],
    passive: { senior: .45, disabled: .45, youth: .4, basic: .45, multicultural: .4, defector: .4, general: .35 },
    baseColor: 0x9fb8d8, roofColor: 0x3f6ea8, height: 4.6,
    desc: '마을 복지의 중심. 모든 대상에게 프로그램을 열 수 있는 대형 거점 시설.',
  },
  {
    id: 'seniorCenter', name: '노인복지관', icon: '🏛️',
    cost: 9e8, upkeep: 2.0e7, size: 2, cap: 90, host: true,
    goodFor: ['senior'],
    passive: { senior: 1.0 },
    baseColor: 0xd8c9a8, roofColor: 0x8a6b3c, height: 3.8,
    desc: '어르신 여가·건강·식사 지원의 거점. 독거노인 프로그램 효과가 커진다.',
  },
  {
    id: 'disabledCenter', name: '장애인복지관', icon: '🏥',
    cost: 10e8, upkeep: 2.2e7, size: 2, cap: 80, host: true,
    goodFor: ['disabled'],
    passive: { disabled: 1.2 },
    baseColor: 0xf0d9a8, roofColor: 0xb98a2e, height: 3.8,
    desc: '발달장애인 주간활동·재활·자립훈련 거점. 장애인 프로그램 효과가 커진다.',
  },
  {
    id: 'familyCenter', name: '가족센터', icon: '🏠',
    cost: 8e8, upkeep: 1.8e7, size: 2, cap: 80, host: true,
    goodFor: ['general', 'basic', 'multicultural'],
    passive: { general: .7, basic: .45, multicultural: 1.1, defector: .4 },
    baseColor: 0xf3c8c8, roofColor: 0xb85c5c, height: 3.4,
    desc: '가족상담·돌봄·다문화 지원. 일반 주민과 수급 가구의 만족도를 올린다.',
  },
  {
    id: 'childCenter', name: '지역아동센터', icon: '🎒',
    cost: 3e8, upkeep: 0.8e7, size: 1, cap: 40, host: true,
    goodFor: ['basic', 'general', 'youth'],
    passive: { basic: .6, general: .25, youth: 1.0 },
    baseColor: 0xc8e6a8, roofColor: 0x5c8a3c, height: 2.6,
    desc: '방과후 돌봄과 학습 지원. 아동이 있는 취약 가구에 큰 힘이 된다.',
  },
  {
    id: 'gyeongro', name: '경로당', icon: '🍵',
    cost: 1.5e8, upkeep: 0.3e7, size: 1, cap: 25, host: true,
    goodFor: ['senior'],
    passive: { senior: .6 },
    baseColor: 0xd9d2b8, roofColor: 0x6e6248, height: 2.2,
    desc: '작지만 가까운 어르신 사랑방. 저렴하게 지어 골목마다 둘 수 있다.',
  },
  {
    id: 'soupKitchen', name: '무료급식소', icon: '🍚',
    cost: 2e8, upkeep: 1.0e7, size: 1, cap: 0, host: false,
    goodFor: ['senior', 'basic'],
    passive: { senior: .8, basic: .8 },
    baseColor: 0xf5e3b8, roofColor: 0xc99a3c, height: 2.4,
    desc: '매일 따뜻한 한 끼 제공. 결식 어르신·수급 가구 사례 연계에도 쓰인다.',
  },
  {
    id: 'jahwal', name: '지역자활센터', icon: '🛠️',
    cost: 5e8, upkeep: 1.2e7, size: 1, cap: 40, host: true,
    goodFor: ['basic', 'disabled', 'defector', 'multicultural'],
    passive: { basic: .8, disabled: .35, defector: .8, multicultural: .5 },
    baseColor: 0xb8c8d8, roofColor: 0x4a6a8a, height: 3.0,
    desc: '수급자·장애인의 일 경험과 자활을 지원. 일자리 프로그램의 거점.',
  },
  {
    id: 'healthPost', name: '보건지소', icon: '💊',
    cost: 6e8, upkeep: 1.5e7, size: 1, cap: 30, host: true,
    goodFor: ['senior', 'disabled'],
    passive: { senior: .45, disabled: .45, basic: .25, youth: .25, multicultural: .3, defector: .3, general: .25 },
    baseColor: 0xffffff, roofColor: 0x3c8a5c, height: 3.0,
    desc: '방문간호·만성질환 관리. 건강 취약 사례 연계에 필요하다.',
  },
  {
    id: 'careHub', name: '통합돌봄센터', icon: '🩺',
    cost: 11e8, upkeep: 2.4e7, size: 2, cap: 80, host: true,
    goodFor: ['senior', 'disabled', 'basic'],
    passive: { senior: .9, disabled: .7, basic: .3 },
    baseColor: 0xc9dbe0, roofColor: 0x2f7d8a, height: 4.0,
    desc: '의료·장기요양·돌봄을 한 곳에서 잇는 통합돌봄 거점. 맞춤형 케어플랜으로 어르신과 장애인의 삶을 지원한다.',
  },
  {
    id: 'communityCenter', name: '주민커뮤니티센터', icon: '🎪',
    cost: 7e8, upkeep: 1.6e7, size: 2, cap: 110, host: true,
    goodFor: ['general', 'senior', 'youth', 'multicultural', 'defector', 'disabled', 'basic'],
    passive: { general: .8, senior: .5, youth: .5, multicultural: .7, defector: .7, disabled: .3, basic: .3 },
    baseColor: 0xf0d2a0, roofColor: 0xc85a4a, height: 3.6,
    desc: '마을 행사와 축제를 여는 주민들의 사랑방. 어르신이 살던 곳에서 계속 지낼 수 있도록(AIP·Aging In Place) 이웃이 함께 살피는 공동케어회의도 이곳에서 열린다.',
  },
  /* ---------- 전문기관 ----------
   * 마을이 어느 정도 자리를 잡아야(인구·도시등급·기존 기관 수·복지 접근성) 짓기 시작할 수 있는
   * 특화 전문기관 5종. 기본 12종보다 다루는 문제가 더 전문적이고 예산도 더 크다.
   */
  {
    id: 'childProtect', name: '아동보호전문기관', icon: '🛡️', cat: 'special',
    cost: 9e8, upkeep: 2.0e7, size: 2, cap: 70, host: true,
    goodFor: ['youth', 'basic', 'general'],
    passive: { youth: 1.3, basic: .4, general: .3 },
    baseColor: 0xdfe8f5, roofColor: 0x3a5a9c, height: 3.8,
    desc: '아동학대 신고 대응·조사와 피해아동 보호를 전담하는 전문기관. 지역 복지 인프라와 협력해야 하므로 기존 기관이 어느 정도 갖춰져야 한다.',
    unlock: { pop: 900, facilityCount: 8 },
  },
  {
    id: 'elderProtect', name: '노인보호전문기관', icon: '🚨', cat: 'special',
    cost: 9e8, upkeep: 2.0e7, size: 2, cap: 70, host: true,
    goodFor: ['senior'],
    passive: { senior: 1.3 },
    baseColor: 0xf0e3c8, roofColor: 0x9c6a2e, height: 3.8,
    desc: '노인학대 신고 대응·예방교육을 전담하는 전문기관. 마을이 성장하는 궤도에 올라야 운영을 시작할 수 있다.',
    unlock: { pop: 900, cityTier: 2 },
  },
  {
    id: 'disabledRights', name: '장애인권익옹호기관', icon: '🤝', cat: 'special',
    cost: 11e8, upkeep: 2.4e7, size: 2, cap: 60, host: true,
    goodFor: ['disabled'],
    passive: { disabled: 1.3 },
    baseColor: 0xe3d8f0, roofColor: 0x6a3a9c, height: 4.0,
    desc: '장애인 학대·차별 피해자를 지원하고 권익을 옹호하는 전문기관. 마을 전역이 고르게 서비스를 받고 있어야(복지 접근성) 진짜 효과를 낼 수 있다.',
    unlock: { cityTier: 3, accessScore: 50 },
  },
  {
    id: 'mentalHealth', name: '정신건강복지센터', icon: '🧠', cat: 'special',
    cost: 13e8, upkeep: 2.8e7, size: 2, cap: 90, host: true,
    goodFor: ['senior', 'disabled', 'youth', 'basic', 'multicultural', 'defector', 'general'],
    passive: { senior: .5, disabled: .5, youth: .7, basic: .6, multicultural: .5, defector: .5, general: .5 },
    baseColor: 0xd8e8e3, roofColor: 0x2e7d6a, height: 4.2,
    desc: '우울·불안·중독 등 정신건강 문제를 상담·치료로 잇는 전문기관. 대상을 가리지 않지만, 그만큼 탄탄한 도시 기반이 갖춰져야 짓기 시작할 수 있다.',
    unlock: { cityTier: 3, facilityCount: 14 },
  },
  {
    id: 'multiFamily', name: '다문화가족지원센터', icon: '🌏', cat: 'special',
    cost: 10e8, upkeep: 2.2e7, size: 2, cap: 75, host: true,
    goodFor: ['multicultural', 'defector', 'general'],
    passive: { multicultural: 1.4, defector: 1.2, general: .3 },
    baseColor: 0xd8e0f0, roofColor: 0x2e5a9c, height: 3.8,
    desc: '결혼이민자·다문화가정·탈북민의 정착과 자립을 지원하는 전문기관. 도시 규모와 골고루 퍼진 복지 접근성을 함께 갖춰야 문을 열 수 있는, 가장 늦게 해금되는 전문기관이다.',
    unlock: { cityTier: 4, accessScore: 60 },
  },
  {
    id: 'park', name: '마을공원', icon: '🌳', cat: 'etc',
    cost: 1e8, upkeep: 0.2e7, size: 1, cap: 0, host: false,
    goodFor: ['senior', 'disabled', 'youth', 'basic', 'multicultural', 'defector', 'general'],
    passive: { senior: .3, disabled: .3, youth: .3, basic: .3, multicultural: .3, defector: .3, general: .3 },
    baseColor: 0x88b868, roofColor: 0x88b868, height: 0.4, isPark: true,
    desc: '누구나 쉬어가는 초록 쉼터. 마을 전체 만족도를 조금씩 올린다.',
  },

  /* ---------- 주거시설 ----------
   * 인구가 늘어날수록 살 곳이 필요해진다. host:false라 프로그램은 못 열지만,
   * housingCap만큼 마을의 최대 수용 인구를 늘려준다. 가격 순서를 반드시 지킨다:
   * 공공아파트 5층 < 빌딩형 공공아파트 < 대단지 공공아파트.
   */
  {
    id: 'apt5', name: '공공아파트 5층', icon: '🏘️', cat: 'housing',
    cost: 2.5e8, upkeep: 0.6e7, size: 1, cap: 0, host: false, housingCap: 60,
    goodFor: [], passive: {},
    baseColor: 0xe8dcc4, roofColor: 0x6b4a30, height: 3.2,
    desc: '초기 단계에 지을 수 있는 소규모 공공주택. 짓기 쉽고 유지비도 적지만 수용 인원은 많지 않다.',
  },
  {
    id: 'aptBlock', name: '빌딩형 공공아파트', icon: '🏢', cat: 'housing',
    cost: 9e8, upkeep: 1.8e7, size: 2, cap: 0, host: false, housingCap: 260,
    goodFor: [], passive: {},
    baseColor: 0xaecbe0, roofColor: 0x33506e, height: 6.5,
    desc: '인구가 어느 정도 늘어난 뒤 지을 수 있는 중·고층 주거시설. 부지 대비 수용 효율이 높다.',
    unlock: { pop: 700 },
  },
  {
    id: 'aptComplex', name: '대단지 공공아파트', icon: '🏙️', cat: 'housing',
    cost: 2.6e9, upkeep: 4.5e7, size: 2, cap: 0, host: false, housingCap: 700,
    goodFor: [], passive: {},
    baseColor: 0xb9bdc2, roofColor: 0x3a3a3a, height: 9.5,
    desc: '고밀도 도시 단계에서 짓는 대규모 주거단지. 건설비와 유지비가 크지만 수용 인원이 압도적이다.',
    unlock: { pop: 2000, cityTier: 3 },
  },
];

/* ---------- 건물 디자인 커스터마이징 ----------
 * 시설(공원 제외)을 지을 때 디자인과 색상을 직접 고를 수 있다.
 * style은 world.js의 makeBuildingMesh가 실제 형태를 어떻게 바꿀지 정하고,
 * wall/roof는 그 위에 입힐 색이다. 건물 인스턴스마다 따로 저장되므로
 * 같은 종류를 여러 채 지어도 서로 다르게 꾸밀 수 있다.
 */
DATA.BUILDING_STYLES = [
  { id: 'modern', name: '모던형', icon: '🏙️', desc: '깔끔한 사각 매스와 통유리로 이루어진 담백한 디자인.' },
  { id: 'eco', name: '친환경형', icon: '🌿', desc: '옥상 녹화와 화단을 두른 초록빛 친환경 디자인.' },
  { id: 'civic', name: '공공기관형', icon: '🏛️', desc: '깃대와 화강암 톤 기단을 갖춘 반듯한 공공기관 디자인.' },
  { id: 'urban', name: '도시형', icon: '🏢', desc: '층을 높이 쌓아 올린 도시적인 고층 디자인.' },
  { id: 'warm', name: '따뜻한 복지시설형', icon: '🏡', desc: '박공지붕과 나무 톤 차양이 정겨운 복지시설 디자인.' },
];

DATA.BUILDING_COLORS = {
  wall: [
    { id: 'white', label: '화이트', hex: 0xf5f3ec },
    { id: 'beige', label: '베이지', hex: 0xe8dcc4 },
    { id: 'pastelBlue', label: '파스텔 블루', hex: 0xaecbe0 },
    { id: 'green', label: '그린', hex: 0xb9d1a0 },
    { id: 'brown', label: '브라운', hex: 0xc2a37e },
    { id: 'grey', label: '그레이', hex: 0xb9bdc2 },
    { id: 'coral', label: '코랄', hex: 0xe8b8ab },
  ],
  roof: [
    { id: 'slate', label: '슬레이트', hex: 0x4a5a66 },
    { id: 'navy', label: '네이비', hex: 0x33506e },
    { id: 'forest', label: '포레스트', hex: 0x3c6b45 },
    { id: 'terracotta', label: '테라코타', hex: 0xb35c3f },
    { id: 'walnut', label: '월넛', hex: 0x6b4a30 },
    { id: 'charcoal', label: '차콜', hex: 0x3a3a3a },
  ],
};

/* ---------- 꾸미기 요소 ----------
 * 시설과 달리 예산에 큰 영향이 없는 소품들. 도로/부지 조건 없이 우리 땅 위 빈자리에 놓는다.
 * kind는 world.js의 makeDecorMesh가 어떤 모양을 그릴지 정한다.
 * cat: nature(자연) · street(거리 시설) · landmark(랜드마크).
 */
DATA.DECOR = [
  { id: 'oakTree',    name: '가로수(활엽수)',  icon: '🌳', cost: 2e6,   cat: 'nature',   kind: 'tree', variant: 'oak',
    desc: '길가에 그늘을 드리우는 활엽수.' },
  { id: 'pineTree',   name: '소나무',          icon: '🌲', cost: 2e6,   cat: 'nature',   kind: 'tree', variant: 'pine',
    desc: '사계절 푸른 침엽수.' },
  { id: 'cherryTree', name: '벚꽃나무',        icon: '🌸', cost: 3e6,   cat: 'nature',   kind: 'tree', variant: 'cherry',
    desc: '봄이면 온 마을이 분홍빛으로 물든다.' },
  { id: 'flowerBed',  name: '화단',            icon: '🌷', cost: 1.5e6, cat: 'nature',   kind: 'flowerbed',
    desc: '알록달록한 꽃으로 채운 작은 화단.' },
  { id: 'bench',      name: '벤치',            icon: '🪑', cost: 1.2e6, cat: 'street',   kind: 'bench',
    desc: '오가는 주민이 잠시 앉아 쉬어가는 자리.' },
  { id: 'lamp',       name: '가로등',          icon: '💡', cost: 1.5e6, cat: 'street',   kind: 'lamp',
    desc: '밤길을 밝혀주는 가로등.' },
  { id: 'fence',      name: '울타리',          icon: '🚧', cost: 8e5,   cat: 'street',   kind: 'fence',
    desc: '화단이나 경계를 아기자기하게 둘러주는 울타리.' },
  { id: 'bikeRack',   name: '자전거 거치대',    icon: '🚲', cost: 1e6,   cat: 'street',   kind: 'bikerack',
    desc: '자전거를 가지런히 세워두는 거치대.' },
  { id: 'trashBin',   name: '쓰레기통',        icon: '🗑️', cost: 5e5,   cat: 'street',   kind: 'trashbin',
    desc: '거리를 깨끗하게 유지해주는 분리수거함.' },
  { id: 'signboard',  name: '환영 안내판',      icon: '🪧', cost: 1.5e6, cat: 'street',   kind: 'signboard',
    desc: '우리 마을 이름을 새긴 안내판.' },
  { id: 'fountain',   name: '분수대',          icon: '⛲', cost: 1.2e7, cat: 'landmark', kind: 'fountain',
    desc: '광장 한가운데서 물줄기가 솟아오르는 분수대.' },
  { id: 'statue',     name: '나눔 조형물',      icon: '🗿', cost: 1.6e7, cat: 'landmark', kind: 'statue',
    desc: '이웃과 나누는 마음을 형상화한 마을 상징 조형물.' },
  { id: 'gazebo',     name: '쉼터 정자',        icon: '⛩️', cost: 9e6,   cat: 'landmark', kind: 'gazebo',
    desc: '햇볕과 비를 피해 이웃과 이야기 나누는 정자.' },
];
DATA.DECOR_CATS = { nature: '🌿 자연', street: '🚏 거리 시설', landmark: '🏛️ 랜드마크' };

/* ---------- 프로그램 키워드 → 대상별 호응 배수 ---------- */
DATA.KEYWORDS = [
  { id: 'health',  label: '건강',   words: ['건강', '운동', '체조', '걷기', '스트레칭', '재활', '요가'],
    interest: { senior: 1.35, disabled: 1.20, basic: 1.05, general: 1.10, youth: 1.05, multicultural: 1.1, defector: 1.15 } },
  { id: 'food',    label: '식생활', words: ['요리', '식사', '반찬', '급식', '영양', '밥', '먹거리'],
    interest: { senior: 1.30, disabled: 1.10, basic: 1.25, general: 1.05, youth: 1.15, multicultural: 1.2, defector: 1.25 } },
  { id: 'culture', label: '문화',   words: ['문화', '음악', '미술', '노래', '공연', '원예', '악기', '합창', '그림'],
    interest: { senior: 1.20, disabled: 1.25, basic: 1.10, general: 1.20, youth: 1.3, multicultural: 1.35, defector: 1.15 } },
  { id: 'edu',     label: '교육',   words: ['교육', '배움', '학습', '교실', '한글', '문해', '공부'],
    interest: { senior: 1.15, disabled: 1.15, basic: 1.20, general: 1.10, youth: 1.35, multicultural: 1.4, defector: 1.35 } },
  { id: 'counsel', label: '심리',   words: ['상담', '마음', '치유', '심리', '힐링', '우울'],
    interest: { senior: 1.20, disabled: 1.20, basic: 1.20, general: 1.10, youth: 1.35, multicultural: 1.2, defector: 1.35 } },
  { id: 'job',     label: '일자리', words: ['일자리', '취업', '자활', '직업', '바리스타', '창업', '근로'],
    interest: { senior: 1.05, disabled: 1.25, basic: 1.40, general: 1.10, youth: 1.3, multicultural: 1.3, defector: 1.4 } },
  { id: 'outing',  label: '나들이', words: ['나들이', '여행', '소풍', '체험', '캠프', '견학'],
    interest: { senior: 1.30, disabled: 1.30, basic: 1.20, general: 1.20, youth: 1.25, multicultural: 1.3, defector: 1.3 } },
  { id: 'digital', label: '디지털', words: ['디지털', '스마트폰', '키오스크', '컴퓨터', '인터넷', '영상통화'],
    interest: { senior: 1.40, disabled: 1.10, basic: 1.10, general: 1.05, youth: 1.2, multicultural: 1.2, defector: 1.25 } },
  { id: 'community', label: '공동체', words: ['공동체', '이웃', '마을', '축제', '장터', '봉사', '나눔'],
    interest: { senior: 1.10, disabled: 1.10, basic: 1.10, general: 1.30, youth: 1.15, multicultural: 1.35, defector: 1.35 } },
];

/* ---------- 프로그램 월 예산 선택지 ---------- */
DATA.PROGRAM_BUDGETS = [
  { value: 3e6,  label: '월 300만 원 (소규모)' },
  { value: 5e6,  label: '월 500만 원 (기본)' },
  { value: 1e7,  label: '월 1,000만 원 (충실)' },
  { value: 2e7,  label: '월 2,000만 원 (집중투자)' },
];

/* ---------- 참여자 반응 템플릿 ---------- */
DATA.COMMENTS = {
  high: [
    '매주 이 시간만 기다려져요. 이런 프로그램이 생겨서 마을 살 맛이 납니다!',
    '선생님들이 한 분 한 분 챙겨주셔서 눈물 나게 고마웠어요.',
    '친구가 생겼어요. 혼자가 아니라는 게 이렇게 좋은 건지 몰랐네요.',
    '옆 동네 사는 동생한테도 자랑했어요. 이사 오고 싶다고 하더라고요.',
    '몸도 마음도 가벼워졌어요. 계속만 해주세요!',
    '처음엔 쭈뼛쭈뼛했는데 지금은 제가 제일 먼저 와서 기다립니다.',
    '이 나이에 새로 배우는 재미가 이렇게 클 줄 몰랐어요.',
    '우리 마을이 정말 달라지고 있다는 게 느껴져요.',
  ],
  mid: [
    '재미있긴 한데 시간이 조금 짧은 것 같아요.',
    '좋았어요. 다만 자리가 좁아서 조금 불편했습니다.',
    '내용은 괜찮은데 우리 눈높이에 조금 어려운 부분도 있었어요.',
    '다음엔 간식이 좀 있으면 좋겠어요. 그래도 잘 다녀왔습니다.',
    '무난했어요. 이웃들 얼굴 보는 재미로 갑니다.',
    '선생님이 친절하셨어요. 프로그램이 더 자주 있으면 좋겠네요.',
  ],
  low: [
    '기대했는데 준비가 좀 부족해 보였어요.',
    '사람이 너무 많아서 정신이 없었어요. 예산을 더 써야 할 것 같아요.',
    '내용이 우리랑 잘 안 맞는 느낌이었어요.',
    '한 번 가보고 안 가게 되더라고요. 아쉬워요.',
    '홍보만 요란하고 실속이 없다는 얘기가 돌아요.',
  ],
  byKeyword: {
    health:  '끝나고 나면 무릎이 한결 부드러워요.',
    food:    '집에 가져간 반찬 덕에 일주일이 든든했어요.',
    culture: '무대에 서 본 게 평생 처음이었어요. 가슴이 벅찼습니다.',
    edu:     '이제 은행 서류도 제 손으로 읽을 수 있어요.',
    counsel: '속 얘기를 털어놓고 나니 잠이 잘 와요.',
    job:     '월급봉투를 받아보는 게 몇 년 만인지 몰라요.',
    outing:  '바깥바람 쐰 게 얼마 만인지… 사진도 많이 찍었어요.',
    digital: '드디어 손주랑 영상통화를 했어요!',
    community: '이웃 얼굴을 알게 되니 골목이 무섭지 않아요.',
  },
};

/* ---------- 사례관리: 욕구(취약점) 분류 ---------- */
DATA.NEEDS = {
  health:  { id: 'health',  label: '건강 악화',     icon: '🩺', desc: '만성질환·거동 불편으로 일상생활이 어려움' },
  mental:  { id: 'mental',  label: '우울·고립',     icon: '🌧️', desc: '사회적 관계 단절, 우울감 호소' },
  housing: { id: 'housing', label: '주거 불안정',   icon: '🏚️', desc: '월세 체납, 곰팡이·누수 등 열악한 주거환경' },
  finance: { id: 'finance', label: '경제적 위기',   icon: '💸', desc: '채무·체납으로 생계가 위태로움' },
  food:    { id: 'food',    label: '결식·영양',     icon: '🍽️', desc: '끼니를 거르는 날이 많고 영양 상태가 나쁨' },
  care:    { id: 'care',    label: '돌봄 공백',     icon: '🫂', desc: '일상을 챙겨줄 사람이 없어 방임 위험' },
  edu:     { id: 'edu',     label: '학습·양육 곤란', icon: '📚', desc: '아동 학습 부진, 양육 부담 과중' },
  legal:   { id: 'legal',   label: '법률 문제',     icon: '⚖️', desc: '임대차 분쟁·서류 문제 등 법적 조력 필요' },
  job:     { id: 'job',     label: '실직·구직난',   icon: '💼', desc: '오랜 실직으로 소득이 끊긴 상태' },
  language:{ id: 'language',label: '언어 장벽',     icon: '💬', desc: '한국어가 서툴러 서류·병원·학교 소통이 어려움' },
  settle:  { id: 'settle',  label: '정착 어려움',   icon: '🧭', desc: '낯선 제도와 문화에 적응하지 못해 고립됨' },
  school:  { id: 'school',  label: '학업 중단 위기', icon: '🎓', desc: '학교 부적응으로 등교를 멈춘 상태' },
};

/* ---------- 지역자원 (사례 연계용) ----------
 * treats: 해결 가능한 욕구. cost: 연계 비용(원). req: 필요한 시설 id(없으면 null)
 */
DATA.RESOURCES = [
  { id: 'visitNurse',  name: '보건지소 방문간호팀',        treats: ['health'], cost: 0,     req: 'healthPost',
    desc: '간호사가 정기 방문해 혈압·복약을 관리한다. (보건지소 필요)' },
  { id: 'hospital',    name: '지역 종합병원 의료후원',      treats: ['health'], cost: 1e6,   req: null,
    desc: '협약 병원이 진료비를 후원한다.' },
  { id: 'mindCenter',  name: '정신건강복지센터 상담 연계',  treats: ['mental'], cost: 0,     req: null,
    desc: '전문 상담사가 주 1회 심리상담을 진행한다.' },
  { id: 'malbut',      name: '말벗 자원봉사단',            treats: ['mental'], cost: 0,     req: null,
    desc: '이웃 봉사자가 주 2회 안부 방문과 말벗이 되어준다.' },
  { id: 'lhCenter',    name: 'LH 주거복지센터',            treats: ['housing'], cost: 0,    req: null,
    desc: '임대주택 이주·주거급여 신청을 돕는다.' },
  { id: 'houseRepair', name: '사랑의 집수리 봉사단',        treats: ['housing'], cost: 5e5,  req: null,
    desc: '도배·장판·보일러를 고쳐준다. (자재비 소요)' },
  { id: 'finCenter',   name: '서민금융통합지원센터',        treats: ['finance'], cost: 0,    req: null,
    desc: '채무조정과 긴급 소액대출을 연계한다.' },
  { id: 'moggum',      name: '사회복지공동모금회 긴급지원', treats: ['finance'], cost: 2e6,  req: null,
    desc: '긴급 생계비를 매칭 지원한다. (매칭금 소요)' },
  { id: 'sideDish',    name: '무료급식소 반찬배달',        treats: ['food'],   cost: 0,     req: 'soupKitchen',
    desc: '주 3회 밑반찬을 배달한다. (무료급식소 필요)' },
  { id: 'foodBank',    name: '푸드뱅크·푸드마켓',          treats: ['food'],   cost: 3e5,   req: null,
    desc: '기부 식품 꾸러미를 정기 전달한다.' },
  { id: 'eldercare',   name: '노인맞춤돌봄서비스',          treats: ['care'],   cost: 8e5,  req: null,
    desc: '생활지원사가 주기적으로 가사·안부를 돌본다.' },
  { id: 'actAssist',   name: '장애인활동지원사 연계',      treats: ['care'],   cost: 8e5,   req: null,
    desc: '활동지원사가 이동·일상생활을 지원한다.' },
  { id: 'afterSchool', name: '지역아동센터 방과후 돌봄',    treats: ['edu'],    cost: 0,    req: 'childCenter',
    desc: '방과후 학습·저녁 돌봄을 제공한다. (지역아동센터 필요)' },
  { id: 'mentoring',   name: '대학생 멘토링 봉사단',        treats: ['edu'],    cost: 0,    req: null,
    desc: '대학생이 주 1회 학습 멘토링을 한다.' },
  { id: 'legalAid',    name: '대한법률구조공단',            treats: ['legal'],  cost: 0,    req: null,
    desc: '무료 법률상담과 소송 구조를 지원한다.' },
  { id: 'jobCenter',   name: '고용센터 취업성공패키지',      treats: ['job'],   cost: 0,    req: null,
    desc: '직업훈련과 구직활동을 단계별로 지원한다.' },
  { id: 'jahwalTeam',  name: '자활근로사업단 참여',        treats: ['job'],    cost: 0,     req: 'jahwal',
    desc: '자활사업단에서 일 경험과 급여를 얻는다. (지역자활센터 필요)' },

  /* 새 대상 집단을 위한 자원 */
  { id: 'koreanClass', name: '다문화가족지원 한국어교실',   treats: ['language'], cost: 0,   req: 'familyCenter',
    desc: '생활 한국어와 통·번역을 지원한다. (가족센터 필요)' },
  { id: 'interpreter', name: '이중언어 통역 자원봉사',      treats: ['language'], cost: 3e5, req: null,
    desc: '병원·학교 동행 통역을 지원한다.' },
  { id: 'hanaCenter',  name: '남북하나재단·하나센터',       treats: ['settle'], cost: 0,     req: null,
    desc: '북한이탈주민의 정착금·자립 상담과 지역 적응을 돕는다.' },
  { id: 'settleMentor',name: '먼저 정착한 이웃 멘토',       treats: ['settle'], cost: 0,     req: null,
    desc: '같은 처지를 먼저 겪은 주민이 길잡이가 되어준다.' },
  { id: 'wee',         name: 'Wee센터·학교사회복지사',      treats: ['school'], cost: 0,     req: null,
    desc: '학교 부적응과 학업 중단을 상담으로 지원한다.' },
  { id: 'dropoutCtr',  name: '학교밖청소년지원센터(꿈드림)', treats: ['school'], cost: 0,    req: null,
    desc: '검정고시·직업체험으로 학업과 진로를 잇는다.' },
  { id: 'youthShelter',name: '청소년쉼터',                  treats: ['housing', 'care'], cost: 6e5, req: null,
    desc: '가정 밖 청소년에게 안전한 잠자리와 보호를 제공한다.' },
];

/* ---------- 사례 생성 템플릿 ---------- */
DATA.CASE_TEMPLATES = {
  senior: {
    ageRange: [68, 89],
    needPool: ['health', 'mental', 'food', 'care', 'housing'],
    stories: [
      '홀로 지내신 지 {yrs}년. 최근 낙상 이후 바깥출입이 부쩍 줄었다.',
      '배우자와 사별 후 식사를 자주 거르신다. 집 안에 약봉지가 쌓여 있다.',
      '자녀와 연락이 끊긴 지 오래다. 겨울이면 보일러를 아껴 켠다.',
      '경로당에도 나오지 않아 이웃이 걱정 끝에 복지관에 알려왔다.',
    ],
  },
  disabled: {
    ageRange: [19, 52],
    needPool: ['care', 'job', 'mental', 'health', 'edu'],
    stories: [
      '고령의 어머니가 홀로 돌보고 있다. 어머니 건강이 나빠지며 돌봄 공백이 우려된다.',
      '특수학교 졸업 후 갈 곳이 없어 집에만 머문 지 {yrs}년째다.',
      '반복 업무는 잘 해내지만 일자리를 구하지 못해 자신감을 잃었다.',
      '낮 시간을 보낼 곳이 없어 생활 리듬이 무너지고 있다.',
    ],
  },
  basic: {
    ageRange: [24, 63],
    needPool: ['finance', 'job', 'housing', 'food', 'edu', 'legal', 'mental'],
    stories: [
      '실직 후 월세가 {yrs}개월째 밀려 있다. 아이는 학원 대신 빈집에서 저녁을 보낸다.',
      '지병으로 일을 쉬는 사이 카드빚이 불어났다. 독촉 전화에 잠을 설친다.',
      '반지하 집에 곰팡이가 번져 아이가 기침을 달고 산다.',
      '한부모 가정. 야간 일을 하는 동안 아이를 맡길 곳이 없다.',
    ],
  },
  youth: {
    ageRange: [14, 22],
    needPool: ['school', 'mental', 'care', 'housing', 'job', 'food'],
    stories: [
      '{yrs}개월째 학교에 나가지 않고 있다. 낮에는 자고 밤에 골목을 서성인다.',
      '집이 편치 않아 친구 집을 전전한다. 끼니는 편의점에서 때운다.',
      '또래와 크게 다툰 뒤 교실에 들어가는 게 무섭다고 한다.',
      '검정고시를 준비하고 싶은데 어디서부터 해야 할지 모르겠다고 한다.',
      '보호자와 갈등이 깊어 집을 나온 지 여러 날 되었다.',
    ],
  },
  multicultural: {
    ageRange: [24, 55],
    needPool: ['language', 'edu', 'job', 'mental', 'finance', 'care'],
    stories: [
      '결혼 후 한국에 온 지 {yrs}년. 아이 학교에서 오는 알림장을 읽지 못해 늘 마음을 졸인다.',
      '병원에 혼자 가기가 두렵다. 증상을 설명할 말을 찾지 못한다.',
      '고향 말을 쓸 이웃이 없어 하루 종일 아무와도 대화하지 않는 날이 많다.',
      '자격증이 있지만 한국어 시험 때문에 번번이 취업이 막힌다.',
      '아이가 학교에서 겉돈다는 이야기를 듣고 밤잠을 설친다.',
    ],
  },
  defector: {
    ageRange: [22, 60],
    needPool: ['settle', 'job', 'mental', 'finance', 'health', 'housing'],
    stories: [
      '남한에 온 지 {yrs}년. 은행 업무와 관공서 서류가 여전히 낯설다.',
      '두고 온 가족 생각에 잠을 이루지 못하는 날이 많다.',
      '이력이 인정되지 않아 예전에 하던 일을 이어가지 못하고 있다.',
      '말투 때문에 시선을 받는 것 같아 사람 만나는 자리를 피하게 된다.',
      '정착지원금이 끊긴 뒤 생활이 급격히 어려워졌다.',
    ],
  },
};

/* ---------- 랜덤 이벤트 ---------- */
DATA.EVENTS = [
  { id: 'coldwave', months: [12, 1, 2], text: '한파가 닥쳤습니다. 독거 어르신들의 난방비 부담이 커졌습니다.',
    effect: { sat: { senior: -3 } } },
  { id: 'heatwave', months: [7, 8], text: '폭염이 이어집니다. 쪽방·반지하 가구가 힘겨운 여름을 보내고 있습니다.',
    effect: { sat: { basic: -2, senior: -2 } } },
  { id: 'donation', months: null, text: '지역 기업이 복지기금 3,000만 원을 기탁했습니다!',
    effect: { budget: 3e7 } },
  { id: 'volunteers', months: null, text: '자원봉사 동아리가 마을 대청소와 반찬 나눔을 진행했습니다.',
    effect: { sat: { senior: 2, basic: 1 } } },
  { id: 'press', months: null, text: '지역 신문에 우리 마을 복지 사례가 크게 보도되었습니다!',
    effect: { rep: 4 }, cond: 'rep50' },
  { id: 'award', months: null, text: '도지사 표창! 복지행정 우수 지자체로 선정되었습니다.',
    effect: { rep: 6, budget: 5e7 }, cond: 'rep70' },
  { id: 'flu', months: [11, 12, 1], text: '독감이 유행합니다. 어르신 건강관리에 비상이 걸렸습니다.',
    effect: { sat: { senior: -2, disabled: -1 } } },
  { id: 'festival', months: [5, 10], text: '마을 골목축제가 열려 주민들이 오랜만에 한자리에 모였습니다.',
    effect: { sat: { general: 3, senior: 1 } } },
];

/* ---------- 이주(전입) 소식 문구 ---------- */
DATA.MIGRATION_LINES = [
  '"복지가 좋다더라"는 소문을 듣고 {n}명이 우리 마을로 이사왔습니다!',
  '옆 도시에서 {n}명이 전입했습니다. "여기는 어르신을 진짜 챙겨준대요."',
  '{n}명이 새 주민이 되었습니다. 부동산에 복지시설 문의가 늘고 있습니다.',
  '아이 키우기 좋다는 입소문에 {n}명의 가족이 이주해왔습니다.',
];

/* ---------- 이름 풀 ---------- */
DATA.NAMES = {
  family: ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황', '안', '송', '전', '홍'],
  seniorGiven: ['영자', '순덕', '말순', '병철', '기수', '옥분', '점례', '만복', '금례', '춘식', '복순', '판술', '정례', '두식', '옥례', '용팔'],
  adultGiven: ['민수', '지영', '성호', '은정', '태윤', '수진', '현우', '미경', '동혁', '세라', '준호', '가은', '상철', '유나', '재만', '하늘'],
  youngGiven: ['도윤', '서연', '하준', '지우', '시우', '아린', '준서', '다은'],
};

/* ---------- 공모사업 ----------
 * 사회복지공동모금회 공모 사업을 본뜬 지원사업 목록.
 * 신청서(제목·목적·목표·프로그램 내용)를 심사 기준에 맞춰 쓰면 선정된다.
 *   target   : 사업 대상 그룹
 *   grant    : 선정 시 지원금
 *   keywords : 목적·내용에 담기면 좋은 핵심어 (하나만 맞아도 인정)
 *   facility : 있으면 수행 역량으로 가점되는 시설 (없어도 신청은 가능)
 */
DATA.GRANTS = [
  {
    id: 'g_disabled_indep', org: '사회복지공동모금회',
    name: '발달장애인 자립지원 사업', target: 'disabled', grant: 5e8,
    summary: '성인기 발달장애인이 지역사회에서 자기 삶을 꾸려가도록 자립생활과 직업활동을 지원합니다.',
    keywords: ['자립', '발달장애', '직업', '일자리', '주간활동', '자기결정', '훈련', '자립생활'],
    facility: 'disabledCenter',
  },
  {
    id: 'g_senior_qol', org: '사회복지공동모금회',
    name: '독거노인 삶의 질 향상 사업', target: 'senior', grant: 4e8,
    summary: '홀로 사는 어르신의 고립을 줄이고 건강과 일상을 함께 돌보는 사업입니다.',
    keywords: ['독거', '어르신', '고립', '건강', '안부', '돌봄', '식사', '여가'],
    facility: 'seniorCenter',
  },
  {
    id: 'g_youth_next', org: '사회복지공동모금회',
    name: '위기청소년 학업·자립 지원 사업', target: 'youth', grant: 3.5e8,
    summary: '학교 밖에 있거나 학업을 멈춘 청소년이 배움과 진로를 다시 잇도록 돕습니다.',
    keywords: ['청소년', '학업', '진로', '검정고시', '멘토', '상담', '자립', '학교밖'],
    facility: 'childCenter',
  },
  {
    id: 'g_multi_settle', org: '사회복지공동모금회',
    name: '다문화가정 정착 지원 사업', target: 'multicultural', grant: 3e8,
    summary: '이주 배경 주민과 그 자녀가 언어와 관계의 장벽을 넘어 마을에 뿌리내리도록 돕습니다.',
    keywords: ['다문화', '이주', '한국어', '통역', '자녀', '정착', '문화', '이중언어'],
    facility: 'familyCenter',
  },
  {
    id: 'g_defector_adapt', org: '사회복지공동모금회',
    name: '북한이탈주민 지역사회 적응 사업', target: 'defector', grant: 3e8,
    summary: '북한이탈주민이 낯선 제도와 관계에 적응하고 안정된 일자리를 찾도록 지원합니다.',
    keywords: ['북한이탈', '탈북', '정착', '적응', '취업', '심리', '멘토', '지역사회'],
    facility: 'jahwal',
  },
  {
    id: 'g_basic_edu', org: '사회복지공동모금회',
    name: '저소득 아동 교육격차 해소 사업', target: 'basic', grant: 3.5e8,
    summary: '형편 때문에 배움의 기회를 놓치는 아이가 없도록 학습과 돌봄을 지원합니다.',
    keywords: ['아동', '학습', '교육', '방과후', '돌봄', '격차', '수급', '결식'],
    facility: 'childCenter',
  },
  {
    id: 'g_community_care', org: '사회복지공동모금회',
    name: '이웃이 이웃을 돌보는 마을 사업', target: 'all', grant: 2.5e8,
    summary: '주민이 서로의 안부를 살피는 마을 돌봄 관계망을 만듭니다.',
    keywords: ['이웃', '마을', '공동체', '돌봄', '관계망', '봉사', '나눔', '안부'],
    facility: 'welfare',
  },
  {
    id: 'g_casemgmt', org: '사회복지공동모금회',
    name: '통합사례관리 역량강화 사업', target: 'all', grant: 3e8,
    summary: '복합적인 어려움을 겪는 가구를 여러 기관이 함께 지원하는 통합사례관리를 강화합니다.',
    keywords: ['사례관리', '통합', '연계', '자원', '위기가구', '민관협력', '솔루션'],
    facility: 'welfare',
  },
];

/* 공모 신청서 심사 기준 (UI와 채점 로직이 함께 참조한다) */
DATA.GRANT_RULES = {
  minPurpose: 30,     // 목적 최소 글자수
  minContent: 60,     // 프로그램 내용 최소 글자수
  passScore: 70,      // 선정 기준 점수
  cooldown: 2,        // 탈락 후 재신청까지 기다리는 개월 수
};

/* ---------- 보건복지부 포상 ----------
 * 신청하는 게 아니라, 마을이 일정 기간 계속 좋은 상태를 유지하면 자동으로 수여된다.
 * streakMonths 동안 조건을 계속 만족해야 하고, 중간에 한 번이라도 못 미치면 처음부터 다시 세야 한다.
 */
DATA.AWARDS = [
  {
    id: 'villageExemplary', org: '보건복지부', icon: '🎖️',
    name: '복지마을 선도우수사례 표창장',
    desc: '마을 평균 만족도가 오랫동안 높게 유지된 마을에 보건복지부가 수여하는 표창장.',
    cond: '평균 만족도 72점 이상을 6개월 연속 유지',
    streakMonths: 6, scoreBonus: 800, prize: 5e8,
  },
  {
    id: 'programExcellence', org: '보건복지부', icon: '🏅',
    name: '우수 사회복지 프로그램 보건복지부 장관상',
    desc: '사례관리와 프로그램 만족도가 오랫동안 높게 유지된 마을에 보건복지부 장관이 수여하는 상.',
    cond: '프로그램 평균 평점 4.0점 이상 + 취약계층 평균 만족도 68점 이상을 6개월 연속 유지',
    streakMonths: 6, scoreBonus: 1000, prize: 7e8,
  },
];

/* ---------- 프로그램 작성 예시(placeholder) ---------- */
DATA.PROGRAM_EXAMPLES = [
  { t: '어르신 스마트폰 교실', d: '키오스크 주문, 손주와 영상통화, 기차표 예매까지. 8주 과정 디지털 문해 교육.' },
  { t: '반찬 나눔 요리단', d: '주민 봉사단과 함께 밑반찬을 만들어 독거 어르신 가정에 배달합니다.' },
  { t: '느린 학습자 바리스타 훈련', d: '발달장애 청년이 카페 실습으로 취업을 준비하는 12주 직업훈련.' },
];
