/* =========================================================
 * 복지마을 타이쿤 — 시뮬레이션 엔진
 * 예산·인구·만족도·평판, 프로그램 운영, 사례관리, 이벤트
 * ========================================================= */
'use strict';

const Sim = (() => {

  const SAVE_KEY = 'welfareTycoonSave_v1';
  const START_BUDGET = 5e9;           // 50억
  const GRANT_PER_CAPITA = 400000;    // 분기 교부금: 인구 1인당 40만 원
  const GOAL = { pop: 1000, sat: 80 };

  let G = null; // 게임 상태

  /* ---------- 유틸 ---------- */
  const rnd = (a, b) => a + Math.random() * (b - a);
  const irnd = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let _uid = 1;
  const uid = (p) => p + '_' + (_uid++) + '_' + Date.now().toString(36);

  function fmtWon(n) {
    const neg = n < 0;
    n = Math.abs(Math.round(n));
    const eok = Math.floor(n / 1e8);
    const man = Math.round((n % 1e8) / 1e4);
    let s = '';
    if (eok) s += eok.toLocaleString() + '억';
    if (man) s += (s ? ' ' : '') + man.toLocaleString() + '만';
    if (!s) s = '0';
    return (neg ? '-' : '') + s + ' 원';
  }

  function makeName(group, age) {
    const fam = pick(DATA.NAMES.family);
    let given;
    if (age >= 65) given = pick(DATA.NAMES.seniorGiven);
    else if (age <= 15) given = pick(DATA.NAMES.youngGiven);
    else given = pick(DATA.NAMES.adultGiven);
    return fam + given;
  }

  /* ---------- 새 게임 ---------- */
  function initialParcels() {
    const { INIT_MIN, INIT_MAX } = DATA.MAP;
    const out = [];
    for (let px = INIT_MIN; px <= INIT_MAX; px++)
      for (let pz = INIT_MIN; pz <= INIT_MAX; pz++) out.push(px + ',' + pz);
    return out;
  }

  // 시작 시 보유 구역 한가운데를 가로지르는 십자 도로
  function initialRoads() {
    const { PARCEL, INIT_MIN, INIT_MAX } = DATA.MAP;
    const lo = INIT_MIN * PARCEL, hi = (INIT_MAX + 1) * PARCEL - 1;
    const mid = Math.floor((lo + hi) / 2);
    const out = new Set();
    for (let i = lo; i <= hi; i++) { out.add(i + ',' + mid); out.add(mid + ',' + i); }
    return [...out];
  }

  function newGame(villageName) {
    G = {
      village: villageName || '행복마을',
      seed: Math.floor(Math.random() * 2 ** 31),   // 지형을 매번 같게 재현하기 위한 씨앗
      month: 3, year: 1, turn: 0,          // 1년차 3월(회계연도 시작)부터
      budget: START_BUDGET,
      totalGrant: 0, totalSpent: 0, totalLand: 0, totalRoad: 0,
      // 500명 중 절반이 취약계층
      pop: { senior: 70, disabled: 30, youth: 25, basic: 75, multicultural: 35, defector: 15, general: 250 },
      sat: { senior: 40, disabled: 38, youth: 36, basic: 41, multicultural: 37, defector: 35, general: 47 },
      rep: 30,
      grants: [],          // 선정된 공모사업 id
      grantTries: {},      // {공모id: 마지막 신청 turn} — 탈락 후 재도전 대기
      totalGrantWon: 0,    // 공모로 확보한 금액
      totalHappinessBonus: 0,
      parcels: initialParcels(),   // 보유한 구역 ["px,pz", …]
      roads: initialRoads(),       // 깔린 도로 타일 ["x,z", …]
      buildings: [],       // {id, defId, x, z}
      decor: [],           // {id, defId, x, z} — 꾸미기 요소
      totalDecor: 0,
      houses: [],          // {x, z, wall, roof} — 원래 살던 주민의 집 (이사 가능)
      mission: { active: false, done: false },   // 주민커뮤니티센터 건립 시 시작되는 미션
      awards: [],          // {id, turn, count} — 수여받은 보건복지부 포상 이력
      awardCounts: {},     // {awardId: 수여 횟수}
      awardScore: 0,       // 포상으로 얻은 누적 점수 보너스
      totalAwardPrize: 0,  // 포상금 누계
      villageGoodStreak: 0,        // 평균 만족도가 기준을 계속 넘긴 연속 개월 수
      programExcellentStreak: 0,   // 프로그램·사례관리 만족도가 기준을 계속 넘긴 연속 개월 수
      housingWarned: false,        // 주거공간 부족 경고를 이미 띄웠는지 (여유 생기면 초기화)
      accessWarned: false,         // 복지사각지대 경고를 이미 띄웠는지 (사각지대 해소되면 초기화)
      programs: [],        // 프로그램 객체
      cases: [],           // 사례 객체
      closedCases: 0,
      log: [],             // {turn, kind, text}
      history: [],         // {turn, label, pop, sat, rep, budget}
      won: false,
    };
    for (let i = 0; i < 4; i++) G.cases.push(makeCase());
    addLog('sys', `${G.village}에 사회복지 예산 ${fmtWon(START_BUDGET)}이 교부되었습니다. 더 나은 마을을 만들어 주세요!`);
    pushHistory();
    return G;
  }

  /* ---------- 토지 ---------- */
  const parcelKey = (px, pz) => px + ',' + pz;
  const parcelOf = (x, z) => [Math.floor(x / DATA.MAP.PARCEL), Math.floor(z / DATA.MAP.PARCEL)];

  function isParcelOwned(px, pz) { return G.parcels.includes(parcelKey(px, pz)); }

  function isOwned(x, z) {
    const { GRID } = DATA.MAP;
    if (x < 0 || z < 0 || x >= GRID || z >= GRID) return false;
    const [px, pz] = parcelOf(x, z);
    return isParcelOwned(px, pz);
  }

  // 다음에 살 구역의 가격 (보유 구역이 늘수록 비싸진다)
  function landPrice() {
    const bought = G.parcels.length - initialParcels().length;
    return DATA.LAND.base + bought * DATA.LAND.step;
  }

  // 이미 보유한 구역과 맞닿아 있어야 살 수 있다
  function isParcelBuyable(px, pz) {
    const { PARCELS } = DATA.MAP;
    if (px < 0 || pz < 0 || px >= PARCELS || pz >= PARCELS) return false;
    if (isParcelOwned(px, pz)) return false;
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => isParcelOwned(px + dx, pz + dz));
  }

  function buyParcel(px, pz) {
    if (!isParcelBuyable(px, pz)) return { ok: false, msg: '이미 보유한 땅과 맞닿은 구역만 매입할 수 있습니다.' };
    const price = landPrice();
    if (G.budget < price) return { ok: false, msg: `예산이 부족합니다. (필요: ${fmtWon(price)})` };
    G.parcels.push(parcelKey(px, pz));
    G.budget -= price;
    G.totalSpent += price;
    G.totalLand += price;
    addLog('land', `🗺️ 새 부지를 매입했습니다. (${fmtWon(price)}) 마을이 넓어졌습니다 — 총 ${G.parcels.length}개 구역.`);
    return { ok: true, price };
  }

  /* ---------- 도로 ---------- */
  const isRoad = (x, z) => G.roads.includes(x + ',' + z);

  function hasRoadAccess(x, z, size = 1) {
    for (let dx = 0; dx < size; dx++) for (let dz = 0; dz < size; dz++) {
      const tx = x + dx, tz = z + dz;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oz]) => isRoad(tx + ox, tz + oz))) return true;
    }
    return false;
  }

  function buildRoad(x, z) {
    if (!isOwned(x, z)) return { ok: false, msg: '우리 마을 땅에만 도로를 낼 수 있습니다.' };
    if (isRoad(x, z)) return { ok: false, msg: '이미 도로입니다.' };
    if (G.budget < DATA.ROAD.cost) return { ok: false, msg: '공사비가 부족합니다.' };
    G.roads.push(x + ',' + z);
    G.budget -= DATA.ROAD.cost;
    G.totalSpent += DATA.ROAD.cost;
    G.totalRoad += DATA.ROAD.cost;
    return { ok: true };
  }

  function removeRoad(x, z) {
    const i = G.roads.indexOf(x + ',' + z);
    if (i < 0) return { ok: false, msg: '도로가 아닙니다.' };

    // 이 길을 걷어내면 도로와 끊어지는 시설이 있는지 먼저 확인한다
    const rest = new Set(G.roads.filter((_, k) => k !== i));
    const stranded = G.buildings.find(b => {
      const def = getDef(b.defId);
      for (let dx = 0; dx < def.size; dx++) for (let dz = 0; dz < def.size; dz++) {
        const tx = b.x + dx, tz = b.z + dz;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ox, oz]) => rest.has((tx + ox) + ',' + (tz + oz)))) return false;
      }
      return true;
    });
    if (stranded) return {
      ok: false,
      msg: `${getDef(stranded.defId).name}이(가) 도로와 끊어집니다. 다른 길을 먼저 내주세요.`,
    };

    G.roads.splice(i, 1);
    G.budget += DATA.ROAD.refund;
    return { ok: true };
  }

  /* ---------- 꾸미기 ----------
   * 나무·벤치·조형물 같은 소품. 건물과 달리 도로 접근이 필요 없고,
   * 우리 땅 위 빈자리(물·건물·도로·다른 꾸밈요소가 아닌 곳)면 어디든 놓을 수 있다.
   * 타일 상태 판정은 World가 하고, 여기서는 소유권·도로 여부만 본다.
   */
  function getDecorDef(defId) { return DATA.DECOR.find(d => d.id === defId); }

  function checkDecorSite(x, z) {
    if (!isOwned(x, z)) return { ok: false, msg: '우리 마을 땅이 아닙니다. 먼저 부지를 매입하세요.' };
    if (isRoad(x, z)) return { ok: false, msg: '도로 위에는 놓을 수 없습니다.' };
    return { ok: true };
  }

  function placeDecor(defId, x, z) {
    const def = getDecorDef(defId);
    if (!def) return { ok: false, msg: '알 수 없는 꾸밈 요소입니다.' };
    const site = checkDecorSite(x, z);
    if (!site.ok) return site;
    if (G.budget < def.cost) return { ok: false, msg: `예산이 부족합니다. (필요: ${fmtWon(def.cost)})` };
    const inst = { id: uid('dec'), defId, x, z };
    G.decor.push(inst);
    G.budget -= def.cost;
    G.totalSpent += def.cost;
    G.totalDecor += def.cost;
    return { ok: true, inst };
  }

  function removeDecor(instId) {
    const i = G.decor.findIndex(d => d.id === instId);
    if (i < 0) return { ok: false, msg: '꾸밈 요소를 찾을 수 없습니다.' };
    const def = getDecorDef(G.decor[i].defId);
    const refund = Math.round(def.cost * 0.5);
    G.decor.splice(i, 1);
    G.budget += refund;
    return { ok: true, refund, def };
  }

  // 꾸밈 요소가 많을수록 마을이 예뻐져 만족도가 아주 조금씩 오른다 (상한 있음)
  function decorBeautyBonus() {
    return Math.min(G.decor.length * 0.025, 1.2);
  }

  /* ---------- 민가 ----------
   * 지형 생성 때 흩뿌려진 원래 주민의 집. 철거는 못 하지만 클릭해서 다른
   * 빈 자리로 이사 보낼 수 있다. World가 처음 생성한 배치를 한 번만
   * 저장해 두어, 이사한 뒤에도 새로고침 시 같은 자리에 남아 있게 한다.
   */
  function setHouses(list) {
    if (G.houses && G.houses.length) return;   // 이미 저장돼 있으면 재생성하지 않는다
    G.houses = list.map(h => ({ x: h.x, z: h.z, wall: h.wall, roof: h.roof }));
  }

  function checkHouseMoveSite(x, z) {
    if (!isOwned(x, z)) return { ok: false, msg: '우리 마을 땅이 아닙니다. 먼저 부지를 매입하세요.' };
    if (isRoad(x, z)) return { ok: false, msg: '도로 위로는 옮길 수 없습니다.' };
    return { ok: true };
  }

  function moveHouse(oldX, oldZ, newX, newZ) {
    const h = G.houses.find(h => h.x === oldX && h.z === oldZ);
    if (!h) return { ok: false, msg: '이사 보낼 집을 찾을 수 없습니다.' };
    const site = checkHouseMoveSite(newX, newZ);
    if (!site.ok) return site;
    h.x = newX; h.z = newZ;
    addLog('build', `🚚 주민 집을 새 자리로 옮겼습니다.`);
    return { ok: true, house: h };
  }

  /* ---------- 로그/기록 ---------- */
  function addLog(kind, text) {
    G.log.push({ turn: G.turn, kind, text, ym: `${G.year}년차 ${G.month}월` });
    if (G.log.length > 200) G.log.shift();
  }

  function totalPop() { return DATA.GROUP_IDS.reduce((s, g) => s + G.pop[g], 0); }
  function avgSat() {
    const t = totalPop();
    if (!t) return 0;
    return DATA.GROUP_IDS.reduce((s, g) => s + G.sat[g] * G.pop[g], 0) / t;
  }
  /* ---------- 총점 ----------
   * 점수판에 보이는 세 지표만으로 계산한다 — 보이는 것이 곧 점수다.
   * 인구만 불리는 것보다 만족도를 지키고 사례를 종결하는 쪽을 크게 쳐준다.
   * (평판과 시설은 점수에 직접 들어가지 않지만, 평판은 인구 유입을,
   *  시설은 만족도를 끌어올려 결국 점수로 돌아온다.)
   */
  const SCORE_W = { pop: 1, sat: 20, closed: 100 };
  const CASE_TARGET = 30;    // 종결 사례 막대가 가득 차는 기준
  function score() {
    return Math.round(
      totalPop() * SCORE_W.pop
      + avgSat() * SCORE_W.sat
      + G.closedCases * SCORE_W.closed
      + (G.awardScore || 0)
    );
  }

  function pushHistory() {
    G.history.push({
      turn: G.turn, label: `${G.year}년차 ${G.month}월`,
      pop: totalPop(), sat: Math.round(avgSat() * 10) / 10,
      rep: Math.round(G.rep), budget: G.budget,
    });
    if (G.history.length > 120) G.history.shift();
  }

  /* ---------- 건축 ---------- */
  function getDef(defId) { return DATA.BUILDINGS.find(b => b.id === defId); }
  function hasBuilding(defId) { return G.buildings.some(b => b.defId === defId); }

  /* ---------- 도시등급 ---------- */
  function cityTier() {
    let best = DATA.CITY_TIERS[0];
    for (const t of DATA.CITY_TIERS) if (totalPop() >= t.pop) best = t;
    return best;
  }
  function nextCityTier() {
    const cur = cityTier();
    return DATA.CITY_TIERS.find(t => t.tier === cur.tier + 1) || null;
  }

  /* ---------- 주거 수용량 ---------- */
  function housingCapacity() {
    const houseCap = (G.houses || []).length * DATA.HOUSING.capPerHouse;
    const aptCap = G.buildings.reduce((s, b) => s + (getDef(b.defId).housingCap || 0), 0);
    return houseCap + aptCap;
  }
  function housingRatio() {
    const cap = housingCapacity();
    return cap > 0 ? totalPop() / cap : 1;
  }

  /* ---------- 복지 접근성 ----------
   * 지도를 7×7 구역(파셀)으로 나눠 인구·시설 커버리지를 계산한다.
   * 인구는 그 구역의 주거 수용량 비중만큼 그 구역에 산다고 가정한다
   * (민가·아파트가 많은 구역일수록 실제로 사람이 많이 사는 구역으로 취급).
   */
  function zoneCenter(px, pz) {
    const P = DATA.MAP.PARCEL;
    return [px * P + P / 2, pz * P + P / 2];
  }

  // 이 구역(px,pz) 안에 있는 주거 수용량 — 건물이 구역 경계에 걸쳐 있으면 겹치는 칸 비율만큼만 센다
  function zoneHousingCap(px, pz) {
    let cap = 0;
    for (const h of (G.houses || [])) {
      const [hpx, hpz] = parcelOf(h.x, h.z);
      if (hpx === px && hpz === pz) cap += DATA.HOUSING.capPerHouse;
    }
    for (const b of G.buildings) {
      const def = getDef(b.defId);
      if (!def.housingCap) continue;
      const totalTiles = def.size * def.size;
      let tilesHere = 0;
      for (let dx = 0; dx < def.size; dx++) for (let dz = 0; dz < def.size; dz++) {
        const [bpx, bpz] = parcelOf(b.x + dx, b.z + dz);
        if (bpx === px && bpz === pz) tilesHere++;
      }
      if (tilesHere > 0) cap += def.housingCap * (tilesHere / totalTiles);
    }
    return cap;
  }

  // 이 구역의 접근성 점수(0~100) — 반경 안 host 시설들의 거리 감쇠 합, 100점 상한
  function zoneAccessScore(px, pz) {
    const [cx, cz] = zoneCenter(px, pz);
    let score = 0;
    for (const b of G.buildings) {
      const def = getDef(b.defId);
      if (!def.host) continue;
      const bx = b.x + def.size / 2, bz = b.z + def.size / 2;
      const dist = Math.hypot(bx - cx, bz - cz);
      if (dist > DATA.ACCESS.radiusTiles) continue;
      score += Math.max(0, 1 - dist / DATA.ACCESS.radiusTiles) * 100;
    }
    return Math.min(100, Math.round(score));
  }

  // 우리 구역별 인구·접근성 목록 (보유한 구역만)
  function zoneList() {
    const owned = G.parcels.map(k => k.split(',').map(Number));
    const caps = owned.map(([px, pz]) => zoneHousingCap(px, pz));
    const totalCap = caps.reduce((s, c) => s + c, 0);
    const pop = totalPop();
    return owned.map(([px, pz], i) => {
      const share = totalCap > 0 ? caps[i] / totalCap : 1 / owned.length;
      return { px, pz, pop: Math.round(pop * share), access: zoneAccessScore(px, pz) };
    });
  }

  // 마을 전체 접근성 점수 — 인구 가중 평균
  function accessibilityScore() {
    const zones = zoneList();
    const pop = totalPop();
    if (!pop) return 100;
    return Math.round(zones.reduce((s, z) => s + z.access * z.pop, 0) / pop);
  }

  // 복지사각지대 — 사람은 사는데 접근성이 기준보다 낮은 구역
  function coldSpots() {
    return zoneList().filter(z => z.pop > 0 && z.access < DATA.ACCESS.coldThreshold);
  }

  // 시설이 특정 구역에 몰려 있는지 — 사각지대와 과밀 구역이 동시에 있으면 불균형으로 본다
  function isOverConcentrated() {
    const zones = zoneList().filter(z => z.pop > 0);
    return zones.some(z => z.access < DATA.ACCESS.coldThreshold) && zones.some(z => z.access >= DATA.ACCESS.goodThreshold);
  }

  // 접근성이 좋을수록 만족도가 조금씩 오르고, 나쁠수록 조금씩 깎인다 (decorBeautyBonus와 같은 자리에 쓰인다)
  function accessBonus() {
    const s = accessibilityScore();
    return s >= 50
      ? (s - 50) / 50 * DATA.ACCESS.satBonusMax
      : (s - 50) / 50 * DATA.ACCESS.satPenaltyMax;
  }

  /* ---------- 해금 조건 ----------
   * def.unlock = { pop, cityTier, facilityCount, accessScore } (전부 선택, 모두 만족해야 해금)
   */
  function checkUnlock(def) {
    if (!def.unlock) return { ok: true, reasons: [] };
    const u = def.unlock;
    const reasons = [];
    if (u.pop && totalPop() < u.pop) reasons.push(`인구 ${u.pop.toLocaleString()}명`);
    if (u.cityTier && cityTier().tier < u.cityTier) {
      const t = DATA.CITY_TIERS.find(t => t.tier === u.cityTier);
      reasons.push(`복지도시 Lv.${u.cityTier}(${t ? t.name : ''})`);
    }
    if (u.facilityCount && G.buildings.length < u.facilityCount) reasons.push(`복지기관 ${u.facilityCount}개 이상`);
    if (u.accessScore && accessibilityScore() < u.accessScore) reasons.push(`복지 접근성 ${u.accessScore}점 이상`);
    return { ok: reasons.length === 0, reasons };
  }

  // 부지 조건: 우리 땅 + 도로에 접함. (3D 배치 가능 여부는 World가 함께 본다)
  function checkSite(def, x, z) {
    for (let dx = 0; dx < def.size; dx++) for (let dz = 0; dz < def.size; dz++) {
      if (!isOwned(x + dx, z + dz)) return { ok: false, msg: '우리 마을 땅이 아닙니다. 먼저 부지를 매입하세요.' };
      if (isRoad(x + dx, z + dz)) return { ok: false, msg: '도로 위에는 지을 수 없습니다.' };
    }
    if (!hasRoadAccess(x, z, def.size)) return { ok: false, msg: '도로에 접해야 지을 수 있습니다. 길을 먼저 내주세요.' };
    return { ok: true };
  }

  // custom(선택): { style, wall, roof } — 디자인/색상 커스터마이징. 안 주면 시설 기본값으로 렌더링된다.
  function build(defId, x, z, custom) {
    const def = getDef(defId);
    if (!def) return { ok: false, msg: '알 수 없는 시설입니다.' };
    const unlock = checkUnlock(def);
    if (!unlock.ok) return { ok: false, msg: `아직 지을 수 없습니다. 해금 조건: ${unlock.reasons.join(' · ')}` };
    const site = checkSite(def, x, z);
    if (!site.ok) return site;
    if (G.budget < def.cost) return { ok: false, msg: `예산이 부족합니다. (필요: ${fmtWon(def.cost)})` };
    const firstCommunityCenter = defId === 'communityCenter' && !hasBuilding('communityCenter');
    const inst = { id: uid('bld'), defId, x, z };
    if (custom && (custom.style || custom.wall || custom.roof)) inst.custom = custom;
    G.buildings.push(inst);
    G.budget -= def.cost;
    G.totalSpent += def.cost;
    G.rep = clamp(G.rep + 3, 0, 100);
    addLog('build', `${def.icon} ${def.name} 건립! (${fmtWon(def.cost)}) 주민들의 기대가 큽니다.`);
    if (firstCommunityCenter && !G.mission.active && !G.mission.done) {
      G.mission.active = true;
      addLog('mission', '🎪 [미션] 주민커뮤니티센터가 문을 열었습니다! 이곳을 무대로, 모든 주민이 함께 어울리는 프로그램을 기획해 보세요. 어르신이 살던 곳에서 오래오래 지낼 수 있도록(AIP) 이웃이 함께 살피는 공동케어회의도 여기서 열립니다.');
    }
    return { ok: true, inst, missionStarted: firstCommunityCenter && G.mission.active };
  }

  function demolish(instId) {
    const i = G.buildings.findIndex(b => b.id === instId);
    if (i < 0) return { ok: false };
    const inst = G.buildings[i];
    const def = getDef(inst.defId);
    const refund = Math.round(def.cost * 0.3);
    G.buildings.splice(i, 1);
    G.budget += refund;
    // 이 시설에서 돌던 프로그램은 중단
    G.programs.forEach(p => {
      if (p.facilityInstId === instId && p.active) {
        p.active = false;
        addLog('warn', `⏸️ 「${p.title}」 프로그램이 시설 철거로 중단되었습니다.`);
      }
    });
    addLog('build', `${def.name}을(를) 철거했습니다. (환급 ${fmtWon(refund)})`);
    return { ok: true, refund, def };
  }

  function upkeepTotal() {
    return G.buildings.reduce((s, b) => s + getDef(b.defId).upkeep, 0);
  }

  /* ---------- 프로그램 ---------- */
  function detectKeywords(text) {
    const found = [];
    for (const k of DATA.KEYWORDS) {
      if (k.words.some(w => text.includes(w))) found.push(k);
    }
    return found;
  }

  function hostableFacilities() {
    return G.buildings.filter(b => getDef(b.defId).host);
  }

  function createProgram({ title, desc, target, budget, facilityInstId }) {
    title = (title || '').trim();
    desc = (desc || '').trim();
    if (!title) return { ok: false, msg: '프로그램 제목을 입력해 주세요.' };
    if (!desc) return { ok: false, msg: '세부 설명을 입력해 주세요.' };
    const fac = G.buildings.find(b => b.id === facilityInstId);
    if (!fac) return { ok: false, msg: '운영할 시설을 선택해 주세요.' };
    if (G.programs.some(p => p.active && p.title === title))
      return { ok: false, msg: '같은 이름의 프로그램이 이미 운영 중입니다.' };
    if (G.budget < budget) return { ok: false, msg: '이번 달 운영비만큼의 예산이 없습니다.' };

    const p = {
      id: uid('prg'), title, desc, target, budget,
      facilityInstId, facilityDefId: fac.defId,
      active: true, createdTurn: G.turn,
      keywords: detectKeywords(title + ' ' + desc).map(k => k.id),
      history: [], totalParticipants: 0,
    };
    G.programs.push(p);
    G.rep = clamp(G.rep + 1.5, 0, 100);
    addLog('program', `📋 신규 프로그램 「${title}」 개설! 다음 달부터 운영됩니다.`);

    // 미션: 주민커뮤니티센터에서, 모든 주민 대상으로, '공동체' 색깔이 담긴 프로그램을 열면 완료
    let missionCompleted = false;
    if (G.mission.active && !G.mission.done && p.facilityDefId === 'communityCenter' &&
        p.target === 'all' && p.keywords.includes('community')) {
      G.mission.active = false;
      G.mission.done = true;
      missionCompleted = true;
      const bonus = 3e8;
      G.budget += bonus;
      G.rep = clamp(G.rep + 8, 0, 100);
      addLog('mission', `🏆 [미션 완료] 「${title}」 프로그램으로 지역주민이 함께 어울리는 마을을 만들었습니다! 공동케어회의를 통한 AIP(Aging In Place) 방안까지 마련되어 특별교부금 ${fmtWon(bonus)}이 지급되었습니다.`);
    }
    return { ok: true, program: p, missionCompleted };
  }

  function setProgramActive(pid, active) {
    const p = G.programs.find(q => q.id === pid);
    if (!p) return;
    if (active && !G.buildings.some(b => b.id === p.facilityInstId)) {
      return { ok: false, msg: '운영 시설이 철거되어 재개할 수 없습니다.' };
    }
    p.active = active;
    addLog('program', active ? `▶️ 「${p.title}」 운영 재개.` : `⏸️ 「${p.title}」 운영 중단.`);
    return { ok: true };
  }

  function runProgramMonth(p) {
    const def = getDef(p.facilityDefId);
    const groups = p.target === 'all' ? DATA.GROUP_IDS : [p.target];
    const eligible = groups.reduce((s, g) => s + G.pop[g], 0) * (p.target === 'all' ? 0.55 : 1);

    // 호응도(appeal) 계산
    let interest = 1.0;
    const kws = DATA.KEYWORDS.filter(k => p.keywords.includes(k.id));
    if (kws.length) {
      let best = 0;
      for (const g of groups) {
        for (const k of kws) best = Math.max(best, (k.interest[g] || 1) - 1);
      }
      interest += best;
    }
    let appeal = 0.16;
    appeal += Math.min(0.24, (p.budget / 1e7) * 0.06);          // 예산
    appeal += (interest - 1) * 0.35;                             // 키워드 적합
    if (p.desc.length >= 40) appeal += 0.05;                     // 정성 들인 기획
    if (p.target !== 'all' && def.goodFor.includes(p.target)) appeal += 0.09; // 시설 궁합
    if (p.target === 'all' && def.id === 'welfare') appeal += 0.07;
    appeal += G.rep * 0.0012;

    const cap = Math.max(10, def.cap);
    const participants = Math.max(0, Math.round(Math.min(cap, eligible * appeal * rnd(0.85, 1.15))));

    // 만족 평점: 1인당 예산이 너무 빠듯하면 감점
    const perHead = participants > 0 ? p.budget / participants : p.budget;
    let rating = 2.1 + appeal * 3.2 + (kws.length ? 0.3 : -0.2);
    if (perHead < 40000) rating -= 0.5;
    else if (perHead > 150000) rating += 0.3;
    rating = clamp(rating + rnd(-0.25, 0.25), 1, 5);
    rating = Math.round(rating * 10) / 10;

    // 참여자 반응 생성
    const pool = rating >= 3.8 ? DATA.COMMENTS.high : rating >= 2.7 ? DATA.COMMENTS.mid : DATA.COMMENTS.low;
    const comments = [];
    const used = new Set();
    const nComments = participants === 0 ? 0 : Math.min(3, Math.max(1, Math.round(participants / 12)));
    for (let i = 0; i < nComments; i++) {
      const g = pick(groups);
      const age = g === 'senior' ? irnd(66, 88) : g === 'disabled' ? irnd(19, 50) : irnd(20, 70);
      let text;
      if (i === 0 && kws.length && rating >= 3.2) text = DATA.COMMENTS.byKeyword[pick(kws).id];
      else { do { text = pick(pool); } while (used.has(text) && used.size < pool.length); }
      used.add(text);
      comments.push({ name: makeName(g, age), age, group: g, text });
    }

    // 효과 반영
    G.budget -= p.budget;
    G.totalSpent += p.budget;
    for (const g of groups) {
      const share = groups.length === 1 ? 1 : G.pop[g] / groups.reduce((s, q) => s + G.pop[q], 0);
      const gain = (participants * share) / Math.max(1, G.pop[g]) * rating * 2.4;
      G.sat[g] = clamp(G.sat[g] + gain, 0, 100);
    }
    if (rating >= 4.2) G.rep = clamp(G.rep + 0.8, 0, 100);
    if (rating < 2.3) G.rep = clamp(G.rep - 0.5, 0, 100);

    p.history.push({ turn: G.turn, participants, rating, comments });
    if (p.history.length > 24) p.history.shift();
    p.totalParticipants += participants;

    if (participants === 0) addLog('warn', `「${p.title}」에 아무도 오지 않았습니다. 기획을 다듬어 보세요.`);
  }

  /* ---------- 사례관리 ---------- */
  function makeCase() {
    // 사례가 잦은 집단일수록 자주 접수된다
    const weights = { senior: 26, basic: 24, disabled: 14, youth: 14, multicultural: 13, defector: 9 };
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let roll = Math.random() * total, group = 'senior';
    for (const [g, w] of Object.entries(weights)) { roll -= w; if (roll <= 0) { group = g; break; } }
    const t = DATA.CASE_TEMPLATES[group];
    const age = irnd(t.ageRange[0], t.ageRange[1]);
    const name = makeName(group, age);
    const nNeeds = irnd(2, 3);
    const poolCopy = [...t.needPool];
    const needs = [];
    for (let i = 0; i < nNeeds && poolCopy.length; i++) {
      const idx = Math.floor(Math.random() * poolCopy.length);
      const cat = poolCopy.splice(idx, 1)[0];
      needs.push({ cat, resolved: false, resource: null });
    }
    const story = pick(t.stories).replace('{yrs}', irnd(3, 14));
    return {
      id: uid('case'), name, age, group, story, needs,
      openedTurn: G ? G.turn : 0, closed: false, failedTries: 0,
    };
  }

  function resourceAvailable(res) {
    if (res.req && !hasBuilding(res.req)) {
      const b = DATA.BUILDINGS.find(x => x.id === res.req);
      return { ok: false, msg: `${b.name}이(가) 마을에 있어야 연계할 수 있습니다.` };
    }
    if (res.cost > 0 && G.budget < res.cost) return { ok: false, msg: '연계 비용을 낼 예산이 없습니다.' };
    return { ok: true };
  }

  function linkResource(caseId, needIdx, resourceId) {
    const c = G.cases.find(x => x.id === caseId);
    if (!c || c.closed) return { ok: false, msg: '종결된 사례입니다.' };
    const need = c.needs[needIdx];
    if (!need || need.resolved) return { ok: false, msg: '이미 해결된 욕구입니다.' };
    const res = DATA.RESOURCES.find(r => r.id === resourceId);
    if (!res) return { ok: false, msg: '알 수 없는 자원입니다.' };

    const avail = resourceAvailable(res);
    if (!avail.ok) return { ok: false, msg: avail.msg };

    if (!res.treats.includes(need.cat)) {
      c.failedTries++;
      const needDef = DATA.NEEDS[need.cat];
      return {
        ok: false, wrong: true,
        msg: `「${res.name}」은(는) ${needDef.label} 욕구와 맞지 않았습니다. 당사자의 상황을 다시 살펴보세요.`,
      };
    }

    if (res.cost > 0) { G.budget -= res.cost; G.totalSpent += res.cost; }
    need.resolved = true;
    need.resource = res.name;
    G.sat[c.group] = clamp(G.sat[c.group] + 2.5, 0, 100);
    const needDef = DATA.NEEDS[need.cat];
    addLog('case', `🤝 ${c.name}님의 ${needDef.label} 욕구를 「${res.name}」과 연계해 해결했습니다.`);

    if (c.needs.every(n => n.resolved)) {
      c.closed = true;
      G.closedCases++;
      G.rep = clamp(G.rep + 2.5, 0, 100);
      G.sat[c.group] = clamp(G.sat[c.group] + 2, 0, 100);
      addLog('case', `🎉 ${c.name}님 사례 종결! "${G.village} 덕분에 다시 살아갈 힘이 생겼어요."`);

      // 사례가 잘 풀릴수록 주민 행복지수가 오르고, 그만큼 보조금이 따라온다
      const bonus = happinessBonus();
      G.budget += bonus;
      G.totalGrant += bonus;
      G.totalHappinessBonus += bonus;
      addLog('money', `💰 주민 행복지수가 높아져서 보조금 ${fmtWon(bonus)}이 추가되었습니다.`);

      return { ok: true, closed: true, bonus };
    }
    return { ok: true, closed: false };
  }

  function openCases() { return G.cases.filter(c => !c.closed); }

  /* ---------- 행복지수 보조금 ----------
   * 사례를 종결할 때마다 주민 만족도에 비례한 보조금이 들어온다.
   * 만족도가 높을수록(= 마을이 살 만할수록) 더 크게 돌아온다.
   */
  function happinessBonus() {
    return Math.round(avgSat() * 6e5 + totalPop() * 2e4);
  }

  /* =========================================================
   * 공모사업
   * ========================================================= */
  function getGrant(id) { return DATA.GRANTS.find(g => g.id === id); }
  function isGrantWon(id) { return G.grants.includes(id); }

  /** 탈락 후 재도전까지 남은 개월 수 (0이면 지금 신청 가능) */
  function grantCooldown(id) {
    const last = G.grantTries[id];
    if (last === undefined) return 0;
    return Math.max(0, DATA.GRANT_RULES.cooldown - (G.turn - last));
  }

  const countWords = (text, words) => words.filter(w => text.includes(w)).length;

  /**
   * 신청서를 심사한다. 항목별 점수와 사유를 함께 돌려주어
   * 왜 붙고 왜 떨어졌는지 배울 수 있게 한다.
   */
  function reviewGrant(grantId, form) {
    const g = getGrant(grantId);
    const R = DATA.GRANT_RULES;
    const title = (form.title || '').trim();
    const purpose = (form.purpose || '').trim();
    const goal = (form.goal || '').trim();
    const content = (form.content || '').trim();
    const all = `${title} ${purpose} ${goal} ${content}`;

    const items = [];

    // 1. 사업 대상이 분명한가 (25)
    const hitKw = countWords(all, g.keywords);
    items.push({
      label: '대상과 사업 취지가 드러나는가',
      max: 25,
      score: hitKw >= 3 ? 25 : hitKw === 2 ? 18 : hitKw === 1 ? 10 : 0,
      ok: hitKw >= 2,
      hint: hitKw >= 2
        ? `공모 취지에 맞는 표현 ${hitKw}개를 확인했습니다.`
        : `이 공모의 핵심어(${g.keywords.slice(0, 4).join(', ')} 등)가 잘 드러나지 않습니다.`,
    });

    // 2. 목적이 충분히 서술되었는가 (20)
    const pOk = purpose.length >= R.minPurpose;
    items.push({
      label: '목적이 구체적으로 서술되었는가',
      max: 20,
      score: pOk ? (purpose.length >= R.minPurpose * 1.6 ? 20 : 15) : Math.round(purpose.length / R.minPurpose * 10),
      ok: pOk,
      hint: pOk ? '목적이 충분히 적혀 있습니다.'
                : `목적을 ${R.minPurpose}자 이상 써주세요. 지금 ${purpose.length}자입니다.`,
    });

    // 3. 목표가 측정 가능한가 (25) — 숫자가 들어가야 한다
    const nums = goal.match(/\d+/g) || [];
    const gOk = nums.length >= 1 && goal.length >= 15;
    items.push({
      label: '목표가 숫자로 측정 가능한가',
      max: 25,
      score: nums.length >= 2 && goal.length >= 25 ? 25 : gOk ? 18 : 5,
      ok: gOk,
      hint: gOk ? '정량 목표가 확인됩니다.'
                : '목표에 숫자를 넣어주세요. 예) "월 2회, 20명 참여, 만족도 80점 이상"',
    });

    // 4. 프로그램 내용이 구체적인가 (20)
    const cOk = content.length >= R.minContent;
    items.push({
      label: '프로그램 내용이 구체적인가',
      max: 20,
      score: cOk ? (content.length >= R.minContent * 1.8 ? 20 : 15) : Math.round(content.length / R.minContent * 10),
      ok: cOk,
      hint: cOk ? '진행 방식이 충분히 적혀 있습니다.'
                : `내용을 ${R.minContent}자 이상 써주세요. 무엇을 몇 회, 누구와 하는지 적으면 좋습니다. 지금 ${content.length}자입니다.`,
    });

    // 5. 수행 역량 — 관련 시설 보유 (10)
    const hasFac = !g.facility || hasBuilding(g.facility);
    const facName = g.facility ? getDef(g.facility).name : '';
    items.push({
      label: '사업을 수행할 시설이 있는가',
      max: 10,
      score: hasFac ? 10 : 0,
      ok: hasFac,
      hint: hasFac ? (facName ? `${facName}을(를) 보유하고 있습니다.` : '수행 여건을 갖췄습니다.')
                   : `${facName}이(가) 있으면 수행 역량에서 가점을 받습니다.`,
    });

    const total = items.reduce((s, i) => s + i.score, 0);
    return { total, pass: total >= R.passScore, items, grant: g };
  }

  /** 심사 결과를 실제로 반영한다 */
  function applyGrant(grantId, form) {
    const g = getGrant(grantId);
    if (!g) return { ok: false, msg: '알 수 없는 공모사업입니다.' };
    if (isGrantWon(grantId)) return { ok: false, msg: '이미 선정된 공모사업입니다.' };
    const wait = grantCooldown(grantId);
    if (wait > 0) return { ok: false, msg: `재신청까지 ${wait}개월 남았습니다. 신청서를 더 다듬어 보세요.` };

    const result = reviewGrant(grantId, form);
    G.grantTries[grantId] = G.turn;

    if (result.pass) {
      G.grants.push(grantId);
      G.budget += g.grant;
      G.totalGrant += g.grant;
      G.totalGrantWon += g.grant;
      G.rep = clamp(G.rep + 3, 0, 100);
      addLog('grant', `🎊 「${g.name}」 선정! 지원금 ${fmtWon(g.grant)}이 예산에 들어왔습니다. (심사 ${result.total}점)`);
    } else {
      addLog('warn', `📋 「${g.name}」 미선정 (심사 ${result.total}점 / ${DATA.GRANT_RULES.passScore}점). 보완해서 다시 도전해 보세요.`);
    }
    return { ok: true, result };
  }

  /* =========================================================
   * 보건복지부 포상
   * 신청하지 않는다 — 마을이 일정 기간 계속 좋은 상태를 유지하면 매달 진행 상황을
   * 지켜보다가 자동으로 수여된다. 조건에 못 미친 달이 하루라도 끼면 그 상은 처음부터 다시 세야 한다.
   * ========================================================= */
  const AWARD_VILLAGE_SAT = 72;     // 표창장: 평균 만족도 기준
  const AWARD_PROGRAM_RATING = 4.0; // 장관상: 이번 달 운영된 프로그램 평균 평점 기준
  const AWARD_CASE_SAT = 68;        // 장관상: 취약계층 평균 만족도 기준(사례관리 성과 지표로 사용)

  function getAward(id) { return DATA.AWARDS.find(a => a.id === id); }

  function grantAward(id, news) {
    const def = getAward(id);
    G.awardCounts[id] = (G.awardCounts[id] || 0) + 1;
    G.awardScore += def.scoreBonus;
    G.budget += def.prize;
    G.totalAwardPrize += def.prize;
    G.awards.push({ id, turn: G.turn, count: G.awardCounts[id] });
    const nth = G.awardCounts[id] > 1 ? ` (${G.awardCounts[id]}번째)` : '';
    addLog('award', `${def.icon} [${def.org}] 「${def.name}」 수상!${nth} 포상금 ${fmtWon(def.prize)} · 점수 +${def.scoreBonus}점`);
    news.push({ kind: 'award', text: `${def.name} 수상!`, awardId: id });
  }

  function checkAwards(news) {
    // 복지마을 선도우수사례 표창장 — 마을 평균 만족도가 계속 좋은 상태인지
    G.villageGoodStreak = avgSat() >= AWARD_VILLAGE_SAT ? G.villageGoodStreak + 1 : 0;
    const villageDef = getAward('villageExemplary');
    if (G.villageGoodStreak >= villageDef.streakMonths) {
      G.villageGoodStreak = 0;
      grantAward('villageExemplary', news);
    }

    // 우수 사회복지 프로그램 보건복지부 장관상 — 이번 달 프로그램 평점 + 취약계층 만족도
    const ratedThisMonth = G.programs
      .map(p => p.history[p.history.length - 1])
      .filter(h => h && h.turn === G.turn);
    const avgRating = ratedThisMonth.length
      ? ratedThisMonth.reduce((s, h) => s + h.rating, 0) / ratedThisMonth.length : 0;
    const caseSat = DATA.VULNERABLE_IDS.reduce((s, g) => s + G.sat[g], 0) / DATA.VULNERABLE_IDS.length;
    const programOk = ratedThisMonth.length > 0 && avgRating >= AWARD_PROGRAM_RATING && caseSat >= AWARD_CASE_SAT;
    G.programExcellentStreak = programOk ? G.programExcellentStreak + 1 : 0;
    const programDef = getAward('programExcellence');
    if (G.programExcellentStreak >= programDef.streakMonths) {
      G.programExcellentStreak = 0;
      grantAward('programExcellence', news);
    }
  }

  /* ---------- 월 진행 ---------- */
  function nextMonth() {
    if (!G) return;
    G.turn++;
    G.month++;
    if (G.month > 12) { G.month = 1; G.year++; }
    const news = [];

    // 1) 시설 유지비 + 패시브 효과
    const upkeep = upkeepTotal();
    if (upkeep > 0) { G.budget -= upkeep; G.totalSpent += upkeep; }
    const passiveCount = {};
    for (const b of G.buildings) {
      const def = getDef(b.defId);
      passiveCount[def.id] = (passiveCount[def.id] || 0) + 1;
      const dim = Math.pow(0.75, passiveCount[def.id] - 1); // 같은 시설 중복은 효과 체감
      for (const g of DATA.GROUP_IDS) {
        if (def.passive[g]) G.sat[g] = clamp(G.sat[g] + def.passive[g] * dim, 0, 100);
      }
    }

    // 2) 프로그램 운영
    for (const p of G.programs) {
      if (!p.active) continue;
      if (G.budget < p.budget) {
        p.active = false;
        addLog('warn', `💸 예산 부족으로 「${p.title}」 운영이 중단되었습니다.`);
        continue;
      }
      runProgramMonth(p);
    }

    // 3) 만족도 자연 감소(관심이 끊기면 서서히 하락) + 꾸민 마을의 미관 보너스 + 복지 접근성 보너스/페널티
    const beauty = decorBeautyBonus();
    const access = accessBonus();
    for (const g of DATA.GROUP_IDS) {
      G.sat[g] = clamp(G.sat[g] - (G.sat[g] > 35 ? 1.0 : 0.3) + beauty + access, 0, 100);
    }

    // 4) 방치된 사례 악화
    for (const c of openCases()) {
      const monthsOpen = G.turn - c.openedTurn;
      if (monthsOpen >= 3 && monthsOpen % 2 === 1) {
        G.sat[c.group] = clamp(G.sat[c.group] - 0.8, 0, 100);
        if (monthsOpen === 5) addLog('warn', `⚠️ ${c.name}님 상황이 나빠지고 있습니다. 사례 개입이 시급합니다.`);
      }
    }

    // 5) 새 사례 발굴
    if (openCases().length < 8 && Math.random() < 0.75) {
      const c = makeCase();
      G.cases.push(c);
      addLog('case', `📂 신규 사례 접수: ${c.name}님(${c.age}세, ${DATA.GROUPS[c.group].label})`);
    }

    // 6) 평판 갱신 및 인구 유입 (주거 수용률이 높으면 유입이 크게 줄어든다)
    const sat = avgSat();
    G.rep = clamp(G.rep + (sat - G.rep) * 0.12, 0, 100);
    if (G.rep >= 45) {
      const inflowBase = (G.rep - 40) / 10;
      let persons = Math.max(0, Math.round(inflowBase * rnd(1.2, 3.2)));
      if (housingRatio() >= DATA.HOUSING.squeezeRatio) persons = Math.round(persons * DATA.HOUSING.squeezeFactor);
      if (persons > 0) {
        const vulnerable = Math.round(persons * 0.3);
        const gen = persons - vulnerable;
        G.pop.general += gen;
        const vg = pick(DATA.VULNERABLE_IDS);
        G.pop[vg] += vulnerable;
        const line = pick(DATA.MIGRATION_LINES).replace('{n}', persons);
        addLog('move', '🏡 ' + line);
        news.push({ kind: 'move', text: line, count: persons });
      }
    }

    // 6b) 주거공간 부족 경고 — 넘을 때 한 번만 알리고, 여유가 다시 생기면 재무장한다
    const hRatio = housingRatio();
    if (hRatio >= DATA.HOUSING.warnRatio && !G.housingWarned) {
      G.housingWarned = true;
      const msg = `주거공간 확충이 필요합니다. 복지마을의 인구가 빠르게 증가하고 있습니다. `
        + `현재 인구 ${totalPop().toLocaleString()}명 / 최대 수용 인구 ${housingCapacity().toLocaleString()}명. `
        + `더 많은 주민이 안정적으로 거주할 수 있도록 공공아파트 건설을 검토해 주세요.`;
      addLog('warn', '🏘️ ' + msg);
      news.push({ kind: 'housing', text: msg });
    } else if (hRatio < DATA.HOUSING.warnRatio - 0.1) {
      G.housingWarned = false;
    }

    // 6c) 복지사각지대 경고 — 시설이 한쪽에 몰려 다른 구역이 소외되면 한 번 알리고,
    // 균형이 맞춰지면(사각지대가 사라지면) 재무장해서 다음에 또 몰리면 다시 알린다
    const cold = coldSpots();
    if (cold.length > 0 && isOverConcentrated() && !G.accessWarned) {
      G.accessWarned = true;
      const msg = `복지사각지대 발생 가능성이 있습니다. 현재 복지시설이 특정 구역에 집중되어 있습니다. `
        + `주민들이 필요한 서비스를 가까운 곳에서 이용할 수 있도록 복지시설을 다른 구역에도 골고루 배치해 주세요. `
        + `(사각지대 ${cold.length}개 구역 · 마을 전체 접근성 ${accessibilityScore()}점)`;
      addLog('warn', '🗺️ ' + msg);
      news.push({ kind: 'access', text: msg });
    } else if (cold.length === 0) {
      G.accessWarned = false;
    }

    // 7) 분기 교부금 (3·6·9·12월)
    if (G.month % 3 === 0) {
      const grant = totalPop() * GRANT_PER_CAPITA + Math.round(G.rep * 1e6);
      G.budget += grant;
      G.totalGrant += grant;
      addLog('money', `🏦 분기 교부금 ${fmtWon(grant)} 입금 (인구 ${totalPop()}명 × 40만 원 + 평판 가산).`);
    }

    // 8) 랜덤 이벤트
    if (Math.random() < 0.35) {
      const candidates = DATA.EVENTS.filter(e => {
        if (e.months && !e.months.includes(G.month)) return false;
        if (e.cond === 'rep50' && G.rep < 50) return false;
        if (e.cond === 'rep70' && G.rep < 70) return false;
        return true;
      });
      if (candidates.length) {
        const ev = pick(candidates);
        if (ev.effect.budget) { G.budget += ev.effect.budget; G.totalGrant += ev.effect.budget; }
        if (ev.effect.rep) G.rep = clamp(G.rep + ev.effect.rep, 0, 100);
        if (ev.effect.sat) for (const g in ev.effect.sat) G.sat[g] = clamp(G.sat[g] + ev.effect.sat[g], 0, 100);
        addLog('event', '📰 ' + ev.text);
        news.push({ kind: 'event', text: ev.text });
      }
    }

    // 9) 보건복지부 포상 심사 (평균 만족도·프로그램 평점·사례관리 성과가 계속 좋은지)
    checkAwards(news);

    // 10) 예산 경고
    if (G.budget < 0) addLog('warn', '🚨 예산이 바닥났습니다! 프로그램을 정리하거나 교부금을 기다려야 합니다.');

    // 11) 목표 달성 체크
    if (!G.won && totalPop() >= GOAL.pop && avgSat() >= GOAL.sat) {
      G.won = true;
      news.push({ kind: 'win', text: '' });
      addLog('sys', `🏆 인구 ${GOAL.pop}명·만족도 ${GOAL.sat}점 달성! ${G.village}은 전국이 주목하는 복지도시가 되었습니다.`);
    }

    pushHistory();
    save();
    return { news };
  }

  /* ---------- 저장/불러오기 ---------- */
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* 저장 불가 환경 무시 */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      // 토지·도로가 없던 이전 저장본도 열리도록 기본값을 채운다
      if (!s.parcels) s.parcels = initialParcels();
      if (!s.roads) s.roads = initialRoads();
      if (s.seed === undefined) s.seed = 1;
      s.totalLand = s.totalLand || 0;
      s.totalRoad = s.totalRoad || 0;
      // 그룹이 4개뿐이던 저장본도 열리도록 새 그룹을 채운다
      for (const g of DATA.GROUP_IDS) {
        if (s.pop[g] === undefined) s.pop[g] = 0;
        if (s.sat[g] === undefined) s.sat[g] = 38;
      }
      if (!s.grants) s.grants = [];
      if (!s.grantTries) s.grantTries = {};
      s.totalGrantWon = s.totalGrantWon || 0;
      s.totalHappinessBonus = s.totalHappinessBonus || 0;
      if (!s.decor) s.decor = [];
      s.totalDecor = s.totalDecor || 0;
      if (!s.houses) s.houses = [];
      if (!s.mission) s.mission = { active: false, done: false };
      if (!s.awards) s.awards = [];
      if (!s.awardCounts) s.awardCounts = {};
      s.awardScore = s.awardScore || 0;
      s.totalAwardPrize = s.totalAwardPrize || 0;
      s.villageGoodStreak = s.villageGoodStreak || 0;
      s.programExcellentStreak = s.programExcellentStreak || 0;
      s.housingWarned = s.housingWarned || false;
      s.accessWarned = s.accessWarned || false;
      return s;
    } catch (e) { return null; }
  }
  function restore(s) { G = s; return G; }
  function reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    G = null;
  }
  return {
    get state() { return G; },
    GOAL, newGame, load, restore, save, reset,
    build, demolish, getDef, hasBuilding, upkeepTotal, checkSite,
    createProgram, setProgramActive, hostableFacilities, detectKeywords,
    linkResource, openCases, resourceAvailable, makeCase,
    nextMonth, totalPop, avgSat, score, SCORE_W, CASE_TARGET, fmtWon, addLog,
    happinessBonus,
    GRANTS: DATA.GRANTS, getGrant, isGrantWon, grantCooldown, reviewGrant, applyGrant,
    isOwned, isParcelOwned, isParcelBuyable, landPrice, buyParcel,
    isRoad, hasRoadAccess, buildRoad, removeRoad,
    getDecorDef, checkDecorSite, placeDecor, removeDecor, decorBeautyBonus,
    setHouses, checkHouseMoveSite, moveHouse,
    getAward, AWARDS: DATA.AWARDS,
    housingCapacity, housingRatio, cityTier, nextCityTier, checkUnlock,
    zoneList, accessibilityScore, coldSpots, isOverConcentrated,
  };
})();
