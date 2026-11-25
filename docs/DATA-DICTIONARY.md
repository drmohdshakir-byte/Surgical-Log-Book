# Data dictionary

One row = one procedure episode in which you took part. CSV import and export use these column names, in this order. **Bold** fields are required.

The first 14 columns are the **core register**, shown in this order on the entry form and in the yearly report: Date, Name, NRIC/ID, Age, Sex, Diagnosis, Procedure, Domain, Registry, Complexity, Role, Urgency, Anaesthesia, Remark. Every other field is optional and sits under "More details".

| Field | Type / allowed values | Notes |
|---|---|---|
| id | text | Created automatically. If an import row has an id that already exists, that record is updated. |
| **date** | `YYYY-MM-DD` (import also accepts `DD/MM/YYYY`) | Date of procedure. Future dates are rejected. |
| facility | text | Hospital or centre. Used for facility-specific privileging reports. |
| setting | Main OT · Daycare OT · Burns unit / burns OT · Procedure room / clinic · Ward / bedside · Emergency department · ICU · Outreach / visiting · Wound care clinic | |
| patientRef | text | Case reference, for example `SR-<registry SurgID>`. |
| patientName | text | Patient full name, for verification by credentialing authorities. Identifiable: see PRIVACY.md. |
| patientId | text | NRIC or passport number. Identifiable. |
| mrn | text | Hospital registration number (HRN/MRN). Identifiable. |
| age | 0–120 | Years. |
| sex | M · F | |
| diagnosis | text | Indication. |
| icd10 | text | Optional ICD-10 diagnosis code. |
| **domain** | code (see below) | Filled in automatically if the procedure is in the built-in list. |
| **procedure** | text | Pick from the list or type your own. Use consistent wording so counts group correctly. |
| registry | text | The operation exactly as written in the hospital registry. It is filled in automatically by the registry import. |
| remark | text | Outcome and/or complication in your own words. The yearly report's Remark column also shows the Clavien–Dindo grade, if one is set. |
| additional | text | Secondary procedures in the same sitting. They are not counted separately. Log a second entry if you need them counted. |
| approach | `INV` invasive (open) · `MIN` minimally invasive · `NON` non-invasive | Built-in defaults can be overridden. |
| complexity | 1 Minor · 2 Intermediate · 3 Major · 4 Complex major | A local, pragmatic grading. It is **not** a national tariff or coding scheme. Defaults are suggestions. |
| **role** | `P` · `PS` · `ST` · `SU` · `A` · `O` | See roles below. |
| supervisorTrainee | text | Name of the supervisor (for PS) or the trainee (for ST/SU). |
| urgency | Elective · Emergency · Urgent / semi-elective | |
| anaesthesia | GA · Regional block · Spinal / epidural · Local (LA) · WALANT · Sedation · Topical · None | |
| laterality | Left · Right · Bilateral · Midline / N/A | |
| durationMin | number | Knife-to-skin to closure, or procedure time. |
| tbsa | 0–100 | % total body surface area, for burns. |
| complication | `NONE` · `CD-I` · `CD-II` · `CD-IIIa` · `CD-IIIb` · `CD-IVa` · `CD-IVb` · `CD-V` · `UNK` | Clavien–Dindo grade (Dindo D, Demartines N, Clavien PA. *Ann Surg* 2004;240:205–213). `UNK` = not yet followed up. It is left out of rate denominators. |
| tags | comma-separated text | Free labels such as teaching, outreach or audit cohort. `demo` marks synthetic entries. |
| notes | text | Reflection or learning points. |
| createdAt / updatedAt | ISO timestamp | Set automatically. |

## Roles
| Code | Meaning | Counted as |
|---|---|---|
| P | Performed independently, as primary operator | Performed |
| PS | Performed under senior supervision (supervisor scrubbed or present) | Performed |
| ST | Supervised a trainee who performed the procedure, with you scrubbed | Supervised |
| SU | Supervised a trainee, with you unscrubbed but immediately available | Supervised |
| A | Assisted | Assisted |
| O | Observed | Observed |

These categories follow the general pattern used by surgical training e-logbooks (performed / supervised / assisted / observed). Check the exact definitions your credentialing committee requires before you submit counts.

## Domains
`BURN-AC` Burns — acute · `BURN-RC` Burns — reconstruction & scar · `HAND` Hand & upper limb · `MICRO` Microsurgery & free tissue transfer · `LYMPH` Lymphatic & supermicrosurgery · `NERVE` Peripheral nerve & brachial plexus · `HN` Head & neck reconstruction · `CRANIO` Cleft & craniofacial · `FTRAUMA` Facial trauma · `SKINONC` Skin oncology & soft-tissue tumours · `BREAST` Breast surgery · `LOWLIMB` Lower limb & orthoplastic reconstruction · `TRUNK` Trunk, perineum & pressure injury · `AESTH` Aesthetic surgery & procedures · `GENITO` Genital & hypospadias · `VASCANOM` Vascular anomalies & paediatric plastics · `WOUND` Wound care · `GENRECON` General reconstruction & minor procedures · `OTHER`

To add or rename procedures or domains, edit `js/taxonomy.js`. Records that already exist keep the values they were saved with.

## How the analytics are calculated
- **Trends:** the last 12 months are compared with the 12 months before them. The slope is an ordinary least-squares fit over the 24 monthly counts. When the two windows hold fewer than 10 cases combined, the trend reads "Too few to judge". Changes of ±20% or more are labelled Rising or Falling. These labels describe the counts only. They are not tests of statistical significance.
- **Complication rates:** the denominator is entries with a recorded outcome. Each rate has a 95% Wilson score interval. Self-reported logbook complications are known to under-count compared with prospective audit, so do not benchmark against published series.
- **Privileging summary:** counts by procedure and role within the selected period, plus the most recent date for each procedure. Counts are self-reported. Committees may ask you to verify them against operating-theatre records.
