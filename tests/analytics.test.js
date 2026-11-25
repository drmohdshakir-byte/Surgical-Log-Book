// Run: node tests/analytics.test.js   (no dependencies)
'use strict';
var assert = require('assert');
var T = require('../js/taxonomy.js');
var A = require('../js/analytics.js');
var IO = require('../js/io.js');
var D = require('../js/demo.js');
var R = require('../js/registry.js');
var fs = require('fs'), path = require('path');

var passed = 0;
function test(name, fn) { try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; } }

function e(o) { return IO.normalise(Object.assign({ date: '2025-01-15', domain: 'HAND', procedure: 'Carpal tunnel release', role: 'P', approach: 'INV' }, o)); }

console.log('io');
test('parseDate handles DD/MM/YYYY and ISO', function () {
  assert.strictEqual(IO.parseDate('3/7/2024'), '2024-07-03');
  assert.strictEqual(IO.parseDate('2024-07-03'), '2024-07-03');
  assert.strictEqual(IO.parseDate('2024/7/3'), '2024-07-03');
  assert.strictEqual(IO.parseDate('nonsense'), '');
});
test('validate rejects impossible dates and unknown codes', function () {
  assert.ok(IO.validate(e({ date: '2024-02-30' })).length);
  assert.ok(IO.validate(e({ role: 'X' })).length);
  assert.deepStrictEqual(IO.validate(e({})), []);
});
test('normalise fills domain/approach/complexity from known procedure', function () {
  var x = IO.normalise({ date: '2024-01-01', procedure: 'free alt flap', role: 'P' });
  assert.strictEqual(x.domain, 'MICRO'); assert.strictEqual(x.approach, 'INV'); assert.strictEqual(x.complexity, '4');
});
test('normalise maps role/approach labels to codes', function () {
  var x = IO.normalise({ date: '2024-01-01', procedure: 'Liposuction', role: 'assisted', approach: 'Minimally invasive (percutaneous, endoscopic, injection, cannula)' });
  assert.strictEqual(x.role, 'A'); assert.strictEqual(x.approach, 'MIN');
});
test('CSV round-trip preserves commas, quotes and newlines', function () {
  var src = [e({ notes: 'line1\nline2, "quoted"', diagnosis: 'a,b' })];
  var back = IO.fromCSV(IO.toCSV(src));
  assert.strictEqual(back.errors.length, 0);
  assert.strictEqual(back.ok[0].notes, src[0].notes);
  assert.strictEqual(back.ok[0].diagnosis, 'a,b');
  assert.strictEqual(back.ok[0].id, src[0].id);
});
test('CSV export neutralises formula injection and import restores it', function () {
  var csv = IO.toCSV([e({ notes: '=HYPERLINK("x")' })]);
  assert.ok(csv.indexOf("'=HYPERLINK") !== -1);
  assert.strictEqual(IO.fromCSV(csv).ok[0].notes, '=HYPERLINK("x")');
});
test('CSV import reports row-level errors', function () {
  var r = IO.fromCSV('date,procedure,role,domain,approach\n2024-01-01,Carpal tunnel release,P,HAND,INV\n2024-13-01,X,P,HAND,INV\n');
  assert.strictEqual(r.ok.length, 1); assert.strictEqual(r.errors.length, 1); assert.strictEqual(r.errors[0].row, 3);
});
test('import template parses cleanly', function () {
  var r = IO.fromCSV(fs.readFileSync(path.join(__dirname, '..', 'templates', 'import-template.csv'), 'utf8'));
  assert.strictEqual(r.errors.length, 0, JSON.stringify(r.errors)); assert.ok(r.ok.length >= 3);
});
test('patient identifiers survive CSV round-trip and are searchable', function () {
  var x = e({ patientName: 'TEST PATIENT', patientId: '010101-01-0101', mrn: 'H123' });
  var back = IO.fromCSV(IO.toCSV([x])).ok[0];
  assert.strictEqual(back.patientName, 'TEST PATIENT'); assert.strictEqual(back.patientId, '010101-01-0101'); assert.strictEqual(back.mrn, 'H123');
  assert.strictEqual(A.applyFilter([back], { text: 'h123' }).length, 1);
});
test('JSON round-trip', function () {
  var src = [e({}), e({ role: 'ST' })];
  var back = IO.fromJSON(IO.toJSON(src));
  assert.strictEqual(back.ok.length, 2); assert.strictEqual(back.ok[1].role, 'ST');
});

