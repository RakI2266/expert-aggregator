/**
 * Analytics helpers — агрегаты из localStorage (MVP)
 */
(function (g) {
  'use strict';

  function weeksBack(n) {
    var out = [];
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    // align to Monday-ish labels by week start
    for (var i = n - 1; i >= 0; i--) {
      var x = new Date(d);
      x.setDate(x.getDate() - i * 7);
      out.push({
        key: x.getFullYear() + '-W' + weekNum(x),
        label: pad(x.getDate()) + '.' + pad(x.getMonth() + 1),
        start: startOfWeek(x),
        end: endOfWeek(x)
      });
    }
    return out;
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function weekNum(d) {
    var t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil((((t - yearStart) / 86400000) + 1) / 7);
  }
  function startOfWeek(d) {
    var x = new Date(d); var day = x.getDay() || 7;
    x.setDate(x.getDate() - day + 1); x.setHours(0, 0, 0, 0); return x;
  }
  function endOfWeek(d) {
    var x = startOfWeek(d); x.setDate(x.getDate() + 7); return x;
  }
  function inWeek(iso, w) {
    if (!iso) return false;
    var t = new Date(iso).getTime();
    return t >= w.start.getTime() && t < w.end.getTime();
  }

  function lawyerStats(userId) {
    var state = loadState();
    var reqs = (state.requests || []).filter(function (r) { return r.lawyerId === userId; });
    var weeks = weeksBack(6);
    var byWeek = weeks.map(function (w) {
      var created = reqs.filter(function (r) { return inWeek(r.publishedAt || r.createdAt, w); }).length;
      var answers = 0;
      reqs.forEach(function (r) {
        (r.answers || []).forEach(function (a) {
          if (!a.withdrawn && inWeek(a.submittedAt || a.createdAt, w)) answers++;
        });
      });
      return { label: w.label, created: created, answers: answers };
    });
    var open = 0, closed = 0, withAnswers = 0, totalAnswers = 0, selected = 0;
    reqs.forEach(function (r) {
      var st = typeof effectiveStatus === 'function' ? effectiveStatus(r) : r.status;
      if (st === 'closed') closed++; else open++;
      var acts = (r.answers || []).filter(function (a) { return !a.withdrawn; });
      totalAnswers += acts.length;
      if (acts.length) withAnswers++;
      if (r.selectedAnswerId) selected++;
    });
    var statusBars = [
      { label: 'Открытые', value: open, color: '#2563EB' },
      { label: 'С ответами', value: withAnswers, color: '#0EA5E9' },
      { label: 'Выбран эксперт', value: selected, color: '#10B981' },
      { label: 'Закрытые', value: closed, color: '#94A3B8' }
    ];
    return {
      kpis: [
        { label: 'Заявок', value: reqs.length },
        { label: 'Ответов получено', value: totalAnswers },
        { label: 'С ответами', value: withAnswers },
        { label: 'Закрыто', value: closed }
      ],
      byWeek: byWeek,
      statusBars: statusBars
    };
  }

  function expertStats(userId) {
    var state = loadState();
    var openFeed = typeof getOpenRequestsForExpert === 'function' ? getOpenRequestsForExpert().length : 0;
    var my = typeof getMyAnswers === 'function' ? getMyAnswers(userId, true) : [];
    var active = my.filter(function (x) { return !x.answer.withdrawn; });
    var withdrawn = my.filter(function (x) { return x.answer.withdrawn; });
    var fav = (state.users[userId] && state.users[userId].favorites) || [];
    var weeks = weeksBack(6);
    var byWeek = weeks.map(function (w) {
      var sent = my.filter(function (x) {
        return !x.answer.withdrawn && inWeek(x.answer.submittedAt || x.answer.createdAt, w);
      }).length;
      return { label: w.label, sent: sent };
    });
    var statusBars = [
      { label: 'Активные отклики', value: active.length, color: '#2563EB' },
      { label: 'Отозванные', value: withdrawn.length, color: '#F59E0B' },
      { label: 'В избранном', value: fav.length, color: '#8B5CF6' },
      { label: 'Открыто в ленте', value: openFeed, color: '#0EA5E9' }
    ];
    return {
      kpis: [
        { label: 'Откликов', value: active.length },
        { label: 'Отозвано', value: withdrawn.length },
        { label: 'Избранное', value: fav.length },
        { label: 'В ленте сейчас', value: openFeed }
      ],
      byWeek: byWeek,
      statusBars: statusBars
    };
  }

  /** SVG line/area chart for series [{label, a, b?}] */
  function renderLineChart(el, series, keys, colors) {
    if (!el) return;
    var w = el.clientWidth || 560, h = 200, pad = { t: 16, r: 12, b: 28, l: 28 };
    var innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
    var max = 1;
    series.forEach(function (row) {
      keys.forEach(function (k) { if (row[k] > max) max = row[k]; });
    });
    function x(i) { return pad.l + (series.length <= 1 ? innerW / 2 : (i / (series.length - 1)) * innerW); }
    function y(v) { return pad.t + innerH - (v / max) * innerH; }
    function pathFor(key) {
      return series.map(function (row, i) {
        return (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ' ' + y(row[key]).toFixed(1);
      }).join(' ');
    }
    var grid = '';
    for (var g = 0; g <= 3; g++) {
      var gy = pad.t + (innerH * g) / 3;
      grid += '<line x1="' + pad.l + '" y1="' + gy + '" x2="' + (w - pad.r) + '" y2="' + gy + '" stroke="#E2E8F0" stroke-width="1"/>';
    }
    var lines = keys.map(function (k, ki) {
      var d = pathFor(k);
      var col = colors[ki] || '#2563EB';
      return '<path class="chart-line" d="' + d + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        series.map(function (row, i) {
          return '<circle class="chart-dot" cx="' + x(i) + '" cy="' + y(row[k]) + '" r="3.5" fill="' + col + '"/>';
        }).join('');
    }).join('');
    var labels = series.map(function (row, i) {
      return '<text x="' + x(i) + '" y="' + (h - 8) + '" text-anchor="middle" font-size="11" fill="#64748B">' + row.label + '</text>';
    }).join('');
    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img">' + grid + lines + labels + '</svg>';
  }

  function renderBarChart(el, items) {
    if (!el) return;
    var max = 1;
    items.forEach(function (it) { if (it.value > max) max = it.value; });
    el.innerHTML = items.map(function (it, i) {
      var pct = Math.max(4, (it.value / max) * 100);
      return '<div class="bar-row" style="--i:' + i + '">' +
        '<div class="bar-label">' + escape(it.label) + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + (it.color || '#2563EB') + '"></div></div>' +
        '<div class="bar-val">' + it.value + '</div></div>';
    }).join('');
  }

  function escape(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  g.ELAnalytics = {
    lawyerStats: lawyerStats,
    expertStats: expertStats,
    renderLineChart: renderLineChart,
    renderBarChart: renderBarChart
  };
})(window);
