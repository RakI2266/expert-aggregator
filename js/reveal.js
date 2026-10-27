/*
 * reveal.js - плавное появление текста
 *   заголовки (h1, h2): слова выезжают из-под линии, строка за строкой
 *   абзацы, карточки, списки: мягкое проявление с подъёмом
 * Каждый элемент появляется, когда до него долистали.
 * При включённом «уменьшении анимации» в системе - всё видно сразу.
 */
(function () {
  'use strict';

  /* ================= НАСТРОЙКИ ================= */
  var CONFIG = {
    headings: '.hero h1, .section-header h2, .final h2',
    blocks: [
      '.eyebrow', '.hero-lead', '.hero-cta', '.cta-note',
      '.hero-stat', '.logo-strip-header', '.logo-marquee',
      '.section-header p', '.cmp-head', '.cmp-row', '.cmp-foot',
      '.flow-steps li', '.flow-stage .window',
      '.expertise-list span',
      '.pricing-tabs', '.pricing-pills', '.price-card', '.pricing-note', '.pricing-cta-wrap',
      '.review-card', '.faq-item', '.final-cta'
    ].join(','),
    lineStep: 130,      // пауза между строками заголовка, мс
    wordStep: 28,       // небольшой сдвиг между словами в строке, мс
    blockStep: 90,      // пауза между блоками, появившимися одновременно, мс
    blockMax: 540,      // максимум такой паузы, мс
    heroDelays: {       // порядок появления первого экрана, мс
      '.eyebrow': 0, 'h1': 140, '.hero-lead': 560, '.hero-cta': 700, '.cta-note': 820
    }
  };
  /* ============== конец настроек ============== */

  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;

  /* ---- разбиваем заголовки на слова (теги внутри, например <em>, сохраняются) ---- */
  function splitWords(el) {
    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    var nodes = [], n;
    while ((n = walker.nextNode())) if (n.nodeValue.trim()) nodes.push(n);
    nodes.forEach(function (tn) {
      var frag = document.createDocumentFragment();
      tn.nodeValue.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
        var w = document.createElement('span'); w.className = 'w';
        var i = document.createElement('span'); i.className = 'wi'; i.textContent = part;
        w.appendChild(i); frag.appendChild(w);
      });
      tn.parentNode.replaceChild(frag, tn);
    });
  }

  /* задержка слова зависит от его строки: считаем в момент появления, когда шрифты уже загружены */
  function lineDelays(el, base) {
    var words = el.querySelectorAll('.wi'), line = -1, lastTop = null, inLine = 0;
    Array.prototype.forEach.call(words, function (wi) {
      var top = wi.parentNode.getBoundingClientRect().top;
      if (lastTop === null || Math.abs(top - lastTop) > 6) { line++; lastTop = top; inLine = 0; }
      wi.style.setProperty('--d', (base + line * CONFIG.lineStep + inLine * CONFIG.wordStep) + 'ms');
      inLine++;
    });
  }

  function baseDelay(el, table) {
    for (var sel in table) if (el.matches(sel)) return table[sel];
    return 0;
  }

  var heads = Array.prototype.slice.call(document.querySelectorAll(CONFIG.headings));
  var blocks = Array.prototype.slice.call(document.querySelectorAll(CONFIG.blocks));
  heads.forEach(splitWords);
  blocks.forEach(function (b) { b.classList.add('rv-up'); });

  var io = new IntersectionObserver(function (entries) {
    var batch = entries.filter(function (e) { return e.isIntersecting; })
      .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left; });
    batch.forEach(function (en, idx) {
      var el = en.target, inHero = !!el.closest('.hero-first');
      io.unobserve(el);
      if (el.classList.contains('rv-up')) {
        var d = inHero ? baseDelay(el, CONFIG.heroDelays) : Math.min(idx * CONFIG.blockStep, CONFIG.blockMax);
        el.style.setProperty('--d', d + 'ms');
        requestAnimationFrame(function () { el.classList.add('in'); });
        // после появления возвращаем элементу его обычные стили (чтобы работали наведения)
        setTimeout(function () { el.classList.remove('rv-up', 'in'); el.style.removeProperty('--d'); }, 1500 + d);
      } else {
        lineDelays(el, inHero ? baseDelay(el, CONFIG.heroDelays) : 0);
        requestAnimationFrame(function () { el.classList.add('split-in'); });
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  var started = false;
  function start() {
    if (started) return; started = true;
    document.documentElement.classList.add('hero-text-on');
    heads.concat(blocks).forEach(function (el) { io.observe(el); });
  }
  function startAfter3d() {
    var go = function () {
      // небольшая пауза после 3D, затем текст
      setTimeout(start, 280);
    };
    if (window.__three3dReady) { go(); return; }
    var t0 = Date.now();
    var iv = setInterval(function () {
      if (window.__three3dReady || Date.now() - t0 > 1600) {
        clearInterval(iv);
        go();
      }
    }, 40);
  }
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(startAfter3d);
  }
  setTimeout(startAfter3d, 900); // страховка
  if (!document.fonts) startAfter3d();
})();
