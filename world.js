/* =========================================================
 * 복지마을 타이쿤 — 3D 월드 (three.js)
 * 시드 기반 지형, 구역(토지) 소유 표시, 플레이어가 놓는 도로,
 * 디테일한 복지시설, 가로등·화단·연못, 걸어다니는 주민
 * ========================================================= */
'use strict';

const World = (() => {

  const GRID = DATA.MAP.GRID;
  const TILE = DATA.MAP.TILE;
  const PARCEL = DATA.MAP.PARCEL;
  const PARCELS = DATA.MAP.PARCELS;
  const HALF = GRID * TILE / 2;

  let renderer, scene, camera, raycaster, groundMesh;
  let terrainGroup = null;          // 지형·장식 (새 게임 시 통째로 교체)
  let roadGroup = null;             // 도로 타일 메시
  let parcelGroup = null;           // 구역 경계 / 미보유 오버레이

  let tiles = [];                   // 'grass' | 'house' | 'tree' | 'water' | 'building' | 'decor'
  let buildingMeshes = {};          // instId -> Group
  let decorMeshes = {};             // 'x,z' -> 나무/화단/민가 메시 (지형 생성 시 흩뿌린 것들)
  let decorInstMeshes = {};         // instId -> Group (플레이어가 놓은 꾸미기 요소)
  let roadMeshes = {};              // 'x,z' -> Group
  let parcelTiles = {};             // 'px,pz' -> {overlay, border}

  // 방향이 있는 꾸미기 요소 — 근처에 도로가 있으면 그쪽을 바라보게 둔다
  const DIRECTIONAL_DECOR_KINDS = new Set(['bench', 'lamp', 'fence', 'signboard', 'bikerack', 'trashbin']);

  let ghost = null, ghostDef = null, ghostValid = false, ghostTile = null, ghostReason = '';
  let hoverRing = null, hoveredInstId = null;
  let villagers = [];
  let clouds = [];
  let cbs = {};
  let mode = { type: 'none' };
  let painting = false;             // 도로 드래그 시공 중
  const pointer = new THREE.Vector2(-10, -10);

  const cam = { theta: Math.PI * 0.75, phi: 0.88, radius: 78, target: new THREE.Vector3(0, 0, 0) };
  const camGoal = { theta: cam.theta, phi: cam.phi, radius: cam.radius, target: cam.target.clone() };
  let dragging = null;

  /* ---------- 시드 난수 (지형을 매번 같게 재현) ---------- */
  let rng = Math.random;
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const rand = (a, b) => a + rng() * (b - a);
  const irand = (a, b) => Math.floor(rand(a, b + 1));
  // 주민 등 게임 중 연출에는 일반 난수를 쓴다
  const lrand = (a, b) => a + Math.random() * (b - a);
  const lirand = (a, b) => Math.floor(lrand(a, b + 1));

  const key = (x, z) => x + ',' + z;
  const tileCenter = (ix, iz, size = 1) =>
    new THREE.Vector3((ix + size / 2) * TILE - HALF, 0, (iz + size / 2) * TILE - HALF);
  const inGrid = (x, z) => x >= 0 && z >= 0 && x < GRID && z < GRID;

  // 발밑(x,z~x+size,z+size)을 둘러싼 도로 중 어느 쪽에 가장 많이 접했는지 찾아
  // 그 방향을 [dx,dz] 단위 벡터로 돌려준다. 건물·방향성 있는 소품이 도로를 보고 서게 하는 데 쓴다.
  function roadFacing(x, z, size) {
    const counts = { n: 0, s: 0, e: 0, w: 0 };
    const dirs = [[0, -1, 'n'], [0, 1, 's'], [1, 0, 'e'], [-1, 0, 'w']];
    for (let dx = 0; dx < size; dx++) for (let dz = 0; dz < size; dz++) {
      const tx = x + dx, tz = z + dz;
      for (const [ox, oz, k] of dirs) {
        const nx = tx + ox, nz = tz + oz;
        if ((nx < x || nx >= x + size || nz < z || nz >= z + size) && Sim.isRoad(nx, nz)) counts[k]++;
      }
    }
    let bestKey = null, bestCount = 0;
    for (const k in counts) if (counts[k] > bestCount) { bestCount = counts[k]; bestKey = k; }
    if (!bestKey) return null;
    return { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[bestKey];
  }

  /* =========================================================
   * 텍스처
   * ========================================================= */
  function canvasTexture(size, draw, repeat = 1) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

  let grassTex = null, asphaltTex = null;
  function grassTexture() {
    if (grassTex) return grassTex;
    grassTex = canvasTexture(512, (x, s) => {
      x.fillStyle = '#7fae60';
      x.fillRect(0, 0, s, s);
      const tones = ['#8cbb69', '#74a457', '#96c471', '#6d9c52'];
      for (let i = 0; i < 1400; i++) {
        x.fillStyle = tones[i % tones.length];
        x.globalAlpha = 0.10 + Math.random() * 0.22;
        x.beginPath();
        x.ellipse(Math.random() * s, Math.random() * s, 5 + Math.random() * 17,
          4 + Math.random() * 10, Math.random() * 3.14, 0, 6.29);
        x.fill();
      }
      x.globalAlpha = 1;
      for (let i = 0; i < 2600; i++) {
        x.strokeStyle = i % 2 ? 'rgba(255,255,255,.055)' : 'rgba(40,70,30,.075)';
        x.lineWidth = 1;
        const px = Math.random() * s, py = Math.random() * s;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + (Math.random() - .5) * 3, py - 2 - Math.random() * 3); x.stroke();
      }
    }, 13);
    return grassTex;
  }
  function asphaltTexture() {
    if (asphaltTex) return asphaltTex;
    asphaltTex = canvasTexture(256, (x, s) => {
      x.fillStyle = '#8a8f93';
      x.fillRect(0, 0, s, s);
      for (let i = 0; i < 2800; i++) {
        const g = 120 + Math.floor(Math.random() * 56);
        x.fillStyle = `rgba(${g},${g + 3},${g + 6},${0.12 + Math.random() * 0.28})`;
        x.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
    }, 1);
    return asphaltTex;
  }

  /* 공용 머티리얼 */
  const M = {};
  function mats() {
    if (M.ready) return M;
    M.curb = new THREE.MeshLambertMaterial({ color: 0xcfcabc });
    M.asphalt = new THREE.MeshLambertMaterial({ map: asphaltTexture(), color: 0xa8adb1 });
    M.line = new THREE.MeshLambertMaterial({ color: 0xf2eddc });
    M.ready = true;
    return M;
  }

  /* =========================================================
   * 초기화 (렌더러·하늘·조명만. 지형은 buildWorld에서)
   * ========================================================= */
  function init(canvas, callbacks) {
    cbs = callbacks || {};
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;

    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xaed3ea, 230, 470);

    camera = new THREE.PerspectiveCamera(48, 1, 0.1, 900);
    raycaster = new THREE.Raycaster();

    buildSky();
    buildLights();
    buildClouds();

    hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(TILE * 0.30, TILE * 0.44, 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, side: THREE.DoubleSide })
    );
    hoverRing.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
    hoverRing.visible = false;
    scene.add(hoverRing);

    resize();
    window.addEventListener('resize', resize);
    bindInput(canvas);
    return { scene, camera };
  }

  function buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: {
        cTop: { value: new THREE.Color(0x3f86c8) },
        cMid: { value: new THREE.Color(0x9ecdea) },
        cBot: { value: new THREE.Color(0xe6f1f6) },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() { vPos = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        uniform vec3 cTop; uniform vec3 cMid; uniform vec3 cBot;
        varying vec3 vPos;
        void main() {
          float h = clamp(vPos.y * 1.15 + 0.08, -1.0, 1.0);
          vec3 col = h > 0.0 ? mix(cMid, cTop, pow(h, 0.75)) : mix(cMid, cBot, pow(-h, 0.55));
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    scene.add(new THREE.Mesh(new THREE.SphereGeometry(560, 32, 18), mat));
  }

  function buildLights() {
    scene.add(new THREE.HemisphereLight(0xbcdcf5, 0x5d7a42, 0.42));
    const sun = new THREE.DirectionalLight(0xfff4dc, 1.28);
    sun.position.set(64, 96, 44);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.02;
    const s = 92;
    sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
    sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
    sun.shadow.camera.far = 300;
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8fbce4, 0.22);
    fill.position.set(-50, 34, -38);
    scene.add(fill);
  }

  function buildClouds() {
    for (let i = 0; i < 9; i++) {
      const c = new THREE.Group();
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, fog: false });
      for (let j = 0; j < 4; j++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(2.6 + Math.random() * 2.2, 8, 6), mat);
        b.position.set(j * (2.6 + Math.random() * 1.6), (Math.random() - .5) * 1.2, (Math.random() - .5) * 2.8);
        b.scale.y = 0.48;
        c.add(b);
      }
      c.position.set(lrand(-HALF * 2.4, HALF * 2.4), lrand(44, 66), lrand(-HALF * 2.4, HALF * 2.4));
      c.userData.speed = lrand(0.35, 1.0);
      scene.add(c);
      clouds.push(c);
    }
  }

  /* =========================================================
   * 월드 생성 — Sim 상태(시드/구역/도로)를 읽어 통째로 만든다
   * ========================================================= */
  function disposeGroup(g) {
    if (!g) return;
    g.traverse(o => {
      if (o.isMesh) {
        o.geometry && o.geometry.dispose();
        // 공용 머티리얼은 유지, 개별 생성분만 정리
        if (o.material && !Object.values(M).includes(o.material)) {
          (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose && m.dispose());
        }
      }
    });
    scene.remove(g);
  }

  function buildWorld() {
    disposeGroup(terrainGroup); disposeGroup(roadGroup); disposeGroup(parcelGroup);
    villagers.forEach(v => scene.remove(v));
    Object.values(buildingMeshes).forEach(g => scene.remove(g));
    villagers = []; buildingMeshes = {}; decorMeshes = {}; roadMeshes = {}; parcelTiles = {};

    terrainGroup = new THREE.Group(); scene.add(terrainGroup);
    roadGroup = new THREE.Group(); scene.add(roadGroup);
    parcelGroup = new THREE.Group(); scene.add(parcelGroup);

    rng = mulberry32(Sim.state.seed || 1);
    buildTerrain();
    refreshRoads();
    refreshParcels();
    spawnVillagers(30);
    focusCamera();
  }

  function buildTerrain() {
    tiles = Array.from({ length: GRID }, () => Array(GRID).fill('grass'));

    // 연못 (고정 위치, 시작 구역 밖)
    for (const [x, z] of [[22, 6], [23, 6], [22, 7], [23, 7]]) tiles[x][z] = 'water';

    groundMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID * TILE, GRID * TILE),
      new THREE.MeshLambertMaterial({ map: grassTexture() })
    );
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    terrainGroup.add(groundMesh);

    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(GRID * TILE * 6, GRID * TILE * 6),
      new THREE.MeshLambertMaterial({ color: 0x6e9a52 })
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.06;
    outer.receiveShadow = true;
    terrainGroup.add(outer);

    buildHills();
    buildPond();
    buildHousesAndTrees();
  }

  function buildHills() {
    const greens = [0x5f8d47, 0x6d9a52, 0x577f40];
    for (let i = 0; i < 18; i++) {
      const r = rand(16, 34);
      const h = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshLambertMaterial({ color: greens[i % 3], flatShading: true })
      );
      const ang = (i / 18) * Math.PI * 2 + rand(-.15, .15);
      const dist = rand(HALF + 40, HALF + 92);
      h.position.set(Math.cos(ang) * dist, -rand(4, 13), Math.sin(ang) * dist);
      h.scale.y = rand(0.35, 0.62);
      terrainGroup.add(h);
    }
  }

  function buildPond() {
    const c = tileCenter(22, 6, 2);
    const water = new THREE.Mesh(
      new THREE.BoxGeometry(TILE * 2 - 0.4, 0.3, TILE * 2 - 0.4),
      new THREE.MeshPhongMaterial({ color: 0x4d94c4, shininess: 90, specular: 0x9fd4f0, transparent: true, opacity: .9 })
    );
    water.position.set(c.x, 0.1, c.z);
    water.receiveShadow = true;
    terrainGroup.add(water);
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.22, 0.42), 0),
        new THREE.MeshLambertMaterial({ color: 0xb5b1a6, flatShading: true }));
      st.position.set(c.x + Math.cos(ang) * (TILE - 0.3), 0.18, c.z + Math.sin(ang) * (TILE - 0.3));
      st.castShadow = true;
      terrainGroup.add(st);
    }
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
  }

  function buildHousesAndTrees() {
    // 기존 민가는 시작 도로변에 (마을이 이미 있던 자리)
    const roadSet = new Set(Sim.state.roads);
    const spots = [];
    for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
      if (tiles[x][z] !== 'grass') continue;
      if (roadSet.has(key(x, z))) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => roadSet.has(key(x + dx, z + dz)));
      if (near) spots.push([x, z, near]);
    }
    shuffle(spots);
    const walls = [0xf0e2c4, 0xe4d3cd, 0xd2e0dc, 0xe8dcec, 0xdfe6cb, 0xf2dfc8];
    const roofs = [0xb85f4a, 0x9a5c72, 0x5f7f9a, 0xa8763c, 0x7d8a4e];
    for (let i = 0; i < Math.min(14, spots.length); i++) {
      const [x, z, near] = spots[i];
      tiles[x][z] = 'house';
      const h = makeHouse(walls[i % walls.length], roofs[i % roofs.length]);
      h.position.copy(tileCenter(x, z));
      h.rotation.y = Math.atan2(near[0], near[1]);
      decorMeshes[key(x, z)] = h;
      terrainGroup.add(h);
    }

    // 가로수길 — 도로를 따라 나무를 심어 거리를 꾸민다 (직선 구간의 양옆에 듬성듬성)
    for (const k of Sim.state.roads) {
      const [rx, rz] = k.split(',').map(Number);
      tryPlantRoadside(rx, rz);
    }

    // 나머지 지역에 나무를 흩뿌린다 (가로수길이 이미 상당수를 채웠으므로 개수는 줄인다)
    let n = 0, guard = 0;
    while (n < 50 && guard++ < 2000) {
      const x = irand(0, GRID - 1), z = irand(0, GRID - 1);
      if (tiles[x][z] !== 'grass' || roadSet.has(key(x, z))) continue;
      tiles[x][z] = 'tree';
      const c = tileCenter(x, z);
      c.x += rand(-1, 1); c.z += rand(-1, 1);
      const t = makeTree(c);
      decorMeshes[key(x, z)] = t;
      terrainGroup.add(t);
      n++;
    }
    // 화단
    let f = 0; guard = 0;
    while (f < 16 && guard++ < 800) {
      const x = irand(0, GRID - 1), z = irand(0, GRID - 1);
      if (tiles[x][z] !== 'grass' || roadSet.has(key(x, z))) continue;
      tiles[x][z] = 'tree';
      const bed = makeFlowerBed(tileCenter(x, z));
      decorMeshes[key(x, z)] = bed;
      terrainGroup.add(bed);
      f++;
    }
  }

  // (x,z) 도로 칸이 직선 구간이면, 진행 방향과 수직인 양옆 빈 칸에 가로수를 심는다.
  // 교차로·막다른 길(양쪽 축 모두 이웃이 있거나 없는 경우)에는 심지 않는다.
  function tryPlantRoadside(x, z) {
    const nS = Sim.isRoad(x, z + 1), nN = Sim.isRoad(x, z - 1);
    const nE = Sim.isRoad(x + 1, z), nW = Sim.isRoad(x - 1, z);
    const horiz = nE || nW, vert = nN || nS;
    if (horiz === vert) return;
    const shoulders = horiz ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [dx, dz] of shoulders) {
      const nx = x + dx, nz = z + dz;
      if (!inGrid(nx, nz)) continue;
      if (tiles[nx][nz] !== 'grass') continue;
      if (!Sim.isOwned(nx, nz)) continue;
      if (rng() > 0.62) continue;
      tiles[nx][nz] = 'tree';
      const c = tileCenter(nx, nz);
      const t = makeTree(c, 'oak');
      t.scale.multiplyScalar(0.82);
      decorMeshes[key(nx, nz)] = t;
      terrainGroup.add(t);
    }
  }

  function makeHouse(wall, roofColor) {
    const g = new THREE.Group();
    const w = TILE * 0.6, h = rand(1.5, 2.0);
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.9),
      new THREE.MeshLambertMaterial({ color: wall }));
    body.position.y = h / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.8, 0.95, 4),
      new THREE.MeshLambertMaterial({ color: roofColor, flatShading: true }));
    roof.position.y = h + 0.47;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.78, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x6b4a35 }));
    door.position.set(0, 0.39, w * 0.45 + 0.02);
    g.add(door);
    const winMat = new THREE.MeshLambertMaterial({ color: 0xbfe0f2, emissive: 0x1b2c38 });
    for (const sx of [-0.55, 0.55]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.06), winMat);
      win.position.set(sx, h * 0.62, w * 0.45 + 0.02);
      g.add(win);
    }
    if (rng() < 0.45) {
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.7, 0.26),
        new THREE.MeshLambertMaterial({ color: 0x9c7f6d }));
      ch.position.set(w * 0.26, h + 0.6, -w * 0.2);
      ch.castShadow = true;
      g.add(ch);
    }
    return g;
  }

  function makeTree(pos, variant) {
    const g = new THREE.Group();
    const kind = variant || (rng() < 0.3 ? 'pine' : 'oak');
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.0, 6),
      new THREE.MeshLambertMaterial({ color: 0x7a5638 }));
    trunk.position.y = 0.5;
    trunk.castShadow = true;
    g.add(trunk);
    if (kind === 'pine') {
      const greens = [0x4e8038, 0x5b8f3f, 0x437030, 0x67a04a];
      const col = greens[irand(0, 3)];
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.05 - i * 0.26, 1.1, 7),
          new THREE.MeshLambertMaterial({ color: col, flatShading: true }));
        cone.position.y = 1.25 + i * 0.62;
        cone.castShadow = true;
        g.add(cone);
      }
    } else if (kind === 'cherry') {
      const pinks = [0xf3b8cf, 0xe89dc0, 0xf7cde0];
      for (let i = 0; i < 2; i++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.75, 1.05), 0),
          new THREE.MeshLambertMaterial({ color: pinks[irand(0, 2)], flatShading: true }));
        leaf.position.set(rand(-.3, .3), 1.5 + i * 0.5, rand(-.3, .3));
        leaf.castShadow = true;
        g.add(leaf);
      }
    } else {
      const greens = [0x4e8038, 0x5b8f3f, 0x437030, 0x67a04a];
      const col = greens[irand(0, 3)];
      for (let i = 0; i < 2; i++) {
        const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(0.75, 1.05), 0),
          new THREE.MeshLambertMaterial({ color: i ? col : (col + 0x060c04), flatShading: true }));
        leaf.position.set(rand(-.3, .3), 1.5 + i * 0.5, rand(-.3, .3));
        leaf.castShadow = true;
        g.add(leaf);
      }
    }
    const s = rand(0.85, 1.25);
    g.scale.set(s, s, s);
    g.position.copy(pos);
    g.rotation.y = rand(0, 6.28);
    return g;
  }

  function makeFlowerBed(pos) {
    const g = new THREE.Group();
    const soil = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.25, 0.28, 10),
      new THREE.MeshLambertMaterial({ color: 0x8b6b4d }));
    soil.position.y = 0.14;
    soil.receiveShadow = soil.castShadow = true;
    g.add(soil);
    const petals = [0xe8657f, 0xf0b23c, 0xe4e0f0, 0xd96fb8, 0xf5e05a];
    for (let i = 0; i < 14; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5),
        new THREE.MeshLambertMaterial({ color: petals[i % petals.length] }));
      const a = rand(0, 6.28), r = rand(0, 0.95);
      f.position.set(Math.cos(a) * r, rand(0.34, 0.5), Math.sin(a) * r);
      g.add(f);
    }
    g.position.copy(pos);
    return g;
  }

  function makeLamp(pos) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.0, 6),
      new THREE.MeshLambertMaterial({ color: 0x40474e }));
    pole.position.y = 1.5; pole.castShadow = true;
    g.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x40474e }));
    arm.position.set(0.25, 2.98, 0);
    g.add(arm);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0xfff3cf, emissive: 0x6b5820 }));
    head.position.set(0.48, 2.92, 0);
    g.add(head);
    g.position.copy(pos);
    return g;
  }

  function makeBench(pos, dir) {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0xa2704a });
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.11, 0.5), woodMat);
    seat.position.y = 0.44; seat.castShadow = true;
    g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 0.09), woodMat);
    back.position.set(0, 0.68, -0.21); back.castShadow = true;
    g.add(back);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x4a5057 });
    for (const sx of [-0.6, 0.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.44, 0.44), legMat);
      leg.position.set(sx, 0.22, 0);
      g.add(leg);
    }
    g.position.copy(pos);
    if (dir) g.rotation.y = Math.atan2(dir[0], dir[1]);
    return g;
  }

  function makeFence(pos) {
    const g = new THREE.Group();
    const postMat = new THREE.MeshLambertMaterial({ color: 0xe8e2d0 });
    const railMat = new THREE.MeshLambertMaterial({ color: 0xf2ede0 });
    for (const ox of [-0.85, 0, 0.85]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.62, 0.09), postMat);
      post.position.set(ox, 0.31, 0);
      post.castShadow = true;
      g.add(post);
    }
    for (const oy of [0.24, 0.46]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.06, 0.06), railMat);
      rail.position.set(0, oy, 0);
      g.add(rail);
    }
    g.position.copy(pos);
    return g;
  }

  function makeBikeRack(pos) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x4a5560 });
    for (const ox of [-0.5, 0, 0.5]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.03, 6, 12, Math.PI), mat);
      loop.rotation.x = Math.PI / 2;
      loop.position.set(ox, 0.28, 0);
      loop.castShadow = true;
      g.add(loop);
    }
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x8a8f93 }));
    base.position.y = 0.03;
    base.receiveShadow = true;
    g.add(base);
    g.position.copy(pos);
    return g;
  }

  function makeTrashBin(pos) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.19, 0.5, 10),
      new THREE.MeshLambertMaterial({ color: 0x3f6e52 }));
    body.position.y = 0.28;
    body.castShadow = true;
    g.add(body);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 10),
      new THREE.MeshLambertMaterial({ color: 0x2c5540 }));
    lid.position.y = 0.54;
    g.add(lid);
    g.position.copy(pos);
    return g;
  }

  function makeFountain(pos) {
    const g = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.34, 16),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c2 }));
    basin.position.y = 0.17;
    basin.castShadow = basin.receiveShadow = true;
    g.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.08, 16),
      new THREE.MeshPhongMaterial({ color: 0x5aa8d8, shininess: 100, specular: 0xbfe6ff, transparent: true, opacity: .92 }));
    water.position.y = 0.36;
    g.add(water);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.7, 10),
      new THREE.MeshLambertMaterial({ color: 0xcfc8b6 }));
    pillar.position.y = 0.6;
    pillar.castShadow = true;
    g.add(pillar);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshPhongMaterial({ color: 0x7cc4ec, shininess: 90, transparent: true, opacity: .9 }));
    top.position.y = 1.0;
    g.add(top);
    for (let i = 0; i < 8; i++) {
      const drop = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4),
        new THREE.MeshPhongMaterial({ color: 0xbfe6ff, transparent: true, opacity: .75 }));
      const a = i / 8 * Math.PI * 2;
      drop.position.set(Math.cos(a) * 0.5, 0.55 + Math.sin(i) * 0.1, Math.sin(a) * 0.5);
      g.add(drop);
    }
    g.position.copy(pos);
    return g;
  }

  function makeStatue(pos) {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0),
      new THREE.MeshLambertMaterial({ color: 0xc9c2b0 }));
    base.position.y = 0.15;
    base.castShadow = base.receiveShadow = true;
    g.add(base);
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.7, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c0 }));
    pedestal.position.y = 0.65;
    pedestal.castShadow = true;
    g.add(pedestal);
    // "나눔" 상징 — 맞잡은 마음을 단순한 형태로 표현
    const symbolMat = new THREE.MeshLambertMaterial({ color: 0x8fae8a });
    const heart = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), symbolMat);
    heart.position.y = 1.28;
    heart.scale.set(1, 1.15, 0.7);
    heart.castShadow = true;
    g.add(heart);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.05, 8, 16), symbolMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 1.0;
    g.add(ring);
    g.position.copy(pos);
    return g;
  }

  function makeGazebo(pos) {
    const g = new THREE.Group();
    const woodMat = new THREE.MeshLambertMaterial({ color: 0xa2764f });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0xb5563f, flatShading: true });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.14, 8),
      new THREE.MeshLambertMaterial({ color: 0xcfc3a6 }));
    floor.position.y = 0.07;
    floor.receiveShadow = true;
    g.add(floor);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 6), woodMat);
      post.position.set(Math.cos(a) * 0.92, 0.87, Math.sin(a) * 0.92);
      post.castShadow = true;
      g.add(post);
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.85, 8), roofMat);
    roof.position.y = 1.95;
    roof.castShadow = true;
    g.add(roof);
    const bench = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 8, 1, true),
      new THREE.MeshLambertMaterial({ color: 0x8a6440, side: THREE.DoubleSide }));
    bench.position.y = 0.5;
    g.add(bench);
    g.position.copy(pos);
    return g;
  }

  function makeSignboard(pos, text) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 1.3, 8),
      new THREE.MeshLambertMaterial({ color: 0x6b7280 }));
    post.position.y = 0.65;
    post.castShadow = true;
    g.add(post);
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.62, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xf7f4ec }));
    board.position.y = 1.45;
    board.castShadow = true;
    g.add(board);
    const label = makeLabelSprite(text || '🏘️ 환영합니다', 0xf0c674);
    label.position.set(0, 1.46, 0.05);
    label.scale.multiplyScalar(0.6);
    g.add(label);
    g.position.copy(pos);
    return g;
  }

  /* =========================================================
   * 꾸미기 요소 메시 — DATA.DECOR의 kind에 따라 알맞은 모양을 만든다
   * ========================================================= */
  function makeDecorMesh(def) {
    const zero = new THREE.Vector3(0, 0, 0);
    switch (def.kind) {
      case 'tree': return makeTree(zero, def.variant);
      case 'flowerbed': return makeFlowerBed(zero);
      case 'bench': return makeBench(zero);
      case 'lamp': return makeLamp(zero);
      case 'fence': return makeFence(zero);
      case 'bikerack': return makeBikeRack(zero);
      case 'trashbin': return makeTrashBin(zero);
      case 'fountain': return makeFountain(zero);
      case 'statue': return makeStatue(zero);
      case 'gazebo': return makeGazebo(zero);
      case 'signboard': return makeSignboard(zero, '🏘️ ' + (Sim.state ? Sim.state.village : '환영합니다'));
      default: return new THREE.Group();
    }
  }

  /* =========================================================
   * 도로 — Sim.state.roads가 원본. 타일 단위로 다시 그린다.
   * ========================================================= */
  function renderRoadTile(x, z) {
    const k = key(x, z);
    if (roadMeshes[k]) { roadGroup.remove(roadMeshes[k]); delete roadMeshes[k]; }
    if (!Sim.isRoad(x, z)) return;

    const m = mats();
    const g = new THREE.Group();
    const c = tileCenter(x, z);

    const curb = new THREE.Mesh(new THREE.BoxGeometry(TILE, 0.16, TILE), m.curb);
    curb.position.y = 0.08;
    curb.receiveShadow = true;
    g.add(curb);

    const nS = Sim.isRoad(x, z + 1), nN = Sim.isRoad(x, z - 1);
    const nE = Sim.isRoad(x + 1, z), nW = Sim.isRoad(x - 1, z);
    const horiz = nE || nW, vert = nN || nS;
    const w = (vert && !horiz) ? TILE * 0.78 : TILE;
    const d = (horiz && !vert) ? TILE * 0.78 : TILE;

    const road = new THREE.Mesh(new THREE.BoxGeometry(w, 0.10, d), m.asphalt);
    road.position.y = 0.15;
    road.receiveShadow = true;
    g.add(road);

    const straightH = horiz && !vert, straightV = vert && !horiz;
    if (straightH || straightV) {
      for (let k2 = -1; k2 <= 1; k2++) {
        const dash = new THREE.Mesh(
          new THREE.BoxGeometry(straightH ? 0.9 : 0.11, 0.02, straightH ? 0.11 : 0.9), m.line);
        dash.position.set(straightH ? k2 * 1.3 : 0, 0.21, straightV ? k2 * 1.3 : 0);
        g.add(dash);
      }
    }
    if (nN && nS && nE && nW) {   // 사거리
      for (let k2 = -2; k2 <= 2; k2++) {
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 1.5), m.line);
        a.position.set(k2 * 0.5, 0.21, -TILE * 0.44);
        g.add(a);
        const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 0.28), m.line);
        b.position.set(-TILE * 0.44, 0.21, k2 * 0.5);
        g.add(b);
      }
    }

    g.position.set(c.x, 0, c.z);
    roadGroup.add(g);
    roadMeshes[k] = g;
  }

  // 한 타일과 이웃 4칸을 다시 그린다 (연석·중앙선이 이웃에 따라 달라지므로)
  function refreshRoadAround(x, z) {
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
      if (inGrid(x + dx, z + dz)) renderRoadTile(x + dx, z + dz);
    });
  }

  function refreshRoads() {
    Object.keys(roadMeshes).forEach(k => { roadGroup.remove(roadMeshes[k]); delete roadMeshes[k]; });
    for (const k of Sim.state.roads) {
      const [x, z] = k.split(',').map(Number);
      renderRoadTile(x, z);
    }
  }

  // 도로를 놓을 때 그 칸의 나무·화단을 치운다
  function clearDecor(x, z) {
    const k = key(x, z);
    if (decorMeshes[k]) {
      terrainGroup.remove(decorMeshes[k]);
      delete decorMeshes[k];
      if (tiles[x][z] === 'tree' || tiles[x][z] === 'house') tiles[x][z] = 'grass';
    }
  }

  function addRoad(x, z) {
    clearDecor(x, z);
    refreshRoadAround(x, z);
    // 새로 놓인 구간과 그 이웃의 직선 여부가 바뀌었을 수 있으니 가로수를 다시 살핀다
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dz]) => {
      const nx = x + dx, nz = z + dz;
      if (inGrid(nx, nz) && Sim.isRoad(nx, nz)) tryPlantRoadside(nx, nz);
    });
  }
  function removeRoadTile(x, z) { refreshRoadAround(x, z); }

  /* =========================================================
   * 구역(토지) — 미보유 구역에 반투명 덮개와 점선 경계
   * ========================================================= */
  function refreshParcels() {
    Object.values(parcelTiles).forEach(o => parcelGroup.remove(o));
    parcelTiles = {};
    const size = PARCEL * TILE;

    for (let px = 0; px < PARCELS; px++) for (let pz = 0; pz < PARCELS; pz++) {
      const owned = Sim.isParcelOwned(px, pz);
      const buyable = !owned && Sim.isParcelBuyable(px, pz);
      if (owned) continue;

      const g = new THREE.Group();
      const cx = (px * PARCEL + PARCEL / 2) * TILE - HALF;
      const cz = (pz * PARCEL + PARCEL / 2) * TILE - HALF;

      // 덮개
      const cover = new THREE.Mesh(
        new THREE.PlaneGeometry(size - 0.4, size - 0.4),
        new THREE.MeshBasicMaterial({
          color: buyable ? 0x2a4a6a : 0x1a2430,
          transparent: true, opacity: buyable ? 0.22 : 0.44, depthWrite: false,
        })
      );
      cover.rotation.x = -Math.PI / 2;
      cover.position.set(cx, 0.30, cz);
      g.add(cover);

      // 경계선
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.PlaneGeometry(size - 0.4, size - 0.4)),
        new THREE.LineBasicMaterial({ color: buyable ? 0xf0c674 : 0x6b7c8d, transparent: true, opacity: buyable ? .95 : .5 })
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(cx, 0.34, cz);
      g.add(edge);

      if (buyable) {
        // 가격표는 부지 매입 모드에서만 띄운다 (평소엔 지도가 어수선해진다)
        const tag = makeLabelSprite('🗺️ 매입 ' + Sim.fmtWon(Sim.landPrice()), 0xf0c674);
        tag.position.set(cx, 3.4, cz);
        tag.visible = (mode.type === 'land');
        g.add(tag);
        g.userData.tag = tag;
      }
      g.userData.buyable = buyable;
      g.userData.parcel = [px, pz];
      parcelGroup.add(g);
      parcelTiles[px + ',' + pz] = g;
    }
  }

  function setParcelTagsVisible(v) {
    for (const pk in parcelTiles) {
      const tag = parcelTiles[pk].userData.tag;
      if (tag) tag.visible = v;
    }
  }

  /* =========================================================
   * 라벨
   * ========================================================= */
  function makeLabelSprite(text, accent) {
    const pad = 30, fs = 40, S = 3;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `700 ${fs}px Pretendard, "Malgun Gothic", sans-serif`;
    const tw = Math.ceil(probe.measureText(text).width);
    const W = tw + pad * 2, H = 74;

    const cv = document.createElement('canvas');
    cv.width = W * S / 2; cv.height = H * S / 2;
    const x = cv.getContext('2d');
    x.scale(S / 2, S / 2);
    x.fillStyle = 'rgba(12,20,30,0.86)';
    roundRect(x, 0, 0, W, H - 12, 13);
    x.fill();
    x.beginPath();
    x.moveTo(W / 2 - 8, H - 13); x.lineTo(W / 2 + 8, H - 13); x.lineTo(W / 2, H - 1);
    x.closePath(); x.fill();
    x.strokeStyle = accent ? '#' + accent.toString(16).padStart(6, '0') : 'rgba(255,255,255,0.20)';
    x.lineWidth = accent ? 2.5 : 1.5;
    roundRect(x, 1, 1, W - 2, H - 14, 12.5);
    x.stroke();
    x.font = `700 ${fs}px Pretendard, "Malgun Gothic", sans-serif`;
    x.fillStyle = accent ? '#' + accent.toString(16).padStart(6, '0') : '#ffffff';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, W / 2, (H - 12) / 2 + 1);

    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearFilter;
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    const k = 0.019;
    spr.scale.set(W * k, H * k, 1);
    spr.renderOrder = 999;
    return spr;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* =========================================================
   * 시설 메시
   * ========================================================= */
  function makeBuildingMesh(def, withLabel = true) {
    const g = new THREE.Group();
    const foot = def.size * TILE - 1.0;
    const inner = new THREE.Group();
    g.add(inner);

    if (def.isPark) {
      const lawn = new THREE.Mesh(new THREE.CylinderGeometry(foot * 0.52, foot * 0.54, 0.26, 16),
        new THREE.MeshLambertMaterial({ color: 0x8fca6a }));
      lawn.position.y = 0.13;
      lawn.receiveShadow = true;
      inner.add(lawn);
      const path = new THREE.Mesh(new THREE.TorusGeometry(foot * 0.28, 0.16, 6, 20),
        new THREE.MeshLambertMaterial({ color: 0xd8cfb4 }));
      path.rotation.x = -Math.PI / 2;
      path.position.y = 0.27;
      inner.add(path);
      for (let i = 0; i < 3; i++) {
        const t = makeTree(new THREE.Vector3(lrand(-1.1, 1.1), 0.24, lrand(-1.1, 1.1)));
        t.scale.multiplyScalar(0.8);
        inner.add(t);
      }
      inner.add(makeBench(new THREE.Vector3(0.3, 0.26, 1.25), [0, 1]));
      inner.add(makeLamp(new THREE.Vector3(-1.3, 0.26, -1.1)));
    } else {
      const h = def.height;
      const wallMat = new THREE.MeshLambertMaterial({ color: def.baseColor });
      const trimMat = new THREE.MeshLambertMaterial({ color: def.roofColor });

      const apron = new THREE.Mesh(new THREE.BoxGeometry(foot + 0.9, 0.22, foot + 0.9),
        new THREE.MeshLambertMaterial({ color: 0xd6d1c4 }));
      apron.position.y = 0.11;
      apron.receiveShadow = true;
      inner.add(apron);

      const body = new THREE.Mesh(new THREE.BoxGeometry(foot, h, foot), wallMat);
      body.position.y = h / 2 + 0.22;
      body.castShadow = body.receiveShadow = true;
      inner.add(body);

      const floors = Math.max(1, Math.round(h / 1.45));
      for (let r = 1; r < floors; r++) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(foot + 0.08, 0.09, foot + 0.08), trimMat);
        band.position.y = 0.22 + r * (h / floors);
        inner.add(band);
      }

      const roof = new THREE.Mesh(new THREE.BoxGeometry(foot + 0.55, 0.34, foot + 0.55), trimMat);
      roof.position.y = h + 0.39;
      roof.castShadow = true;
      inner.add(roof);

      const penthouse = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.34, 0.62, foot * 0.3), wallMat);
      penthouse.position.set(-foot * 0.22, h + 0.87, -foot * 0.2);
      penthouse.castShadow = true;
      inner.add(penthouse);
      const phRoof = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.4, 0.12, foot * 0.36), trimMat);
      phRoof.position.set(-foot * 0.22, h + 1.24, -foot * 0.2);
      phRoof.castShadow = true;
      inner.add(phRoof);

      const winMat = new THREE.MeshLambertMaterial({ color: 0xc9e6fa, emissive: 0x1e3444 });
      const frameMat = new THREE.MeshLambertMaterial({ color: 0x5d6874 });
      const cols = def.size >= 2 ? 3 : 2;
      for (let r = 0; r < floors; r++) {
        for (let ci = 0; ci < cols; ci++) {
          const ox = (ci - (cols - 1) / 2) * (foot / (cols + 0.3));
          const oy = 0.22 + (r + 0.6) * (h / floors);
          if (r === 0 && Math.abs(ox) < 0.35) continue;
          for (const dz of [foot / 2 + 0.02, -foot / 2 - 0.02]) {
            const fr = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.19, 0.62, 0.07), frameMat);
            fr.position.set(ox, oy, dz);
            inner.add(fr);
            const win = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.15, 0.48, 0.1), winMat);
            win.position.set(ox, oy, dz);
            inner.add(win);
          }
        }
      }

      const step = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.42, 0.12, 0.9),
        new THREE.MeshLambertMaterial({ color: 0xe0dbcd }));
      step.position.set(0, 0.18, foot / 2 + 0.42);
      step.receiveShadow = true;
      inner.add(step);
      const doorGlass = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.3, 1.25, 0.12),
        new THREE.MeshLambertMaterial({ color: 0x8fbcd4, emissive: 0x16323f }));
      doorGlass.position.set(0, 0.9, foot / 2 + 0.03);
      inner.add(doorGlass);
      const canopy = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.5, 0.13, 1.15), trimMat);
      canopy.position.set(0, 1.75, foot / 2 + 0.42);
      canopy.castShadow = true;
      inner.add(canopy);

      const sign = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.66, 0.42, 0.1),
        new THREE.MeshLambertMaterial({ color: 0xf7f4ec }));
      sign.position.set(0, h + 0.05, foot / 2 + 0.04);
      inner.add(sign);
      const signBar = new THREE.Mesh(new THREE.BoxGeometry(foot * 0.66, 0.09, 0.12), trimMat);
      signBar.position.set(0, h - 0.16, foot / 2 + 0.05);
      inner.add(signBar);

      for (let i = 0; i < (def.size >= 2 ? 3 : 1); i++) {
        const unit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.4),
          new THREE.MeshLambertMaterial({ color: 0xb9bcc0 }));
        unit.position.set(lrand(-foot * 0.3, foot * 0.3), h + 0.73, lrand(-foot * 0.3, foot * 0.3));
        unit.castShadow = true;
        inner.add(unit);
      }

      if (def.size >= 2) {
        const bed = makeFlowerBed(new THREE.Vector3(-foot * 0.36, 0.2, foot * 0.55));
        bed.scale.multiplyScalar(0.55);
        inner.add(bed);
      }
    }

    if (withLabel) {
      const label = makeLabelSprite(def.icon + ' ' + def.name);
      label.position.y = (def.isPark ? 2.5 : def.height + 2.1);
      g.add(label);
      g.userData.label = label;
    }
    g.userData.inner = inner;
    g.userData.def = def;
    return g;
  }

  /* =========================================================
   * 배치 검사
   * ========================================================= */
  // 3D 지형상의 제약. 토지/도로 조건은 Sim.checkSite가 본다.
  // 주민이 사는 집과 플레이어가 놓은 꾸미기 요소는 자리를 비워주지 않는다 —
  // 건물을 지으려면 다른 빈자리를 찾아야 한다.
  function terrainFree(def, ix, iz) {
    for (let dx = 0; dx < def.size; dx++) for (let dz = 0; dz < def.size; dz++) {
      const x = ix + dx, z = iz + dz;
      if (!inGrid(x, z)) return { ok: false, msg: '지도 밖입니다.' };
      const t = tiles[x][z];
      if (t === 'water') return { ok: false, msg: '물 위에는 지을 수 없습니다.' };
      if (t === 'house') return { ok: false, msg: '주민이 사는 집이 있는 자리입니다. 다른 곳에 지어주세요.' };
      if (t === 'building') return { ok: false, msg: '이미 다른 시설이 있는 자리입니다.' };
      if (t === 'decor') return { ok: false, msg: '꾸밈 요소가 있는 자리입니다. 먼저 철거해 주세요.' };
    }
    return { ok: true };
  }

  function canPlace(def, ix, iz) {
    const t = terrainFree(def, ix, iz);
    if (!t.ok) return t;
    return Sim.checkSite(def, ix, iz);
  }

  /* ---------- 꾸미기 배치 검사 ---------- */
  function terrainFreeForDecor(ix, iz) {
    if (!inGrid(ix, iz)) return { ok: false, msg: '지도 밖입니다.' };
    const t = tiles[ix][iz];
    if (t === 'water') return { ok: false, msg: '물 위에는 놓을 수 없습니다.' };
    if (t === 'house') return { ok: false, msg: '주민이 사는 집이 있는 자리입니다.' };
    if (t === 'building') return { ok: false, msg: '이미 시설이 있는 자리입니다.' };
    if (t === 'decor') return { ok: false, msg: '이미 다른 꾸밈 요소가 있습니다.' };
    return { ok: true };
  }

  function canPlaceDecor(x, z) {
    const t = terrainFreeForDecor(x, z);
    if (!t.ok) return t;
    return Sim.checkDecorSite(x, z);
  }

  function isHouseTile(x, z) { return inGrid(x, z) && tiles[x][z] === 'house'; }
  function isDecorTile(x, z) { return inGrid(x, z) && tiles[x][z] === 'decor'; }

  function addBuilding(inst) {
    const def = Sim.getDef(inst.defId);
    for (let dx = 0; dx < def.size; dx++) for (let dz = 0; dz < def.size; dz++) {
      const x = inst.x + dx, z = inst.z + dz;
      clearDecor(x, z);
      tiles[x][z] = 'building';
    }
    const g = makeBuildingMesh(def);
    const c = tileCenter(inst.x, inst.z, def.size);
    g.position.set(c.x, 0, c.z);
    const facing = roadFacing(inst.x, inst.z, def.size);
    if (facing) g.rotation.y = Math.atan2(facing[0], facing[1]);
    g.userData.instId = inst.id;
    scene.add(g);
    buildingMeshes[inst.id] = g;
    g.userData.pop = 0;
    g.userData.inner.scale.set(0.01, 0.01, 0.01);
    if (g.userData.label) g.userData.label.material.opacity = 0;
    return g;
  }

  function removeBuilding(instId, inst) {
    const g = buildingMeshes[instId];
    if (!g) return;
    scene.remove(g);
    delete buildingMeshes[instId];
    if (hoveredInstId === instId) hoveredInstId = null;
    if (inst) {
      const def = Sim.getDef(inst.defId);
      for (let dx = 0; dx < def.size; dx++) for (let dz = 0; dz < def.size; dz++) {
        tiles[inst.x + dx][inst.z + dz] = 'grass';
      }
    }
  }

  /* =========================================================
   * 꾸미기 요소 배치/철거 (플레이어가 놓은 소품)
   * ========================================================= */
  function addDecor(inst) {
    const def = DATA.DECOR.find(d => d.id === inst.defId);
    clearDecor(inst.x, inst.z);   // 그 자리의 야생 나무·화단을 정리하고
    tiles[inst.x][inst.z] = 'decor';
    const g = makeDecorMesh(def);
    const c = tileCenter(inst.x, inst.z);
    g.position.set(c.x, 0, c.z);
    const facing = roadFacing(inst.x, inst.z, 1);
    if (DIRECTIONAL_DECOR_KINDS.has(def.kind) && facing) g.rotation.y = Math.atan2(facing[0], facing[1]);
    else g.rotation.y = lrand(0, Math.PI * 2);
    g.userData.instId = inst.id;
    g.userData.pop = 0;
    g.scale.set(0.01, 0.01, 0.01);
    scene.add(g);
    decorInstMeshes[inst.id] = g;
    return g;
  }

  function removeDecorInst(instId, inst) {
    const g = decorInstMeshes[instId];
    if (!g) return;
    scene.remove(g);
    delete decorInstMeshes[instId];
    if (inst) tiles[inst.x][inst.z] = 'grass';
  }

  /* =========================================================
   * 모드 / 고스트
   * ========================================================= */
  function setMode(m) {
    mode = m;
    if (ghost) { scene.remove(ghost); ghost = null; ghostDef = null; ghostTile = null; }
    if (m.type === 'build' || m.type === 'decor') {
      ghostDef = m.type === 'build' ? Sim.getDef(m.defId) : DATA.DECOR.find(d => d.id === m.defId);
      ghost = m.type === 'build' ? makeBuildingMesh(ghostDef, false) : makeDecorMesh(ghostDef);
      ghost.traverse(o => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.5;
          o.castShadow = false;
        }
      });
      ghost.visible = false;
      scene.add(ghost);
    }
    hoverRing.visible = false;
    setParcelTagsVisible(m.type === 'land');
    document.body.style.cursor = m.type === 'none' ? 'default' : 'crosshair';
  }
  function getMode() { return mode; }

  /* =========================================================
   * 입력
   * ========================================================= */
  function pickGroundTile() {
    if (!groundMesh) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(groundMesh, false);
    if (!hits.length) return null;
    const p = hits[0].point;
    const x = Math.floor((p.x + HALF) / TILE), z = Math.floor((p.z + HALF) / TILE);
    return inGrid(x, z) ? { x, z, point: p } : null;
  }

  function bindInput(canvas) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    const paintAt = (t) => {
      if (!t) return;
      if (mode.type === 'road') cbs.onRoadPaint && cbs.onRoadPaint(t.x, t.z);
      else if (mode.type === 'decor') cbs.onDecorPaint && cbs.onDecorPaint(t.x, t.z, mode.defId);
    };

    canvas.addEventListener('pointerdown', e => {
      if (e.button === 0 && (mode.type === 'road' || mode.type === 'decor')) {
        painting = true;
        paintAt(pickGroundTile());
        return;
      }
      if (e.button === 0 && mode.type !== 'none') return;
      dragging = { btn: e.button, x: e.clientX, y: e.clientY, moved: false };
      canvas.setPointerCapture(e.pointerId);
    });

    canvas.addEventListener('pointermove', e => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

      if (painting) {                       // 드래그로 길/꾸미기 잇기
        paintAt(pickGroundTile());
        return;
      }
      if (!dragging) return;
      const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
      dragging.x = e.clientX; dragging.y = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 1) dragging.moved = true;
      if (dragging.btn === 0 || dragging.btn === 1) {
        camGoal.theta -= dx * 0.005;
        camGoal.phi = THREE.MathUtils.clamp(camGoal.phi - dy * 0.004, 0.16, 1.32);
      } else if (dragging.btn === 2) {
        const pan = new THREE.Vector3(-dx, 0, -dy).multiplyScalar(camGoal.radius * 0.0016);
        pan.applyAxisAngle(new THREE.Vector3(0, 1, 0), camGoal.theta);
        camGoal.target.add(pan);
        camGoal.target.x = THREE.MathUtils.clamp(camGoal.target.x, -HALF, HALF);
        camGoal.target.z = THREE.MathUtils.clamp(camGoal.target.z, -HALF, HALF);
      }
    });

    const endPaint = () => {
      if (!painting) return;
      painting = false;
      if (mode.type === 'road') cbs.onRoadPaintEnd && cbs.onRoadPaintEnd();
      else if (mode.type === 'decor') cbs.onDecorPaintEnd && cbs.onDecorPaintEnd();
    };
    canvas.addEventListener('pointerup', () => {
      endPaint();
      if (dragging && !dragging.moved && dragging.btn === 0 && mode.type === 'none') {
        const hit = pickBuilding();
        if (hit && cbs.onBuildingClick) cbs.onBuildingClick(hit);
      }
      dragging = null;
    });
    canvas.addEventListener('pointerleave', endPaint);

    canvas.addEventListener('click', () => {
      if (mode.type === 'build' && ghostTile) {
        cbs.onTileClick && cbs.onTileClick(ghostTile.x, ghostTile.z, ghostValid, ghostReason);
      } else if (mode.type === 'bulldoze') {
        const hitB = pickBuilding();
        if (hitB) { cbs.onBuildingClick && cbs.onBuildingClick(hitB); return; }
        const hitD = pickDecorInst();
        if (hitD) { cbs.onDecorClick && cbs.onDecorClick(hitD); return; }
        const t = pickGroundTile();
        if (t && Sim.isRoad(t.x, t.z)) cbs.onRoadRemove && cbs.onRoadRemove(t.x, t.z);
      } else if (mode.type === 'land') {
        const t = pickGroundTile();
        if (t) cbs.onLandClick && cbs.onLandClick(Math.floor(t.x / PARCEL), Math.floor(t.z / PARCEL));
      }
    });

    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      camGoal.radius = THREE.MathUtils.clamp(camGoal.radius * (1 + Math.sign(e.deltaY) * 0.1), 20, 190);
    }, { passive: false });
  }

  function pickBuilding() {
    raycaster.setFromCamera(pointer, camera);
    const meshes = [];
    Object.values(buildingMeshes).forEach(g =>
      g.traverse(o => { if (o.isMesh) { o.userData.instId = g.userData.instId; meshes.push(o); } }));
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object.userData.instId : null;
  }

  function pickDecorInst() {
    raycaster.setFromCamera(pointer, camera);
    const meshes = [];
    Object.values(decorInstMeshes).forEach(g =>
      g.traverse(o => { if (o.isMesh) { o.userData.instId = g.userData.instId; meshes.push(o); } }));
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length ? hits[0].object.userData.instId : null;
  }

  /* =========================================================
   * 주민
   * ========================================================= */
  function walkableTiles() {
    const list = [];
    for (let x = 0; x < GRID; x++) for (let z = 0; z < GRID; z++) {
      if (!Sim.isOwned(x, z)) continue;
      if (Sim.isRoad(x, z) || tiles[x][z] === 'grass') list.push([x, z]);
    }
    return list;
  }
  function roadTiles() {
    return Sim.state.roads.map(k => k.split(',').map(Number)).filter(([x, z]) => inGrid(x, z));
  }

  function makeVillager() {
    const g = new THREE.Group();
    const palettes = [0x4d8fd6, 0xc07f2b, 0x2fa07f, 0xa96fd0, 0x7e8996, 0xc75c5c, 0x3f9ab0, 0xd08a4a];
    const skin = [0xf2cba4, 0xe8bb92, 0xd8a97f][lirand(0, 2)];
    const elder = Math.random() < 0.35;
    const scale = elder ? lrand(0.86, 0.94) : lrand(0.95, 1.1);

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.21, 0.48, 3, 8),
      new THREE.MeshLambertMaterial({ color: palettes[lirand(0, 7)] }));
    body.position.y = 0.6; body.castShadow = true;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8),
      new THREE.MeshLambertMaterial({ color: skin }));
    head.position.y = 1.14; head.castShadow = true;
    g.add(head);

    if (Math.random() < 0.5) {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8, 0, 6.28, 0, 1.5),
        new THREE.MeshLambertMaterial({ color: elder ? 0xd8d8d8 : [0x2c2320, 0x4a3428, 0x6b4a2e][lirand(0, 2)] }));
      hair.position.y = 1.16;
      g.add(hair);
    } else {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.21, 0.13, 10),
        new THREE.MeshLambertMaterial({ color: palettes[lirand(0, 7)] }));
      cap.position.y = 1.27;
      g.add(cap);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12),
        new THREE.MeshLambertMaterial({ color: 0x33383e }));
      brim.position.y = 1.21;
      g.add(brim);
    }
    if (elder && Math.random() < 0.4) {
      const cane = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.85, 5),
        new THREE.MeshLambertMaterial({ color: 0x8a6440 }));
      cane.position.set(0.26, 0.42, 0.06);
      g.add(cane);
    }
    g.scale.setScalar(scale);
    g.userData = { target: null, speed: elder ? lrand(0.7, 1.1) : lrand(1.1, 2.0), phase: lrand(0, 6.28), pause: 0 };
    return g;
  }

  function placeVillager(v) {
    const spots = roadTiles().length ? roadTiles() : walkableTiles();
    if (!spots.length) { v.position.set(0, 0, 0); return; }
    const [tx, tz] = spots[lirand(0, spots.length - 1)];
    const c = tileCenter(tx, tz);
    v.position.set(c.x + lrand(-1, 1), 0, c.z + lrand(-1, 1));
  }

  function spawnVillagers(n) {
    for (let i = 0; i < n; i++) {
      const v = makeVillager();
      placeVillager(v);
      scene.add(v);
      villagers.push(v);
    }
  }

  function syncVillagerCount(pop) {
    const want = THREE.MathUtils.clamp(Math.round(pop / 14), 24, 70);
    while (villagers.length < want) {
      const v = makeVillager();
      placeVillager(v);
      scene.add(v);
      villagers.push(v);
    }
    while (villagers.length > want) scene.remove(villagers.pop());
  }

  function pickDestination() {
    const insts = Object.values(buildingMeshes);
    if (insts.length && Math.random() < 0.45) {
      const g = insts[lirand(0, insts.length - 1)];
      return new THREE.Vector3(g.position.x + lrand(-2.2, 2.2), 0, g.position.z + lrand(2.2, 3.6));
    }
    const roads = roadTiles();
    const spots = (roads.length && Math.random() < 0.75) ? roads : walkableTiles();
    if (!spots.length) return null;
    const [tx, tz] = spots[lirand(0, spots.length - 1)];
    const c = tileCenter(tx, tz);
    return new THREE.Vector3(c.x + lrand(-1.2, 1.2), 0, c.z + lrand(-1.2, 1.2));
  }

  function updateVillagers(dt, t) {
    for (const v of villagers) {
      const u = v.userData;
      if (u.pause > 0) { u.pause -= dt; v.position.y = 0; continue; }
      if (!u.target) { u.target = pickDestination(); if (!u.target) continue; }
      const dir = u.target.clone().sub(v.position);
      dir.y = 0;
      const dist = dir.length();
      if (dist < 0.35) {
        u.target = null;
        if (Math.random() < 0.35) u.pause = lrand(1.5, 5);
        continue;
      }
      dir.normalize();
      v.position.addScaledVector(dir, u.speed * dt);
      const want = Math.atan2(dir.x, dir.z);
      let diff = want - v.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      v.rotation.y += diff * Math.min(1, dt * 9);
      v.position.y = Math.abs(Math.sin(t * 7 + u.phase)) * 0.07;
    }
  }

  /* =========================================================
   * 프레임
   * ========================================================= */
  function update(dt, t) {
    const k = Math.min(1, dt * 11);
    cam.theta += (camGoal.theta - cam.theta) * k;
    cam.phi += (camGoal.phi - cam.phi) * k;
    cam.radius += (camGoal.radius - cam.radius) * k;
    cam.target.lerp(camGoal.target, k);
    camera.position.set(
      cam.target.x + cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta),
      cam.target.y + cam.radius * Math.cos(cam.phi),
      cam.target.z + cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta)
    );
    camera.lookAt(cam.target);

    if (!groundMesh) { renderer.render(scene, camera); return; }

    if (mode.type === 'none' || mode.type === 'bulldoze') hoveredInstId = pickBuilding();

    for (const id in buildingMeshes) {
      const g = buildingMeshes[id];
      const inner = g.userData.inner;
      if (g.userData.pop !== undefined && g.userData.pop < 1) {
        g.userData.pop = Math.min(1, g.userData.pop + dt * 2.2);
        const p = g.userData.pop;
        const e = 1 - Math.pow(1 - p, 3);
        inner.scale.setScalar(e * (1 + Math.sin(p * Math.PI) * 0.14));
        if (g.userData.label) g.userData.label.material.opacity = Math.max(0, (p - 0.4) / 0.6);
        if (p >= 1) { inner.scale.setScalar(1); delete g.userData.pop; }
      } else {
        const lift = hoveredInstId === id ? 0.34 : 0;
        inner.position.y += (lift - inner.position.y) * Math.min(1, dt * 12);
      }
      if (g.userData.label && g.userData.pop === undefined) {
        g.userData.label.material.opacity = THREE.MathUtils.clamp(1.6 - cam.radius / 150, 0.12, 1);
      }
    }

    // 꾸미기 요소 등장 애니메이션
    for (const id in decorInstMeshes) {
      const g = decorInstMeshes[id];
      if (g.userData.pop !== undefined && g.userData.pop < 1) {
        g.userData.pop = Math.min(1, g.userData.pop + dt * 2.6);
        const p = g.userData.pop;
        const e = 1 - Math.pow(1 - p, 3);
        g.scale.setScalar(e * (1 + Math.sin(p * Math.PI) * 0.12));
        if (p >= 1) { g.scale.setScalar(1); delete g.userData.pop; }
      }
    }

    // 매입 가능 구역 표지를 살짝 띄운다
    for (const pk in parcelTiles) {
      const g = parcelTiles[pk];
      if (g.userData.tag) g.userData.tag.position.y = 3.4 + Math.sin(t * 2 + g.userData.parcel[0]) * 0.18;
    }

    if ((mode.type === 'build' || mode.type === 'decor') && ghost) {
      const t2 = pickGroundTile();
      if (t2) {
        const size = mode.type === 'build' ? ghostDef.size : 1;
        const ix = t2.x - Math.floor((size - 1) / 2);
        const iz = t2.z - Math.floor((size - 1) / 2);
        ghostTile = { x: ix, z: iz };
        const chk = mode.type === 'build' ? canPlace(ghostDef, ix, iz) : canPlaceDecor(ix, iz);
        ghostValid = chk.ok;
        ghostReason = chk.msg || '';
        const c = tileCenter(ix, iz, size);
        ghost.position.set(c.x, 0.02 + Math.sin(t * 3) * 0.06, c.z);
        // 도로 방향으로 미리 회전해서 보여준다
        const facing = roadFacing(ix, iz, size);
        if (mode.type === 'build') {
          ghost.rotation.y = facing ? Math.atan2(facing[0], facing[1]) : 0;
        } else if (DIRECTIONAL_DECOR_KINDS.has(ghostDef.kind) && facing) {
          ghost.rotation.y = Math.atan2(facing[0], facing[1]);
        }
        ghost.visible = true;
        const tint = ghostValid ? 0x2f7a3f : 0x8a2020;
        ghost.traverse(o => { if (o.isMesh && o.material.emissive) o.material.emissive.setHex(tint); });
      } else {
        ghost.visible = false;
        ghostTile = null;
      }
    } else if (mode.type === 'road' || mode.type === 'bulldoze' || mode.type === 'land') {
      const t2 = pickGroundTile();
      hoverRing.visible = !!t2;
      if (t2) {
        if (mode.type === 'land') {
          const px = Math.floor(t2.x / PARCEL), pz = Math.floor(t2.z / PARCEL);
          const buyable = Sim.isParcelBuyable(px, pz);
          hoverRing.position.set(
            (px * PARCEL + PARCEL / 2) * TILE - HALF, 0.42,
            (pz * PARCEL + PARCEL / 2) * TILE - HALF);
          hoverRing.scale.setScalar(PARCEL * 0.92);
          hoverRing.material.color.setHex(buyable ? 0xf0c674 : 0x8a8a8a);
        } else {
          hoverRing.scale.setScalar(1);
          hoverRing.position.set(t2.point.x, 0.26, t2.point.z);
          const ok = mode.type === 'road'
            ? (Sim.isOwned(t2.x, t2.z) && !Sim.isRoad(t2.x, t2.z) && tiles[t2.x][t2.z] !== 'building'
              && tiles[t2.x][t2.z] !== 'water' && tiles[t2.x][t2.z] !== 'house' && tiles[t2.x][t2.z] !== 'decor')
            : true;
          hoverRing.material.color.setHex(mode.type === 'bulldoze' ? 0xff6b6b : (ok ? 0x6ee0b8 : 0xff6b6b));
        }
        hoverRing.rotation.z = Math.PI / 4 + t * 0.6;
      }
    } else {
      hoverRing.visible = false;
      hoverRing.scale.setScalar(1);
    }

    for (const c of clouds) {
      c.position.x += c.userData.speed * dt;
      if (c.position.x > HALF * 2.6) c.position.x = -HALF * 2.6;
    }

    updateVillagers(dt, t);
    renderer.render(scene, camera);
  }

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function focusCamera() {
    camGoal.target.set(0, 0, 0);
    camGoal.radius = 78;
  }

  return {
    init, buildWorld, update, resize, setMode, getMode,
    addBuilding, removeBuilding, canPlace,
    addDecor, removeDecorInst, canPlaceDecor, isHouseTile, isDecorTile,
    addRoad, removeRoadTile, refreshRoads, refreshParcels,
    focusCamera, syncVillagerCount,
    get GRID() { return GRID; },
    // 읽기 전용 점검용 접근자 (자동화 테스트/디버깅에 사용, 게임 로직에는 영향 없음)
    __debug: {
      get buildingMeshes() { return buildingMeshes; },
      get decorInstMeshes() { return decorInstMeshes; },
      get tiles() { return tiles; },
      get ghostTile() { return ghostTile; },
      get ghostValid() { return ghostValid; },
    },
  };
})();
