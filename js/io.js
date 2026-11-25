/*
 * Surgical Log Book — record schema, validation, CSV/JSON import & export.
 */
(function (root) {
  'use strict';
  var T = (root.SLB && root.SLB.taxonomy) || (typeof require !== 'undefined' ? require('./taxonomy.js') : null);

  var SCHEMA_VERSION = 1;

  // Order here = CSV column order. See docs/DATA-DICTIONARY.md
  // The first 14 (after id) are the owner's core register columns, in report order.
  var FIELDS = ['id', 'date', 'patientName', 'patientId', 'age', 'sex', 'diagnosis', 'procedure', 'domain', 'registry',
    'complexity', 'role', 'urgency', 'anaesthesia', 'remark',
    'complication', 'facility', 'setting', 'mrn', 'patientRef', 'icd10', 'additional', 'approach', 'supervisorTrainee',
    'laterality', 'durationMin', 'tbsa', 'tags', 'notes', 'createdAt', 'updatedAt'];

  // Core register columns (report table order) with display headings
  var CORE = [['date', 'Date'], ['patientName', 'Name'], ['patientId', 'NRIC / ID'], ['age', 'Age'], ['sex', 'Sex'],
    ['diagnosis', 'Diagnosis'], ['procedure', 'Procedure'], ['domain', 'Domain'], ['registry', 'Registry'],
    ['complexity', 'Complexity'], ['role', 'Role'], ['urgency', 'Urgency'], ['anaesthesia', 'Anaesthesia'],
    ['remark', 'Remark (outcome / complication)']];

  // Older column names still accepted on import
  var LEGACY = { outcome: 'outcome' };

  var REQUIRED = ['date', 'domain', 'procedure', 'role'];

  function uuid() {
    if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function clean(v) { return v === undefined || v === null ? '' : String(v).trim(); }

  // Accept DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, YYYY/MM/DD. Returns ISO or ''.
  function parseDate(s) {
    s = clean(s); if (!s) return '';
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
    if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    return '';
  }

  function validDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
    var d = new Date(iso + 'T00:00:00');
    return !isNaN(d) && d.toISOString().slice(0, 10) === iso;
  }

  // Map free-text values from spreadsheets to codes where unambiguous.
  function codeFrom(list, v, key) {
    v = clean(v); if (!v) return '';
    var lv = v.toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var c = String(list[i][key || 'code']);
      if (c.toLowerCase() === lv || String(list[i].label || list[i].name || '').toLowerCase() === lv) return list[i][key || 'code'];
    }
    return v;
  }

  function normalise(raw) {
    var e = {};
    FIELDS.forEach(function (f) { e[f] = clean(raw[f]); });
    // Migrations from earlier versions
    if (!e.registry && /^Registry:\s*/.test(e.additional)) { e.registry = e.additional.replace(/^Registry:\s*/, ''); e.additional = ''; }
    if (!e.remark && clean(raw.outcome)) e.remark = clean(raw.outcome);
    e.date = parseDate(e.date) || e.date;
    e.role = String(codeFrom(T.ROLES, e.role)).toUpperCase();
    e.approach = String(codeFrom(T.APPROACHES, e.approach)).toUpperCase();
    e.domain = codeFrom(T.DOMAINS, e.domain);
    e.complication = e.complication ? codeFrom(T.COMPLICATIONS, e.complication) : '';
    var cx = codeFrom(T.COMPLEXITY, e.complexity); e.complexity = cx === '' ? '' : String(cx);
    // Fill domain/approach/complexity from the taxonomy if the procedure is known and fields are blank
    var known = T.findProcedure(e.procedure);
    if (known) {
      if (!e.domain) e.domain = known.domain;
      if (!e.approach) e.approach = known.approach;
      if (!e.complexity) e.complexity = String(known.complexity);
    }
    if (!e.id) e.id = uuid();
    var now = new Date().toISOString();
    if (!e.createdAt) e.createdAt = now;
    if (!e.updatedAt) e.updatedAt = e.createdAt;
    return e;
  }

  function validate(e) {
    var errs = [];
    REQUIRED.forEach(function (f) { if (!e[f]) errs.push(f + ' is required'); });
    if (e.date && !validDate(e.date)) errs.push('date "' + e.date + '" is not a valid date (use YYYY-MM-DD or DD/MM/YYYY)');
    if (e.date && validDate(e.date) && e.date > new Date(Date.now() + 864e5).toISOString().slice(0, 10)) errs.push('date is in the future');
    if (e.role && !T.ROLES.some(function (r) { return r.code === e.role; })) errs.push('role "' + e.role + '" not recognised (use P, PS, ST, SU, A, O)');
    if (e.approach && !T.APPROACHES.some(function (r) { return r.code === e.approach; })) errs.push('approach "' + e.approach + '" not recognised (use INV, MIN, NON)');
    if (e.domain && !T.domainByCode(e.domain)) errs.push('domain "' + e.domain + '" not recognised');
    if (e.complexity && !/^[1-4]$/.test(e.complexity)) errs.push('complexity must be 1–4');
    if (e.age && (isNaN(Number(e.age)) || Number(e.age) < 0 || Number(e.age) > 120)) errs.push('age must be 0–120');
    if (e.durationMin && (isNaN(Number(e.durationMin)) || Number(e.durationMin) < 0)) errs.push('durationMin must be a positive number');
    if (e.tbsa && (isNaN(Number(e.tbsa)) || Number(e.tbsa) < 0 || Number(e.tbsa) > 100)) errs.push('tbsa must be 0–100');
    if (e.complication && !T.COMPLICATIONS.some(function (c) { return c.code === e.complication; })) errs.push('complication "' + e.complication + '" not recognised');
    return errs;
  }

  // RFC 4180 CSV parser (handles quotes, escaped quotes, CRLF, embedded newlines)
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var rows = [], row = [], field = '', i = 0, q = false, ch;
    while (i < text.length) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i += 2; continue; } q = false; i++; continue; }
        field += ch; i++; continue;
      }
      if (ch === '"') { q = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += ch; i++;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (c) { return c.trim() !== ''; }); });
  }

  function csvCell(v) {
    v = clean(v);
    // Neutralise spreadsheet formula injection
    if (/^[=+\-@\t]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = "'" + v;
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function toCSV(entries) {
    var out = [FIELDS.join(',')];
    entries.forEach(function (e) { out.push(FIELDS.map(function (f) { return csvCell(e[f]); }).join(',')); });
    return '﻿' + out.join('\r\n') + '\r\n';
  }

  // Returns { ok: [entries], errors: [{row, messages}] }
  function fromCSV(text) {
    var rows = parseCSV(text); if (!rows.length) return { ok: [], errors: [{ row: 0, messages: ['empty file'] }] };
    var header = rows[0].map(function (h) { return h.trim(); });
    var lowerMap = {}; FIELDS.forEach(function (f) { lowerMap[f.toLowerCase()] = f; });
    Object.keys(LEGACY).forEach(function (k) { lowerMap[k] = LEGACY[k]; });
    CORE.forEach(function (c) { lowerMap[c[1].toLowerCase()] = c[0]; });
    var idx = header.map(function (h) { return lowerMap[h.toLowerCase()] || null; });
    if (idx.indexOf('date') === -1 || idx.indexOf('procedure') === -1) return { ok: [], errors: [{ row: 1, messages: ['header must contain at least "date" and "procedure" columns — use templates/import-template.csv'] }] };
    var ok = [], errors = [];
    for (var r = 1; r < rows.length; r++) {
      var raw = {}; idx.forEach(function (f, c) { if (f) raw[f] = (rows[r][c] || '').replace(/^'(?=[=+\-@])/, ''); });
      var e = normalise(raw), errs = validate(e);
      if (errs.length) errors.push({ row: r + 1, messages: errs }); else ok.push(e);
    }
    return { ok: ok, errors: errors };
  }

  function toJSON(entries, meta) {
    return JSON.stringify({ app: 'surgical-log-book', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), meta: meta || {}, entries: entries }, null, 2);
  }

  function fromJSON(text) {
    var data = JSON.parse(text);
    var list = Array.isArray(data) ? data : data.entries;
    if (!Array.isArray(list)) throw new Error('No "entries" array found in file');
    var ok = [], errors = [];
    list.forEach(function (raw, i) {
      var e = normalise(raw), errs = validate(e);
      if (errs.length) errors.push({ row: i + 1, messages: errs }); else ok.push(e);
    });
    return { ok: ok, errors: errors, meta: data.meta || {} };
  }

  var api = { SCHEMA_VERSION: SCHEMA_VERSION, FIELDS: FIELDS, CORE: CORE, REQUIRED: REQUIRED, uuid: uuid, parseDate: parseDate, validDate: validDate,
    normalise: normalise, validate: validate, parseCSV: parseCSV, toCSV: toCSV, fromCSV: fromCSV, toJSON: toJSON, fromJSON: fromJSON };
  root.SLB = root.SLB || {};
  root.SLB.io = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