console.log('analytics');
var data = [
  e({ date: '2023-03-01', role: 'P' }), e({ date: '2023-03-20', role: 'A' }), e({ date: '2024-06-01', role: 'ST', domain: 'BURN-AC', procedure: 'Escharotomy' }),
  e({ date: '2024-06-02', role: 'SU', complication: 'CD-IIIb' }), e({ date: '2025-01-01', role: 'PS', complication: 'NONE' })
];
test('applyFilter by date, role group and text', function () {
  assert.strictEqual(A.applyFilter(data, { from: '2024-01-01' }).length, 3);
  assert.strictEqual(A.applyFilter(data, { role: 'group:Supervised' }).length, 2);
  assert.strictEqual(A.applyFilter(data, { role: 'P' }).length, 1);
  assert.strictEqual(A.applyFilter(data, { text: 'eschar' }).length, 1);
});
test('series fills empty months and accumulates', function () {
  var s = A.series(data, 'month');
  assert.strictEqual(s[0].period, '2023-03'); assert.strictEqual(s[0].count, 2);
  assert.strictEqual(s[s.length - 1].period, '2025-01'); assert.strictEqual(s[s.length - 1].cumulative, 5);
  assert.strictEqual(s.length, 23);
  assert.strictEqual(A.series(data, 'year').map(function (x) { return x.count; }).join(), '2,2,1');
});
test('overview counts role groups', function () {
  var o = A.overview(data);
  assert.strictEqual(o.performed, 2); assert.strictEqual(o.supervised, 2); assert.strictEqual(o.assisted, 1);
  assert.strictEqual(o.first, '2023-03-01'); assert.strictEqual(o.last, '2025-01-01');
});
test('privilegingSummary splits roles and keeps last date', function () {
  var p = A.privilegingSummary(data), hand = p.filter(function (d) { return d.domain === 'HAND'; })[0];
  var ctr = hand.procedures[0];
  assert.strictEqual(ctr.total, 4); assert.strictEqual(ctr.P, 1); assert.strictEqual(ctr.PS, 1); assert.strictEqual(ctr.A, 1); assert.strictEqual(ctr.SU, 1);
  assert.strictEqual(ctr.performed, 2); assert.strictEqual(ctr.last, '2025-01-01');
  assert.strictEqual(ctr.complications, 1); assert.strictEqual(ctr.known, 2);
});
test('wilson interval matches reference values', function () {
  var w = A.wilson(1, 10); // reference: 0.0179 – 0.4042
  assert.ok(Math.abs(w.lo - 0.0179) < 0.0005 && Math.abs(w.hi - 0.4042) < 0.0005, JSON.stringify(w));
  assert.strictEqual(A.wilson(0, 0).p, null);
});
test('complicationSummary ignores unknown outcomes in denominator', function () {
  var c = A.complicationSummary(data).filter(function (x) { return x.domain === 'HAND'; })[0];
  assert.strictEqual(c.n, 4); assert.strictEqual(c.known, 2); assert.strictEqual(c.major, 1);
});
test('slope of linear series', function () { assert.ok(Math.abs(A.slope([1, 2, 3, 4]) - 1) < 1e-9); assert.strictEqual(A.slope([5]), 0); });
test('domainTrends windows and small-number guard', function () {
  var list = [];
  for (var i = 0; i < 6; i++) list.push(e({ date: '2023-0' + (i + 1) + '-10' }));
  for (var j = 0; j < 12; j++) list.push(e({ date: '2024-' + ('0' + (j + 1)).slice(-2) + '-10' }));
  var t = A.domainTrends(list, '2024-12-31', 12)[0];
  assert.strictEqual(t.previous, 6); assert.strictEqual(t.current, 12); assert.strictEqual(Math.round(t.changePct), 100); assert.strictEqual(t.label, 'Rising');
  var few = A.domainTrends([e({ date: '2024-05-01' })], '2024-12-31', 12)[0];
  assert.strictEqual(few.label, 'Too few to judge');
});
test('shiftDate clamps month ends', function () { assert.strictEqual(A.shiftDate('2024-03-31', -1), '2024-02-29'); assert.strictEqual(A.shiftDate('2024-01-15', -36), '2021-01-15'); });
test('cvSummary contains totals and domains', function () {
  var s = A.cvSummary(data, { name: 'Test' });
  assert.ok(/Total procedures logged: 5/.test(s)); assert.ok(s.indexOf('Hand & upper limb') !== -1);
});
test('demo data is valid and deterministic', function () {
  var a = D.generate(300, '2026-01-01', 3).map(IO.normalise), b = D.generate(300, '2026-01-01', 3);
  a.forEach(function (x) { assert.deepStrictEqual(IO.validate(x), [], x.id); });
  assert.strictEqual(a[10].procedure, b[10].procedure);
});
test('every taxonomy procedure has valid defaults', function () {
  T.DOMAINS.forEach(function (d) { d.procedures.forEach(function (p) { assert.ok(/^(INV|MIN|NON)$/.test(p[1]) && p[2] >= 1 && p[2] <= 4, p[0]); }); });
});


