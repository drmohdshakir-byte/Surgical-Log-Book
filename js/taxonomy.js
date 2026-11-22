/*
 * Surgical Log Book — taxonomy
 * Domains, sub-domains and a starter procedure list for
 * Plastic, Reconstructive & Burns Surgery and Wound Care.
 *
 * Each procedure entry: [name, defaultApproach, defaultComplexity]
 *   approach:   INV = invasive (open), MIN = minimally invasive, NON = non-invasive
 *   complexity: 1 = Minor, 2 = Intermediate, 3 = Major, 4 = Complex major
 *
 * The list is a starting point, not a closed list: free-text procedures are
 * accepted and you can extend this file. Defaults only pre-fill the form;
 * the value recorded on each entry is what counts.
 */
(function (root) {
  'use strict';

  var ROLES = [
    { code: 'P',  label: 'Performed — independent (primary operator)', group: 'Performed' },
    { code: 'PS', label: 'Performed — with senior supervision',        group: 'Performed' },
    { code: 'ST', label: 'Supervised trainee — scrubbed',               group: 'Supervised' },
    { code: 'SU', label: 'Supervised trainee — unscrubbed / available', group: 'Supervised' },
    { code: 'A',  label: 'Assisted',                                    group: 'Assisted' },
    { code: 'O',  label: 'Observed',                                    group: 'Observed' }
  ];

  var APPROACHES = [
    { code: 'INV', label: 'Invasive (open surgery)' },
    { code: 'MIN', label: 'Minimally invasive (percutaneous, endoscopic, injection, cannula)' },
    { code: 'NON', label: 'Non-invasive (laser/energy, dressing, splint, garment, conservative)' }
  ];

  var COMPLEXITY = [
    { code: 1, label: 'Minor' },
    { code: 2, label: 'Intermediate' },
    { code: 3, label: 'Major' },
    { code: 4, label: 'Complex major' }
  ];

  var URGENCY = ['Elective', 'Emergency', 'Urgent / semi-elective'];

  var ANAESTHESIA = ['GA', 'Regional block', 'Spinal / epidural', 'Local (LA)', 'WALANT', 'Sedation', 'Topical', 'None'];

  var SETTINGS = ['Main OT', 'Daycare OT', 'Burns unit / burns OT', 'Procedure room / clinic', 'Ward / bedside', 'Emergency department', 'ICU', 'Outreach / visiting', 'Wound care clinic'];

  // Clavien–Dindo classification (Dindo et al., Ann Surg 2004;240:205-213)
  var COMPLICATIONS = [
    { code: 'NONE', label: 'None' },
    { code: 'CD-I', label: 'Clavien–Dindo I' },
    { code: 'CD-II', label: 'Clavien–Dindo II' },
    { code: 'CD-IIIa', label: 'Clavien–Dindo IIIa (intervention, no GA)' },
    { code: 'CD-IIIb', label: 'Clavien–Dindo IIIb (intervention under GA)' },
    { code: 'CD-IVa', label: 'Clavien–Dindo IVa (single-organ dysfunction)' },
    { code: 'CD-IVb', label: 'Clavien–Dindo IVb (multi-organ dysfunction)' },
    { code: 'CD-V', label: 'Clavien–Dindo V (death)' },
    { code: 'UNK', label: 'Unknown / not yet followed up' }
  ];

  var DOMAINS = [
    { code: 'BURN-AC', name: 'Burns — acute', procedures: [
      ['Escharotomy', 'INV', 2], ['Fasciotomy (burns)', 'INV', 2],
      ['Tangential excision', 'INV', 3], ['Fascial excision', 'INV', 3],
      ['Burn excision and split-thickness skin graft', 'INV', 3],
      ['Meshed / Meek micrografting', 'INV', 4], ['Cultured epithelial / dermal substitute application', 'INV', 3],
      ['Enzymatic debridement (bromelain-based)', 'MIN', 2],
      ['Burn wound dressing under GA / sedation', 'NON', 1], ['Bedside burn dressing / resuscitation review', 'NON', 1],
      ['Tracheostomy (burns)', 'INV', 2]
    ]},
    { code: 'BURN-RC', name: 'Burns — reconstruction & scar', procedures: [
      ['Burn contracture release and graft', 'INV', 3], ['Z-plasty / multiple Z-plasty', 'INV', 2],
      ['Local flap for burn contracture', 'INV', 3], ['Tissue expansion (insertion)', 'INV', 3],
      ['Tissue expander exchange / advancement', 'INV', 3], ['Fractional CO2 laser to scar', 'NON', 1],
      ['Pulsed-dye / vascular laser to scar', 'NON', 1], ['Intralesional steroid injection (scar / keloid)', 'MIN', 1],
      ['Keloid excision', 'INV', 2], ['Fat grafting to scar', 'MIN', 2], ['Pressure garment / silicone therapy prescription', 'NON', 1]
    ]},
    { code: 'HAND', name: 'Hand & upper limb', procedures: [
      ['Flexor tendon repair', 'INV', 3], ['Extensor tendon repair', 'INV', 2], ['Tendon transfer', 'INV', 3],
      ['Digital nerve repair', 'INV', 3], ['Fracture fixation — hand (K-wire / plate)', 'INV', 2],
      ['Carpal tunnel release', 'INV', 2], ['Trigger finger release', 'INV', 1], ['De Quervain release', 'INV', 1],
      ['Dupuytren fasciectomy', 'INV', 3], ['Needle fasciotomy (Dupuytren)', 'MIN', 1],
      ['Hand infection washout / drainage', 'INV', 2], ['Fingertip / nail bed repair', 'INV', 1],
      ['Terminalisation / ray amputation', 'INV', 2], ['Ganglion excision', 'INV', 1],
      ['Replantation / revascularisation', 'INV', 4], ['Syndactyly / congenital hand release', 'INV', 3],
      ['Hand splinting / therapy prescription', 'NON', 1]
    ]},
    { code: 'MICRO', name: 'Microsurgery & free tissue transfer', procedures: [
      ['Free ALT flap', 'INV', 4], ['Free radial forearm flap', 'INV', 4], ['Free fibula flap', 'INV', 4],
      ['Free latissimus dorsi flap', 'INV', 4], ['Free gracilis flap', 'INV', 4], ['Free DIEP / MS-TRAM flap', 'INV', 4],
      ['Free SCIP / SIEA flap', 'INV', 4], ['Free functioning muscle transfer', 'INV', 4],
      ['Flap re-exploration / salvage', 'INV', 4], ['Toe-to-hand transfer', 'INV', 4]
    ]},
    { code: 'LYMPH', name: 'Lymphatic & supermicrosurgery', procedures: [
      ['Lymphaticovenular anastomosis (LVA)', 'INV', 4], ['Vascularised lymph node transfer', 'INV', 4],
      ['Suction-assisted lipectomy for lymphoedema', 'MIN', 3], ['ICG lymphography', 'MIN', 1]
    ]},
    { code: 'NERVE', name: 'Peripheral nerve & brachial plexus', procedures: [
      ['Peripheral nerve repair / graft', 'INV', 3], ['Nerve transfer', 'INV', 4], ['Brachial plexus exploration / reconstruction', 'INV', 4],
      ['Neuroma excision / TMR / RPNI', 'INV', 3], ['Nerve decompression (other than CTR)', 'INV', 2]
    ]},
    { code: 'HN', name: 'Head & neck reconstruction', procedures: [
      ['Pedicled pectoralis major flap', 'INV', 3], ['Submental / supraclavicular island flap', 'INV', 3],
      ['Forehead flap (nasal reconstruction)', 'INV', 3], ['Local facial flap', 'INV', 2],
      ['Lip / eyelid reconstruction', 'INV', 3], ['Ear reconstruction', 'INV', 3],
      ['Facial reanimation (static / dynamic)', 'INV', 4], ['Neck dissection (with reconstruction team)', 'INV', 3]
    ]},
    { code: 'CRANIO', name: 'Cleft & craniofacial', procedures: [
      ['Cleft lip repair', 'INV', 3], ['Cleft palate repair', 'INV', 3], ['Alveolar bone graft', 'INV', 3],
      ['Pharyngoplasty / VPI surgery', 'INV', 3], ['Cleft rhinoplasty / revision', 'INV', 3],
      ['Craniosynostosis surgery (with team)', 'INV', 4], ['Orthognathic surgery (with team)', 'INV', 4]
    ]},
    { code: 'FTRAUMA', name: 'Facial trauma', procedures: [
      ['Complex facial laceration repair', 'INV', 2], ['Facial fracture ORIF (zygoma / orbit / mandible)', 'INV', 3],
      ['Nasal fracture reduction', 'MIN', 1], ['Facial nerve / parotid duct repair', 'INV', 3]
    ]},
    { code: 'SKINONC', name: 'Skin oncology & soft-tissue tumours', procedures: [
      ['Excision skin lesion + direct closure', 'INV', 1], ['Excision skin lesion + local flap', 'INV', 2],
      ['Excision skin lesion + skin graft', 'INV', 2], ['Wide local excision melanoma', 'INV', 2],
      ['Sentinel lymph node biopsy', 'INV', 3], ['Therapeutic lymph node dissection', 'INV', 3],
      ['Soft-tissue sarcoma excision and reconstruction', 'INV', 4], ['Punch / incisional biopsy', 'MIN', 1],
      ['Cryotherapy / curettage and cautery', 'MIN', 1]
    ]},
    { code: 'BREAST', name: 'Breast surgery', procedures: [
      ['Implant-based breast reconstruction', 'INV', 3], ['Pedicled latissimus dorsi breast reconstruction', 'INV', 3],
      ['Reduction mammoplasty', 'INV', 3], ['Mastopexy', 'INV', 3], ['Augmentation mammoplasty', 'INV', 2],
      ['Nipple-areola reconstruction', 'INV', 1], ['Oncoplastic reshaping / symmetrisation', 'INV', 3],
      ['Gynaecomastia surgery', 'INV', 2], ['Fat grafting to breast', 'MIN', 2]
    ]},
    { code: 'LOWLIMB', name: 'Lower limb & orthoplastic reconstruction', procedures: [
      ['Pedicled lower-limb flap (gastrocnemius / soleus / propeller)', 'INV', 3],
      ['Reverse sural flap', 'INV', 3], ['Open fracture debridement (orthoplastic)', 'INV', 3],
      ['Local perforator flap — lower limb', 'INV', 3], ['Split-thickness skin graft — lower limb', 'INV', 2]
    ]},
    { code: 'TRUNK', name: 'Trunk, perineum & pressure injury', procedures: [
      ['Pressure injury debridement and flap closure', 'INV', 3], ['Abdominal wall reconstruction', 'INV', 4],
      ['Component separation', 'INV', 4], ['Perineal / pelvic reconstruction', 'INV', 4],
      ['Pilonidal sinus excision and flap', 'INV', 2], ['Hidradenitis excision and reconstruction', 'INV', 3],
      ['Chest wall reconstruction', 'INV', 4]
    ]},
    { code: 'AESTH', name: 'Aesthetic surgery & procedures', procedures: [
      ['Abdominoplasty', 'INV', 3], ['Liposuction', 'MIN', 2], ['Blepharoplasty', 'INV', 2], ['Rhinoplasty', 'INV', 3],
      ['Face / neck lift', 'INV', 3], ['Post-bariatric body contouring', 'INV', 4], ['Otoplasty', 'INV', 2],
      ['Botulinum toxin injection', 'MIN', 1], ['Dermal filler injection', 'MIN', 1], ['Energy-based device / laser resurfacing', 'NON', 1]
    ]},
    { code: 'GENITO', name: 'Genital & hypospadias', procedures: [
      ['Hypospadias repair', 'INV', 3], ['Genital reconstruction', 'INV', 3], ['Genital lymphoedema excision', 'INV', 3]
    ]},
    { code: 'VASCANOM', name: 'Vascular anomalies & paediatric plastics', procedures: [
      ['Vascular malformation excision', 'INV', 3], ['Sclerotherapy', 'MIN', 1], ['Laser for vascular lesion', 'NON', 1],
      ['Giant congenital naevus staged excision', 'INV', 3], ['Accessory digit / tag excision', 'INV', 1]
    ]},
    { code: 'WOUND', name: 'Wound care', procedures: [
      ['Surgical debridement', 'INV', 2], ['Sharp / bedside debridement', 'MIN', 1],
      ['Negative pressure wound therapy (application / change)', 'NON', 1],
      ['Diabetic foot debridement', 'INV', 2], ['Minor amputation (toe / ray)', 'INV', 2],
      ['Split-thickness skin graft (wound)', 'INV', 2], ['Dermal matrix application', 'INV', 2],
      ['Advanced wound dressing', 'NON', 1], ['Compression therapy', 'NON', 1],
      ['Maggot / biosurgical debridement', 'NON', 1], ['Wound swab / tissue biopsy', 'MIN', 1],
      ['Hyperbaric oxygen referral / review', 'NON', 1], ['Delayed primary closure / secondary suture', 'INV', 1]
    ]},
    { code: 'GENRECON', name: 'General reconstruction & minor procedures', procedures: [
      ['Full-thickness skin graft', 'INV', 2], ['Local / regional flap (other)', 'INV', 2],
      ['Scar revision', 'INV', 1], ['Incision and drainage of abscess', 'INV', 1],
      ['Foreign body removal', 'MIN', 1], ['Complex laceration repair', 'INV', 1]
    ]},
    { code: 'OTHER', name: 'Other', procedures: [] }
  ];

  function domainByCode(code) {
    for (var i = 0; i < DOMAINS.length; i++) if (DOMAINS[i].code === code) return DOMAINS[i];
    return null;
  }
  function domainName(code) { var d = domainByCode(code); return d ? d.name : (code || 'Unassigned'); }
  function roleLabel(code) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].code === code) return ROLES[i].label; return code || ''; }
  function roleGroup(code) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].code === code) return ROLES[i].group; return 'Unknown'; }
  function approachLabel(code) { for (var i = 0; i < APPROACHES.length; i++) if (APPROACHES[i].code === code) return APPROACHES[i].label.split(' (')[0]; return code || ''; }
  function complexityLabel(code) { for (var i = 0; i < COMPLEXITY.length; i++) if (COMPLEXITY[i].code === Number(code)) return COMPLEXITY[i].label; return ''; }
  function findProcedure(name) {
    var n = String(name || '').trim().toLowerCase();
    for (var i = 0; i < DOMAINS.length; i++) {
      var ps = DOMAINS[i].procedures;
      for (var j = 0; j < ps.length; j++) if (ps[j][0].toLowerCase() === n) return { domain: DOMAINS[i].code, name: ps[j][0], approach: ps[j][1], complexity: ps[j][2] };
    }
    return null;
  }

  var api = {
    ROLES: ROLES, APPROACHES: APPROACHES, COMPLEXITY: COMPLEXITY, URGENCY: URGENCY,
    ANAESTHESIA: ANAESTHESIA, SETTINGS: SETTINGS, COMPLICATIONS: COMPLICATIONS, DOMAINS: DOMAINS,
    domainByCode: domainByCode, domainName: domainName, roleLabel: roleLabel, roleGroup: roleGroup,
    approachLabel: approachLabel, complexityLabel: complexityLabel, findProcedure: findProcedure
  };

  root.SLB = root.SLB || {};
  root.SLB.taxonomy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
