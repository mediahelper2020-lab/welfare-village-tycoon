/* =========================================================
 * 복지마을 타이쿤 — UI (HUD, 패널, 모달, 차트, 사운드)
 * ========================================================= */
'use strict';

const UI = (() => {

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = Sim.fmtWon;

  function starRow(r) {
    const full = Math.round(r);
    return `<span class="stars">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</span>`;
  }

  let currentPanel = null;
  let renderedLogCount = 0;
  let lastBudget = null;
  let lastScore = null;
  let hooks = {};

  /* ---------- 로컬 저장소 (차단된 환경에서도 죽지 않도록) ---------- */
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 무시 */ } },
  };

  /* ---------- 사운드 ---------- */
  let audioCtx = null;
  let muted = store.get('wt_muted') === '1';
  function beep(freq, dur = 0.08, type = 'sine', gain = 0.05) {
    if (muted) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.connect(g); g.connect(audioCtx.destination);
      o.start(); o.stop(audioCtx.currentTime + dur);
    } catch (e) { /* 오디오 불가 환경 무시 */ }
  }
  const sfx = {
    click: () => beep(680, .04, 'square', .022),
    place: () => { beep(392, .09, 'triangle', .055); setTimeout(() => beep(523, .13, 'triangle', .055), 70); },
    month: () => { beep(523, .09, 'sine', .045); setTimeout(() => beep(659, .13, 'sine', .045), 85); },
    good:  () => { beep(523, .09); setTimeout(() => beep(659, .09), 80); setTimeout(() => beep(784, .18), 160); },
    bad:   () => beep(184, .18, 'sawtooth', .035),
  };

  /* ---------- 토스트 ---------- */
  function toast(msg, kind = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + kind;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    if (kind === 'err') sfx.bad();
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-10px)'; }, 2700);
    setTimeout(() => t.remove(), 3200);
  }

  /* ---------- 모달 ---------- */
  function showModal(html, opts = {}) {
    const wrap = $('#modalWrap'), m = $('#modal');
    m.innerHTML = html;
    m.scrollTop = 0;
    wrap.classList.add('show');
    wrap.onclick = (e) => { if (e.target === wrap && !opts.locked) closeModal(); };
    return m;
  }
  function closeModal() { $('#modalWrap').classList.remove('show'); }
  function isModalOpen() { return $('#modalWrap').classList.contains('show'); }

  /* ---------- HUD ---------- */
  function refresh() {
    const G = Sim.state;
    if (!G) return;
    $('#hudVillage').textContent = G.village;
    $('#hudDate').textContent = `${G.year}년차 ${G.month}월`;

    const b = $('#hudBudget');
    b.textContent = fmt(G.budget);
    b.classList.toggle('minus', G.budget < 0);
    if (lastBudget !== null && G.budget > lastBudget + 1e7) {
      b.classList.remove('flash');
      void b.offsetWidth;
      b.classList.add('flash');
    }
    lastBudget = G.budget;

    const monthly = Sim.upkeepTotal() + G.programs.filter(p => p.active).reduce((s, p) => s + p.budget, 0);
    $('#hudUpkeep').innerHTML = `월 고정지출 <b>${fmt(monthly)}</b> · 누적 집행 ${fmt(G.totalSpent)}`;

    const pop = Sim.totalPop(), sat = Sim.avgSat();
    const sc = Sim.score();
    const scEl = $('#mScore');
    if (lastScore !== null && sc > lastScore) {
      scEl.classList.remove('up');
      void scEl.offsetWidth;
      scEl.classList.add('up');
    }
    scEl.textContent = sc.toLocaleString();
    lastScore = sc;

    $('#mPop').textContent = pop.toLocaleString() + '명';
    $('#mPopBar').style.width = Math.min(100, pop / Sim.GOAL.pop * 100) + '%';
    $('#mSat').textContent = sat.toFixed(0) + '점';
    $('#mSatBar').style.width = sat + '%';
    $('#mCase').textContent = G.closedCases.toLocaleString() + '건';
    $('#mCaseBar').style.width = Math.min(100, G.closedCases / Sim.CASE_TARGET * 100) + '%';

    const pd = Math.min(100, pop / Sim.GOAL.pop * 100);
    const sd = Math.min(100, sat / Sim.GOAL.sat * 100);
    $('#goalProgress').innerHTML = G.won
      ? '<span class="goalhit">🏆 목표 달성!</span>'
      : `🎯 인구 <b>${pd.toFixed(0)}%</b> · 만족도 <b>${sd.toFixed(0)}%</b>`;

    const nOpen = Sim.openCases().length;
    const badge = $('#caseBadge');
    badge.style.display = nOpen ? '' : 'none';
    badge.textContent = nOpen;

    if (window.World && World.syncVillagerCount) World.syncVillagerCount(pop);
    renderLog();
  }

  function renderLog() {
    const G = Sim.state;
    const feed = $('#logfeed');
    while (renderedLogCount < G.log.length) {
      const item = G.log[renderedLogCount++];
      const d = document.createElement('div');
      d.className = 'logitem ' + (item.kind || '');
      d.innerHTML = `<span class="ym">${esc(item.ym)}</span>${esc(item.text)}`;
      feed.prepend(d);
      while (feed.children.length > 26) feed.lastChild.remove();
    }
  }
  function resetLogFeed() { renderedLogCount = 0; $('#logfeed').innerHTML = ''; }

  /* ---------- 사이드 패널 ---------- */
  const PANELS = {
    build: () => renderBuild(),
    decorate: () => renderDecorate(),
    programs: () => renderPrograms(),
    cases: () => renderCases(),
    stats: () => renderStats(),
    grants: () => renderGrants(),
    rank: () => renderRank(),
  };

  function openPanel(name) {
    const first = currentPanel !== name;
    currentPanel = name;
    const panel = $('#sidepanel');
    panel.classList.add('show');
    if (first) { panel.style.animation = 'none'; void panel.offsetWidth; panel.style.animation = ''; }
    document.querySelectorAll('#toolbar .tbtn[data-panel]').forEach(b =>
      b.classList.toggle('on', b.dataset.panel === name));
    PANELS[name]();
    if (first) $('#panelBody').scrollTop = 0;
  }
  function closePanel() {
    currentPanel = null;
    $('#sidepanel').classList.remove('show');
    document.querySelectorAll('#toolbar .tbtn[data-panel]').forEach(b => b.classList.remove('on'));
  }
  function rerenderPanel() {
    if (!currentPanel) return;
    // 랭킹은 달이 바뀔 때마다 서버를 다시 부르지 않는다 (새로고침 버튼으로 갱신)
    if (currentPanel === 'rank') return;
    const keep = $('#panelBody').scrollTop;
    PANELS[currentPanel]();
    $('#panelBody').scrollTop = keep;
  }

  function stagger(body) {
    body.querySelectorAll('.card').forEach((c, i) =>
      c.style.animationDelay = Math.min(i * 26, 300) + 'ms');
  }

  /* ---------- 건설 ---------- */
  function renderBuild() {
    const G = Sim.state;
    $('#panelTitle').textContent = '🏗️ 건설';
    const body = $('#panelBody');

    const owned = G.parcels.length;
    const roadKm = G.roads.length;

    let html = `<p class="lede">시설은 <b>우리 마을 땅</b> 위, 그리고 <b>도로에 접한</b> 자리에만 지을 수 있습니다.
      땅이 모자라면 부지를 매입하고, 길이 없으면 먼저 도로를 내세요.</p>

    <div class="statgrid" style="margin-bottom:14px">
      <div class="stattile"><div class="k">보유 부지</div><div class="v num">${owned}구역</div></div>
      <div class="stattile"><div class="k">도로</div><div class="v num">${roadKm}칸</div></div>
    </div>

    <div class="card">
      <div class="row spread" style="align-items:flex-start">
        <h3>🗺️ 부지 매입</h3>
        <span class="price">${fmt(Sim.landPrice())}</span>
      </div>
      <div class="desc">마을과 맞닿은 구역(4×4칸)을 사들여 마을을 넓힙니다. 넓힐수록 다음 구역이 비싸집니다.</div>
      <div class="row spread" style="margin-top:10px">
        <span class="muted">지도에서 노란 테두리 구역을 클릭</span>
        <button class="btn small" id="landBtn" ${G.budget >= Sim.landPrice() ? '' : 'disabled'}>
          ${G.budget >= Sim.landPrice() ? '땅 사기' : '예산 부족'}</button>
      </div>
    </div>

    <div class="card">
      <div class="row spread" style="align-items:flex-start">
        <h3>🛣️ 도로 건설</h3>
        <span class="price">${fmt(DATA.ROAD.cost)}/칸</span>
      </div>
      <div class="desc">우리 땅 위에 길을 냅니다. 지도에서 <b>끌면 이어서</b> 깔립니다. 시설은 도로에 접해야 지을 수 있습니다.</div>
      <div class="row spread" style="margin-top:10px">
        <span class="muted">철거 모드에서 도로를 클릭하면 걷어냅니다</span>
        <button class="btn small" id="roadBtn">길 내기</button>
      </div>
    </div>

    <div class="hr"></div>
    <div class="secthead"><span>복지시설</span></div>`;

    for (const def of DATA.BUILDINGS) {
      const built = G.buildings.filter(b => b.defId === def.id).length;
      const afford = G.budget >= def.cost;
      const tags = [`${def.size}×${def.size}칸`];
      if (def.cap) tags.push(`정원 ${def.cap}명`);
      tags.push(`유지비 ${fmt(def.upkeep)}/월`);
      html += `
      <div class="card">
        <div class="row spread" style="align-items:flex-start">
          <h3>${def.icon} ${esc(def.name)}${built ? ` <span class="chip owned">보유 ${built}</span>` : ''}</h3>
          <span class="price">${fmt(def.cost)}</span>
        </div>
        <div class="desc">${esc(def.desc)}</div>
        <div class="row spread" style="margin-top:10px">
          <span class="muted">${tags.join(' · ')}</span>
          <button class="btn small" data-build="${def.id}" ${afford ? '' : 'disabled'}>
            ${afford ? '짓기' : '예산 부족'}</button>
        </div>
      </div>`;
    }

    html += `
      <div class="hr"></div>
      <div class="card">
        <div class="row spread">
          <h3>🧨 철거</h3>
          <button class="btn small danger" id="bulldozeBtn">철거 모드</button>
        </div>
        <div class="desc">시설을 클릭하면 건축비의 30%를 환급받고 철거합니다.
          도로를 클릭하면 ${fmt(DATA.ROAD.refund)}을 돌려받고 걷어냅니다.</div>
      </div>`;

    body.innerHTML = html;
    stagger(body);
    body.querySelectorAll('[data-build]').forEach(btn =>
      btn.onclick = () => { sfx.click(); hooks.startBuild(btn.dataset.build); });
    $('#landBtn').onclick = () => { sfx.click(); hooks.startLand(); };
    $('#roadBtn').onclick = () => { sfx.click(); hooks.startRoad(); };
    $('#bulldozeBtn').onclick = () => { sfx.click(); hooks.startBulldoze(); };
  }

  /* ---------- 꾸미기 ---------- */
  function renderDecorate() {
    const G = Sim.state;
    $('#panelTitle').textContent = '🎨 마을 꾸미기';
    const body = $('#panelBody');
    const count = G.decor.length;

    let html = `<p class="lede">나무·화단·벤치·조형물로 우리 마을만의 개성을 더해보세요.
      도로에 접해 놓으면 벤치와 안내판 같은 소품이 저절로 도로 쪽을 바라봅니다.
      나무처럼 저렴한 소품은 <b>끌어서 한 번에 여러 개</b> 놓을 수 있습니다.
      꾸민 만큼 마을 만족도가 조금씩 올라갑니다.</p>

      <div class="statgrid" style="margin-bottom:14px">
        <div class="stattile"><div class="k">놓은 꾸밈 요소</div><div class="v num">${count}개</div></div>
        <div class="stattile"><div class="k">꾸미기 지출</div><div class="v num">${fmt(G.totalDecor || 0)}</div></div>
      </div>`;

    for (const cat of Object.keys(DATA.DECOR_CATS)) {
      const items = DATA.DECOR.filter(d => d.cat === cat);
      if (!items.length) continue;
      html += `<div class="secthead"><span>${esc(DATA.DECOR_CATS[cat])}</span></div>`;
      for (const d of items) {
        const afford = G.budget >= d.cost;
        html += `
        <div class="card">
          <div class="row spread" style="align-items:flex-start">
            <h3>${d.icon} ${esc(d.name)}</h3>
            <span class="price">${fmt(d.cost)}</span>
          </div>
          <div class="desc">${esc(d.desc)}</div>
          <div class="row spread" style="margin-top:10px">
            <span class="muted">클릭 또는 드래그해서 배치</span>
            <button class="btn small" data-decor="${d.id}" ${afford ? '' : 'disabled'}>
              ${afford ? '놓기' : '예산 부족'}</button>
          </div>
        </div>`;
      }
    }

    html += `
      <div class="hr"></div>
      <div class="card">
        <div class="row spread">
          <h3>🧨 꾸밈 요소 철거</h3>
          <button class="btn small danger" id="undecorateBtn">철거 모드</button>
        </div>
        <div class="desc">시설·도로와 같은 철거 모드입니다. 비용의 절반을 환급받습니다.</div>
      </div>`;

    body.innerHTML = html;
    stagger(body);
    body.querySelectorAll('[data-decor]').forEach(btn =>
      btn.onclick = () => { sfx.click(); hooks.startDecor(btn.dataset.decor); });
    $('#undecorateBtn').onclick = () => { sfx.click(); hooks.startBulldoze(); };
  }

  /* ---------- 프로그램 ---------- */
  function targetChip(t) {
    if (t === 'all') return `<span class="chip all"><i></i>전체 주민</span>`;
    return `<span class="chip ${t}"><i></i>${DATA.GROUPS[t].label}</span>`;
  }

  function renderPrograms() {
    const G = Sim.state;
    $('#panelTitle').textContent = '📋 복지 프로그램';
    const body = $('#panelBody');
    const hostable = Sim.hostableFacilities();
    let html = '';

    if (!hostable.length) {
      html += `<div class="emptybox">
        <div class="em">🏗️</div>
        <p>프로그램은 <b>시설 안에서</b> 열립니다.<br>
        건설 메뉴에서 경로당이나 복지관을 먼저 지어 주세요.</p>
        <button class="btn" id="goBuildBtn" style="margin-top:14px">건설 메뉴 열기</button>
      </div>`;
      body.innerHTML = html;
      $('#goBuildBtn').onclick = () => { sfx.click(); openPanel('build'); };
      return;
    }

    html += `<button class="btn wide" id="newProgramBtn" style="margin-bottom:14px">＋ 새 프로그램 기획하기</button>`;

    if (!G.programs.length) {
      html += `<div class="emptybox">
        <div class="em">📝</div>
        <p>아직 운영 중인 프로그램이 없습니다.<br>
        제목과 설명을 직접 써서 우리 마을만의 프로그램을 만들어 보세요.</p>
      </div>`;
    }

    for (const p of [...G.programs].reverse()) {
      const def = Sim.getDef(p.facilityDefId);
      const last = p.history[p.history.length - 1];
      const prev = p.history[p.history.length - 2];
      let trend = '';
      if (last && prev) {
        const d = last.participants - prev.participants;
        if (d !== 0) trend = `<span class="muted" style="color:${d > 0 ? 'var(--good)' : 'var(--bad)'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d)}</span>`;
      }
      html += `
      <div class="card" style="${p.active ? '' : 'opacity:.62'}">
        <div class="row spread" style="align-items:flex-start">
          <h3>${esc(p.title)}</h3>
          ${targetChip(p.target)}
        </div>
        <div class="desc">${esc(p.desc)}</div>
        <div class="muted" style="margin-top:8px">
          ${def.icon} ${esc(def.name)} · ${fmt(p.budget)}/월 · 누적 ${p.totalParticipants.toLocaleString()}명 참여
        </div>`;

      if (last) {
        html += `
        <div class="row spread" style="margin-top:11px; padding-top:11px; border-top:1px solid var(--line)">
          <span class="row tight"><span class="bigstat num">${last.participants}명</span>
            <span class="muted">참여 · 지난달</span> ${trend}</span>
          <span class="ratebox">${starRow(last.rating)}<span class="rv num">${last.rating.toFixed(1)}</span></span>
        </div>`;
        for (const c of last.comments) {
          html += `<div class="commentbox"><b>${esc(c.name)} · ${c.age}세</b><br>${esc(c.text)}</div>`;
        }
      } else if (p.active) {
        html += `<div class="muted" style="margin-top:9px">🕐 다음 달부터 운영 결과가 나옵니다.</div>`;
      }

      html += `
        <div class="row" style="margin-top:12px">
          <button class="btn small ${p.active ? 'ghostb' : ''}" data-ptoggle="${p.id}">
            ${p.active ? '⏸ 운영 중단' : '▶ 운영 재개'}</button>
          ${p.history.length > 1 ? `<button class="btn small ghostb" data-phist="${p.id}">지난 기록</button>` : ''}
        </div>
      </div>`;
    }

    body.innerHTML = html;
    stagger(body);
    $('#newProgramBtn').onclick = () => { sfx.click(); openProgramForm(); };
    body.querySelectorAll('[data-ptoggle]').forEach(b => b.onclick = () => {
      const p = G.programs.find(q => q.id === b.dataset.ptoggle);
      const r = Sim.setProgramActive(p.id, !p.active);
      if (r && r.ok === false) toast(r.msg, 'err');
      Sim.save(); refresh(); renderPrograms();
    });
    body.querySelectorAll('[data-phist]').forEach(b =>
      b.onclick = () => openProgramHistory(b.dataset.phist));
  }

  function openProgramForm() {
    const hostable = Sim.hostableFacilities();
    const ex = DATA.PROGRAM_EXAMPLES[Math.floor(Math.random() * DATA.PROGRAM_EXAMPLES.length)];
    const facOpts = hostable.map(b => {
      const def = Sim.getDef(b.defId);
      return `<option value="${b.id}">${def.icon} ${esc(def.name)} · 정원 ${def.cap}명</option>`;
    }).join('');
    const budgetOpts = DATA.PROGRAM_BUDGETS.map((b, i) =>
      `<option value="${b.value}" ${i === 1 ? 'selected' : ''}>${b.label}</option>`).join('');

    const m = showModal(`
      <h2>📝 새 프로그램 기획</h2>
      <p class="lead">제목과 설명에 담긴 <b>키워드</b>에 따라 대상별 호응이 달라집니다.
        건강·요리·나들이·스마트폰·일자리처럼 주민이 반길 말을 넣고, 설명을 정성껏 쓸수록 참여율이 오릅니다.</p>

      <label class="fl"><span>프로그램 제목</span><span class="hint">최대 30자</span></label>
      <input type="text" id="pfTitle" maxlength="30" placeholder="예) ${esc(ex.t)}" autocomplete="off" />

      <label class="fl"><span>세부 설명</span><span class="hint" id="pfCount">0 / 200자</span></label>
      <textarea id="pfDesc" maxlength="200" placeholder="예) ${esc(ex.d)}"></textarea>

      <div id="pfKeywords" class="muted" style="margin-top:8px; min-height:34px; line-height:1.6"></div>

      <label class="fl"><span>대상</span></label>
      <select id="pfTarget">
        <option value="all">전체 주민</option>
        ${DATA.GROUP_IDS.map(g => `<option value="${g}">${esc(DATA.GROUPS[g].label)}</option>`).join('')}
      </select>

      <label class="fl"><span>운영 시설</span></label>
      <select id="pfFacility">${facOpts}</select>

      <label class="fl"><span>월 운영 예산</span></label>
      <select id="pfBudget">${budgetOpts}</select>

      <div class="modal-actions">
        <button class="btn ghostb" id="pfCancel">취소</button>
        <button class="btn" id="pfSubmit">프로그램 개설</button>
      </div>
    `);

    const updateKw = () => {
      const desc = $('#pfDesc').value;
      $('#pfCount').textContent = `${desc.length} / 200자`;
      const kws = Sim.detectKeywords($('#pfTitle').value + ' ' + desc);
      $('#pfKeywords').innerHTML = kws.length
        ? `🔍 감지된 키워드 ${kws.map(k => `<span class="chip owned">${k.label}</span>`).join(' ')}
           <br>관심 있는 주민의 참여율이 올라갑니다.`
        : `🔍 아직 감지된 키워드가 없습니다.<br>건강 · 요리 · 나들이 · 스마트폰 · 일자리 같은 말을 넣어 보세요.`;
    };
    updateKw();
    $('#pfTitle').oninput = updateKw;
    $('#pfDesc').oninput = updateKw;
    $('#pfCancel').onclick = closeModal;
    $('#pfSubmit').onclick = () => {
      const r = Sim.createProgram({
        title: $('#pfTitle').value,
        desc: $('#pfDesc').value,
        target: $('#pfTarget').value,
        budget: Number($('#pfBudget').value),
        facilityInstId: $('#pfFacility').value,
      });
      if (!r.ok) { toast(r.msg, 'err'); return; }
      sfx.good();
      toast(`「${r.program.title}」 개설! 다음 달부터 운영됩니다.`, 'ok');
      closeModal();
      Sim.save(); refresh(); rerenderPanel();
      if (r.missionCompleted) setTimeout(() => showMissionComplete(r.program), 200);
    };
    setTimeout(() => $('#pfTitle').focus(), 60);
  }

  function openProgramHistory(pid) {
    const p = Sim.state.programs.find(q => q.id === pid);
    if (!p) return;
    const rows = [...p.history].reverse().map(h =>
      `<tr><td>${h.turn}개월차</td><td class="num">${h.participants}명</td>
       <td class="num">${h.rating.toFixed(1)}</td></tr>`).join('');
    const avg = p.history.reduce((s, h) => s + h.rating, 0) / p.history.length;
    const best = Math.max(...p.history.map(h => h.participants));
    showModal(`
      <h2>「${esc(p.title)}」 운영 기록</h2>
      <div class="statgrid" style="margin-top:16px">
        <div class="stattile"><div class="k">누적 참여</div><div class="v num">${p.totalParticipants.toLocaleString()}명</div></div>
        <div class="stattile"><div class="k">평균 평점</div><div class="v num">${avg.toFixed(1)}</div></div>
        <div class="stattile"><div class="k">최다 참여</div><div class="v num">${best}명</div></div>
        <div class="stattile"><div class="k">운영 개월</div><div class="v num">${p.history.length}개월</div></div>
      </div>
      <div class="chartbox"><table class="datatable">
        <tr><th>시점</th><th>참여자</th><th>평점</th></tr>${rows}
      </table></div>
      <div class="modal-actions"><button class="btn ghostb" onclick="UI.closeModal()">닫기</button></div>
    `);
  }

  /* ---------- 사례관리 ---------- */
  function renderCases() {
    const G = Sim.state;
    $('#panelTitle').textContent = '🤝 사례관리';
    const body = $('#panelBody');
    const open = Sim.openCases();

    let html = `<p class="lede">도움이 필요한 주민 한 분 한 분의 이야기입니다.
      취약점에 맞는 <b>지역자원</b>을 연계해 위기를 해소하세요. 지금까지
      <b style="color:#6ee0b8">${G.closedCases}건</b> 종결했습니다.</p>`;

    if (!open.length) {
      html += `<div class="emptybox">
        <div class="em">🌤️</div>
        <p>지금 접수된 사례가 없습니다. 훌륭해요!<br>새로운 사례는 매달 발굴됩니다.</p>
      </div>`;
    }

    for (const c of open) {
      const g = DATA.GROUPS[c.group];
      const solved = c.needs.filter(n => n.resolved).length;
      const months = G.turn - c.openedTurn;
      const urgent = months >= 4;
      html += `
      <div class="card tappable ${urgent ? 'urgent' : ''}" data-case="${c.id}">
        <div class="row spread" style="align-items:flex-start">
          <h3>${esc(c.name)} <span class="muted" style="font-weight:600">${c.age}세</span></h3>
          <span class="chip ${c.group}"><i></i>${g.label}</span>
        </div>
        <div class="desc">${esc(c.story)}</div>
        <div class="row tight" style="margin-top:10px">
          ${c.needs.map(n => `<span class="chip ${n.resolved ? 'done' : ''}">
            ${DATA.NEEDS[n.cat].icon} ${DATA.NEEDS[n.cat].label}${n.resolved ? ' ✓' : ''}</span>`).join('')}
        </div>
        <div class="progressline"><i style="width:${solved / c.needs.length * 100}%"></i></div>
        <div class="muted" style="margin-top:7px">
          ${solved}/${c.needs.length} 해결 · 접수 ${months}개월 경과${urgent ? ' · <b style="color:var(--bad)">개입이 시급합니다</b>' : ''}
        </div>
      </div>`;
    }

    body.innerHTML = html;
    stagger(body);
    body.querySelectorAll('[data-case]').forEach(el =>
      el.onclick = () => { sfx.click(); openCaseModal(el.dataset.case); });
  }

  function openCaseModal(caseId) {
    const G = Sim.state;
    const c = G.cases.find(x => x.id === caseId);
    if (!c) return;
    const g = DATA.GROUPS[c.group];
    const solved = c.needs.filter(n => n.resolved).length;

    let needsHtml = '';
    c.needs.forEach((n, idx) => {
      const nd = DATA.NEEDS[n.cat];
      if (n.resolved) {
        needsHtml += `
        <div class="need resolved">
          <div class="nt">${nd.icon} ${nd.label} <span class="chip done">✓ 해결</span></div>
          <div class="nd">「${esc(n.resource)}」 연계로 해결되었습니다.</div>
        </div>`;
        return;
      }
      const opts = DATA.RESOURCES.map(r => {
        const bits = [r.cost > 0 ? fmt(r.cost) : '무료'];
        if (r.req) {
          const b = DATA.BUILDINGS.find(x => x.id === r.req);
          bits.push(`${b.name} ${Sim.hasBuilding(r.req) ? '보유중' : '미보유'}`);
        }
        return `<option value="${r.id}">${esc(r.name)} · ${bits.join(' · ')}</option>`;
      }).join('');
      needsHtml += `
      <div class="need">
        <div class="nt">${nd.icon} ${nd.label}</div>
        <div class="nd">${esc(nd.desc)}</div>
        <div class="linkrow">
          <select data-needsel="${idx}"><option value="">지역자원 선택…</option>${opts}</select>
          <button class="btn small" data-needlink="${idx}">연계</button>
        </div>
      </div>`;
    });

    const m = showModal(`
      <div class="row spread" style="align-items:flex-start">
        <h2>📂 ${esc(c.name)} <span class="muted" style="font-size:14px;font-weight:600">${c.age}세</span></h2>
        <span class="chip ${c.group}"><i></i>${g.label}</span>
      </div>
      <p class="lead">${esc(c.story)}</p>
      <div class="progressline" style="margin-top:14px"><i style="width:${solved / c.needs.length * 100}%"></i></div>
      <div class="muted" style="margin-top:7px">
        💡 이야기를 다시 읽어 보세요. 상황에 맞지 않는 자원은 연계해도 효과가 없습니다.
      </div>
      ${needsHtml}
      <div class="modal-actions"><button class="btn ghostb" onclick="UI.closeModal()">닫기</button></div>
    `);

    m.querySelectorAll('[data-needlink]').forEach(btn => btn.onclick = () => {
      const idx = Number(btn.dataset.needlink);
      const sel = m.querySelector(`[data-needsel="${idx}"]`);
      if (!sel.value) { toast('연계할 지역자원을 먼저 선택하세요.', 'err'); return; }
      const r = Sim.linkResource(c.id, idx, sel.value);
      Sim.save();
      if (!r.ok) { toast(r.msg, 'err'); refresh(); return; }
      if (r.closed) {
        sfx.good();
        showModal(`
          <h2>🎉 사례 종결</h2>
          <p class="lead"><b>${esc(c.name)}</b>님의 모든 욕구가 해결되었습니다.<br><br>
            "${esc(G.village)} 덕분에 다시 살아갈 힘이 생겼어요. 정말 고맙습니다."</p>
          <div class="hr"></div>
          <p class="muted">마을 평판과 ${g.label} 만족도가 올랐습니다.
            지금까지 <b style="color:#6ee0b8">${G.closedCases}건</b> 종결.</p>
          <div class="modal-actions"><button class="btn" onclick="UI.closeModal()">보람차다!</button></div>`);
      } else {
        sfx.place();
        toast('자원 연계 성공! 남은 욕구도 살펴보세요.', 'ok');
        openCaseModal(caseId);
      }
      refresh();
      if (currentPanel === 'cases') renderCases();
    });
  }

  /* ---------- 공모사업 ---------- */
  function renderGrants() {
    const G = Sim.state;
    $('#panelTitle').textContent = '📜 공모사업';
    const body = $('#panelBody');

    const won = G.grants.length;
    const total = DATA.GRANTS.length;
    let html = `<p class="lede">사회복지공동모금회 등의 공모사업에 신청해 <b>사업비를 따올 수 있습니다.</b>
      공모 취지에 맞게 제목·목적·목표·프로그램 내용을 쓰면 심사를 거쳐 선정됩니다.
      떨어져도 보완해서 다시 도전할 수 있습니다.</p>

      <div class="statgrid" style="margin-bottom:14px">
        <div class="stattile"><div class="k">선정</div><div class="v num">${won} / ${total}건</div></div>
        <div class="stattile"><div class="k">확보한 사업비</div><div class="v num">${fmt(G.totalGrantWon || 0)}</div></div>
      </div>`;

    for (const g of DATA.GRANTS) {
      const isWon = Sim.isGrantWon(g.id);
      const wait = Sim.grantCooldown(g.id);
      const tgt = g.target === 'all'
        ? '<span class="chip all"><i></i>전체 주민</span>'
        : `<span class="chip ${g.target}"><i></i>${DATA.GROUPS[g.target].label}</span>`;
      const facName = g.facility ? Sim.getDef(g.facility).name : null;
      const hasFac = !g.facility || Sim.hasBuilding(g.facility);

      html += `
      <div class="card ${isWon ? 'granted' : ''}">
        <div class="row spread" style="align-items:flex-start">
          <h3>${isWon ? '✅ ' : ''}${esc(g.name)}</h3>
          <span class="price">${fmt(g.grant)}</span>
        </div>
        <div class="muted" style="margin-top:3px">${esc(g.org)}</div>
        <div class="desc">${esc(g.summary)}</div>
        <div class="row tight" style="margin-top:9px">
          ${tgt}
          ${facName ? `<span class="chip ${hasFac ? 'owned' : ''}">${hasFac ? '✓' : '·'} ${esc(facName)}</span>` : ''}
        </div>
        <div class="row spread" style="margin-top:11px">
          <span class="muted">${isWon ? '선정 완료 · 사업비가 예산에 반영되었습니다'
            : wait > 0 ? `재신청까지 ${wait}개월` : '신청서를 작성해 제출하세요'}</span>
          <button class="btn small" data-grant="${g.id}" ${isWon || wait > 0 ? 'disabled' : ''}>
            ${isWon ? '선정됨' : wait > 0 ? '대기 중' : '신청하기'}</button>
        </div>
      </div>`;
    }

    body.innerHTML = html;
    stagger(body);
    body.querySelectorAll('[data-grant]').forEach(b =>
      b.onclick = () => { sfx.click(); openGrantForm(b.dataset.grant); });
  }

  function openGrantForm(grantId) {
    const g = Sim.getGrant(grantId);
    const R = DATA.GRANT_RULES;
    const tgtLabel = g.target === 'all' ? '전체 주민' : DATA.GROUPS[g.target].label;

    showModal(`
      <h2>📜 ${esc(g.name)}</h2>
      <p class="muted" style="margin-top:4px">${esc(g.org)} · 지원금 <b style="color:var(--gold)">${fmt(g.grant)}</b> · 대상 ${esc(tgtLabel)}</p>
      <p class="lead">${esc(g.summary)}</p>

      <div class="card" style="margin-top:14px">
        <h3>심사 기준</h3>
        <div class="desc">
          ① 대상과 사업 취지가 드러나는가 <b>25점</b><br>
          ② 목적이 구체적으로 서술되었는가 <b>20점</b> (${R.minPurpose}자 이상)<br>
          ③ 목표가 숫자로 측정 가능한가 <b>25점</b><br>
          ④ 프로그램 내용이 구체적인가 <b>20점</b> (${R.minContent}자 이상)<br>
          ⑤ 사업을 수행할 시설이 있는가 <b>10점</b><br>
          <span class="muted">${R.passScore}점 이상이면 선정됩니다.</span>
        </div>
      </div>

      <label class="fl"><span>사업명</span><span class="hint">최대 40자</span></label>
      <input type="text" id="gfTitle" maxlength="40" placeholder="예) 함께 걷는 첫걸음, ${esc(tgtLabel)} 자립 프로젝트" autocomplete="off" />

      <label class="fl"><span>사업 목적</span><span class="hint" id="gfPc">0자</span></label>
      <textarea id="gfPurpose" maxlength="400" placeholder="왜 이 사업이 필요한지, 어떤 문제를 해결하려는지 적어주세요."></textarea>

      <label class="fl"><span>사업 목표</span><span class="hint">숫자를 넣어 측정 가능하게</span></label>
      <textarea id="gfGoal" maxlength="300" placeholder="예) 대상자 20명 발굴, 주 1회 12회기 운영, 참여자 만족도 80점 이상"></textarea>

      <label class="fl"><span>프로그램 내용</span><span class="hint" id="gfCc">0자</span></label>
      <textarea id="gfContent" maxlength="800" placeholder="무엇을, 누구와, 몇 회, 어떻게 진행하는지 구체적으로 적어주세요."></textarea>

      <div id="gfHint" class="muted" style="margin-top:8px; line-height:1.6"></div>

      <div class="modal-actions">
        <button class="btn ghostb" id="gfCancel">취소</button>
        <button class="btn" id="gfSubmit">신청서 제출</button>
      </div>
    `);

    const update = () => {
      $('#gfPc').textContent = $('#gfPurpose').value.length + '자';
      $('#gfCc').textContent = $('#gfContent').value.length + '자';
      const all = $('#gfTitle').value + ' ' + $('#gfPurpose').value + ' ' + $('#gfGoal').value + ' ' + $('#gfContent').value;
      const hit = g.keywords.filter(k => all.includes(k));
      $('#gfHint').innerHTML = hit.length
        ? `🔍 확인된 핵심어 ${hit.map(k => `<span class="chip owned">${esc(k)}</span>`).join(' ')}`
        : `🔍 이 공모의 핵심어가 아직 없습니다 — ${g.keywords.slice(0, 5).map(esc).join(' · ')} 등을 담아보세요.`;
    };
    ['gfTitle', 'gfPurpose', 'gfGoal', 'gfContent'].forEach(id => $('#' + id).oninput = update);
    update();

    $('#gfCancel').onclick = closeModal;
    $('#gfSubmit').onclick = () => {
      const form = {
        title: $('#gfTitle').value,
        purpose: $('#gfPurpose').value,
        goal: $('#gfGoal').value,
        content: $('#gfContent').value,
      };
      if (!form.title.trim()) { toast('사업명을 입력해 주세요.', 'err'); return; }
      const r = Sim.applyGrant(grantId, form);
      if (!r.ok) { toast(r.msg, 'err'); return; }
      Sim.save();
      showGrantResult(r.result);
      refresh();
    };
    setTimeout(() => $('#gfTitle').focus(), 60);
  }

  function showGrantResult(res) {
    const g = res.grant;
    const rows = res.items.map(i => `
      <div class="need ${i.ok ? 'resolved' : ''}">
        <div class="nt">${i.ok ? '✅' : '⚠️'} ${esc(i.label)}
          <span class="chip ${i.ok ? 'done' : ''}">${i.score} / ${i.max}점</span></div>
        <div class="nd">${esc(i.hint)}</div>
      </div>`).join('');

    if (res.pass) sfx.good(); else sfx.bad();

    showModal(`
      <div style="text-align:center">
        <div style="font-size:42px; line-height:1">${res.pass ? '🎊' : '📋'}</div>
        <h2 style="margin-top:8px">${res.pass ? '선정되었습니다!' : '아쉽게 선정되지 못했습니다'}</h2>
      </div>
      <p class="lead" style="text-align:center">
        ${esc(g.name)}<br>
        심사 결과 <b style="color:${res.pass ? 'var(--gold)' : 'var(--ink)'}">${res.total}점</b>
        / 선정 기준 ${DATA.GRANT_RULES.passScore}점
        ${res.pass ? `<br><br>사업비 <b style="color:var(--gold)">${fmt(g.grant)}</b>이 예산에 들어왔습니다.`
                   : `<br><br>아래 지적사항을 보완해 <b>${DATA.GRANT_RULES.cooldown}개월 뒤</b> 다시 신청할 수 있습니다.`}
      </p>
      <div class="hr"></div>
      ${rows}
      <div class="modal-actions">
        <button class="btn" onclick="UI.closeModal()">${res.pass ? '고맙습니다!' : '보완하겠습니다'}</button>
      </div>
    `);
    if (currentPanel === 'grants') renderGrants();
  }

  /* ---------- 랭킹 ---------- */
  let myEntryId = store.get('wt_rank_id') || null;

  function renderRank() {
    const G = Sim.state;
    $('#panelTitle').textContent = '🏆 마을 랭킹';
    const body = $('#panelBody');

    body.innerHTML = `
      <p class="lede">다른 참가자들이 만든 마을과 총점을 겨뤄 보세요.
        마을 데이터는 서버로 가지 않습니다 — <b>이름·소속기관과 점수 몇 줄</b>만 올라갑니다.</p>

      <div class="card">
        <div class="row spread" style="align-items:flex-start">
          <h3>내 마을 · ${esc(G.village)}</h3>
          <span class="price">${Sim.score().toLocaleString()}점</span>
        </div>
        <div class="muted" style="margin-top:6px">
          인구 ${Sim.totalPop().toLocaleString()}명 · 만족도 ${Sim.avgSat().toFixed(0)}점
          · 종결사례 ${G.closedCases}건 · ${G.turn}개월차
        </div>
        <button class="btn wide" id="rankSubmitBtn" style="margin-top:11px">
          ${myEntryId ? '점수 다시 올리기' : '내 점수 올리기'}</button>
      </div>

      <div class="secthead"><span>순위표 · 상위 20</span>
        <button class="btn small ghostb" id="rankReload">새로고침</button>
      </div>
      <div id="rankList"><div class="emptybox"><p>불러오는 중…</p></div></div>`;

    $('#rankSubmitBtn').onclick = () => { sfx.click(); openRankSubmit(); };
    $('#rankReload').onclick = () => { sfx.click(); loadRankList(); };
    loadRankList();
  }

  async function loadRankList() {
    const el = $('#rankList');
    if (!el) return;
    const r = await Leaderboard.top(20);
    if (!el.isConnected) return;                 // 그 사이 패널이 닫혔다면 그만
    if (!r.ok) {
      el.innerHTML = `<div class="emptybox">
        <div class="em">📡</div>
        <p>${esc(r.msg)}</p>
      </div>`;
      return;
    }
    const rows = r.data || [];
    if (!rows.length) {
      el.innerHTML = `<div class="emptybox">
        <div class="em">🥇</div>
        <p>아직 등록된 기록이 없습니다.<br>첫 번째 마을이 되어 보세요!</p>
      </div>`;
      return;
    }
    const medal = ['🥇', '🥈', '🥉'];
    el.innerHTML = rows.map((e, i) => `
      <div class="rankrow ${i < 3 ? 'top' + (i + 1) : ''} ${e.id === myEntryId ? 'me' : ''}">
        <span class="rk">${i < 3 ? medal[i] : i + 1}</span>
        <span class="who">
          <div class="nm">${esc(e.nickname)}${e.org ? ` <span class="muted">· ${esc(e.org)}</span>` : ''}${e.id === myEntryId ? ' <span class="chip owned">나</span>' : ''}</div>
          <div class="sub">${esc(e.village)} · 인구 ${Number(e.pop).toLocaleString()}명
            · 만족도 ${Number(e.sat).toFixed(0)}점 · 사례 ${e.closed_cases}건</div>
        </span>
        <span class="pt">${Number(e.score).toLocaleString()}<small>${e.months}개월차</small></span>
      </div>`).join('');
  }

  function openRankSubmit() {
    const G = Sim.state;
    const nick = store.get('wt_nickname') || '';
    const org = store.get('wt_org') || '';
    const m = showModal(`
      <h2>🏆 랭킹에 점수 올리기</h2>
      <p class="lead">아래 값이 순위표에 <b>공개</b>됩니다. 마을 세이브와 프로그램 내용은 올라가지 않습니다.</p>

      <div class="statgrid" style="margin-top:16px">
        <div class="stattile" style="grid-column:1/-1">
          <div class="k">총점</div>
          <div class="v num" style="font-size:24px;color:var(--gold)">${Sim.score().toLocaleString()}점</div>
        </div>
        <div class="stattile"><div class="k">인구</div><div class="v num">${Sim.totalPop().toLocaleString()}명</div></div>
        <div class="stattile"><div class="k">만족도</div><div class="v num">${Sim.avgSat().toFixed(0)}점</div></div>
        <div class="stattile"><div class="k">종결사례</div><div class="v num">${G.closedCases}건</div></div>
        <div class="stattile"><div class="k">경과</div><div class="v num">${G.turn}개월</div></div>
      </div>

      <label class="fl"><span>이름</span><span class="hint">최대 12자</span></label>
      <input type="text" id="rkNick" maxlength="12" value="${esc(nick)}"
             placeholder="예) 홍길동" autocomplete="off" />

      <label class="fl" style="margin-top:10px"><span>소속기관</span><span class="hint">최대 20자 · 선택</span></label>
      <input type="text" id="rkOrg" maxlength="20" value="${esc(org)}"
             placeholder="예) 행복종합사회복지관" autocomplete="off" />

      <p class="muted" style="margin-top:8px">
        이름·소속기관·마을 이름은 다른 참가자에게 그대로 공개됩니다.
      </p>

      <div class="modal-actions">
        <button class="btn ghostb" id="rkCancel">취소</button>
        <button class="btn" id="rkGo">올리기</button>
      </div>
    `);

    $('#rkCancel').onclick = closeModal;
    $('#rkGo').onclick = async () => {
      const nickname = $('#rkNick').value.trim();
      const orgVal = $('#rkOrg').value.trim();
      if (!nickname) { toast('이름을 입력해 주세요.', 'err'); return; }
      const btn = $('#rkGo');
      btn.disabled = true;
      btn.textContent = '올리는 중…';

      const r = await Leaderboard.submit({
        nickname,
        org: orgVal || null,
        village: G.village.slice(0, 12),
        score: Sim.score(),
        pop: Sim.totalPop(),
        sat: Math.round(Sim.avgSat() * 10) / 10,
        closed_cases: G.closedCases,
        months: G.turn,
      });

      if (!r.ok) {
        btn.disabled = false;
        btn.textContent = '올리기';
        toast(r.msg, 'err');
        return;
      }
      const saved = Array.isArray(r.data) ? r.data[0] : r.data;
      if (saved && saved.id) { myEntryId = saved.id; store.set('wt_rank_id', saved.id); }
      store.set('wt_nickname', nickname);
      store.set('wt_org', orgVal);
      sfx.good();
      closeModal();
      toast('순위표에 등록되었습니다!', 'ok');
      if (currentPanel === 'rank') renderRank();
    };
    setTimeout(() => $('#rkNick').focus(), 60);
  }

  /* ---------- 통계 ---------- */
  let statsAsTable = false;
  function renderStats() {
    const G = Sim.state;
    $('#panelTitle').textContent = '📊 마을 통계';
    const body = $('#panelBody');
    const pop = Sim.totalPop();
    const vulnerable = DATA.VULNERABLE_IDS.reduce((a, g) => a + G.pop[g], 0);
    const startPop = G.history.length ? G.history[0].pop : pop;

    body.innerHTML = `
      <div class="statgrid">
        <div class="stattile" style="grid-column:1/-1">
          <div class="k">총점 · 인구 ${pop.toLocaleString()} + 만족도 ${Sim.avgSat().toFixed(0)}×20 + 종결사례 ${G.closedCases}×100</div>
          <div class="v num" style="font-size:24px;color:var(--gold)">${Sim.score().toLocaleString()}점</div>
        </div>
        <div class="stattile"><div class="k">인구</div><div class="v num">${pop.toLocaleString()}명</div></div>
        <div class="stattile"><div class="k">전입 누계</div><div class="v num">+${(pop - startPop).toLocaleString()}명</div></div>
        <div class="stattile"><div class="k">취약계층 비율</div><div class="v num">${(vulnerable / pop * 100).toFixed(0)}%</div></div>
        <div class="stattile"><div class="k">평판</div><div class="v num">${G.rep.toFixed(0)}점</div></div>
        <div class="stattile"><div class="k">총 수입</div><div class="v num">${fmt(5e9 + G.totalGrant)}</div></div>
        <div class="stattile"><div class="k">누적 집행</div><div class="v num">${fmt(G.totalSpent)}</div></div>
        <div class="stattile"><div class="k">보유 부지</div><div class="v num">${G.parcels.length}구역</div></div>
        <div class="stattile"><div class="k">도로</div><div class="v num">${G.roads.length}칸</div></div>
        <div class="stattile"><div class="k">토지 매입비</div><div class="v num">${fmt(G.totalLand || 0)}</div></div>
        <div class="stattile"><div class="k">도로 공사비</div><div class="v num">${fmt(G.totalRoad || 0)}</div></div>
        <div class="stattile"><div class="k">공모 사업비</div><div class="v num">${fmt(G.totalGrantWon || 0)}</div></div>
        <div class="stattile"><div class="k">행복지수 보조금</div><div class="v num">${fmt(G.totalHappinessBonus || 0)}</div></div>
        <div class="stattile"><div class="k">꾸민 요소</div><div class="v num">${(G.decor || []).length}개</div></div>
        <div class="stattile"><div class="k">꾸미기 지출</div><div class="v num">${fmt(G.totalDecor || 0)}</div></div>
        <div class="stattile"><div class="k">운영 프로그램</div><div class="v num">${G.programs.filter(p => p.active).length}개</div></div>
        <div class="stattile"><div class="k">종결 사례</div><div class="v num">${G.closedCases}건</div></div>
      </div>

      <div class="secthead"><span>월별 추이</span>
        <button class="btn small ghostb" id="statTableBtn">${statsAsTable ? '차트로 보기' : '표로 보기'}</button>
      </div>

      <div id="statCharts" style="display:${statsAsTable ? 'none' : 'block'}">
        <div class="chartbox"><h4>인구 추이 (명)</h4><canvas id="chartPop" height="146"></canvas></div>
        <div class="chartbox"><h4>평균 만족도 추이 (점)</h4><canvas id="chartSat" height="146"></canvas></div>
      </div>
      <div id="statTable" class="chartbox" style="display:${statsAsTable ? 'block' : 'none'}"></div>

      <div class="chartbox">
        <h4>대상별 만족도</h4>
        ${DATA.GROUP_IDS.map(gid => {
          const g = DATA.GROUPS[gid];
          return `<div class="hbar">
            <span class="lb"><i style="background:${g.color}"></i>${g.label}</span>
            <span class="track"><i style="width:${G.sat[gid]}%;background:${g.color}"></i></span>
            <span class="vv num">${G.sat[gid].toFixed(0)}점</span></div>`;
        }).join('')}
      </div>

      <div class="chartbox">
        <h4>인구 구성</h4>
        ${DATA.GROUP_IDS.map(gid => {
          const g = DATA.GROUPS[gid];
          return `<div class="hbar">
            <span class="lb"><i style="background:${g.color}"></i>${g.label}</span>
            <span class="track"><i style="width:${G.pop[gid] / pop * 100}%;background:${g.color}"></i></span>
            <span class="vv num">${G.pop[gid].toLocaleString()}명</span></div>`;
        }).join('')}
      </div>`;

    $('#statTableBtn').onclick = () => { statsAsTable = !statsAsTable; renderStats(); };

    if (statsAsTable) {
      const rows = [...G.history].reverse().slice(0, 40).map(h =>
        `<tr><td>${esc(h.label)}</td><td class="num">${h.pop.toLocaleString()}</td>
         <td class="num">${h.sat.toFixed(1)}</td><td class="num">${h.rep}</td>
         <td class="num">${fmt(h.budget)}</td></tr>`).join('');
      $('#statTable').innerHTML = `<table class="datatable">
        <tr><th>시점</th><th>인구</th><th>만족도</th><th>평판</th><th>예산</th></tr>${rows}</table>`;
    } else {
      drawLineChart($('#chartPop'), G.history.map(h => h.pop), G.history.map(h => h.label),
        { color: '#4d8fd6', fmt: v => v.toLocaleString() + '명', goal: Sim.GOAL.pop, goalLabel: '목표 1,000명' });
      drawLineChart($('#chartSat'), G.history.map(h => h.sat), G.history.map(h => h.label),
        { color: '#2fa07f', fmt: v => v.toFixed(1) + '점', yMax: 100, goal: Sim.GOAL.sat, goalLabel: '목표 80점' });
    }
  }

  /* ---------- 라인 차트 ---------- */
  function drawLineChart(canvas, values, labels, opts) {
    if (!canvas || !values.length) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.clientWidth || 340;
    const H = Number(canvas.getAttribute('height')) || 146;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.height = H + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const padL = 46, padR = 16, padT = 14, padB = 24;
    const iw = W - padL - padR, ih = H - padT - padB;
    // 목표선이 항상 보이도록 축 상한을 목표치까지 잡는다 (남은 거리를 눈으로 알 수 있게)
    const vMin = 0;
    let vMax = opts.yMax || Math.max(Math.max(...values) * 1.18, (opts.goal || 0) * 1.06);
    if (vMax <= vMin) vMax = vMin + 1;
    const xAt = i => padL + (values.length <= 1 ? iw / 2 : i / (values.length - 1) * iw);
    const yAt = v => padT + ih - (v - vMin) / (vMax - vMin) * ih;
    const font = 'Pretendard, sans-serif';

    function render(hoverIdx = -1) {
      ctx.clearRect(0, 0, W, H);

      // 격자 + y축 눈금
      ctx.font = `500 10px ${font}`;
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const v = vMin + (vMax - vMin) * i / 4;
        const y = Math.round(yAt(v)) + .5;
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = '#7d8fa3';
        ctx.textAlign = 'right';
        ctx.fillText(Math.round(v).toLocaleString(), padL - 8, y + 3.5);
      }

      // 목표선
      if (opts.goal && opts.goal <= vMax) {
        const gy = Math.round(yAt(opts.goal)) + .5;
        ctx.strokeStyle = 'rgba(240,198,116,0.5)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(W - padR, gy); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(240,198,116,0.85)';
        ctx.textAlign = 'left';
        ctx.font = `600 9.5px ${font}`;
        ctx.fillText(opts.goalLabel, padL + 4, gy - 5);
      }

      // x축 라벨
      ctx.fillStyle = '#7d8fa3';
      ctx.font = `500 10px ${font}`;
      ctx.textAlign = 'center';
      [...new Set([0, Math.floor((labels.length - 1) / 2), labels.length - 1])].forEach(i => {
        if (labels[i]) ctx.fillText(labels[i], Math.min(W - padR - 18, Math.max(padL + 18, xAt(i))), H - 7);
      });

      // 면적
      const grad = ctx.createLinearGradient(0, padT, 0, padT + ih);
      grad.addColorStop(0, opts.color + '4d');
      grad.addColorStop(1, opts.color + '05');
      ctx.beginPath();
      values.forEach((v, i) => i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v)));
      ctx.lineTo(xAt(values.length - 1), padT + ih);
      ctx.lineTo(xAt(0), padT + ih);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // 선
      ctx.beginPath();
      values.forEach((v, i) => i ? ctx.lineTo(xAt(i), yAt(v)) : ctx.moveTo(xAt(i), yAt(v)));
      ctx.strokeStyle = opts.color;
      ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.stroke();

      // 마지막 값 직접 라벨
      const lastX = xAt(values.length - 1), lv = values[values.length - 1];
      ctx.beginPath(); ctx.arc(lastX, yAt(lv), 3.5, 0, 7);
      ctx.fillStyle = opts.color; ctx.fill();
      ctx.strokeStyle = '#131c28'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `700 11px ${font}`;
      ctx.fillStyle = '#f0f5fb';
      ctx.textAlign = 'right';
      ctx.fillText(opts.fmt(lv), lastX - 2, Math.max(13, yAt(lv) - 10));

      // 호버 크로스헤어 + 툴팁
      if (hoverIdx >= 0 && hoverIdx < values.length) {
        const hx = xAt(hoverIdx), hv = values[hoverIdx], hy = yAt(hv);
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(hx, padT); ctx.lineTo(hx, padT + ih); ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(hx, hy, 4.5, 0, 7);
        ctx.fillStyle = opts.color; ctx.fill();
        ctx.strokeStyle = '#131c28'; ctx.lineWidth = 2.5; ctx.stroke();

        const txt = `${labels[hoverIdx]} · ${opts.fmt(hv)}`;
        ctx.font = `700 11px ${font}`;
        const tw = ctx.measureText(txt).width + 16;
        const tx = Math.min(W - padR - tw, Math.max(padL, hx - tw / 2));
        ctx.fillStyle = 'rgba(8,13,20,0.94)';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(tx, 1, tw, 19, 6); else ctx.rect(tx, 1, tw, 19);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#f0f5fb';
        ctx.textAlign = 'center';
        ctx.fillText(txt, tx + tw / 2, 14.5);
      }
    }

    render();
    canvas.onmousemove = (e) => {
      const rect = canvas.getBoundingClientRect();
      let idx = Math.round((e.clientX - rect.left - padL) / (iw || 1) * (values.length - 1));
      render(Math.max(0, Math.min(values.length - 1, idx)));
    };
    canvas.onmouseleave = () => render();
  }

  /* ---------- 시설 정보 ---------- */
  function openBuildingInfo(instId) {
    const G = Sim.state;
    const inst = G.buildings.find(b => b.id === instId);
    if (!inst) return;
    const def = Sim.getDef(inst.defId);
    const progs = G.programs.filter(p => p.facilityInstId === instId && p.active);
    const lastMonth = progs.reduce((s, p) => {
      const h = p.history[p.history.length - 1];
      return s + (h ? h.participants : 0);
    }, 0);

    showModal(`
      <h2>${def.icon} ${esc(def.name)}</h2>
      <p class="lead">${esc(def.desc)}</p>
      <div class="statgrid" style="margin-top:18px">
        <div class="stattile"><div class="k">월 유지비</div><div class="v num">${fmt(def.upkeep)}</div></div>
        <div class="stattile"><div class="k">프로그램 정원</div><div class="v num">${def.cap ? def.cap + '명' : '운영 불가'}</div></div>
        <div class="stattile"><div class="k">운영 프로그램</div><div class="v num">${progs.length}개</div></div>
        <div class="stattile"><div class="k">지난달 이용</div><div class="v num">${lastMonth}명</div></div>
      </div>
      ${progs.length ? `<div class="muted" style="margin-top:12px">운영 중 · ${progs.map(p => `「${esc(p.title)}」`).join(', ')}</div>` : ''}
      <div class="modal-actions">
        <button class="btn danger small" id="biDemolish">철거 · ${fmt(Math.round(def.cost * .3))} 환급</button>
        <button class="btn ghostb" onclick="UI.closeModal()">닫기</button>
      </div>
    `);
    $('#biDemolish').onclick = () => { closeModal(); hooks.demolish(instId); };
  }

  /* ---------- 민가 ---------- */
  function openHouseInfo(x, z) {
    showModal(`
      <h2>🏠 원래 살던 주민의 집</h2>
      <p class="lead">이 자리는 마을이 생기기 전부터 살아온 주민의 집입니다. 철거할 수는 없지만,
        우리 땅 안의 다른 빈 자리로 이사를 보낼 수는 있습니다.</p>
      <div class="modal-actions">
        <button class="btn ghostb" onclick="UI.closeModal()">닫기</button>
        <button class="btn primary" id="hiMove">🚚 이사 보내기</button>
      </div>
    `);
    $('#hiMove').onclick = () => { closeModal(); hooks.startMoveHouse(x, z); };
  }

  /* ---------- 미션 ---------- */
  function showMissionStart() {
    showModal(`
      <h2>🎪 [미션] 다 함께 어울리는 마을</h2>
      <p class="lead">주민커뮤니티센터가 문을 열었습니다! 이곳을 무대로 <b>모든 주민</b>이 함께 어울릴 수 있는
        프로그램을 기획해 보세요. 어르신이 살던 곳에서 오래오래 지낼 수 있도록(AIP · Aging In Place)
        이웃이 함께 살피는 공동케어회의도 이곳에서 열립니다.</p>
      <p class="muted">힌트: 프로그램 대상을 <b>전체 주민</b>으로, 운영 시설을 <b>주민커뮤니티센터</b>로 고르고,
        제목이나 설명에 '공동체·이웃·마을·축제·나눔' 같은 말을 넣어 보세요.</p>
      <div class="modal-actions">
        <button class="btn primary" onclick="UI.closeModal()">알겠습니다</button>
      </div>
    `);
  }

  function showMissionComplete(program) {
    showModal(`
      <h2>🏆 미션 완료!</h2>
      <p class="lead">「${esc(program.title)}」 프로그램으로 지역주민이 함께 어울리는 마을을 만들었습니다!
        공동케어회의를 통한 AIP 방안까지 마련되어 특별교부금 <b>${fmt(3e8)}</b>이 지급되었습니다.</p>
      <div class="modal-actions">
        <button class="btn primary" onclick="UI.closeModal()">좋아요!</button>
      </div>
    `);
  }

  /* ---------- 인트로 / 승리 / 메뉴 ---------- */
  function showIntro(hasSave, onNew, onContinue) {
    showModal(`
      <div style="text-align:center; margin-bottom:6px">
        <div style="font-size:44px; line-height:1">🏘️</div>
        <h2 style="margin-top:8px">복지마을 타이쿤</h2>
      </div>
      <p class="lead" style="text-align:center">
        인구 <b>500명</b>의 작은 마을에 사회복지 예산 <b style="color:var(--gold)">50억 원</b>이 교부되었습니다.<br>
        주민의 절반은 <b>독거노인 · 발달장애인 · 위기청소년 · 기초생활수급자 · 다문화이주민 · 북한이탈주민</b>입니다.
      </p>
      <div class="hr"></div>
      <div class="card"><h3>🗺️ 넓힌다</h3><div class="desc">부지를 매입해 마을을 넓히고, 직접 길을 내어 골목을 잇습니다.</div></div>
      <div class="card"><h3>🏗️ 짓는다</h3><div class="desc">복지관·가족센터·경로당을 예산 안에서 건축합니다. 시설은 도로 쪽을 바라보게 서고, 주민의 집은 절대 헐리지 않습니다.</div></div>
      <div class="card"><h3>🎨 꾸민다</h3><div class="desc">가로수·화단·벤치·분수대 같은 소품으로 나만의 예쁜 마을을 만듭니다.</div></div>
      <div class="card"><h3>📋 기획한다</h3><div class="desc">제목과 설명을 직접 써서 우리 마을만의 프로그램을 만듭니다. 참여자 수와 생생한 반응이 돌아옵니다.</div></div>
      <div class="card"><h3>🤝 연계한다</h3><div class="desc">사례관리로 주민 한 분 한 분의 취약점에 맞는 지역자원을 이어줍니다.</div></div>
      <p class="muted" style="margin-top:12px">
        복지가 좋다는 소문이 나면 다른 지역에서 사람들이 이사 옵니다.<br>
        🎯 목표 · 인구 <b>1,000명</b> · 평균 만족도 <b>80점</b><br>
        🖱️ 좌드래그 회전 · 우드래그 이동 · 휠 확대 · Space 다음 달
      </p>
      <label class="fl"><span>마을 이름</span><span class="hint">최대 10자</span></label>
      <input type="text" id="introName" maxlength="10" value="행복마을" autocomplete="off" />
      <div class="modal-actions">
        ${hasSave ? '<button class="btn ghostb" id="introContinue">이어하기</button>' : ''}
        <button class="btn" id="introNew">${hasSave ? '처음부터' : '마을 시작하기'}</button>
      </div>
    `, { locked: true });
    $('#introNew').onclick = () => { closeModal(); onNew($('#introName').value.trim() || '행복마을'); };
    const cont = $('#introContinue');
    if (cont) cont.onclick = () => { closeModal(); onContinue(); };
  }

  function showVictory() {
    sfx.good();
    const G = Sim.state;
    showModal(`
      <div style="text-align:center">
        <div style="font-size:44px; line-height:1">🏆</div>
        <h2 style="margin-top:8px">복지도시 달성!</h2>
      </div>
      <p class="lead" style="text-align:center">
        <b>${esc(G.village)}</b>이 목표를 이뤘습니다.<br>
        전국에서 벤치마킹 견학이 이어지고 "살고 싶은 마을" 1위에 선정되었습니다.
      </p>
      <div class="statgrid" style="margin-top:18px">
        <div class="stattile" style="grid-column:1/-1">
          <div class="k">최종 점수</div>
          <div class="v num" style="font-size:26px;color:var(--gold)">${Sim.score().toLocaleString()}점</div>
        </div>
        <div class="stattile"><div class="k">인구</div><div class="v num">${Sim.totalPop().toLocaleString()}명</div></div>
        <div class="stattile"><div class="k">평균 만족도</div><div class="v num">${Sim.avgSat().toFixed(0)}점</div></div>
        <div class="stattile"><div class="k">종결 사례</div><div class="v num">${G.closedCases}건</div></div>
        <div class="stattile"><div class="k">만든 프로그램</div><div class="v num">${G.programs.length}개</div></div>
      </div>
      <p class="muted" style="margin-top:14px; text-align:center">게임은 계속됩니다. 더 큰 복지도시를 만들어 보세요!</p>
      <div class="modal-actions">
        <button class="btn ghostb" id="winRank">🏆 랭킹에 올리기</button>
        <button class="btn" onclick="UI.closeModal()">계속하기</button>
      </div>
    `);
    $('#winRank').onclick = () => openRankSubmit();
  }

  function openMenu() {
    showModal(`
      <h2>⚙️ 메뉴</h2>
      <div class="card" style="margin-top:16px"><div class="row spread">
        <span class="desc" style="margin:0">진행 상황은 매달 자동 저장됩니다.</span>
        <button class="btn small ghostb" id="menuSave">지금 저장</button></div></div>
      <div class="card"><div class="row spread">
        <span class="desc" style="margin:0">효과음 ${muted ? '꺼짐' : '켜짐'}</span>
        <button class="btn small ghostb" id="menuMute">${muted ? '🔇 켜기' : '🔊 끄기'}</button></div></div>
      <div class="card"><div class="row spread">
        <span class="desc" style="margin:0">처음부터 다시 시작 · 저장 삭제</span>
        <button class="btn small danger" id="menuReset">초기화</button></div></div>
      <div class="hr"></div>
      <p class="muted">
        🖱️ 좌드래그 회전 · 우드래그 이동 · 휠 확대/축소<br>
        시설을 클릭하면 상세 정보가 열립니다 · Space 다음 달 · ESC 취소
      </p>
      <div class="modal-actions"><button class="btn ghostb" onclick="UI.closeModal()">닫기</button></div>
    `);
    $('#menuSave').onclick = () => { Sim.save(); toast('저장되었습니다.', 'ok'); };
    $('#menuMute').onclick = () => {
      muted = !muted;
      store.set('wt_muted', muted ? '1' : '0');
      closeModal(); openMenu();
    };
    $('#menuReset').onclick = () => {
      showModal(`
        <h2>정말 초기화할까요?</h2>
        <p class="lead">지금까지 만든 마을이 모두 사라집니다. 되돌릴 수 없습니다.</p>
        <div class="modal-actions">
          <button class="btn ghostb" onclick="UI.closeModal()">취소</button>
          <button class="btn danger" id="resetYes">초기화</button>
        </div>`);
      $('#resetYes').onclick = () => { Sim.reset(); location.reload(); };
    };
  }

  /* ---------- 진행 ---------- */
  function doNextMonth() {
    if (!Sim.state) return;
    sfx.month();
    const wasWon = Sim.state.won;
    Sim.nextMonth();
    refresh();
    rerenderPanel();
    if (Sim.state.won && !wasWon) showVictory();
  }

  /* ---------- 모드 힌트 ---------- */
  function showModeHint(html) {
    $('#modeHintText').innerHTML = html;
    $('#modeHint').classList.add('show');
  }
  function hideModeHint() { $('#modeHint').classList.remove('show'); }

  function hideLoader() { $('#loader').classList.add('hide'); }

  /* ---------- init ---------- */
  function init(h) {
    hooks = h;
    document.querySelectorAll('#toolbar .tbtn[data-panel]').forEach(btn => {
      btn.onclick = () => {
        sfx.click();
        if (currentPanel === btn.dataset.panel) closePanel();
        else openPanel(btn.dataset.panel);
      };
    });
    $('#panelClose').onclick = () => { sfx.click(); closePanel(); };
    $('#nextBtn').onclick = () => doNextMonth();
    $('#menuBtn').onclick = () => { sfx.click(); openMenu(); };
    $('#modeCancelBtn').onclick = () => hooks.cancelMode();

    window.addEventListener('keydown', e => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
      if (e.key === 'Escape') {
        if (isModalOpen()) closeModal();
        else if (currentPanel) closePanel();
        else hooks.cancelMode();
      }
      if (e.key === ' ' && !isModalOpen() && !typing) { e.preventDefault(); doNextMonth(); }
    });
    window.addEventListener('resize', () => { if (currentPanel === 'stats') renderStats(); });
  }

  return {
    init, refresh, toast, sfx, hideLoader,
    openPanel, closePanel, rerenderPanel, resetLogFeed,
    showModal, closeModal, isModalOpen,
    showIntro, showVictory, openMenu, openBuildingInfo, openHouseInfo,
    showMissionStart, showMissionComplete,
    showModeHint, hideModeHint, doNextMonth,
  };
})();