console.log('registry & yearly report');
test('legacy "Registry:" in additional and outcome migrate to registry/remark', function () {
  var x = IO.normalise({ date: '2026-01-02', procedure: 'Free ALT flap', role: 'P', additional: 'Registry: FREE ALT FLAP TO CHEEK', outcome: 'flap survived' });
  assert.strictEqual(x.registry, 'FREE ALT FLAP TO CHEEK'); assert.strictEqual(x.additional, ''); assert.strictEqual(x.remark, 'flap survived');
});
test('core columns are the owner\'s 14 fields in order', function () {
  assert.deepStrictEqual(IO.CORE.map(function (c) { return c[0]; }), ['date', 'patientName', 'patientId', 'age', 'sex', 'diagnosis', 'procedure', 'domain', 'registry', 'complexity', 'role', 'urgency', 'anaesthesia', 'remark']);
  assert.deepStrictEqual(IO.FIELDS.slice(1, 15), IO.CORE.map(function (c) { return c[0]; }));
});
test('CSV import accepts report headings (e.g. "NRIC / ID")', function () {
  var r = IO.fromCSV('Date,Name,NRIC / ID,Procedure,Domain,Role\n01/02/2026,A B,123,Carpal tunnel release,HAND,P\n');
  assert.strictEqual(r.ok.length, 1); assert.strictEqual(r.ok[0].patientId, '123'); assert.strictEqual(r.ok[0].patientName, 'A B');
});
test('remarkText combines remark and complication grade', function () {
  assert.strictEqual(A.remarkText({ remark: 'SSI', complication: 'CD-II' }), 'SSI; Clavien–Dindo II');
  assert.strictEqual(A.remarkText({ remark: '', complication: 'UNK' }), '');
});
test('yearReport: only that year, months, roles, previous-year comparison', function () {
  var list = [e({ date: '2026-01-05', role: 'P' }), e({ date: '2026-01-20', role: 'ST', urgency: 'Emergency' }), e({ date: '2026-03-02', role: 'A', complication: 'CD-IIIb' }), e({ date: '2025-07-01' })];
  var r = A.yearReport(list, 2026, { coreFields: IO.CORE });
  assert.strictEqual(r.entries.length, 3); assert.strictEqual(r.monthly[0].total, 2); assert.strictEqual(r.monthly[2].Assisted, 1);
  assert.strictEqual(r.overview.performed, 1); assert.strictEqual(r.previous.total, 1); assert.strictEqual(r.complications.major, 1);
  assert.strictEqual(r.domains.cols.length, 4);
  var urg = r.completeness.filter(function (c) { return c.field === 'Urgency'; })[0]; assert.strictEqual(urg.filled, 1); assert.strictEqual(urg.missing, 2);
  assert.ok(r.narrative.length >= 4);
  assert.strictEqual(A.yearReport(list, 2030).entries.length, 0);
});
test('excelDate converts serial numbers and text', function () {
  assert.strictEqual(R.excelDate(46057).date, '2026-02-04');
  var t = R.excelDate(46057.7013888889); assert.strictEqual(t.minutes, 16 * 60 + 50);
  assert.strictEqual(R.excelDate('2026-02-04 16:50:00').date, '2026-02-04');
  assert.strictEqual(R.excelDate(''), null);
});
test('classifier maps common operations', function () {
  function c(op, dx) { var x = R.classify(op, dx || ''); return x.domain + ' | ' + x.procedure; }
  assert.strictEqual(c('WOUND DEBRIDEMENT+MEEK SKIN GRAFT', '20% TBSA BURN'), 'BURN-AC | Meshed / Meek micrografting');
  assert.strictEqual(c('SOFT TISSUE RECONSTRUCTION WITH FREE ANTEROLATERAL THIGH FLAP'), 'MICRO | Free ALT flap');
  assert.strictEqual(c('SOFT TISSUE COVERAGE WITH REVERSED ALT FLAP'), 'LOWLIMB | Pedicled reverse ALT flap');
  assert.strictEqual(c('PALATOPLASTY + RIGHT BUCCAL FAT PAD', 'BCLP'), 'CRANIO | Cleft palate repair');
  assert.strictEqual(c('WIDE LOCAL EXCISION + LOCAL FLAP', 'BASAL CELL CARCINOMA'), 'SKINONC | Excision skin lesion + local flap');
  assert.strictEqual(c('SYNDCATYLY RELEASE AND FTSG', 'LEFT 4TH AND 5TH TOE SYNDACTYLY'), 'VASCANOM | Toe syndactyly release + full-thickness skin graft');
  assert.strictEqual(c('WOUND DEBRIDEMENT + BURRING OF SKULL + BTM AND NPWT', 'DOG BITE LACERATION SCALP'), 'WOUND | Dermal matrix application');
  assert.strictEqual(R.classify('SOMETHING UNUSUAL', '').domain, 'OTHER');
});
test('registryToEntries: name match in doctor columns only, role mapping, identifiers', function () {
  var H = ['SurgID', 'Date Entry', 'Name of Patient', 'NRIC', 'Date Of Birth', 'Gender', 'HRN', 'Pre-operative Diagnosis', 'Time Started', 'Time Ended', 'Operation',
    'Operating Doctor', 'Role Operating', 'Rank Operating', 'Doctor Involve_1', 'Role_1', 'Rank Doctor inv_1', 'General Anaesthesia', 'Location OT'];
  var rows = [H,
    [1, 46057, 'PATIENT ONE', '900101-01-1111', 32874, 'Male', 'H1', 'LEFT UCLP', 46057.375, 46057.5, 'LEFT LIP REPAIR', 'Dr Test Surgeon', 'Surgeon', 'Consultant', 'Dr Junior', '1st Assistant', 'Medical Officer', true, 'OT 10'],
    [2, 46058, 'PATIENT TWO', '900101-01-2222', 32874, 'Female', '', 'BCC NOSE', 46058.4, 46058.45, 'WLE + FTSG', 'Dr Specialist', 'Surgeon', 'Specialist', 'Dr Test Surgeon', 'Supervisor', 'Consultant', true, 'Kulai OT'],
    [3, 46058, 'TESTER PATIENT', '1', 32874, 'Male', '', 'X', 46058.4, 46058.45, 'WLE', 'Dr Other', 'Surgeon', 'Specialist', 'Dr Junior', '1st Assistant', 'MO', true, 'OT 1']];
  var res = R.registryToEntries(rows, 'test surgeon');
  assert.strictEqual(res.entries.length, 2, 'patient-name match must not count');
  var a = res.entries[0], b = res.entries[1];
  assert.strictEqual(a.id, 'reg2026-1'); assert.strictEqual(a.role, 'P'); assert.strictEqual(a.patientName, 'PATIENT ONE'); assert.strictEqual(a.patientId, '900101-01-1111');
  assert.strictEqual(a.mrn, 'H1'); assert.strictEqual(a.durationMin, '180'); assert.strictEqual(a.anaesthesia, 'GA'); assert.strictEqual(a.registry, 'LEFT LIP REPAIR');
  assert.strictEqual(a.domain, 'CRANIO'); assert.strictEqual(a.complication, 'UNK'); assert.strictEqual(a.urgency, ''); assert.strictEqual(a.age, '36');
  assert.strictEqual(b.role, 'ST'); assert.strictEqual(b.facility, 'Hospital Kulai'); assert.strictEqual(b.sex, 'F');
  res.entries.map(IO.normalise).forEach(function (x) { assert.deepStrictEqual(IO.validate(x), []); });
  assert.throws(function () { R.registryToEntries(rows, ''); });
});

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
