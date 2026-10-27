/*
 * hero3d.js - 3D-сцена для hero-секции Expert Letters
 * Идея: в центре «платформа» (хаб), вокруг - экспертные организации (узлы).
 * Заявка уходит от хаба к узлам (синие огоньки), ответные письма возвращаются (зелёные).
 *
 * Подключение (перед </body>):
 *   <script src="js/three.min.js"></script>
 *   <script src="js/hero3d.js"></script>
 *
 * Всё, что обычно хочется поменять, - в блоке CONFIG ниже.
 */
(function () {
  'use strict';

  /* ================= НАСТРОЙКИ ================= */
  var CONFIG = {
    host: '#top .hero-first', // блок первого экрана, в который вставляется сцена
    offsetX: 0.34,           // сдвиг сцены вправо (доля полуширины экрана), чтобы слева остался чистый текст
    offsetYMobile: 0.30,     // на телефоне сцена опускается под текст (доля полувысоты)
    opacity: 1,              // общая яркость сцены, 0..1
    centerOpacity: 1,        // приглушение центра (1 - не приглушать; текст закрывается мягким градиентом в CSS)

    nodes: 29,               // число экспертных организаций (на десктопе)
    nodesMobile: 14,         // на телефоне
    dust: 220,               // «пыль» для глубины (частицы)
    dustMobile: 80,

    spread: { x: 7.6, y: 4.6, z: 5.5 },  // размер облака узлов
    hubY: 0,                 // высота хаба (минус - ниже, плюс - выше)

    spin: 0.045,             // скорость вращения всей сцены
    parallax: 0.9,           // реакция на курсор, 0 - выключить
    packetEvery: 0.38,       // как часто запускать новый огонёк (сек)
    packetSpeed: 0.55,       // скорость огоньков

    glow: 1,                 // сила свечения (0.5 - мягче, 1.5 - ярче)
    maxDpr: 1.75,            // ограничение чёткости (для скорости)

    colors: {
      bg:      0xFAFBFD,     // цвет фона сайта (на него «тают» дальние объекты)
      hub:     0x2563EB,
      hubWire: 0x1E40AF,
      node:    0x1E40AF,
      halo:    0x3B82F6,
      line:    0x3B82F6,
      link:    0x93C5FD,
      out:     0x2563EB,     // заявка -> организации
      back:    0x10B981,     // письма -> юристу
      dust:    0x60A5FA
    }
  };
  /* ============== конец настроек ============== */

  if (typeof THREE === 'undefined') return;
  var host = document.querySelector(CONFIG.host);
  if (!host) return;

  var mq = window.matchMedia ? window.matchMedia.bind(window) : null;
  var reduce = !!(mq && mq('(prefers-reduced-motion: reduce)').matches);
  var isMobile = !!(mq && mq('(max-width: 720px)').matches);
  var C = CONFIG.colors;

  /* ---- рендерер (если WebGL недоступен - тихо выходим, останется aurora) ---- */
  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: !isMobile, alpha: true, powerPreference: 'low-power' });
  } catch (e) { return; }
  renderer.setClearColor(0x000000, 0);

  /* ---- контейнер и стили ---- */
  var style = document.createElement('style');
  style.textContent =
    '.hero3d{position:absolute;inset:0;z-index:0;pointer-events:none;opacity:0;transition:opacity 1.4s ease;' +
    '-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 72%,transparent 100%),radial-gradient(ellipse 36% 52% at 50% 46%,rgba(0,0,0,' + CONFIG.centerOpacity + ') 0%,#000 100%);' +
    '-webkit-mask-composite:source-in;mask-image:linear-gradient(180deg,#000 0%,#000 72%,transparent 100%),radial-gradient(ellipse 36% 52% at 50% 46%,rgba(0,0,0,' + CONFIG.centerOpacity + ') 0%,#000 100%);mask-composite:intersect}' +
    '.hero3d.is-ready{opacity:' + CONFIG.opacity + '}' +
    '.hero3d canvas{display:block;width:100%;height:100%}' +
    '.has-hero3d>*:not(.hero3d){z-index:2}';
  document.head.appendChild(style);

  var box = document.createElement('div');
  box.className = 'hero3d';
  box.setAttribute('aria-hidden', 'true');
  host.classList.add('has-hero3d');
  host.insertBefore(box, host.firstChild);
  box.appendChild(renderer.domElement);

  /* ---- сцена ---- */
  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(C.bg, 11, 28);                 // дальние объекты растворяются в фон -> глубина
  var camera = new THREE.PerspectiveCamera(45, 1.8, 0.1, 60);
  camera.position.set(0, 0, 15);
  var world = new THREE.Group();
  scene.add(world);

  function rng(seed) {
    return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  }
  var rand = rng(20261026);

  function glowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 128;
    var g = c.getContext('2d');
    var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }
  var glowTex = glowTexture();

  function halo(color, size, opacity) {
    var m = new THREE.SpriteMaterial({ map: glowTex, color: color, transparent: true, opacity: Math.min(1, opacity * CONFIG.glow), depthWrite: false });
    var s = new THREE.Sprite(m);
    s.scale.set(size, size, 1);
    s.userData.base = size;
    s.userData.op = opacity;
    return s;
  }

  var hubPos = new THREE.Vector3(0, CONFIG.hubY, 0);

  /* ---- хаб (платформа) ---- */
  var hub = new THREE.Group();
  hub.position.copy(hubPos);
  world.add(hub);

  var core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 32, 32), new THREE.MeshBasicMaterial({ color: C.hub }));
  hub.add(core);
  var shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.95, 1),
    new THREE.MeshBasicMaterial({ color: C.hubWire, wireframe: true, transparent: true, opacity: 0.55 })
  );
  hub.add(shell);
  var ring1 = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.59, 96), new THREE.MeshBasicMaterial({ color: C.halo, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
  ring1.rotation.x = 1.15;
  hub.add(ring1);
  var ring2 = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.23, 120), new THREE.MeshBasicMaterial({ color: C.halo, transparent: true, opacity: 0.25, side: THREE.DoubleSide }));
  ring2.rotation.x = 1.9;
  ring2.rotation.y = 0.5;
  hub.add(ring2);
  var hubHalo = halo(C.halo, 9, 0.55);
  hub.add(hubHalo);
  var hubPulse = 0;

  /* ---- узлы (экспертные организации) ---- */
  var N = isMobile ? CONFIG.nodesMobile : CONFIG.nodes;
  var nodes = [];
  var golden = Math.PI * (3 - Math.sqrt(5));
  var sph = new THREE.SphereGeometry(1, 16, 16);
  var i, n;
  for (i = 0; i < N; i++) {
    var y = 1 - (i / (N - 1)) * 2;
    var rad = Math.sqrt(1 - y * y);
    var th = golden * i;
    var k = 0.72 + rand() * 0.28;
    var pos = new THREE.Vector3(
      Math.cos(th) * rad * CONFIG.spread.x * k,
      y * CONFIG.spread.y * k + CONFIG.hubY,
      Math.sin(th) * rad * CONFIG.spread.z * k
    );
    var r = 0.15 + rand() * 0.12;
    var mesh = new THREE.Mesh(sph, new THREE.MeshBasicMaterial({ color: C.node }));
    mesh.scale.setScalar(r);
    mesh.position.copy(pos);
    var h = halo(C.halo, 1.5 + r * 4, 0.5);
    h.position.copy(pos);
    world.add(mesh);
    world.add(h);
    nodes.push({ pos: pos, mesh: mesh, halo: h, r: r, pulse: 0, phase: rand() * 6.28 });
  }

  /* ---- линии: хаб -> узлы (лучи) и узел -> ближайший сосед (сеть) ---- */
  function lineSegments(pairs, cFrom, cTo) {
    var p = new Float32Array(pairs.length * 6), col = new Float32Array(pairs.length * 6);
    var a = new THREE.Color(cFrom), b = new THREE.Color(cTo);
    for (var q = 0; q < pairs.length; q++) {
      p.set([pairs[q][0].x, pairs[q][0].y, pairs[q][0].z, pairs[q][1].x, pairs[q][1].y, pairs[q][1].z], q * 6);
      col.set([a.r, a.g, a.b, b.r, b.g, b.b], q * 6);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
  }
  var rays = [];
  for (i = 0; i < N; i++) rays.push([hubPos, nodes[i].pos]);
  world.add(lineSegments(rays, C.line, C.bg));

  var links = [], seen = {};
  for (i = 0; i < N; i++) {
    var best = -1, bd = 1e9;
    for (var j = 0; j < N; j++) {
      if (j === i) continue;
      var d = nodes[i].pos.distanceTo(nodes[j].pos);
      if (d < bd) { bd = d; best = j; }
    }
    var key = Math.min(i, best) + '-' + Math.max(i, best);
    if (best >= 0 && !seen[key]) { seen[key] = 1; links.push([nodes[i].pos, nodes[best].pos]); }
  }
  world.add(lineSegments(links, C.link, C.bg));

  /* ---- огоньки: заявка туда, письмо обратно ---- */
  var PN = isMobile ? 6 : 12;
  var packets = [];
  for (i = 0; i < PN; i++) {
    var sp = halo(C.out, 0.55, 0.95);
    sp.visible = false;
    world.add(sp);
    packets.push({ sprite: sp, active: false, node: null, dir: 1, t: 0, wait: 0, speed: 1 });
  }
  var spawnTimer = 0;
  function spawn() {
    for (var q = 0; q < packets.length; q++) {
      if (!packets[q].active) {
        var p = packets[q];
        p.active = true;
        p.node = nodes[(rand() * N) | 0];
        p.dir = 1; p.t = 0; p.wait = 0;
        p.speed = CONFIG.packetSpeed * (0.8 + rand() * 0.5);
        p.sprite.material.color.setHex(C.out);
        p.sprite.visible = true;
        return;
      }
    }
  }

  /* ---- пыль (частицы для ощущения глубины) ---- */
  var D = isMobile ? CONFIG.dustMobile : CONFIG.dust;
  var dp = new Float32Array(D * 3);
  for (i = 0; i < D; i++) {
    dp[i * 3] = (rand() - 0.5) * CONFIG.spread.x * 2.6;
    dp[i * 3 + 1] = (rand() - 0.5) * CONFIG.spread.y * 2.8;
    dp[i * 3 + 2] = (rand() - 0.5) * CONFIG.spread.z * 2.8;
  }
  var dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  var dust = new THREE.Points(dg, new THREE.PointsMaterial({
    map: glowTex, color: C.dust, size: 0.2, sizeAttenuation: true,
    transparent: true, opacity: Math.min(1, 0.55 * CONFIG.glow), depthWrite: false
  }));
  world.add(dust);

  /* ---- обновление кадра ---- */
  var time = 0, mx = 0, my = 0;
  var tmp = new THREE.Vector3();

  function update(dt) {
    time += dt;

    world.rotation.y = time * CONFIG.spin;
    world.rotation.x = Math.sin(time * 0.15) * 0.06;
    dust.rotation.y = -time * 0.01;

    camera.position.x += (mx * CONFIG.parallax * 2 - camera.position.x) * 0.04;
    camera.position.y += (-my * CONFIG.parallax * 1.2 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);

    shell.rotation.y = time * 0.35;
    shell.rotation.x = time * 0.18;
    ring1.rotation.z = time * 0.3;
    ring2.rotation.z = -time * 0.2;
    hubPulse = Math.max(0, hubPulse - dt * 1.4);
    var hs = hubHalo.userData.base * (1 + Math.sin(time * 1.5) * 0.05 + hubPulse * 0.22);
    hubHalo.scale.set(hs, hs, 1);
    core.scale.setScalar(1 + hubPulse * 0.25);

    for (var q = 0; q < nodes.length; q++) {
      var nd = nodes[q];
      nd.pulse = Math.max(0, nd.pulse - dt * 1.5);
      var tw = 1 + Math.sin(time * 0.9 + nd.phase) * 0.08;
      nd.mesh.scale.setScalar(nd.r * tw * (1 + nd.pulse * 0.9));
      var hsz = nd.halo.userData.base * (1 + nd.pulse * 1.3) * tw;
      nd.halo.scale.set(hsz, hsz, 1);
      nd.halo.material.opacity = Math.min(1, (nd.halo.userData.op + nd.pulse * 0.4) * CONFIG.glow);
    }

    if (!reduce) {
      spawnTimer += dt;
      if (spawnTimer >= CONFIG.packetEvery) { spawnTimer = 0; spawn(); }
    }
    for (q = 0; q < packets.length; q++) {
      var pk = packets[q];
      if (!pk.active) continue;
      if (pk.wait > 0) { pk.wait -= dt; continue; }
      pk.t += dt * pk.speed;
      if (pk.t >= 1) {
        if (pk.dir === 1) {
          pk.node.pulse = 1;
          pk.dir = -1; pk.t = 0; pk.wait = 0.25;
          pk.sprite.material.color.setHex(C.back);
          pk.sprite.position.copy(pk.node.pos);
        } else {
          hubPulse = 1;
          pk.active = false;
          pk.sprite.visible = false;
        }
        continue;
      }
      var e = pk.t * pk.t * (3 - 2 * pk.t);   // плавный старт и финиш
      if (pk.dir === 1) tmp.lerpVectors(hubPos, pk.node.pos, e);
      else tmp.lerpVectors(pk.node.pos, hubPos, e);
      pk.sprite.position.copy(tmp);
    }
  }

  /* ---- размеры ---- */
  function resize() {
    var w = box.clientWidth || host.clientWidth, h = box.clientHeight || host.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    var halfH = Math.tan(camera.fov * Math.PI / 360) * camera.position.z, halfW = halfH * camera.aspect;
    if (camera.aspect > 1.15) {
      // компьютер: сцена справа от текста
      world.scale.setScalar(Math.min(1, Math.max(0.38, camera.aspect / 1.6)));
      world.position.set(CONFIG.offsetX * halfW, 0, 0);
    } else {
      // телефон / портрет: сцена в отдельной зоне внизу, под текстом (зона = --scene-zone в air.css)
      var Hpx = h, Wpx = w;
      var zone = Math.min(Wpx * 0.96, 420);
      var pxPerUnit = Hpx / (2 * halfH);
      world.scale.setScalar(Math.max(0.2, Math.min(1, (zone / 2) / (CONFIG.spread.x * pxPerUnit) * 1.2)));
      var cy = Hpx - zone / 2 - 12;                       // центр сцены, px сверху
      world.position.set(0, -((cy - Hpx / 2) / (Hpx / 2)) * halfH, 0);
    }
    if (!running) renderer.render(scene, camera);
  }

  /* ---- цикл ---- */
  var clock = new THREE.Clock();
  var running = false, raf = 0, inView = true;

  function frame() {
    raf = requestAnimationFrame(frame);
    update(Math.min(clock.getDelta(), 0.05));
    renderer.render(scene, camera);
  }
  function start() { if (running || reduce) return; running = true; clock.getDelta(); frame(); }
  function stop() { running = false; cancelAnimationFrame(raf); }

  /* ---- события ---- */
  if (!reduce && !isMobile && CONFIG.parallax > 0) {
    window.addEventListener('pointermove', function (e) {
      mx = (e.clientX / window.innerWidth - 0.5) * 2;
      my = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(box);
  else window.addEventListener('resize', resize);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) {
      inView = en[0].isIntersecting;
      if (inView && !document.hidden) start(); else stop();
    }, { threshold: 0 }).observe(host);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else if (inView) start();
  });
  renderer.domElement.addEventListener('webglcontextlost', function (e) {
    e.preventDefault(); stop(); box.remove();
  });

  /* ---- старт ---- */
  resize();
  if (reduce) { time = 6; update(0); }          // статичный красивый кадр
  renderer.render(scene, camera);
  box.classList.add('is-ready');
  window.__three3dReady = true;
  start();
})();
