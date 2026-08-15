/* =========================================================
 * 복지마을 타이쿤 — 부트스트랩 & 게임 루프
 * ========================================================= */
'use strict';

(() => {

  const canvas = document.getElementById('scene');
  let pendingBuildDefId = null;
  let roadSpent = 0;         // 이번 드래그로 깐 도로 비용 합계
  let decorSpent = 0;        // 이번 드래그로 놓은 꾸미기 비용 합계

  /* ---------- 모드 ---------- */
  function startBuild(defId) {
    const def = Sim.getDef(defId);
    if (Sim.state.budget < def.cost) { UI.toast('예산이 부족합니다.', 'err'); return; }
    pendingBuildDefId = defId;
    World.setMode({ type: 'build', defId });
    UI.closePanel();
    UI.showModeHint(`${def.icon} <b>${def.name}</b> · 도로에 접한 우리 땅을 클릭하세요 · ${Sim.fmtWon(def.cost)}`);
  }

  function startLand() {
    World.setMode({ type: 'land' });
    UI.closePanel();
    UI.showModeHint(`🗺️ <b>부지 매입</b> · 노란 테두리 구역을 클릭하세요 · ${Sim.fmtWon(Sim.landPrice())}`);
  }

  function startRoad() {
    World.setMode({ type: 'road' });
    UI.closePanel();
    UI.showModeHint(`🛣️ <b>도로 건설</b> · 우리 땅 위를 끌어서 길을 이으세요 · 칸당 ${Sim.fmtWon(DATA.ROAD.cost)}`);
  }

  function startDecor(defId) {
    const def = Sim.getDecorDef(defId);
    if (Sim.state.budget < def.cost) { UI.toast('예산이 부족합니다.', 'err'); return; }
    World.setMode({ type: 'decor', defId });
    UI.closePanel();
    UI.showModeHint(`${def.icon} <b>${def.name}</b> · 클릭하거나 끌어서 놓으세요 · ${Sim.fmtWon(def.cost)}`);
  }

  function startBulldoze() {
    World.setMode({ type: 'bulldoze' });
    UI.closePanel();
    UI.showModeHint('🧨 <b>철거 모드</b> · 시설이나 도로를 클릭하세요');
  }

  function cancelMode() {
    pendingBuildDefId = null;
    World.setMode({ type: 'none' });
    UI.hideModeHint();
  }

  /* ---------- 월드 콜백 ---------- */
  function onTileClick(x, z, valid, reason) {
    if (!pendingBuildDefId) return;
    if (!valid) { UI.toast(reason || '이 자리에는 지을 수 없습니다.', 'err'); return; }
    const r = Sim.build(pendingBuildDefId, x, z);
    if (!r.ok) { UI.toast(r.msg, 'err'); return; }
    World.addBuilding(r.inst);
    UI.sfx.place();
    Sim.save();
    UI.refresh();
    cancelMode();
  }

  function onLandClick(px, pz) {
    const r = Sim.buyParcel(px, pz);
    if (!r.ok) { UI.toast(r.msg, 'err'); return; }
    World.refreshParcels();
    UI.sfx.good();
    UI.toast(`부지 매입 완료 · ${Sim.fmtWon(r.price)}`, 'ok');
    Sim.save();
    UI.refresh();
    // 계속 살 수 있도록 모드를 유지하고 가격만 갱신
    UI.showModeHint(`🗺️ <b>부지 매입</b> · 노란 테두리 구역을 클릭하세요 · ${Sim.fmtWon(Sim.landPrice())}`);
  }

  function onRoadPaint(x, z) {
    if (Sim.isRoad(x, z)) return;
    if (World.isHouseTile(x, z) || World.isDecorTile(x, z)) {
      if (roadSpent === 0) UI.toast('그 자리에는 도로를 낼 수 없습니다.', 'err');
      return;
    }
    const r = Sim.buildRoad(x, z);
    if (!r.ok) {
      if (r.msg && roadSpent === 0) UI.toast(r.msg, 'err');
      return;
    }
    World.addRoad(x, z);
    roadSpent += DATA.ROAD.cost;
    UI.sfx.click();
    UI.refresh();
  }

  function onRoadPaintEnd() {
    if (!roadSpent) return;
    UI.toast(`도로 공사 완료 · ${Sim.fmtWon(roadSpent)}`, 'ok');
    roadSpent = 0;
    Sim.save();
    UI.refresh();
  }

  function onRoadRemove(x, z) {
    const r = Sim.removeRoad(x, z);
    if (!r.ok) { UI.toast(r.msg, 'err'); return; }
    World.removeRoadTile(x, z);
    UI.sfx.bad();
    Sim.save();
    UI.refresh();
  }

  function onDecorPaint(x, z, defId) {
    const chk = World.canPlaceDecor(x, z);
    if (!chk.ok) { if (decorSpent === 0) UI.toast(chk.msg, 'err'); return; }
    const r = Sim.placeDecor(defId, x, z);
    if (!r.ok) { if (decorSpent === 0) UI.toast(r.msg, 'err'); return; }
    World.addDecor(r.inst);
    decorSpent += Sim.getDecorDef(defId).cost;
    UI.sfx.click();
    UI.refresh();
  }

  function onDecorPaintEnd() {
    if (!decorSpent) return;
    UI.toast(`꾸미기 완료 · ${Sim.fmtWon(decorSpent)}`, 'ok');
    decorSpent = 0;
    Sim.save();
    UI.refresh();
  }

  function onDecorClick(instId) {
    const inst = Sim.state.decor.find(d => d.id === instId);
    if (!inst) return;
    const def = Sim.getDecorDef(inst.defId);
    const r = Sim.removeDecor(instId);
    if (!r.ok) return;
    World.removeDecorInst(instId, inst);
    UI.sfx.bad();
    UI.toast(`${def.name} 철거 · ${Sim.fmtWon(r.refund)} 환급`);
    Sim.save();
    UI.refresh();
    UI.rerenderPanel();
  }

  function onBuildingClick(instId) {
    if (World.getMode().type === 'bulldoze') {
      const inst = Sim.state.buildings.find(b => b.id === instId);
      if (!inst) return;
      const def = Sim.getDef(inst.defId);
      const running = Sim.state.programs.filter(p => p.facilityInstId === instId && p.active);
      const m = UI.showModal(`
        <h2>🧨 ${def.icon} ${def.name} 철거</h2>
        <p class="lead">건축비의 30%인 <b>${Sim.fmtWon(Math.round(def.cost * .3))}</b>을 환급받습니다.
          ${running.length ? `<br><br>이 시설에서 운영 중인 <b>${running.length}개 프로그램</b>이 중단됩니다.` : ''}</p>
        <div class="modal-actions">
          <button class="btn ghostb" id="dzNo">취소</button>
          <button class="btn danger" id="dzYes">철거하기</button>
        </div>`);
      m.querySelector('#dzNo').onclick = UI.closeModal;
      m.querySelector('#dzYes').onclick = () => { UI.closeModal(); demolish(instId); cancelMode(); };
    } else {
      UI.openBuildingInfo(instId);
    }
  }

  function demolish(instId) {
    const inst = Sim.state.buildings.find(b => b.id === instId);
    if (!inst) return;
    const instCopy = { ...inst };
    const r = Sim.demolish(instId);
    if (!r.ok) return;
    World.removeBuilding(instId, instCopy);
    UI.sfx.bad();
    UI.toast(`${r.def.name} 철거 완료 · ${Sim.fmtWon(r.refund)} 환급`);
    Sim.save();
    UI.refresh();
    UI.rerenderPanel();
  }

  /* ---------- 시작 ---------- */
  World.init(canvas, {
    onTileClick, onBuildingClick, onLandClick,
    onRoadPaint, onRoadPaintEnd, onRoadRemove,
    onDecorPaint, onDecorPaintEnd, onDecorClick,
  });
  UI.init({ startBuild, startLand, startRoad, startDecor, startBulldoze, cancelMode, demolish });

  function bootWithState() {
    World.buildWorld();
    for (const inst of Sim.state.buildings) World.addBuilding(inst);
    for (const inst of Sim.state.decor) World.addDecor(inst);
    UI.resetLogFeed();
    UI.refresh();
  }

  function start() {
    UI.hideLoader();
    // 저장본을 먼저 읽어두고, 인트로 뒤에 보일 마을을 미리 지어 배경으로 쓴다
    const saved = Sim.load();
    Sim.newGame('행복마을');
    bootWithState();

    UI.showIntro(!!saved,
      (name) => {                     // 새로 시작 — 배경으로 지은 마을을 그대로 쓴다
        Sim.state.village = name;
        Sim.save();
        UI.refresh();
        UI.toast(`${name}에 오신 것을 환영합니다! 🏗️ 건설 메뉴부터 열어 보세요.`, 'ok');
      },
      () => {                         // 이어하기 — 저장된 마을로 다시 짓는다
        Sim.restore(saved);
        bootWithState();
        UI.toast(`${Sim.state.village} ${Sim.state.year}년차 ${Sim.state.month}월부터 이어합니다.`, 'ok');
      });
  }

  /* ---------- 렌더 루프 ---------- */
  let last = performance.now();
  let frames = 0;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    World.update(dt, now / 1000);
    if (++frames === 3) start();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
