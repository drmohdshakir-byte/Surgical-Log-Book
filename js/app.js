/* Surgical Log Book — UI controller */
(function () {
  'use strict';
  var T = SLB.taxonomy, A = SLB.analytics, IO = SLB.io, S = SLB.store, C = SLB.charts, esc = C.esc;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  var state = { tab: 'dashboard', tsPeriod: 'month', sort: { key: 'date', dir: -1 }, page: 0, pageSize: 50, settings: {} };
  var ROLE_KEYS = ['P', 'PS', 'ST', 'SU', 'A', 'O'];
  var ROLE_SHORT = { P: 'Performed', PS: 'Performed (supervised)', ST: 'Supervised trainee (scrubbed)', SU: 'Supervised trainee (unscrubbed)', A: 'Assisted', O: 'Observed' };

  function opt(v, l, sel) { return '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(l) + '</option>'; }
  function today() { return A.isoDate(new Date()); }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function flash(el, msg, bad) { el.textContent = msg; el.className = 'msg ' + (bad ? 'bad' : 'good'); setTimeout(function () { el.textContent = ''; }, 4000); }

  // ---------- setup ----------
  function fillSelects() {
    var f = $('#entryForm');
    f.domain.innerHTML = opt('', '— select domain —') + T.DOMAINS.map(function (d) { return opt(d.code, d.name); }).join('');
    f.approach.innerHTML = opt('', '— select —') + T.APPROACHES.map(function (a) { return opt(a.code, a.label); }).join('');
    f.complexity.innerHTML = opt('', '—') + T.COMPLEXITY.map(function (c) { return opt(c.code, c.code + ' — ' + c.label); }).join('');
    f.role.innerHTML = opt('', '— select role —') + T.ROLES.map(function (r) { return opt(r.code, r.code + ' — ' + r.label); }).join('');
    f.setting.innerHTML = opt('', '—') + T.SETTINGS.map(function (s) { return opt(s, s); }).join('');
    f.urgency.innerHTML = T.URGENCY.map(function (s) { return opt(s, s); }).join('');
    f.anaesthesia.innerHTML = opt('', '—') + T.ANAESTHESIA.map(function (s) { return opt(s, s); }).join('');
    f.complication.innerHTML = T.COMPLICATIONS.map(function (c) { return opt(c.code, c.label); }).join('');

    $('#fRole').innerHTML = opt('', 'All roles') + ['Performed', 'Supervised', 'Assisted', 'Observed'].map(function (g) { return opt('group:' + g, 'All ' + g.toLowerCase()); }).join('') +
      T.ROLES.map(function (r) { return opt(r.code, r.code + ' — ' + r.label); }).join('');
    $('#fDomain').innerHTML = opt('', 'All domains') + T.DOMAINS.map(function (d) { return opt(d.code, d.name); }).join('');
    $('#fApproach').innerHTML = opt('', 'All') + T.APPROACHES.map(function (a) { return opt(a.code, T.approachLabel(a.code)); }).join('');
    procedureList('');
  }

  function procedureList(domain) {
    var names = [];
    T.DOMAINS.forEach(function (d) { if (!domain || d.code === domain) d.procedures.forEach(function (p) { names.push(p[0]); }); });
    // include procedures you have previously typed
    S.all().forEach(function (e) { if ((!domain || e.domain === domain) && names.indexOf(e.procedure) === -1) names.push(e.procedure); });
    $('#dlProcedure').innerHTML = names.sort().map(function (n) { return '<option value="' + esc(n) + '">'; }).join('');
  }

  function refreshFacilities() {
    var fac = A.countBy(S.all(), function (e) { return e.facility; }).filter(function (x) { return x.key !== '(blank)'; }).map(function (x) { return x.key; });
    var cur = $('#fFacility').value;
    $('#fFacility').innerHTML = opt('', 'All') + fac.map(function (f) { return opt(f, f, f === cur); }).join('');
    $('#dlFacility').innerHTML = fac.map(function (f) { return '<option value="' + esc(f) + '">'; }).join('');
  }

  // ---------- filters ----------
  function filters() {
    return { from: $('#fFrom').value, to: $('#fTo').value, facility: $('#fFacility').value, role: $('#fRole').value, domain: $('#fDomain').value, approach: $('#fApproach').value };
  }
  function filtered() { return A.applyFilter(S.all(), filters()); }

  function quick(v) {
    var t = today();
    if (!v) { $('#fFrom').value = ''; $('#fTo').value = ''; }
    else if (v === 'ytd') { $('#fFrom').value = t.slice(0, 4) + '-01-01'; $('#fTo').value = t; }
    else { $('#fFrom').value = A.shiftDate(t, -Number(v)); $('#fTo').value = t; }
  }

  // ---------- tabs ----------
  function showTab(name) {
    state.tab = name;
    $$('.tabs button').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === name); });
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t.id === 'tab-' + name); });
    $('#filters').style.display = (name === 'entry' || name === 'data') ? 'none' : '';
    render();
  }

  function render() {
    if (state.tab === 'dashboard') renderDashboard();
    else if (state.tab === 'records') renderRecords();
    else if (state.tab === 'privileging') renderPrivileging();
    else if (state.tab === 'cv') renderCv();
    else if (state.tab === 'data') renderData();
  }

  // ---------- dashboard ----------
  function renderDashboard() {
    var list = filtered(), o = A.overview(list);
    var k = [
      ['Total logged', o.total], ['Performed', o.performed], ['Supervised trainee', o.supervised], ['Assisted', o.assisted],
      ['Major / complex', o.majorPlus], ['Emergency', o.emergency], ['Domains covered', o.domains + ' / ' + T.DOMAINS.length],
      ['Median duration', o.medianDuration == null ? '—' : o.medianDuration + ' min']
    ];
    $('#kpis').innerHTML = k.map(function (x) { return '<div class="kpi"><div class="kv">' + esc(x[1]) + '</div><div class="kl">' + esc(x[0]) + '</div></div>'; }).join('') +
      '<div class="kpi wide"><div class="kl">Period in view</div><div class="kd">' + esc((o.first || '—') + ' → ' + (o.last || '—')) + '</div></div>';

    var f = filters();
    C.timeSeries($('#chTime'), A.series(list, state.tsPeriod, { from: f.from || undefined, to: f.to || undefined }), { unit: state.tsPeriod, aria: 'cases over time' });

    var ct = A.crossTab(list, function (e) { return T.domainName(e.domain); }, function (e) { return T.roleGroup(e.role); }, ['Performed', 'Supervised', 'Assisted', 'Observed']);
    C.stacked($('#chDomain'), ct.rows.map(function (r) { return { label: r.key, parts: r.cells }; }), ct.cols, { aria: 'domain by role' });

    C.hbar($('#chApproach'), A.countBy(list, function (e) { return T.approachLabel(e.approach); }).map(function (x) { return { label: x.key, value: x.count }; }), { labelWidth: 170, color: 'var(--c2)' });
    C.hbar($('#chComplexity'), A.countBy(list, function (e) { return T.complexityLabel(e.complexity) || '(not graded)'; }).map(function (x) { return { label: x.key, value: x.count }; }), { labelWidth: 170, color: 'var(--c4)' });
    C.hbar($('#chTopProc'), A.countBy(list, function (e) { return e.procedure; }).slice(0, 15).map(function (x) { return { label: x.key, value: x.count }; }), { labelWidth: 290 });

    // heatmap domain x year
    var hm = A.crossTab(list, function (e) { return T.domainName(e.domain); }, function (e) { return e.date.slice(0, 4); });
    var maxCell = 0; hm.rows.forEach(function (r) { r.cells.forEach(function (c) { if (c > maxCell) maxCell = c; }); });
    $('#heatmap').innerHTML = hm.rows.length ? '<table class="tbl heat"><thead><tr><th>Domain</th>' + hm.cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '<th>Total</th></tr></thead><tbody>' +
      hm.rows.map(function (r) { return '<tr><td>' + esc(r.key) + '</td>' + r.cells.map(function (c) { var a = maxCell ? c / maxCell : 0; return '<td style="--a:' + a.toFixed(3) + '" class="hc">' + (c || '') + '</td>'; }).join('') + '<td><b>' + r.total + '</b></td></tr>'; }).join('') +
      '</tbody><tfoot><tr><td>Total</td>' + hm.colTotals.map(function (c) { return '<td><b>' + c + '</b></td>'; }).join('') + '<td><b>' + hm.grand + '</b></td></tr></tfoot></table>' : '<p class="empty">No data.</p>';

    // trends (ignores the From filter by design — uses a fixed 24-month window)
    var ref = f.to || today();
    var base = A.applyFilter(S.all(), { facility: f.facility, role: f.role, approach: f.approach, domain: f.domain });
    var tr = A.domainTrends(base, ref, 12);
    $('#trendNote').textContent = '(window ends ' + ref + ')';
    $('#trends').innerHTML = tr.length ? '<table class="tbl"><thead><tr><th>Domain</th><th>Prior 12 m</th><th>Last 12 m</th><th>Change</th><th>Slope (cases/mo²)</th><th>24-month shape</th><th>Read-out</th></tr></thead><tbody>' +
      tr.map(function (t) {
        return '<tr><td>' + esc(t.name) + '</td><td>' + t.previous + '</td><td>' + t.current + '</td><td>' + (t.changePct === null ? '—' : (t.changePct > 0 ? '+' : '') + t.changePct.toFixed(0) + '%') +
          '</td><td>' + t.slope.toFixed(3) + '</td><td>' + C.sparkline(t.monthly) + '</td><td><span class="pill ' + t.label.split(' ')[0].toLowerCase() + '">' + esc(t.label) + '</span></td></tr>';
      }).join('') + '</tbody></table>' : '<p class="empty">No cases in the last 24 months of the window.</p>';

    var cs = A.complicationSummary(list);
    function pct(w) { return w.p === null ? '—' : (w.p * 100).toFixed(1) + '% <span class="muted small">(' + (w.lo * 100).toFixed(1) + '–' + (w.hi * 100).toFixed(1) + ')</span>'; }
    $('#complications').innerHTML = cs.length ? '<table class="tbl"><thead><tr><th>Domain</th><th>Cases</th><th>Outcome recorded</th><th>Any complication</th><th>Clavien–Dindo ≥ III</th></tr></thead><tbody>' +
      cs.map(function (c) { return '<tr><td>' + esc(c.name) + '</td><td>' + c.n + '</td><td>' + c.known + '</td><td>' + c.any + ' · ' + pct(c.anyRate) + '</td><td>' + c.major + ' · ' + pct(c.majorRate) + '</td></tr>'; }).join('') +
      '</tbody></table>' : '<p class="empty">No data.</p>';
  }

  // ---------- entry form ----------
  function formData() {
    var f = $('#entryForm'), raw = {};
    IO.FIELDS.forEach(function (k) { if (f[k]) raw[k] = f[k].value; });
    return raw;
  }
  function setForm(e) {
    var f = $('#entryForm');
    IO.FIELDS.forEach(function (k) { if (f[k]) f[k].value = e[k] == null ? '' : e[k]; });
    procedureList(f.domain.value);
  }
  function resetForm(keep) {
    var f = $('#entryForm'), kept = {};
    if (keep) ['date', 'facility', 'setting', 'urgency', 'domain', 'role', 'anaesthesia', 'supervisorTrainee'].forEach(function (k) { kept[k] = f[k].value; });
    f.reset();
    f.id.value = '';
    f.date.value = kept.date || today();
    f.facility.value = kept.facility || state.settings.defaultFacility || '';
    f.complication.value = 'UNK';
    Object.keys(kept).forEach(function (k) { f[k].value = kept[k]; });
    $('#formTitle').textContent = 'New log entry';
    procedureList(f.domain.value);
  }

  function saveEntry(keep) {
    var raw = formData(), existing = raw.id ? S.get(raw.id) : null;
    if (existing) { raw.createdAt = existing.createdAt; }
    var e = IO.normalise(raw);
    e.updatedAt = new Date().toISOString();
    var errs = IO.validate(e), msg = $('#formMsg');
    if (errs.length) return flash(msg, errs.join('; '), true);
    S.put(e).then(function () {
      flash(msg, existing ? 'Entry updated.' : 'Entry saved.');
      refreshFacilities();
      if (existing && !keep) { resetForm(false); showTab('records'); }
      else resetForm(keep);
    }).catch(function (err) { flash(msg, 'Save failed: ' + err, true); });
  }

  function edit(id) {
    var e = S.get(id); if (!e) return;
    showTab('entry'); setForm(e);
    $('#formTitle').textContent = 'Edit entry (' + e.date + ')';
  }

  // ---------- records ----------
  function renderRecords() {
    var f = filters(); f.text = $('#search').value;
    var list = A.applyFilter(S.all(), f).slice(), k = state.sort.key, d = state.sort.dir;
    list.sort(function (a, b) { var x = a[k] || '', y = b[k] || ''; return x < y ? -d : x > y ? d : 0; });
    var pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    if (state.page >= pages) state.page = pages - 1;
    var slice = list.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);
    $('#recCount').textContent = list.length + ' of ' + S.all().length + ' records';
    $('#pageInfo').textContent = 'Page ' + (state.page + 1) + ' / ' + pages;
    $('#recTable tbody').innerHTML = slice.map(function (e) {
      return '<tr><td>' + esc(e.date) + '</td><td>' + esc(e.patientName || e.patientRef || '') + (e.mrn ? ' <span class="muted small">' + esc(e.mrn) + '</span>' : '') + '</td><td>' + esc(T.domainName(e.domain)) + '</td><td title="' + esc(e.diagnosis || '') + '">' + esc(e.procedure) + (e.additional ? ' <span class="muted small">' + esc(e.additional) + '</span>' : '') +
        '</td><td title="' + esc(T.roleLabel(e.role)) + '">' + esc(e.role) + '</td><td>' + esc(e.approach) + '</td><td>' + esc(e.complexity) + '</td><td>' + esc(e.facility) + '</td><td>' + esc(e.complication === 'NONE' ? '–' : e.complication) +
        '</td><td class="nowrap"><button class="ghost sm" data-edit="' + esc(e.id) + '">Edit</button><button class="ghost sm" data-del="' + esc(e.id) + '">Delete</button></td></tr>';
    }).join('') || '<tr><td colspan="10" class="empty">No records match.</td></tr>';
    $$('#recTable th').forEach(function (th) { th.classList.toggle('sorted', th.dataset.sort === k); th.dataset.dir = th.dataset.sort === k ? (d > 0 ? '▲' : '▼') : ''; });
    state.lastRecordList = list;
  }

  // ---------- privileging ----------
  function renderPrivileging() {
    var f = filters(), s = state.settings, list = filtered();
    var sum = A.privilegingSummary(list), o = A.overview(list), all = $('#privShowAll').checked;
    $('#privHeader').innerHTML = '<h2>Summary of operative &amp; procedural experience</h2>' +
      '<table class="meta"><tr><td>Name</td><td>' + esc(s.name || '—') + '</td><td>Registration no.</td><td>' + esc(s.regNo || '—') + '</td></tr>' +
      '<tr><td>Position</td><td>' + esc(s.position || '—') + '</td><td>Facility filter</td><td>' + esc(f.facility || 'All facilities') + '</td></tr>' +
      '<tr><td>Period</td><td>' + esc((f.from || o.first || '—') + ' to ' + (f.to || o.last || '—')) + '</td><td>Generated</td><td>' + esc(today()) + '</td></tr></table>' +
      '<p class="small">Totals: <b>' + o.total + '</b> procedures — performed ' + o.performed + ', supervised trainee ' + o.supervised + ', assisted ' + o.assisted + ', observed ' + o.observed + '. ' +
      'Roles: P = performed independently; PS = performed under senior supervision; ST/SU = supervised a trainee (scrubbed / unscrubbed); A = assisted; O = observed. ' +
      'Major compl. = Clavien–Dindo ≥ III over entries with a recorded outcome.</p>';
    $('#privBody').innerHTML = sum.map(function (d) {
      var procs = all ? d.procedures : d.procedures.slice(0, 25), t = d.totals;
      return '<h3 class="domain-h">' + esc(d.name) + ' <span class="muted small">(' + t.total + ')</span></h3><table class="tbl priv"><thead><tr><th>Procedure</th>' + ROLE_KEYS.map(function (r) { return '<th title="' + esc(ROLE_SHORT[r]) + '">' + r + '</th>'; }).join('') +
        '<th>Total</th><th>Last done</th><th>Major compl.</th></tr></thead><tbody>' +
        procs.map(function (p) { return '<tr><td>' + esc(p.procedure) + '</td>' + ROLE_KEYS.map(function (r) { return '<td>' + (p[r] || '') + '</td>'; }).join('') + '<td><b>' + p.total + '</b></td><td>' + esc(p.last) + '</td><td>' + (p.known ? p.complications + '/' + p.known : '—') + '</td></tr>'; }).join('') +
        (procs.length < d.procedures.length ? '<tr><td colspan="10" class="muted small">+ ' + (d.procedures.length - procs.length) + ' other procedures (tick "show every procedure")</td></tr>' : '') +
        '</tbody><tfoot><tr><td>Domain total</td>' + ROLE_KEYS.map(function (r) { return '<td>' + t[r] + '</td>'; }).join('') + '<td>' + t.total + '</td><td colspan="2"></td></tr></tfoot></table>';
    }).join('') || '<p class="empty">No records in this period.</p>';
    state.lastPriv = sum;
    state.lastPrivList = list.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    $('#privCaseList').innerHTML = $('#privCases').checked ? '<h3 class="domain-h case-h">Appendix — case list for verification (' + list.length + ')</h3><p class="small muted">Contains patient identifiers. Confidential — for the credentialing committee only.</p>' +
      '<table class="tbl cases"><thead><tr><th>#</th><th>Date</th><th>Patient name</th><th>NRIC / ID</th><th>HRN</th><th>Procedure</th><th>Role</th><th>Facility</th></tr></thead><tbody>' +
      state.lastPrivList.map(function (e, i) { return '<tr><td>' + (i + 1) + '</td><td>' + esc(e.date) + '</td><td>' + esc(e.patientName) + '</td><td>' + esc(e.patientId) + '</td><td>' + esc(e.mrn) + '</td><td>' + esc(e.procedure) + '</td><td>' + esc(e.role) + '</td><td>' + esc(e.facility) + '</td></tr>'; }).join('') +
      '</tbody></table>' : '';
  }

  function casesCsv() {
    var cols = ['date', 'patientName', 'patientId', 'mrn', 'patientRef', 'facility', 'domain', 'procedure', 'role', 'supervisorTrainee', 'diagnosis'];
    return '\uFEFF' + [cols.join(',')].concat((state.lastPrivList || []).map(function (e) {
      return cols.map(function (k) { var c = k === 'domain' ? T.domainName(e.domain) : String(e[k] || ''); if (/^[=+\-@]/.test(c)) c = "'" + c; return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(',');
    })).join('\r\n');
  }

  function privCsv() {
    var rows = [['domain', 'procedure'].concat(ROLE_KEYS, ['total', 'last_done', 'major_complications', 'outcome_recorded'])];
    (state.lastPriv || []).forEach(function (d) { d.procedures.forEach(function (p) { rows.push([d.name, p.procedure].concat(ROLE_KEYS.map(function (r) { return p[r]; }), [p.total, p.last, p.complications, p.known])); }); });
    return '﻿' + rows.map(function (r) { return r.map(function (c) { c = String(c); return /[",\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c; }).join(','); }).join('\r\n');
  }

  // ---------- CV ----------
  function renderCv() {
    var f = filters();
    $('#cvText').textContent = A.cvSummary(filtered(), { from: f.from, to: f.to, name: state.settings.name, topPerDomain: Number($('#cvTop').value) || 0 });
  }

  // ---------- data ----------
  function renderData() {
    var s = state.settings, f = $('#settingsForm');
    ['name', 'regNo', 'position', 'defaultFacility'].forEach(function (k) { f[k].value = s[k] || ''; });
    $('#backend').textContent = S.backend() + ', ' + S.all().length + ' records';
    $('#lastBackup').innerHTML = s.lastBackup ? 'Last JSON backup: <b>' + esc(s.lastBackup.slice(0, 16).replace('T', ' ')) + '</b>' : '<span class="bad">No backup exported from this browser yet.</span>';
  }

  function doImport(file) {
    var rep = $('#importReport'); rep.textContent = 'Reading ' + file.name + '…';
    var reader = new FileReader();
    reader.onload = function () {
      var res;
      try { res = /\.json$/i.test(file.name) ? IO.fromJSON(reader.result) : IO.fromCSV(reader.result); }
      catch (err) { rep.textContent = 'Could not read file: ' + err.message; return; }
      var updates = res.ok.filter(function (e) { return S.get(e.id); }).length;
      var lines = [res.ok.length + ' valid rows (' + (res.ok.length - updates) + ' new, ' + updates + ' updates), ' + res.errors.length + ' rejected.'];
      res.errors.slice(0, 50).forEach(function (er) { lines.push('  row ' + er.row + ': ' + er.messages.join('; ')); });
      if (res.errors.length > 50) lines.push('  … ' + (res.errors.length - 50) + ' more');
      if (!res.ok.length) { rep.textContent = lines.join('\n'); return; }
      if (!confirm(lines[0] + '\n\nImport the valid rows now?')) { rep.textContent = lines.join('\n') + '\nImport cancelled.'; return; }
      S.putMany(res.ok).then(function () { rep.textContent = lines.join('\n') + '\nImported.'; afterDataChange(); });
    };
    reader.readAsText(file);
  }

  function afterDataChange() { refreshFacilities(); procedureList($('#entryForm').domain.value); render(); }

  // ---------- events ----------
  function bind() {
    $$('.tabs button').forEach(function (b) { b.addEventListener('click', function () { if (b.dataset.tab === 'entry' && !$('#entryForm').id.value) resetForm(false); showTab(b.dataset.tab); }); });
    ['#fFrom', '#fTo', '#fFacility', '#fRole', '#fDomain', '#fApproach'].forEach(function (s) { $(s).addEventListener('change', function () { if (s === '#fFrom' || s === '#fTo') $('#fQuick').value = ''; state.page = 0; render(); }); });
    $('#fQuick').addEventListener('change', function () { quick(this.value); state.page = 0; render(); });
    $('#fReset').addEventListener('click', function () { ['#fFrom', '#fTo', '#fQuick', '#fFacility', '#fRole', '#fDomain', '#fApproach'].forEach(function (s) { $(s).value = ''; }); render(); });
    $$('#tsPeriod button').forEach(function (b) { b.addEventListener('click', function () { state.tsPeriod = b.dataset.p; $$('#tsPeriod button').forEach(function (x) { x.classList.toggle('active', x === b); }); renderDashboard(); }); });

    var f = $('#entryForm');
    f.addEventListener('submit', function (ev) { ev.preventDefault(); saveEntry(false); });
    $('#saveAnother').addEventListener('click', function () { if (f.reportValidity()) saveEntry(true); });
    $('#cancelEdit').addEventListener('click', function () { resetForm(false); });
    f.domain.addEventListener('change', function () { procedureList(f.domain.value); });
    f.procedure.addEventListener('change', function () {
      var k = T.findProcedure(f.procedure.value); if (!k) return;
      if (!f.domain.value) f.domain.value = k.domain;
      f.approach.value = k.approach; f.complexity.value = String(k.complexity);
    });

    $('#search').addEventListener('input', function () { state.page = 0; renderRecords(); });
    $$('#recTable th[data-sort]').forEach(function (th) { th.addEventListener('click', function () { var k = th.dataset.sort; state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : 1 }; renderRecords(); }); });
    $('#recTable').addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.dataset.edit) edit(t.dataset.edit);
      if (t.dataset.del) { var e = S.get(t.dataset.del); if (e && confirm('Delete ' + e.date + ' — ' + e.procedure + '?')) S.remove(e.id).then(afterDataChange); }
    });
    $('#prevPage').addEventListener('click', function () { if (state.page > 0) { state.page--; renderRecords(); } });
    $('#nextPage').addEventListener('click', function () { state.page++; renderRecords(); });
    $('#exportFilteredCsv').addEventListener('click', function () { download('logbook-filtered-' + today() + '.csv', IO.toCSV(state.lastRecordList || []), 'text/csv'); });

    $('#printPriv').addEventListener('click', function () { window.print(); });
    $('#csvPriv').addEventListener('click', function () { download('privileging-summary-' + today() + '.csv', privCsv(), 'text/csv'); });
    $('#privShowAll').addEventListener('change', renderPrivileging);
    $('#privCases').addEventListener('change', renderPrivileging);
    $('#csvCases').addEventListener('click', function () { download('case-list-CONFIDENTIAL-' + today() + '.csv', casesCsv(), 'text/csv'); });

    $('#cvTop').addEventListener('change', renderCv);
    $('#copyCv').addEventListener('click', function () { navigator.clipboard.writeText($('#cvText').textContent).then(function () { $('#copyCv').textContent = 'Copied ✓'; setTimeout(function () { $('#copyCv').textContent = 'Copy to clipboard'; }, 2000); }); });
    $('#dlCv').addEventListener('click', function () { download('operative-experience-' + today() + '.txt', $('#cvText').textContent); });

    $('#settingsForm').addEventListener('submit', function (ev) {
      ev.preventDefault(); var sf = ev.target;
      ['name', 'regNo', 'position', 'defaultFacility'].forEach(function (k) { state.settings[k] = sf[k].value.trim(); });
      S.saveSettings(state.settings); updateOwner(); flash($('#setMsg'), 'Saved.');
    });
    $('#exportJson').addEventListener('click', function () {
      download('surgical-logbook-backup-' + today() + '.json', IO.toJSON(S.all(), { owner: state.settings.name || '' }), 'application/json');
      state.settings.lastBackup = new Date().toISOString(); S.saveSettings(state.settings); renderData();
    });
    $('#exportCsv').addEventListener('click', function () { download('surgical-logbook-' + today() + '.csv', IO.toCSV(S.all()), 'text/csv'); });
    $('#importFile').addEventListener('change', function () { if (this.files[0]) doImport(this.files[0]); this.value = ''; });
    $('#loadDemo').addEventListener('click', function () { S.putMany(SLB.demo.generate(600, today(), 7).map(IO.normalise)).then(afterDataChange).then(function () { showTab('dashboard'); }); });
    $('#removeDemo').addEventListener('click', function () {
      var ids = S.all().filter(function (e) { return /(^|,)\s*demo\s*(,|$)/.test(e.tags); }).map(function (e) { return e.id; });
      if (!ids.length) return alert('No demo entries found.');
      if (!confirm('Remove ' + ids.length + ' demo entries?')) return;
      ids.reduce(function (p, id) { return p.then(function () { return S.remove(id); }); }, Promise.resolve()).then(afterDataChange);
    });
    $('#wipe').addEventListener('click', function () {
      var n = S.all().length; if (!n) return;
      var typed = prompt('This permanently deletes ' + n + ' records from this browser.\nType DELETE to confirm.');
      if (typed === 'DELETE') S.clear().then(afterDataChange);
    });
  }

  function updateOwner() {
    var s = state.settings;
    $('#ownerLine').textContent = s.name ? s.name + (s.position ? ' · ' + s.position : '') : 'Plastic, Reconstructive & Burns Surgery · Wound Care';
  }

  // ---------- boot ----------
  state.settings = S.getSettings();
  fillSelects(); bind();
  S.load().then(function () {
    S.requestPersistence();
    refreshFacilities(); updateOwner(); resetForm(false);
    showTab(S.all().length ? 'dashboard' : 'entry');
  });
})();
