/*
 * Surgical Log Book — analytics (pure functions, no DOM).
 * Tested by tests/analytics.test.js (run: node tests/analytics.test.js)
 */
(function (root) {
  'use strict';
  var T = (root.SLB && root.SLB.taxonomy) || (typeof require !== 'undefined' ? require('./taxonomy.js') : null);

  var PERFORMED = { P: 1, PS: 1 };
  var SUPERVISED = { ST: 1, SU: 1 };
  var MAJOR_COMPLICATION = { 'CD-IIIa': 1, 'CD-IIIb': 1, 'CD-IVa': 1, 'CD-IVb': 1, 'CD-V': 1 };

  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ym(date) { return String(date || '').slice(0, 7); }
  function yr(date) { return String(date || '').slice(0, 4); }

  function addMonths(ymStr, k) {
    var y = Number(ymStr.slice(0, 4)), m = Number(ymStr.slice(5, 7)) - 1 + k;
    y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
    return y + '-' + pad2(m + 1);
  }
  function monthsBetween(a, b) { // inclusive list a..b of 'YYYY-MM'
    var out = []; if (!a || !b || a > b) return out;
    for (var cur = a; cur <= b; cur = addMonths(cur, 1)) out.push(cur);
    return out;
  }
  function isoDate(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function shiftDate(iso, months) { // same day-of-month, clamped
    var y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + months, d = Number(iso.slice(8, 10));
    var dt = new Date(y, m, 1); var last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    dt.setDate(Math.min(d, last)); return isoDate(dt);
  }

  function applyFilter(entries, f) {
    f = f || {};
    var text = (f.text || '').trim().toLowerCase();
    return entries.filter(function (e) {
      if (f.from && e.date < f.from) return false;
      if (f.to && e.date > f.to) return false;
      if (f.facility && e.facility !== f.facility) return false;
      if (f.domain && e.domain !== f.domain) return false;
      if (f.approach && e.approach !== f.approach) return false;
      if (f.urgency && e.urgency !== f.urgency) return false;
      if (f.role) {
        if (f.role.indexOf('group:') === 0) { if (T.roleGroup(e.role) !== f.role.slice(6)) return false; }
        else if (e.role !== f.role) return false;
      }
      if (text) {
        var hay = [e.procedure, e.additional, e.diagnosis, e.icd10, e.tags, e.notes, e.patientRef, e.patientName, e.patientId, e.mrn, e.facility, e.supervisorTrainee].join(' ').toLowerCase();
        if (hay.indexOf(text) === -1) return false;
      }
      return true;
    });
  }

  function countBy(entries, keyFn) {
    var m = {};
    entries.forEach(function (e) { var k = keyFn(e); if (k === undefined || k === null || k === '') k = '(blank)'; m[k] = (m[k] || 0) + 1; });
    return Object.keys(m).map(function (k) { return { key: k, count: m[k] }; })
      .sort(function (a, b) { return b.count - a.count || (a.key < b.key ? -1 : 1); });
  }

  function series(entries, period, opts) {
    opts = opts || {};
    var keyFn = period === 'year' ? function (e) { return yr(e.date); } : function (e) { return ym(e.date); };
    var m = {}; entries.forEach(function (e) { if (e.date) { var k = keyFn(e); m[k] = (m[k] || 0) + 1; } });
    var keys = Object.keys(m).sort(); if (!keys.length) return [];
    var first = opts.from ? keyFn({ date: opts.from }) : keys[0];
    var last = opts.to ? keyFn({ date: opts.to }) : keys[keys.length - 1];
    var periods;
    if (period === 'year') { periods = []; for (var y = Number(first); y <= Number(last); y++) periods.push(String(y)); }
    else periods = monthsBetween(first, last);
    var cum = 0;
    return periods.map(function (p) { var c = m[p] || 0; cum += c; return { period: p, count: c, cumulative: cum }; });
  }

  function crossTab(entries, rowFn, colFn, colOrder) {
    var rows = {}, colsSeen = {};
    entries.forEach(function (e) {
      var r = rowFn(e) || '(blank)', c = colFn(e) || '(blank)';
      rows[r] = rows[r] || {}; rows[r][c] = (rows[r][c] || 0) + 1; colsSeen[c] = 1;
    });
    var cols = colOrder ? colOrder.filter(function (c) { return colsSeen[c]; }).concat(Object.keys(colsSeen).filter(function (c) { return colOrder.indexOf(c) === -1; }).sort())
      : Object.keys(colsSeen).sort();
    var out = Object.keys(rows).map(function (r) {
      var cells = cols.map(function (c) { return rows[r][c] || 0; });
      return { key: r, cells: cells, total: cells.reduce(function (a, b) { return a + b; }, 0) };
    }).sort(function (a, b) { return b.total - a.total; });
    var colTotals = cols.map(function (_, i) { return out.reduce(function (s, r) { return s + r.cells[i]; }, 0); });
    return { cols: cols, rows: out, colTotals: colTotals, grand: colTotals.reduce(function (a, b) { return a + b; }, 0) };
  }

  // Ordinary least-squares slope of y over x = 0..n-1
  function slope(ys) {
    var n = ys.length; if (n < 2) return 0;
    var mx = (n - 1) / 2, my = ys.reduce(function (a, b) { return a + b; }, 0) / n, num = 0, den = 0;
    for (var i = 0; i < n; i++) { num += (i - mx) * (ys[i] - my); den += (i - mx) * (i - mx); }
    return den ? num / den : 0;
  }

  // Wilson score interval for a binomial proportion (95% default)
  function wilson(x, n, z) {
    z = z || 1.959964;
    if (!n) return { p: null, lo: null, hi: null };
    var p = x / n, z2 = z * z, den = 1 + z2 / n;
    var centre = (p + z2 / (2 * n)) / den;
    var half = (z * Math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))) / den;
    return { p: p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
  }

  /*
   * Domain trend: compares the last `windowMonths` up to refDate with the
   * preceding window of equal length, plus an OLS slope across both windows
   * (cases per month, per month). Labels are descriptive only — with small
   * counts, apparent changes may be noise; `n` is shown so it can be judged.
   */
  function domainTrends(entries, refDate, windowMonths) {
    windowMonths = windowMonths || 12;
    var endYm = ym(refDate), startCur = addMonths(endYm, -windowMonths + 1), startPrev = addMonths(endYm, -2 * windowMonths + 1);
    var months = monthsBetween(startPrev, endYm);
    var byDomain = {};
    entries.forEach(function (e) {
      var k = ym(e.date); if (k < startPrev || k > endYm) return;
      var d = e.domain || 'OTHER';
      byDomain[d] = byDomain[d] || {}; byDomain[d][k] = (byDomain[d][k] || 0) + 1;
    });
    return Object.keys(byDomain).map(function (d) {
      var ys = months.map(function (m) { return byDomain[d][m] || 0; });
      var prev = ys.slice(0, windowMonths).reduce(function (a, b) { return a + b; }, 0);
      var cur = ys.slice(windowMonths).reduce(function (a, b) { return a + b; }, 0);
      var pct = prev ? (cur - prev) / prev * 100 : null;
      var label;
      if (cur + prev < 10) label = 'Too few to judge';
      else if (pct === null) label = 'New';
      else if (pct >= 20) label = 'Rising';
      else if (pct <= -20) label = 'Falling';
      else label = 'Stable';
      return { domain: d, name: T.domainName(d), current: cur, previous: prev, changePct: pct, slope: slope(ys), monthly: ys, label: label };
    }).sort(function (a, b) { return b.current - a.current; });
  }

  function complicationSummary(entries) {
    var groups = {};
    entries.forEach(function (e) {
      var d = e.domain || 'OTHER'; groups[d] = groups[d] || { n: 0, known: 0, any: 0, major: 0 };
      var g = groups[d]; g.n++;
      if (e.complication && e.complication !== 'UNK') {
        g.known++;
        if (e.complication !== 'NONE') g.any++;
        if (MAJOR_COMPLICATION[e.complication]) g.major++;
      }
    });
    return Object.keys(groups).map(function (d) {
      var g = groups[d];
      return { domain: d, name: T.domainName(d), n: g.n, known: g.known, any: g.any, major: g.major,
        anyRate: wilson(g.any, g.known), majorRate: wilson(g.major, g.known) };
    }).sort(function (a, b) { return b.n - a.n; });
  }

  /*
   * Privileging summary: per domain and procedure, counts split by role,
   * within an optional date window, with the most recent date per procedure.
   */
  function privilegingSummary(entries, opts) {
    opts = opts || {};
    var list = applyFilter(entries, { from: opts.from, to: opts.to });
    var dom = {};
    list.forEach(function (e) {
      var d = e.domain || 'OTHER', p = (e.procedure || '(unspecified)').trim();
      dom[d] = dom[d] || {}; var r = dom[d][p] = dom[d][p] || { procedure: p, P: 0, PS: 0, ST: 0, SU: 0, A: 0, O: 0, total: 0, last: '', complications: 0, known: 0 };
      if (r[e.role] !== undefined) r[e.role]++;
      r.total++;
      if (e.date > r.last) r.last = e.date;
      if (e.complication && e.complication !== 'UNK') { r.known++; if (MAJOR_COMPLICATION[e.complication]) r.complications++; }
    });
    return Object.keys(dom).map(function (d) {
      var procs = Object.keys(dom[d]).map(function (k) {
        var r = dom[d][k];
        r.performed = r.P + r.PS; r.supervised = r.ST + r.SU;
        return r;
      }).sort(function (a, b) { return b.total - a.total; });
      var tot = procs.reduce(function (acc, r) {
        acc.P += r.P; acc.PS += r.PS; acc.ST += r.ST; acc.SU += r.SU; acc.A += r.A; acc.O += r.O; acc.total += r.total; return acc;
      }, { P: 0, PS: 0, ST: 0, SU: 0, A: 0, O: 0, total: 0 });
      tot.performed = tot.P + tot.PS; tot.supervised = tot.ST + tot.SU;
      return { domain: d, name: T.domainName(d), procedures: procs, totals: tot };
    }).sort(function (a, b) { return b.totals.total - a.totals.total; });
  }

  function median(nums) {
    var a = nums.filter(function (x) { return typeof x === 'number' && !isNaN(x); }).sort(function (x, y) { return x - y; });
    if (!a.length) return null; var m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  function overview(entries) {
    var dates = entries.map(function (e) { return e.date; }).filter(Boolean).sort();
    var role = countBy(entries, function (e) { return T.roleGroup(e.role); });
    function g(name) { for (var i = 0; i < role.length; i++) if (role[i].key === name) return role[i].count; return 0; }
    return {
      total: entries.length,
      first: dates[0] || null, last: dates[dates.length - 1] || null,
      performed: g('Performed'), supervised: g('Supervised'), assisted: g('Assisted'), observed: g('Observed'),
      domains: countBy(entries, function (e) { return e.domain; }).length,
      facilities: countBy(entries, function (e) { return e.facility; }).filter(function (x) { return x.key !== '(blank)'; }).length,
      emergency: entries.filter(function (e) { return e.urgency === 'Emergency'; }).length,
      majorPlus: entries.filter(function (e) { return Number(e.complexity) >= 3; }).length,
      medianDuration: median(entries.map(function (e) { return e.durationMin === '' || e.durationMin == null ? NaN : Number(e.durationMin); }))
    };
  }

  // Plain-text CV / portfolio summary
  function cvSummary(entries, opts) {
    opts = opts || {};
    var list = applyFilter(entries, { from: opts.from, to: opts.to });
    var o = overview(list), lines = [];
    lines.push('OPERATIVE & PROCEDURAL EXPERIENCE' + (opts.name ? ' — ' + opts.name : ''));
    lines.push('Period: ' + (opts.from || o.first || '—') + ' to ' + (opts.to || o.last || '—'));
    lines.push('Total procedures logged: ' + o.total + ' (performed ' + o.performed + ', supervised trainee ' + o.supervised + ', assisted ' + o.assisted + (o.observed ? ', observed ' + o.observed : '') + ')');
    lines.push('Major / complex-major cases: ' + o.majorPlus + '; emergency cases: ' + o.emergency);
    lines.push('');
    lines.push('By domain (performed / supervised / assisted / total):');
    privilegingSummary(list).forEach(function (d) {
      var t = d.totals;
      lines.push('  • ' + d.name + ': ' + t.performed + ' / ' + t.supervised + ' / ' + t.A + ' / ' + t.total);
      d.procedures.slice(0, opts.topPerDomain || 5).forEach(function (p) {
        lines.push('      – ' + p.procedure + ': ' + p.total + ' (P ' + p.P + ', PS ' + p.PS + ', S ' + p.supervised + ', A ' + p.A + ')');
      });
    });
    var ap = countBy(list, function (e) { return T.approachLabel(e.approach); });
    lines.push('');
    lines.push('By approach: ' + ap.map(function (x) { return x.key + ' ' + x.count; }).join('; '));
    lines.push('');
    lines.push('Source: personal electronic surgical log book; counts are self-reported and should be verified against hospital operating records where required.');
    return lines.join('\n');
  }

  var api = {
    applyFilter: applyFilter, countBy: countBy, series: series, crossTab: crossTab, slope: slope, wilson: wilson,
    domainTrends: domainTrends, complicationSummary: complicationSummary, privilegingSummary: privilegingSummary,
    overview: overview, cvSummary: cvSummary, median: median, monthsBetween: monthsBetween, addMonths: addMonths,
    shiftDate: shiftDate, isoDate: isoDate, PERFORMED: PERFORMED, SUPERVISED: SUPERVISED, MAJOR_COMPLICATION: MAJOR_COMPLICATION
  };
  root.SLB = root.SLB || {};
  root.SLB.analytics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
