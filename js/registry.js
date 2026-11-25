/*
 * Surgical Log Book — yearly hospital registry import (.xlsx, sheet like `tbl_sur_reg`).
 * Reads the Excel file in the browser (no upload, no library), finds the cases
 * involving the owner, maps roles, auto-classifies domain/procedure from the
 * operation text, and returns log entries. Works in Node 18+ too (for tests).
 */
(function (root) {
  'use strict';
  var T = (root.SLB && root.SLB.taxonomy) || (typeof require !== 'undefined' ? require('./taxonomy.js') : null);

  // ---------------- minimal XLSX reader ----------------
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function inflateRaw(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Response(stream).arrayBuffer().then(function (ab) { return new Uint8Array(ab); });
  }

  function unzip(buf) {
    var b = new Uint8Array(buf), eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error('Not an .xlsx file (zip directory not found)'));
    var count = u16(b, eocd + 10), off = u32(b, eocd + 16), files = {}, jobs = [], dec = new TextDecoder();
    for (var k = 0; k < count; k++) {
      if (u32(b, off) !== 0x02014b50) break;
      var method = u16(b, off + 10), csize = u32(b, off + 20), nlen = u16(b, off + 28), xlen = u16(b, off + 30), clen = u16(b, off + 32), lho = u32(b, off + 42);
      var name = dec.decode(b.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + xlen + clen;
      if (!/\.(xml|rels)$/.test(name)) continue;
      var start = lho + 30 + u16(b, lho + 26) + u16(b, lho + 28), data = b.subarray(start, start + csize);
      (function (name, method, data) {
        jobs.push((method === 0 ? Promise.resolve(data) : inflateRaw(data)).then(function (out) { files[name] = dec.decode(out); }));
      })(name, method, data);
    }
    return Promise.all(jobs).then(function () { return files; });
  }

  function unxml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(Number(n)); })
      .replace(/&#x([0-9a-f]+);/gi, function (_, n) { return String.fromCharCode(parseInt(n, 16)); }).replace(/&amp;/g, '&')
      .replace(/_x000D_/g, '');
  }
  function textOf(xml) { var out = '', m, re = /<t\b[^>]*>([\s\S]*?)<\/t>/g; while ((m = re.exec(xml))) out += m[1]; return unxml(out); }
  function colIndex(ref) { var letters = ref.replace(/\d+$/, ''), n = 0; for (var i = 0; i < letters.length; i++) n = n * 26 + letters.charCodeAt(i) - 64; return n - 1; }

  // Returns rows (arrays of strings/booleans) of the first worksheet
  function readXlsx(buf) {
    return unzip(buf).then(function (f) {
      var shared = [];
      if (f['xl/sharedStrings.xml']) {
        var m, re = /<si\b[^>]*>([\s\S]*?)<\/si>/g, x = f['xl/sharedStrings.xml'].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
        while ((m = re.exec(x))) shared.push(textOf(m[1]));
      }
      var sheetPath = 'xl/worksheets/sheet1.xml', wb = f['xl/workbook.xml'], rels = f['xl/_rels/workbook.xml.rels'];
      if (wb && rels) {
        var first = /<sheet\b[^>]*r:id="([^"]+)"/.exec(wb);
        if (first) {
          var rel = new RegExp('<Relationship\\b[^>]*Id="' + first[1] + '"[^>]*/?>').exec(rels) || [];
          var target = /Target="([^"]+)"/.exec(rel[0] || '');
          if (target) sheetPath = target[1].replace(/^\/?(xl\/)?/, 'xl/');
        }
      }
      var sheet = f[sheetPath]; if (!sheet) throw new Error('Worksheet not found in file');
      var rows = [], rm, rowRe = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
      while ((rm = rowRe.exec(sheet))) {
        var row = [], cm, cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, body = rm[1] || '';
        while ((cm = cellRe.exec(body))) {
          var attrs = cm[1], inner = cm[2] || '', r = /\br="([A-Z]+\d+)"/.exec(attrs), t = (/\bt="(\w+)"/.exec(attrs) || [])[1];
          var v = /<v>([\s\S]*?)<\/v>/.exec(inner), val;
          if (t === 's') val = v ? shared[Number(v[1])] : '';
          else if (t === 'inlineStr') val = textOf(inner);
          else if (t === 'b') val = v ? v[1] === '1' : '';
          else val = v ? unxml(v[1]) : '';
          row[r ? colIndex(r[1]) : row.length] = val;
        }
        rows.push(row);
      }
      return rows;
    });
  }

  // ---------------- registry → entries ----------------
  function s(v) { return v === undefined || v === null ? '' : String(v).replace(/\s+/g, ' ').trim(); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  // Excel serial (1900 system) or text → {date:'YYYY-MM-DD', minutes:Number|null}
  function excelDate(v) {
    if (v === undefined || v === null || v === '') return null;
    if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v))) {
      var n = Number(v); if (n < 1) return null;
      var ms = Math.round((n - 25569) * 864e5), d = new Date(ms);
      return { date: d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate()), minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), ts: ms };
    }
    var str = String(v), m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(str) || null;
    if (m) return { date: m[1] + '-' + m[2] + '-' + m[3], minutes: m[4] ? Number(m[4]) * 60 + Number(m[5]) : null, ts: Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) };
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/.exec(str);
    if (m) return { date: m[3] + '-' + pad2(+m[2]) + '-' + pad2(+m[1]), minutes: m[4] ? Number(m[4]) * 60 + Number(m[5]) : null, ts: Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)) };
    return null;
  }

  /*
   * Rule-based classifier. First matching rule wins. Text = operation + ' || ' + diagnosis, upper-case.
   * [test(op, dx, all) -> bool, domain, procedure (string or fn), approach, complexity]
   * These are pragmatic keyword rules; every auto-classified entry is flagged for review.
   */
  var has = function (re) { return function (op, dx, all) { return re.test(all); }; };
  var opHas = function (re) { return function (op) { return re.test(op); }; };
  var both = function (a, b) { return function (op, dx, all) { return a(op, dx, all) && b(op, dx, all); }; };
  var BURN = has(/\bBURN|TBSA|SCALD|ELECTRICAL INJ|FLAME/);
  var GRAFT = opHas(/SKIN GRAFT|\bSSG\b|\bSTSG\b|SPLIT SKIN|SPLIT THICKNESS|\bFTSG\b|FULL THICKNESS/);
  var LOWER = has(/\bLEG\b|TIBIA|FIBULA|ANKLE|FOOT|HEEL|CALCAN|KNEE|THIGH|TOE|LOWER LIMB|PATELLA|SHIN/);
  var FACE = has(/FACE|FACIAL|\bLIP\b|NOSE|NASAL|\bEAR\b|EYELID|CHEEK|FOREHEAD|CHIN|SCALP|TEMPORAL|PERIORBITAL/);
  var RULES = [
    [opHas(/MEEK/), 'BURN-AC', 'Meshed / Meek micrografting', 'INV', 4],
    [opHas(/ESCHAROTOMY/), 'BURN-AC', 'Escharotomy', 'INV', 2],
    [both(BURN, opHas(/CONTRACTURE/)), 'BURN-RC', 'Burn contracture release and graft', 'INV', 3],
    [both(BURN, GRAFT), 'BURN-AC', 'Burn excision and split-thickness skin graft', 'INV', 3],
    [both(BURN, opHas(/DEBRID|DRESSING|TANGENTIAL|EXCISION/)), 'BURN-AC', 'Burn wound debridement and dressing', 'INV', 2],
    [both(has(/KELOID|HYPERTROPHIC SCAR/), opHas(/INJECT|TRIAMCINOLONE|STEROID|KENACORT/)), 'BURN-RC', 'Intralesional steroid injection (scar / keloid)', 'MIN', 1],
    [has(/KELOID/), 'BURN-RC', 'Keloid excision', 'INV', 2],
    [opHas(/LASER/), 'BURN-RC', 'Fractional CO2 laser to scar', 'NON', 1],
    [opHas(/REVERSE[D]? ALT|REVERSE[D]? ANTEROLATERAL/), 'LOWLIMB', 'Pedicled reverse ALT flap', 'INV', 4],
    [opHas(/\bFREE\b.*(\bALT\b|ANTEROLATERAL)|(\bALT\b|ANTEROLATERAL)[A-Z ]*FREE/), 'MICRO', 'Free ALT flap', 'INV', 4],
    [opHas(/\bFREE\b.*RADIAL|RADIAL FOREARM FREE/), 'MICRO', 'Free radial forearm flap', 'INV', 4],
    [opHas(/\bFREE\b.*FIBULA/), 'MICRO', 'Free fibula flap', 'INV', 4],
    [opHas(/\bFREE\b.*GRACILIS/), 'MICRO', 'Free gracilis flap', 'INV', 4],
    [opHas(/\bDIEP\b|MS-?TRAM/), 'MICRO', 'Free DIEP / MS-TRAM flap', 'INV', 4],
    [opHas(/\bFREE\b.*LATISSIMUS/), 'MICRO', 'Free latissimus dorsi flap', 'INV', 4],
    [opHas(/\bFREE\b[A-Z ]*FLAP|FREE TISSUE TRANSFER/), 'MICRO', 'Free flap (other)', 'INV', 4],
    [opHas(/REPLANT|REVASCULARI/), 'HAND', 'Replantation / revascularisation', 'INV', 4],
    [opHas(/LYMPHATICOVEN|\bLVA\b/), 'LYMPH', 'Lymphaticovenular anastomosis (LVA)', 'INV', 4],
    [both(has(/LYMPH(O)?E?DE?MA|LYMPHEDEDMA/), opHas(/DEBULK|EXCIS|LIPOSUCTION|CHARLES/)), 'LYMPH', 'Debulking for lymphoedema', 'INV', 3],
    [opHas(/NERVE TRANSFER|BRACHIAL PLEXUS/), 'NERVE', 'Nerve transfer', 'INV', 4],
    [opHas(/FISTULA REPAIR/), 'CRANIO', 'Palatal fistula repair', 'INV', 3],
    [opHas(/REDO PALATOPLASTY|RE-?PALATOPLASTY/), 'CRANIO', 'Redo palatoplasty (fistula / VPI)', 'INV', 4],
    [opHas(/PHARYNGOPLASTY|PHARYNGEAL FLAP/), 'CRANIO', 'Pharyngoplasty / VPI surgery', 'INV', 3],
    [opHas(/PALATOPLASTY|PALATE REPAIR|VELOPLASTY|FURLOW/), 'CRANIO', 'Cleft palate repair', 'INV', 3],
    [opHas(/ALVEOLAR BONE GRAFT/), 'CRANIO', 'Alveolar bone graft', 'INV', 3],
    [both(opHas(/LIP REPAIR|CHEILOPLASTY|LIP REVISION/), has(/CLEFT|UCLP|BCLP|\bLIP\b/)), 'CRANIO', 'Cleft lip repair', 'INV', 3],
    [opHas(/TONGUE TIE|ANKYLOGLOSS|FRENOTOMY|FRENULOPLASTY/), 'CRANIO', 'Tongue-tie / ankyloglossia release', 'INV', 2],
    [both(opHas(/^STO\b|\bSTO\b|SUTURE REMOVAL|REMOVAL OF SUTURE/), has(/CLEFT|LIP|PALATE/)), 'CRANIO', 'Suture removal under GA (post lip repair)', 'NON', 1],
    [opHas(/^STO\b|\bSTO\b|SUTURE REMOVAL|REMOVAL OF SUTURE/), 'GENRECON', 'Suture removal under GA', 'NON', 1],
    [both(opHas(/SYNDACTYLY|SYNDCATYLY/), has(/TOE/)), 'VASCANOM', 'Toe syndactyly release + full-thickness skin graft', 'INV', 2],
    [opHas(/SYNDACTYLY|SYNDCATYLY|WEB ?SPACE/), 'HAND', 'Syndactyly / congenital hand release', 'INV', 3],
    [has(/DUPLICATION|POLYDACTYLY|ACCESSORY DIGIT|EXTRA DIGIT/), 'VASCANOM', 'Accessory digit / tag excision', 'INV', 2],
    [has(/VASCULAR MALFORMATION|HAEMANGIOMA|HEMANGIOMA|AVM\b/), 'VASCANOM', 'Vascular malformation excision', 'INV', 3],
    [opHas(/FLEXOR TENDON/), 'HAND', 'Flexor tendon repair', 'INV', 3],
    [opHas(/EXTENSOR TENDON/), 'HAND', 'Extensor tendon repair', 'INV', 2],
    [opHas(/TENDON TRANSFER/), 'HAND', 'Tendon transfer', 'INV', 3],
    [opHas(/CARPAL TUNNEL/), 'HAND', 'Carpal tunnel release', 'INV', 2],
    [opHas(/TRIGGER/), 'HAND', 'Trigger finger release', 'INV', 1],
    [opHas(/DE ?QUERVAIN/), 'HAND', 'De Quervain release', 'INV', 1],
    [opHas(/DUPUYTREN|FASCIECTOMY/), 'HAND', 'Dupuytren fasciectomy', 'INV', 3],
    [opHas(/DIGITAL NERVE/), 'HAND', 'Digital nerve repair', 'INV', 3],
    [opHas(/NAIL ?BED|FINGERTIP|FINGER TIP/), 'HAND', 'Fingertip / nail bed repair', 'INV', 1],
    [opHas(/RAY AMPUTATION|TERMINALI[SZ]ATION/), 'HAND', 'Terminalisation / ray amputation', 'INV', 2],
    [opHas(/GANGLION/), 'HAND', 'Ganglion excision', 'INV', 1],
    [both(opHas(/CONTRACTURE/), has(/FINGER|THUMB|HAND|PALM|DIGIT/)), 'HAND', 'Finger contracture release + full-thickness skin graft', 'INV', 2],
    [opHas(/REDUCTION MAMMOPLASTY|BREAST REDUCTION|REDUCTION MAMMAPLASTY/), 'BREAST', 'Reduction mammoplasty', 'INV', 3],
    [opHas(/MASTOPEXY/), 'BREAST', 'Mastopexy', 'INV', 3],
    [opHas(/GYN(A)?ECOMASTIA/), 'BREAST', 'Gynaecomastia surgery', 'INV', 2],
    [opHas(/NIPPLE/), 'BREAST', 'Nipple-areola reconstruction', 'INV', 1],
    [opHas(/AUGMENTATION/), 'BREAST', 'Augmentation mammoplasty', 'INV', 2],
    [opHas(/BREAST RECONSTRUCTION|IMPLANT/), 'BREAST', 'Implant-based breast reconstruction', 'INV', 3],
    [opHas(/THORACOABDOMINAL|CHEST WALL RECON/), 'TRUNK', 'Chest wall reconstruction', 'INV', 3],
    [opHas(/RECTUS ABDOMINIS|\bVRAM\b|PELVIC FLOOR|PERINEAL RECON/), 'TRUNK', 'Perineal / pelvic reconstruction', 'INV', 4],
    [has(/STERN/), 'TRUNK', 'Sternal wound debridement / closure', 'INV', 2],
    [has(/PRESSURE (SORE|INJURY|ULCER)|SACRAL SORE|ISCHIAL|TROCHANTERIC/), 'TRUNK', 'Pressure injury debridement and flap closure', 'INV', 3],
    [has(/PILONIDAL/), 'TRUNK', 'Pilonidal sinus excision and flap', 'INV', 2],
    [has(/HIDRADENITIS/), 'TRUNK', 'Hidradenitis excision and reconstruction', 'INV', 3],
    [opHas(/COMPONENT SEPARATION|ABDOMINAL WALL RECON/), 'TRUNK', 'Abdominal wall reconstruction', 'INV', 4],
    [opHas(/ABDOMINOPLASTY/), 'AESTH', 'Abdominoplasty', 'INV', 3],
    [opHas(/LIPOSUCTION/), 'AESTH', 'Liposuction', 'MIN', 2],
    [opHas(/BLEPHAROPLASTY/), 'AESTH', 'Blepharoplasty', 'INV', 2],
    [opHas(/RHINOPLASTY/), 'AESTH', 'Rhinoplasty', 'INV', 3],
    [opHas(/OTOPLASTY/), 'AESTH', 'Otoplasty', 'INV', 2],
    [has(/PAGET/), 'SKINONC', 'Wide excision extramammary Paget disease + skin graft', 'INV', 3],
    [opHas(/HYPOSPADIAS/), 'GENITO', 'Hypospadias repair', 'INV', 3],
    [has(/PENI(S|LE)|SCROT|GENITAL|PARAFFINOMA|VULV|LABIA/), 'GENITO', 'Genital reconstruction', 'INV', 3],
    [opHas(/SURAL/), 'LOWLIMB', 'Reverse sural flap', 'INV', 3],
    [opHas(/GASTROCNEMIUS|SOLEUS|PROPELLER/), 'LOWLIMB', 'Pedicled lower-limb flap (gastrocnemius / soleus / propeller)', 'INV', 3],
    [has(/DIABETIC|\bDFU\b/), 'WOUND', 'Diabetic foot debridement', 'INV', 2],
    [both(LOWER, opHas(/FLAP/)), 'LOWLIMB', 'Local perforator flap — lower limb', 'INV', 3],
    [both(LOWER, has(/CRUSH|DEGLOV|OPEN FRACTURE|COMPOUND/)), 'LOWLIMB', 'Wound exploration and debridement — lower limb', 'INV', 2],
    [opHas(/\bBTM\b|DERMAL MATRIX|INTEGRA|MATRIDERM|DERMAL SUBSTITUTE/), 'WOUND', 'Dermal matrix application', 'INV', 3],
    [opHas(/DELTOPECTORAL/), 'HN', 'Deltopectoral flap', 'INV', 3],
    [opHas(/PECTORALIS|\bPM FLAP|\bPMMC/), 'HN', 'Pedicled pectoralis major flap', 'INV', 3],
    [opHas(/SUPRACLAVICULAR|SUBMENTAL/), 'HN', 'Submental / supraclavicular island flap', 'INV', 3],
    [opHas(/FOREHEAD FLAP/), 'HN', 'Forehead flap (nasal reconstruction)', 'INV', 3],
    [opHas(/REANIMATION/), 'HN', 'Facial reanimation (static / dynamic)', 'INV', 4],
    [opHas(/FLOOR OF MOUTH|INTRAORAL|PAROTID|MANDIB|MAXILL|TONGUE/), 'HN', 'Head & neck reconstruction (other)', 'INV', 2],
    [both(has(/SCALP/), opHas(/FLAP/)), 'HN', 'Scalp flap reconstruction', 'INV', 3],
    [both(opHas(/ORIF|REDUCTION|FIXATION/), has(/ZYGOMA|ORBIT|MANDIB|MAXILL|NASAL BONE|NASAL FRACTURE/)), 'FTRAUMA', 'Facial fracture ORIF (zygoma / orbit / mandible)', 'INV', 3],
    [both(FACE, has(/LACERAT|TOILET|SUTUR/)), 'FTRAUMA', 'Complex facial laceration repair', 'INV', 2],
    [opHas(/SENTINEL/), 'SKINONC', 'Sentinel lymph node biopsy', 'INV', 3],
    [opHas(/LYMPH NODE DISSECTION|NECK DISSECTION|AXILLARY CLEARANCE/), 'SKINONC', 'Therapeutic lymph node dissection', 'INV', 3],
    [both(has(/SARCOMA|DFSP|DERMATOFIBROSARCOMA/), opHas(/DEBULK/)), 'SKINONC', 'Tumour debulking + reconstruction', 'INV', 3],
    [has(/SARCOMA|DFSP|DERMATOFIBROSARCOMA|SOFT TISSUE TUMOU?R/), 'SKINONC', 'Wide local excision soft-tissue tumour', 'INV', 3],
    [both(opHas(/BIOPSY/), function (op) { return !/EXCISION BIOPSY|EXCISIONAL/.test(op); }), 'SKINONC', 'Punch / incisional biopsy', 'INV', 1],
    [both(has(/\bBCC\b|BASAL CELL|\bSCC\b|SQUAMOUS|MELANOMA|KERATOACANTHOMA|NAEVUS|NEVUS|LESION|CYST|LIPOMA|TUMOU?R|MASS|SWELLING|CARCINOMA/), opHas(/EXCIS|\bWLE\b|EXCISION/)),
      'SKINONC', function (op) { return /FLAP/.test(op) ? 'Excision skin lesion + local flap' : (/GRAFT|\bFTSG\b|\bSSG\b|\bSTSG\b/.test(op) ? 'Excision skin lesion + skin graft' : 'Excision skin lesion + direct closure'); }, 'INV', 2],
    [opHas(/CONTRACTURE/), 'GENRECON', 'Contracture release + skin graft', 'INV', 2],
    [both(opHas(/SPLIT SKIN|\bSSG\b|\bSTSG\b|SPLIT THICKNESS/), function () { return true; }), 'WOUND', 'Split-thickness skin graft (wound)', 'INV', 2],
    [opHas(/FULL THICKNESS|\bFTSG\b/), 'GENRECON', 'Full-thickness skin graft', 'INV', 2],
    [opHas(/AMPUTATION/), 'WOUND', 'Minor amputation (toe / ray)', 'INV', 2],
    [opHas(/DEBRID|SLOUGHECTOMY|WASHOUT|WASH OUT/), 'WOUND', 'Surgical debridement', 'INV', 2],
    [opHas(/\bNPWT\b|\bVAC\b|VACUUM|VACCUM|NEGATIVE PRESSURE/), 'WOUND', 'Negative pressure wound therapy (application / change)', 'NON', 1],
    [opHas(/INCISION AND DRAINAGE|I ?& ?D\b/), 'GENRECON', 'Incision and drainage of abscess', 'INV', 1],
    [opHas(/FOREIGN BODY/), 'GENRECON', 'Foreign body removal', 'MIN', 1],
    [opHas(/SCAR REVISION/), 'GENRECON', 'Scar revision', 'INV', 1],
    [opHas(/\bFLAP\b/), 'GENRECON', 'Local / regional flap (other)', 'INV', 2],
    [opHas(/WOUND INSPECTION|DRESSING|\bWI\b/), 'WOUND', 'Wound inspection and dressing under GA', 'NON', 1],
    [opHas(/SUTUR|TOILET/), 'GENRECON', 'Complex laceration repair', 'INV', 1]
  ];

  function classify(operation, diagnosis) {
    var op = s(operation).toUpperCase(), dx = s(diagnosis).toUpperCase(), all = op + ' || ' + dx;
    for (var i = 0; i < RULES.length; i++) {
      var r = RULES[i];
      if (r[0](op, dx, all)) return { domain: r[1], procedure: typeof r[2] === 'function' ? r[2](op, dx) : r[2], approach: r[3], complexity: r[4], matched: true };
    }
    var title = s(operation).toLowerCase().replace(/(^|\s)\S/g, function (c) { return c.toUpperCase(); });
    return { domain: 'OTHER', procedure: title.slice(0, 80) || '(unspecified)', approach: 'INV', complexity: '', matched: false };
  }

  function buildPattern(variants) {
    var parts = String(variants || '').split(/[,;\n]/).map(function (v) { return v.trim(); }).filter(function (v) { return v.length >= 3; })
      .map(function (v) { return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'); });
    return parts.length ? new RegExp(parts.join('|'), 'i') : null;
  }

  /*
   * rows: array of arrays (first row = header). variants: comma-separated name spellings.
   * Returns { entries, matched, years, warnings }.
   */
  function registryToEntries(rows, variants) {
    var pat = buildPattern(variants);
    if (!pat) throw new Error('Enter your name spellings first (Data & settings → Registry name matching).');
    if (!rows.length) throw new Error('The sheet is empty.');
    var H = rows[0].map(function (h) { return s(h); }), ix = {};
    H.forEach(function (h, i) { ix[h.toLowerCase()] = i; });
    function col(r, name) { var i = ix[name.toLowerCase()]; return i === undefined ? '' : r[i]; }
    ['Operating Doctor', 'Operation', 'SurgID'].forEach(function (c) { if (ix[c.toLowerCase()] === undefined) throw new Error('Column "' + c + '" not found — is this the surgical registry export (tbl_sur_reg)?'); });

    var out = [], years = {};
    for (var k = 1; k < rows.length; k++) {
      var r = rows[k]; if (!r || !s(col(r, 'SurgID'))) continue;
      var isOp = pat.test(s(col(r, 'Operating Doctor'))), isI1 = pat.test(s(col(r, 'Doctor Involve_1')));
      var isI2 = pat.test(s(col(r, 'Doctor Involve_2'))), isI3 = pat.test(s(col(r, 'Doctor Involve_3')));
      if (!(isOp || isI1 || isI2 || isI3)) continue;
      var sid = s(col(r, 'SurgID')), start = excelDate(col(r, 'Time Started')), end = excelDate(col(r, 'Time Ended')), entry = excelDate(col(r, 'Date Entry'));
      var date = (start || entry || {}).date || '';
      var notes = ['Imported from surgical registry (SurgID ' + sid + (s(col(r, 'Location OT')) ? ', ' + s(col(r, 'Location OT')) : '') + ').'];
      var role, team = [], regRole;
      function doc(n, ro, rk) { var nm = s(col(r, n)); return nm ? nm + ' (' + [s(col(r, ro)), s(col(r, rk))].filter(Boolean).join(', ') + ')' : ''; }
      var d1 = doc('Doctor Involve_1', 'Role_1', 'Rank Doctor inv_1'), d2 = doc('Doctor Involve_2', 'Role_2', 'Rank Doctor Involve_2'), d3 = doc('Doctor Involve_3', 'Role_3', 'Rank Doctor Involve_3'), d0 = doc('Operating Doctor', 'Role Operating', 'Rank Operating');
      if (isOp) {
        var rr = s(col(r, 'Role Operating')), r1 = s(col(r, 'Role_1'));
        if (/supervis/i.test(rr)) { role = 'ST'; notes.push('Registry role: Supervisor — scrubbed/unscrubbed not recorded; logged as ST.'); }
        else if (/surgeon/i.test(r1)) { role = 'P'; notes.push('Registry lists a co-surgeon; logged as P — change to ST if you supervised.'); }
        else if (/assist/i.test(rr)) role = 'A';
        else role = 'P';
        regRole = 'Operating doctor — ' + [rr, s(col(r, 'Rank Operating'))].filter(Boolean).join(', ');
        team = [d1, d2, d3];
      } else {
        var n = isI1 ? 1 : isI2 ? 2 : 3, rl = s(col(r, 'Role_' + n));
        if (/supervis/i.test(rl)) { role = 'ST'; notes.push('Registry role: Supervisor — scrubbed/unscrubbed not recorded; logged as ST.'); }
        else if (/assist/i.test(rl)) role = 'A';
        else { role = 'P'; notes.push('Registry role "' + rl + '" with another listed operating surgeon; logged as P — review (co-surgeon vs supervisor).'); }
        regRole = 'Doctor involved ' + n + ' — ' + rl;
        team = [d0].concat([d1, d2, d3].filter(function (_, i) { return i !== n - 1; }));
      }
      notes.push('Registry role: ' + regRole + '.');
      if (entry && start && entry.date !== start.date) notes.push('Registry entry date ' + entry.date + ' differs from operation start ' + start.date + '; operation date used.');

      var dur = '';
      if (start && end && start.minutes && end.ts > start.ts && end.ts - start.ts < 864e5) dur = String(Math.round((end.ts - start.ts) / 6e4));
      var dob = excelDate(col(r, 'Date Of Birth')), age = s(col(r, 'Age'));
      if (!age && dob && date) { var a = Number(date.slice(0, 4)) - Number(dob.date.slice(0, 4)); if (date.slice(5) < dob.date.slice(5)) a--; age = String(a); }
      var op = s(col(r, 'Operation')), dx = s(col(r, 'Pre-operative Diagnosis')) || s(col(r, 'Post operative Diagnosis'));
      var c = classify(op, dx);
      notes.push(c.matched ? 'Domain/procedure auto-classified from registry text — please check.' : 'Could not classify automatically — set domain and procedure.');
      var txt = (dx + ' ' + op).toUpperCase();
      var lat = /BILATERAL/.test(txt) ? 'Bilateral' : (/LEFT/.test(txt) && !/RIGHT/.test(txt) ? 'Left' : (/RIGHT/.test(txt) && !/LEFT/.test(txt) ? 'Right' : ''));
      var ga = col(r, 'General Anaesthesia'), reg = col(r, 'Regional'), la = col(r, 'Local Anaesthesia');
      var an = s(col(r, 'Type of Anesthesia')) || (ga === true ? 'GA' : reg === true ? 'Regional block' : la === true ? 'Local (LA)' : '');
      var loc = s(col(r, 'Location OT')), sex = s(col(r, 'Gender'));
      var morb = s(col(r, 'Morbidity')), morbTxt = s(col(r, 'if yes please state')), other = s(col(r, 'Other Morbidity')), mort = s(col(r, 'Mortality'));
      var remark = [morbTxt || (/^(yes|1|true)$/i.test(morb) ? 'Morbidity recorded in registry' : ''), other, /^(yes|1|true)$/i.test(mort) ? 'Mortality recorded in registry' : ''].filter(Boolean).join('; ');
      if (date) years[date.slice(0, 4)] = (years[date.slice(0, 4)] || 0) + 1;
      out.push({
        id: 'reg' + (date.slice(0, 4) || 'x') + '-' + sid, date: date, patientName: s(col(r, 'Name of Patient')).toUpperCase(), patientId: s(col(r, 'NRIC')),
        age: age, sex: /^m/i.test(sex) ? 'M' : /^f/i.test(sex) ? 'F' : '', diagnosis: dx, procedure: c.procedure, domain: c.domain, registry: op,
        complexity: String(c.complexity || ''), role: role, urgency: '', anaesthesia: an, remark: remark,
        complication: 'UNK', facility: /kulai/i.test(loc) ? 'Hospital Kulai' : '', setting: 'Main OT', mrn: s(col(r, 'HRN')), patientRef: 'SR-' + sid,
        approach: c.approach, supervisorTrainee: team.filter(Boolean).join('; '), laterality: lat, durationMin: dur,
        tags: 'registry-' + (date.slice(0, 4) || ''), notes: notes.join(' ')
      });
    }
    return { entries: out, years: years };
  }

  var api = { readXlsx: readXlsx, unzip: unzip, excelDate: excelDate, classify: classify, buildPattern: buildPattern, registryToEntries: registryToEntries, RULES: RULES };
  root.SLB = root.SLB || {};
  root.SLB.registry = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
