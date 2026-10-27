/*
 * how3d.js - 3D-панель для блока «Как это работает» (Expert Letters)
 *
 * Что делает: превращает тёмную боковую панель «окна кабинета» в живую 3D-сцену,
 * которая меняется вместе с выбранным шагом (и для юриста, и для экспертной организации).
 * Код вкладок на странице НЕ трогает: просто наблюдает, какая панель сейчас активна.
 *
 * Подключение (перед </body>, после hero3d.js):
 *   <script src="js/three.min.js"></script>
 *   <script src="js/hero3d.js"></script>
 *   <script src="js/how3d.js"></script>
 */
(function () {
  'use strict';

  /* ================= НАСТРОЙКИ ================= */
  var CONFIG = {
    panelWidth: 168,          // ширина тёмной панели, px
    wideSectionFrom: 0,    // от какой ширины экрана расширять блок (чтобы панель не сжимала окно); 0 - не трогать
    wideSectionMax: 1240,     // максимальная ширина блока при расширении, px
    spin: 0.16,               // скорость вращения сети
    glow: 1,                  // сила свечения (0.6 мягче, 1.5 ярче)
    parallax: 0.35,           // реакция на курсор, 0 - выключить
    maxDpr: 2,
    colors: {
      bg:     0x0F172A,       // фон панели (на него «тают» дальние объекты)
      node:   0x3B82F6,       // обычная организация
      chosen: 0x34D399,       // выбранная организация / письма-ответы
      dim:    0x475569,       // «погасшие» организации
      hub:    0x93C5FD,       // платформа
      halo:   0x2563EB,       // свечение
      out:    0x60A5FA,       // заявка
      back:   0x34D399,       // ответ
      line:   0x2563EB        // лучи
    }
  };

  /* Тексты под сценой. l - юрист, e - экспертная организация */
  var TEXT = {
    l: [
      ['Заявка', 'Одна заявка видна всем организациям'],
      ['Ответы', 'Организации присылают письма'],
      ['Выбор', 'Лучшее предложение выделено'],
      ['Документы', 'Все письма в одном архиве'],
      ['Итог', 'Приём закрыт, все уведомлены']
    ],
    e: [
      ['Лента', 'Новые заявки приходят в ленту'],
      ['Заявка', 'Вы изучаете вопросы и документы'],
      ['Письмо', 'Письмо уходит юристу'],
      ['Мои ответы', 'Все отправленные письма в списке'],
      ['Результат', 'Уведомления об изменениях и выборе']
    ]
  };

  /* Что происходит в сцене на каждом шаге */
  var STATES = {
    l1: { doc: [1, 1],       letters: ['hide', 'hide', 'hide', 'hide'],  streams: ['doc>hub', 'hub>out'], dim: 'none' },
    l2: { doc: [0.6, 0.55],  letters: ['inbox', 'inbox', 'inbox', 'inbox'], streams: ['org>hub'], dim: 'none' },
    l3: { doc: [0.6, 0.45],  letters: ['list', 'list', 'list', 'list'], streams: [], dim: 'soft', chosen: true, highlight: 1 },
    l4: { doc: [0.6, 0.45],  letters: ['zip', 'zip', 'zip', 'zip'],     streams: [], dim: 'soft', chosen: true, box: true },
    l5: { doc: [0.6, 0.45],  letters: ['hide', 'hide', 'hide', 'hide'], streams: ['hub>chosen'], dim: 'strong', chosen: true, check: true },
    e1: { doc: [1, 1],       letters: ['hide', 'hide', 'hide', 'hide'],  streams: ['doc>hub', 'hub>out'], dim: 'none' },
    e2: { doc: [1.3, 1],     letters: ['hide', 'hide', 'hide', 'hide'],  streams: ['hub>chosen'], dim: 'soft' },
    e3: { doc: [0.8, 0.8],   letters: ['hide', 'doc', 'hide', 'hide'],   streams: [], dim: 'soft' },
    e4: { doc: [0.6, 0.45],  letters: ['list', 'list', 'list', 'hide'], streams: [], dim: 'none', tints: [0x93C5FD, 0x86EFAC, 0x94A3B8, 0xFFFFFF] },
    e5: { doc: [0.8, 0.8],   letters: ['hide', 'hide', 'hide', 'hide'],  streams: ['hub>doc', 'hub>chosen'], dim: 'strong', chosen: true, check: true }
  };
  var TINT_DEFAULT = 0xFFFFFF, TINT_LETTER = 0xBBF7D0;
  var INTERVAL = { 'doc>hub': 0.9, 'hub>out': 0.26, 'org>hub': 0.3, 'hub>chosen': 0.5, 'hub>doc': 0.8 };
  /* ============== конец настроек ============== */

  if (typeof THREE === 'undefined') return;
  var side = document.querySelector('.flow-stage .win-side');
  if (!side) return;

  var reduce = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  var C = CONFIG.colors;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { return; }
  renderer.setClearColor(0x000000, 0);

  /* ---- разметка и стили ---- */
  var css =
    '@media (min-width:641px){' +
    '.flow-stage .win-body{grid-template-columns:' + CONFIG.panelWidth + 'px minmax(0,1fr) !important}' +
    '.flow-stage .win-side.has-3d{display:flex !important;flex-direction:column;min-width:0;padding:14px 10px 14px;overflow:hidden;' +
    'background:radial-gradient(130% 55% at 50% 46%,#16305f 0%,#0F172A 72%)}' +
    '.flow-stage .win-side.has-3d .ws-item{display:none}' +
    '.flow-stage .win-side.has-3d .ws-brand{margin:0 4px 4px;font-size:12.5px}' +
    '.how3d-box{position:relative;flex:1 1 auto;min-height:0}' +
    '.how3d-box canvas{position:absolute;inset:0;width:100%;height:100%;display:block}' +
    '.how3d-cap{flex:none;padding:4px 4px 0}' +
    '.how3d-cap .n{display:block;font-size:11px;font-weight:600;letter-spacing:.08em;color:#60A5FA}' +
    '.how3d-cap b{display:block;color:#fff;font-size:14px;margin:2px 0 1px;letter-spacing:-.01em}' +
    '.how3d-cap .t{display:block;font-size:11px;line-height:1.3;color:#94A3B8;min-height:28px}' +
    '.how3d-dots{display:flex;gap:5px;margin-top:6px}' +
    '.how3d-dots i{display:block;width:16px;height:3px;border-radius:3px;background:#1E293B;transition:background .3s}' +
    '.how3d-dots i.on{background:#3B82F6}' +
    '.flow-stage table.tbl{min-width:420px}' +
    '}' +
    '@media (max-width:640px){.how3d-box,.how3d-cap{display:none}}';
  if (CONFIG.wideSectionFrom > 0) {
    css += '@media (min-width:' + CONFIG.wideSectionFrom + 'px){#how.section{max-width:' + CONFIG.wideSectionMax + 'px}}';
  }
  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  side.classList.add('has-3d');
  var box = document.createElement('div');
  box.className = 'how3d-box';
  box.appendChild(renderer.domElement);
  var cap = document.createElement('div');
  cap.className = 'how3d-cap';
  cap.innerHTML = '<span class="n"></span><b></b><span class="t"></span><div class="how3d-dots"><i></i><i></i><i></i><i></i><i></i></div>';
  side.appendChild(box);
  side.appendChild(cap);
  var capN = cap.querySelector('.n'), capB = cap.querySelector('b'), capT = cap.querySelector('.t');
  var dots = cap.querySelectorAll('.how3d-dots i');

  /* ---- сцена ---- */
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.bg, 8, 17);
  var camera = new THREE.PerspectiveCamera(38, 0.4, 0.1, 50);
  camera.position.set(0, 0, 11);
  var world = new THREE.Group();     // вращается: сеть организаций
  var fixed = new THREE.Group();     // не вращается: документ, письма, архив, платформа
  scene.add(world);
  scene.add(fixed);
  world.rotation.x = 0.18;

  var seed = 777;
  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function damp(cur, target, k, dt) { return cur + (target - cur) * (1 - Math.exp(-k * dt)); }

  /* ---- текстуры ---- */
  function canvasTex(w, h, draw) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    return new THREE.CanvasTexture(c);
  }
  function rr(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  var glowTex = canvasTex(128, 128, function (g) {
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  });
  var pageTex = canvasTex(96, 120, function (g, w, h) {
    g.fillStyle = '#FFFFFF'; rr(g, 2, 2, w - 4, h - 4, 8); g.fill();
    g.fillStyle = '#A5B4CF'; rr(g, 10, 10, 40, 8, 3); g.fill();
    g.fillStyle = '#CBD5E1';
    for (var y = 34; y < h - 14; y += 14) { rr(g, 10, y, w - 20 - (y % 28 ? 16 : 0), 6, 3); g.fill(); }
  });
  function labelTex(txt, color, font) {
    return canvasTex(96, 96, function (g, w, h) {
      g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = color; g.fillText(txt, w / 2, h / 2 + 2);
    });
  }
  var checkTex = canvasTex(128, 128, function (g) {
    g.fillStyle = '#10B981'; g.beginPath(); g.arc(64, 64, 54, 0, 6.2832); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 11; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(40, 66); g.lineTo(58, 83); g.lineTo(90, 47); g.stroke();
  });
  var zipTex = labelTex('ZIP', '#DBEAFE', '700 34px Manrope, Inter, sans-serif');

  function halo(color, size, op) {
    var s = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: color, transparent: true, opacity: Math.min(1, op * CONFIG.glow),
      depthWrite: false, blending: THREE.AdditiveBlending
    }));
    s.scale.set(size, size, 1);
    s.userData.base = size; s.userData.op = op;
    return s;
  }

  /* ---- платформа (хаб) ---- */
  var hubPos = new THREE.Vector3(0, 0.1, 0);
  var hub = new THREE.Group();
  hub.position.copy(hubPos);
  fixed.add(hub);
  var core = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 24), new THREE.MeshBasicMaterial({ color: C.hub }));
  var wire = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), new THREE.MeshBasicMaterial({ color: C.halo, wireframe: true, transparent: true, opacity: 0.6 }));
  var ringH = new THREE.Mesh(new THREE.RingGeometry(0.78, 0.8, 64), new THREE.MeshBasicMaterial({ color: C.out, transparent: true, opacity: 0.45, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  ringH.rotation.x = 1.25;
  var hubHalo = halo(C.halo, 3.2, 0.6);
  hub.add(core); hub.add(wire); hub.add(ringH); hub.add(hubHalo);
  var hubPulse = 0;

  /* ---- организации ---- */
  var LET = ['А', 'Б', 'В', 'Г'];
  var CHOSEN = 1;                         // «Организация Б»
  var orgs = [];
  var sphG = new THREE.SphereGeometry(1, 14, 14);
  function addOrg(x, y, z, r, label) {
    var m = new THREE.Mesh(sphG, new THREE.MeshBasicMaterial({ color: C.node }));
    m.scale.setScalar(r); m.position.set(x, y, z);
    var h = halo(C.node, 0.5 + r * 4, 0.45); h.position.set(x, y, z);
    world.add(m); world.add(h);
    var o = { pos: new THREE.Vector3(x, y, z), mesh: m, halo: h, r: r, pulse: 0, s: 1, hop: 0.45, label: null };
    if (label) {
      var lb = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex(label, '#E2E8F0', '700 44px Manrope, Inter, sans-serif'), transparent: true, depthWrite: false }));
      lb.scale.set(0.42, 0.42, 1); lb.position.set(x, y + 0.34, z);
      world.add(lb);
      o.label = lb;
    }
    orgs.push(o);
    // луч от платформы
    var lg = new THREE.BufferGeometry().setFromPoints([hubPos, o.pos]);
    var line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: C.line, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    world.add(line);
    o.line = line;
  }
  var mainAng = [0.6, 2.2, 3.8, 5.4], mainY = [0.55, -0.35, 0.4, -0.5], i, a;
  for (i = 0; i < 4; i++) addOrg(Math.cos(mainAng[i]) * 1.15, hubPos.y + mainY[i], Math.sin(mainAng[i]) * 1.15, 0.15, LET[i]);
  for (i = 0; i < 12; i++) {
    a = i * 0.5236 + 0.3;
    var rad = i % 2 ? 1.55 : 0.95;
    addOrg(Math.cos(a) * rad, hubPos.y + (rand() - 0.5) * 2.1, Math.sin(a) * rad, 0.07 + rand() * 0.04, null);
  }

  /* ---- документ юриста (сверху) ---- */
  var docPos = new THREE.Vector3(0, 2.7, 0);
  var docG = new THREE.Group();
  docG.position.copy(docPos);
  fixed.add(docG);
  var docMat = new THREE.MeshBasicMaterial({ map: pageTex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  docG.add(new THREE.Mesh(new THREE.PlaneGeometry(0.78, 0.98), docMat));
  var docHalo = halo(C.halo, 2.2, 0.7);
  docG.add(docHalo);
  var docS = 1, docO = 1, docPulse = 0;

  /* ---- письма ---- */
  var letters = [];
  for (i = 0; i < 4; i++) {
    var lm = new THREE.MeshBasicMaterial({ map: pageTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, color: TINT_LETTER });
    var lmesh = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.76), lm);
    var lh = halo(C.chosen, 1.6, 0);
    lmesh.add(lh);
    lmesh.visible = false;
    fixed.add(lmesh);
    letters.push({ mesh: lmesh, mat: lm, halo: lh, mode: 'hide', pending: null, s: 0, o: 0, ts: 0, to: 0, tint: new THREE.Color(TINT_LETTER) });
  }

  /* ---- архив (ZIP) и значок результата ---- */
  var resPos = new THREE.Vector3(0, -2.35, 0);
  var boxG = new THREE.Group();
  boxG.position.copy(resPos);
  var cube = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.55), new THREE.MeshBasicMaterial({ color: 0x1E3A8A, transparent: true, opacity: 0.85 }));
  var edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.55, 0.45, 0.55)), new THREE.LineBasicMaterial({ color: 0x93C5FD }));
  var zipLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: zipTex, transparent: true, depthWrite: false }));
  zipLabel.scale.set(0.7, 0.7, 1); zipLabel.position.set(0, 0.55, 0);
  var boxHalo = halo(C.halo, 2.2, 0.7);
  boxG.add(cube); boxG.add(edges); boxG.add(zipLabel); boxG.add(boxHalo);
  boxG.scale.setScalar(0.001);
  fixed.add(boxG);
  var boxS = 0;

  var check = new THREE.Sprite(new THREE.SpriteMaterial({ map: checkTex, transparent: true, depthWrite: false }));
  check.position.copy(resPos);
  check.scale.set(0.001, 0.001, 1);
  fixed.add(check);
  var checkS = 0;

  var ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.014, 8, 48), new THREE.MeshBasicMaterial({ color: C.chosen, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.visible = false;
  fixed.add(ring);
  var ringS = 0;

  /* ---- пыль для глубины ---- */
  var DN = 70, dp = new Float32Array(DN * 3);
  for (i = 0; i < DN; i++) { dp[i * 3] = (rand() - 0.5) * 3.6; dp[i * 3 + 1] = (rand() - 0.5) * 8; dp[i * 3 + 2] = (rand() - 0.5) * 4.5; }
  var dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  var dust = new THREE.Points(dg, new THREE.PointsMaterial({
    map: glowTex, color: C.out, size: 0.14, sizeAttenuation: true, transparent: true,
    opacity: Math.min(1, 0.5 * CONFIG.glow), depthWrite: false, blending: THREE.AdditiveBlending
  }));
  world.add(dust);

  /* ---- огоньки ---- */
  var packets = [];
  for (i = 0; i < 14; i++) {
    var ps = halo(C.out, 0.5, 1);
    ps.visible = false;
    fixed.add(ps);
    packets.push({ sprite: ps, active: false, t: 0, speed: 1, from: null, to: null });
  }
  var timers = {};
  var tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();

  function pt(ref, out) {
    if (ref.isVector3) return out.copy(ref);
    return world.localToWorld(out.copy(ref.pos));
  }
  function randOrg() { return orgs[(rand() * orgs.length) | 0]; }
  function spawn(kind) {
    var p = null, q;
    for (q = 0; q < packets.length; q++) if (!packets[q].active) { p = packets[q]; break; }
    if (!p) return;
    var from, to, color = C.out;
    if (kind === 'doc>hub') { from = docPos; to = hubPos; }
    else if (kind === 'hub>out') { from = hubPos; to = randOrg(); }
    else if (kind === 'org>hub') { from = randOrg(); to = hubPos; color = C.back; }
    else if (kind === 'hub>chosen') { from = hubPos; to = orgs[CHOSEN]; color = C.back; }
    else if (kind === 'hub>doc') { from = hubPos; to = docPos; color = C.back; }
    else return;
    p.from = from; p.to = to; p.t = 0; p.speed = 0.7 + rand() * 0.4; p.active = true;
    p.sprite.material.color.setHex(color);
    p.sprite.visible = true;
  }

  /* ---- состояние шага ---- */
  var S = STATES.l1, key = '';
  function applyState(k) {
    key = k;
    S = STATES[k] || STATES.l1;
    for (var q = 0; q < 4; q++) {
      var L = letters[q], mode = S.letters[q] || 'hide';
      L.pending = { mode: mode, delay: mode === 'hide' ? 0 : q * 0.33 + 0.08 };
      L.tint.setHex(S.tints ? S.tints[q] : TINT_LETTER);
    }
    for (var n in timers) timers[n] = 0;
  }

  /* ---- обновление ---- */
  var time = 0, mx = 0;
  function update(dt) {
    time += dt;
    var q, o, L;

    world.rotation.y = reduce ? 0.6 : time * CONFIG.spin;
    camera.position.x = damp(camera.position.x, mx * CONFIG.parallax, 2, dt);
    camera.lookAt(0, 0, 0);

    wire.rotation.y = time * 0.5; wire.rotation.x = time * 0.3;
    ringH.rotation.z = time * 0.4;
    hubPulse = Math.max(0, hubPulse - dt * 1.5);
    var hs = hubHalo.userData.base * (1 + Math.sin(time * 1.6) * 0.05 + hubPulse * 0.25);
    hubHalo.scale.set(hs, hs, 1);
    core.scale.setScalar(1 + hubPulse * 0.4);

    /* документ */
    docPulse = Math.max(0, docPulse - dt * 1.5);
    docS = damp(docS, S.doc[0], 4, dt);
    docO = damp(docO, S.doc[1], 4, dt);
    docG.scale.setScalar(docS * (1 + docPulse * 0.12));
    docMat.opacity = docO;
    docHalo.material.opacity = Math.min(1, (0.15 + docO * 0.5 + docPulse * 0.3) * CONFIG.glow);
    docG.rotation.y = Math.sin(time * 0.7) * 0.25;

    /* организации */
    var gcol = new THREE.Color();
    for (q = 0; q < orgs.length; q++) {
      o = orgs[q];
      o.pulse = Math.max(0, o.pulse - dt * 1.5);
      var isCh = (q === CHOSEN), tc, ts = 1, th = 0.45;
      if (S.chosen && isCh) { tc = C.chosen; ts = S.check ? 1.5 : 1.35; th = 0.55; }
      else if (S.dim === 'strong') { tc = C.dim; th = 0.08; }
      else if (S.dim === 'soft') { tc = C.node; ts = 0.9; th = 0.22; if (q < 4 && S.dim === 'soft' && !S.chosen) th = 0.35; }
      else { tc = C.node; }
      gcol.setHex(tc);
      o.mesh.material.color.lerp(gcol, 1 - Math.exp(-5 * dt));
      o.halo.material.color.lerp(gcol, 1 - Math.exp(-5 * dt));
      o.s = damp(o.s, ts, 4, dt);
      o.hop = damp(o.hop, th, 4, dt);
      o.mesh.scale.setScalar(o.r * o.s * (1 + o.pulse * 0.9));
      var hz = o.halo.userData.base * o.s * (1 + o.pulse * 1.3);
      o.halo.scale.set(hz, hz, 1);
      o.halo.material.opacity = Math.min(1, (o.hop + o.pulse * 0.45) * CONFIG.glow);
      o.line.material.opacity = (S.dim === 'strong' && !isCh) ? damp(o.line.material.opacity, 0.07, 4, dt) : damp(o.line.material.opacity, isCh && S.chosen ? 0.8 : 0.35, 4, dt);
      if (o.label) o.label.material.opacity = (S.dim === 'strong' && !isCh) ? damp(o.label.material.opacity, 0.35, 4, dt) : damp(o.label.material.opacity, 1, 4, dt);
    }

    /* письма */
    var cp = tmpA;
    for (q = 0; q < 4; q++) {
      L = letters[q];
      if (L.pending) {
        L.pending.delay -= dt;
        if (L.pending.delay <= 0) {
          L.mode = L.pending.mode;
          if (L.mode === 'inbox' || L.mode === 'doc') orgs[q].pulse = 1;
          L.pending = null;
        }
      }
      var tx, ty, tz, tsc = 0, top = 0, snap = false;
      switch (L.mode) {
        case 'inbox':
          tx = (q - 1.5) * 0.36; ty = hubPos.y - 0.05 + (q % 2 ? 0 : 0.14); tz = 1.2; tsc = 0.42; top = 1; break;
        case 'list':
          if (S.highlight === q) { tx = 0; ty = 0.7; tz = 2.0; tsc = 0.9; top = 1; }
          else { tx = 0; ty = 1.5 - q * 0.62; tz = 1.0; tsc = 0.5; top = S.highlight !== undefined ? 0.5 : 1; }
          if (S.highlight === undefined) { ty = 1.0 - q * 0.8; tz = 1.2; tsc = 0.55; }
          break;
        case 'zip':
          tx = resPos.x; ty = resPos.y + 0.1; tz = 0.3; tsc = 0.12; top = 0; break;
        case 'doc':
          tx = docPos.x; ty = docPos.y - 0.15; tz = 0.8; tsc = 0.32; top = 1; break;
        default:
          if (L.o > 0.03) { tx = L.mesh.position.x; ty = L.mesh.position.y; tz = L.mesh.position.z; tsc = L.s * 0.6; top = 0; }
          else { snap = true; }
      }
      if (snap) {
        world.localToWorld(cp.copy(orgs[q].pos));
        L.mesh.position.copy(cp); L.s = 0; L.o = 0;
      } else {
        L.mesh.position.x = damp(L.mesh.position.x, tx, 3.2, dt);
        L.mesh.position.y = damp(L.mesh.position.y, ty, 3.2, dt);
        L.mesh.position.z = damp(L.mesh.position.z, tz, 3.2, dt);
        L.s = damp(L.s, tsc, 4, dt);
        L.o = damp(L.o, top, 5, dt);
      }
      L.mesh.scale.setScalar(Math.max(0.0001, L.s));
      L.mat.opacity = L.o;
      L.mat.color.lerp(L.tint, 1 - Math.exp(-6 * dt));
      L.mesh.visible = L.o > 0.02 && L.s > 0.02;
      L.mesh.rotation.y = Math.sin(time * 0.8 + q) * 0.18;
      var lhOp = (S.highlight === q && L.mode === 'list') ? 0.9 : 0;
      L.halo.material.opacity = damp(L.halo.material.opacity, Math.min(1, lhOp * CONFIG.glow), 5, dt);
    }

    /* архив, значок, кольцо */
    boxS = damp(boxS, S.box ? 1 : 0, 4, dt);
    boxG.scale.setScalar(Math.max(0.001, boxS));
    boxG.rotation.y = time * 0.6;
    boxG.position.y = resPos.y + Math.sin(time * 1.4) * 0.05;
    checkS = damp(checkS, S.check ? 0.75 : 0, 4, dt);
    check.scale.set(Math.max(0.001, checkS), Math.max(0.001, checkS), 1);
    ringS = damp(ringS, (S.chosen && S.check) ? 1 : 0, 4, dt);
    ring.visible = ringS > 0.02;
    if (ring.visible) {
      world.localToWorld(ring.position.copy(orgs[CHOSEN].pos));
      ring.scale.setScalar(ringS * (1 + 0.12 * Math.sin(time * 3)));
    }

    /* потоки огоньков */
    if (!reduce) {
      for (q = 0; q < S.streams.length; q++) {
        var nm = S.streams[q];
        timers[nm] = (timers[nm] || 0) + dt;
        if (timers[nm] >= INTERVAL[nm]) { timers[nm] = 0; spawn(nm); }
      }
    }
    for (q = 0; q < packets.length; q++) {
      var pk = packets[q];
      if (!pk.active) continue;
      pk.t += dt * pk.speed;
      if (pk.t >= 1) {
        pk.active = false; pk.sprite.visible = false;
        if (pk.to === hubPos) hubPulse = 1;
        else if (pk.to === docPos) docPulse = 1;
        else if (pk.to.pulse !== undefined) pk.to.pulse = 1;
        continue;
      }
      var e = pk.t * pk.t * (3 - 2 * pk.t);
      pt(pk.from, tmpA); pt(pk.to, tmpB);
      pk.sprite.position.lerpVectors(tmpA, tmpB, e);
    }
  }

  /* ---- размеры ---- */
  function resize() {
    var w = box.clientWidth, h = box.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    var half = Math.tan(camera.fov * Math.PI / 360);
    camera.position.z = Math.max(7.0 / (2 * half), 2.9 / (2 * half * camera.aspect));
    camera.updateProjectionMatrix();
    if (!running) renderer.render(scene, camera);
  }

  /* ---- цикл ---- */
  var clock = new THREE.Clock();
  var running = false, raf = 0, inView = false;
  function frame() {
    raf = requestAnimationFrame(frame);
    update(Math.min(clock.getDelta(), 0.05));
    renderer.render(scene, camera);
  }
  function start() { if (running || reduce || !box.clientWidth) return; running = true; clock.getDelta(); frame(); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function settle() { if (reduce) { for (var k = 0; k < 40; k++) update(0.1); renderer.render(scene, camera); } }

  /* ---- слежение за активным шагом (код вкладок не трогаем) ---- */
  var lastKey = '';
  function readKey() {
    var on = document.querySelector('.flow-stage .fpanel.on');
    var m = on && /^pn-([le])(\d)$/.exec(on.id);
    return m ? m[1] + m[2] : null;
  }
  function sync() {
    var k = readKey();
    if (!k || k === lastKey) return;
    lastKey = k;
    applyState(k);
    var role = k.charAt(0), step = +k.charAt(1) - 1, tx = TEXT[role][step];
    capN.textContent = (role === 'l' ? 'ЮРИСТ' : 'ЭКСПЕРТ') + ' · ШАГ ' + (step + 1);
    capB.textContent = tx[0];
    capT.textContent = tx[1];
    for (var d = 0; d < dots.length; d++) dots[d].className = d <= step ? 'on' : '';
    settle();
  }
  var main = document.querySelector('.flow-stage .win-main');
  if (main && 'MutationObserver' in window) {
    new MutationObserver(sync).observe(main, { attributes: true, attributeFilter: ['class'], subtree: true });
  }
  setInterval(sync, 700);      // страховка, если класс сменили иначе

  /* ---- события ---- */
  if (!reduce && CONFIG.parallax > 0) {
    window.addEventListener('pointermove', function (e) { mx = (e.clientX / window.innerWidth - 0.5) * 2; }, { passive: true });
  }
  if ('ResizeObserver' in window) new ResizeObserver(function () { resize(); if (inView) start(); }).observe(box);
  else window.addEventListener('resize', resize);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      inView = en[0].isIntersecting;
      if (inView && !document.hidden) start(); else stop();
    }, { threshold: 0.05 }).observe(side);
  } else { inView = true; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (inView) start(); });
  renderer.domElement.addEventListener('webglcontextlost', function (e) { e.preventDefault(); stop(); });

  /* ---- старт ---- */
  applyState('l1');
  sync();
  resize();
  renderer.render(scene, camera);
  window.__how3dReady = true;
})();
