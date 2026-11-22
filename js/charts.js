/*
 * Surgical Log Book — dependency-free SVG charts (works offline).
 * Colours come from CSS custom properties so light/dark themes both work.
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var SERIES = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
  function empty(el, msg) { el.innerHTML = '<p class="empty">' + esc(msg || 'No data for this selection.') + '</p>'; }

  // Horizontal bar chart. items: [{label, value, title?}]
  function hbar(el, items, opts) {
    opts = opts || {};
    if (!items.length) return empty(el);
    var rowH = 26, labelW = opts.labelWidth || 230, w = 640, h = items.length * rowH + 10, max = niceMax(Math.max.apply(null, items.map(function (i) { return i.value; })));
    var plotW = w - labelW - 50, s = '';
    items.forEach(function (it, i) {
      var y = i * rowH + 5, bw = Math.max(1, it.value / max * plotW);
      s += '<g><title>' + esc(it.title || (it.label + ': ' + it.value)) + '</title>' +
        '<text x="' + (labelW - 8) + '" y="' + (y + 16) + '" text-anchor="end" class="lbl">' + esc(trunc(it.label, 34)) + '</text>' +
        '<rect x="' + labelW + '" y="' + (y + 4) + '" width="' + bw + '" height="' + (rowH - 9) + '" rx="3" fill="' + (it.color || opts.color || 'var(--c1)') + '"/>' +
        '<text x="' + (labelW + bw + 6) + '" y="' + (y + 16) + '" class="val">' + esc(fmt(it.value, opts)) + '</text></g>';
    });
    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" role="img" aria-label="' + esc(opts.aria || 'bar chart') + '">' + s + '</svg>';
  }

  // Stacked horizontal bars. rows: [{label, parts:[n,...]}]; keys: legend labels
  function stacked(el, rows, keys, opts) {
    opts = opts || {};
    if (!rows.length) return empty(el);
    var rowH = 26, labelW = opts.labelWidth || 230, w = 640, legendH = 26, h = rows.length * rowH + 10 + legendH;
    var max = niceMax(Math.max.apply(null, rows.map(function (r) { return r.parts.reduce(function (a, b) { return a + b; }, 0); })));
    var plotW = w - labelW - 50, s = '';
    var lx = labelW;
    keys.forEach(function (k, i) {
      s += '<rect x="' + lx + '" y="6" width="12" height="12" rx="2" fill="' + SERIES[i % SERIES.length] + '"/><text x="' + (lx + 16) + '" y="16" class="lbl">' + esc(k) + '</text>';
      lx += 26 + k.length * 7;
    });
    rows.forEach(function (r, i) {
      var y = legendH + i * rowH + 5, x = labelW, tot = 0;
      s += '<text x="' + (labelW - 8) + '" y="' + (y + 16) + '" text-anchor="end" class="lbl">' + esc(trunc(r.label, 34)) + '</text>';
      r.parts.forEach(function (v, j) {
        if (!v) return; var bw = v / max * plotW; tot += v;
        s += '<rect x="' + x + '" y="' + (y + 4) + '" width="' + bw + '" height="' + (rowH - 9) + '" fill="' + SERIES[j % SERIES.length] + '"><title>' + esc(r.label + ' — ' + keys[j] + ': ' + v) + '</title></rect>';
        x += bw;
      });
      s += '<text x="' + (x + 6) + '" y="' + (y + 16) + '" class="val">' + tot + '</text>';
    });
    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" role="img" aria-label="' + esc(opts.aria || 'stacked bar chart') + '">' + s + '</svg>';
  }

  // Time series: columns = count per period, line = cumulative (right axis). points: [{period, count, cumulative}]
  function timeSeries(el, points, opts) {
    opts = opts || {};
    if (!points.length) return empty(el);
    var w = 720, h = 260, m = { l: 40, r: 50, t: 14, b: 40 }, pw = w - m.l - m.r, ph = h - m.t - m.b;
    var maxC = niceMax(Math.max.apply(null, points.map(function (p) { return p.count; })));
    var maxCum = niceMax(points[points.length - 1].cumulative);
    var bw = pw / points.length, s = '';
    for (var g = 0; g <= 4; g++) {
      var gy = m.t + ph - g / 4 * ph;
      s += '<line x1="' + m.l + '" x2="' + (w - m.r) + '" y1="' + gy + '" y2="' + gy + '" class="grid"/>' +
        '<text x="' + (m.l - 6) + '" y="' + (gy + 4) + '" text-anchor="end" class="ax">' + Math.round(maxC * g / 4) + '</text>';
      if (opts.cumulative !== false) s += '<text x="' + (w - m.r + 6) + '" y="' + (gy + 4) + '" class="ax cum">' + Math.round(maxCum * g / 4) + '</text>';
    }
    var step = Math.ceil(points.length / 12), path = '';
    points.forEach(function (p, i) {
      var x = m.l + i * bw, bh = p.count / maxC * ph;
      s += '<rect x="' + (x + bw * 0.12) + '" y="' + (m.t + ph - bh) + '" width="' + Math.max(1, bw * 0.76) + '" height="' + bh + '" fill="var(--c1)"><title>' + esc(p.period + ': ' + p.count + ' (cumulative ' + p.cumulative + ')') + '</title></rect>';
      if (i % step === 0) s += '<text x="' + (x + bw / 2) + '" y="' + (h - m.b + 16) + '" text-anchor="middle" class="ax">' + esc(p.period) + '</text>';
      var cy = m.t + ph - p.cumulative / maxCum * ph;
      path += (i ? 'L' : 'M') + (x + bw / 2).toFixed(1) + ',' + cy.toFixed(1);
    });
    if (opts.cumulative !== false) s += '<path d="' + path + '" fill="none" stroke="var(--c3)" stroke-width="2.5"/>';
    s += '<text x="' + m.l + '" y="' + (h - 6) + '" class="ax">■ cases per ' + esc(opts.unit || 'period') + (opts.cumulative !== false ? '   — cumulative (right axis)' : '') + '</text>';
    el.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" class="chart" role="img" aria-label="' + esc(opts.aria || 'time series') + '">' + s + '</svg>';
  }

  function sparkline(values) {
    if (!values || !values.length) return '';
    var w = 120, h = 26, max = Math.max.apply(null, values.concat([1])), step = w / Math.max(1, values.length - 1);
    var d = values.map(function (v, i) { return (i ? 'L' : 'M') + (i * step).toFixed(1) + ',' + (h - 2 - v / max * (h - 4)).toFixed(1); }).join('');
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" class="spark" aria-hidden="true"><path d="' + d + '" fill="none" stroke="var(--c1)" stroke-width="1.6"/></svg>';
  }

  function trunc(s, n) { s = String(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function fmt(v, opts) { return opts && opts.pct ? (v * 100).toFixed(1) + '%' : v; }

  root.SLB = root.SLB || {};
  root.SLB.charts = { hbar: hbar, stacked: stacked, timeSeries: timeSeries, sparkline: sparkline, esc: esc, SERIES: SERIES };
})(typeof window !== 'undefined' ? window : globalThis);
