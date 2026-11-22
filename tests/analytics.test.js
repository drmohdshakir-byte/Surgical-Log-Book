// Run: node tests/analytics.test.js   (no dependencies)
'use strict';
var assert = require('assert');
var T = require('../js/taxonomy.js');
var A = require('../js/analytics.js');
var IO = require('../js/io.js');
var D = require('../js/demo.js');
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

console.log('\n' + passed + ' passed' + (process.exitCode ? ', some FAILED' : ''));
