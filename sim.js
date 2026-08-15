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
      pop: { senior: 85, disabled: 40, basic: 125, general: 250 },
      sat: { senior: 40, disabled: 38, basic: 41, general: 47 },
      rep: 30,
      parcels: initialParcels(),   // 보유한 구역 ["px,pz", …]
      roads: initialRoads(),       // 깔린 도로 타일 ["x,z", …]
      buildings: [],       // {id, defId, x, z}
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

  // 부지 조건: 우리 땅 + 도로에 접함. (3D 배치 가능 여부는 World가 함께 본다)
  function checkSite(def, x, z) {
    for (let dx = 0; dx < def.size; dx++) for (let dz = 0; dz < def.size; dz++) {
      if (!isOwned(x + dx, z + dz)) return { ok: false, msg: '우리 마을 땅이 아닙니다. 먼저 부지를 매입하세요.' };
      if (isRoad(x + dx, z + dz)) return { ok: false, msg: '도로 위에는 지을 수 없습니다.' };
    }
    if (!hasRoadAccess(x, z, def.size)) return { ok: false, msg: '도로에 접해야 지을 수 있습니다. 길을 먼저 내주세요.' };
    return { ok: true };
  }

  function build(defId, x, z) {
    const def = getDef(defId);
    if (!def) return { ok: false, msg: '알 수 없는 시설입니다.' };
    const site = checkSite(def, x, z);
    if (!site.ok) return site;
    if (G.budget < def.cost) return { ok: false, msg: `예산이 부족합니다. (필요: ${fmtWon(def.cost)})` };
    const inst = { id: uid('bld'), defId, x, z };
    G.buildings.push(inst);
    G.budget -= def.cost;
    G.totalSpent += def.cost;
    G.rep = clamp(G.rep + 3, 0, 100);
    addLog('build', `${def.icon} ${def.name} 건립! (${fmtWon(def.cost)}) 주민들의 기대가 큽니다.`);
    return { ok: true, inst };
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
    return { ok: true, program: p };
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
    const roll = Math.random();
    const group = roll < 0.4 ? 'senior' : roll < 0.65 ? 'disabled' : 'basic';
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
      return { ok: true, closed: true };
    }
    return { ok: true, closed: false };
  }

  function openCases() { return G.cases.filter(c => !c.closed); }

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

    // 3) 만족도 자연 감소(관심이 끊기면 서서히 하락)
    for (const g of DATA.GROUP_IDS) {
      G.sat[g] = clamp(G.sat[g] - (G.sat[g] > 35 ? 1.0 : 0.3), 0, 100);
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

    // 6) 평판 갱신 및 인구 유입
    const sat = avgSat();
    G.rep = clamp(G.rep + (sat - G.rep) * 0.12, 0, 100);
    if (G.rep >= 45) {
      const inflowBase = (G.rep - 40) / 10;
      const persons = Math.max(0, Math.round(inflowBase * rnd(1.2, 3.2)));
      if (persons > 0) {
        const vulnerable = Math.round(persons * 0.3);
        const gen = persons - vulnerable;
        G.pop.general += gen;
        const vg = pick(['senior', 'basic', 'disabled']);
        G.pop[vg] += vulnerable;
        const line = pick(DATA.MIGRATION_LINES).replace('{n}', persons);
        addLog('move', '🏡 ' + line);
        news.push({ kind: 'move', text: line });
      }
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

    // 9) 예산 경고
    if (G.budget < 0) addLog('warn', '🚨 예산이 바닥났습니다! 프로그램을 정리하거나 교부금을 기다려야 합니다.');

    // 10) 목표 달성 체크
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
    nextMonth, totalPop, avgSat, fmtWon, addLog,
    isOwned, isParcelOwned, isParcelBuyable, landPrice, buyParcel,
    isRoad, hasRoadAccess, buildRoad, removeRoad,
  };
})();
