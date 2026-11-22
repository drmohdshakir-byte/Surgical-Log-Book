/*
 * Synthetic demo data generator — NOT real patients. Deterministic (seeded).
 * Every generated entry is tagged "demo" so it can be removed in one step.
 */
(function (root) {
  'use strict';
  var T = (root.SLB && root.SLB.taxonomy) || (typeof require !== 'undefined' ? require('./taxonomy.js') : null);

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function generate(n, endDate, seed) {
    var r = rng(seed || 42), out = [];
    var weights = { 'BURN-AC': 14, 'BURN-RC': 6, HAND: 16, MICRO: 6, LYMPH: 1, NERVE: 2, HN: 4, CRANIO: 3, FTRAUMA: 3, SKINONC: 9, BREAST: 4, LOWLIMB: 5, TRUNK: 4, AESTH: 3, GENITO: 1, VASCANOM: 2, WOUND: 14, GENRECON: 5 };
    var pool = []; Object.keys(weights).forEach(function (k) { for (var i = 0; i < weights[k]; i++) pool.push(k); });
    var facilities = ['Hospital A (tertiary)', 'Hospital B (district)', 'Outreach clinic C'];
    var end = new Date((endDate || new Date().toISOString().slice(0, 10)) + 'T00:00:00').getTime(), span = 5 * 365 * 864e5;
    function pick(a) { return a[Math.floor(r() * a.length)]; }
    for (var i = 0; i < n; i++) {
      var d = T.domainByCode(pick(pool)), p = pick(d.procedures);
      // gentle growth over time: later dates more likely
      var t = end - span * (1 - Math.sqrt(r()));
      var roleRoll = r(), yearsIn = (t - (end - span)) / span;
      var role = roleRoll < 0.40 + 0.15 * yearsIn ? 'P' : roleRoll < 0.55 ? 'ST' : roleRoll < 0.68 ? 'SU' : roleRoll < 0.85 ? 'PS' : roleRoll < 0.97 ? 'A' : 'O';
      var compRoll = r();
      var comp = compRoll < 0.12 ? 'UNK' : compRoll < 0.84 ? 'NONE' : compRoll < 0.92 ? 'CD-I' : compRoll < 0.96 ? 'CD-II' : compRoll < 0.98 ? 'CD-IIIa' : 'CD-IIIb';
      out.push({
        id: 'demo-' + i, date: new Date(t).toISOString().slice(0, 10), facility: r() < 0.7 ? facilities[0] : r() < 0.8 ? facilities[1] : facilities[2],
        setting: p[2] >= 3 ? 'Main OT' : pick(['Daycare OT', 'Procedure room / clinic', 'Ward / bedside', 'Main OT']),
        patientRef: 'DEMO' + (1000 + i), age: String(Math.floor(r() * 80) + 1), sex: r() < 0.55 ? 'M' : 'F',
        diagnosis: 'Synthetic case', icd10: '', domain: d.code, procedure: p[0], additional: '', approach: p[1], complexity: String(p[2]),
        role: role, supervisorTrainee: '', urgency: d.code === 'BURN-AC' || d.code === 'FTRAUMA' || r() < 0.2 ? 'Emergency' : 'Elective',
        anaesthesia: p[2] >= 3 ? 'GA' : pick(['Local (LA)', 'WALANT', 'Regional block', 'GA']), laterality: '',
        durationMin: String(Math.round((20 + p[2] * p[2] * 25 * (0.6 + r())) / 5) * 5), tbsa: d.code === 'BURN-AC' ? String(Math.round(r() * 40 + 2)) : '',
        complication: comp, outcome: '', tags: 'demo', notes: '', createdAt: new Date(t).toISOString(), updatedAt: new Date(t).toISOString()
      });
    }
    return out;
  }

  root.SLB = root.SLB || {};
  root.SLB.demo = { generate: generate };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SLB.demo;
})(typeof window !== 'undefined' ? window : globalThis);
