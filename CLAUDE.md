# Project rules for Claude (persistent)

## Patient identifiers: owner's standing instruction (2026-11-22)
- The owner (consultant plastic surgeon) **authorises recording patient name, NRIC/passport (`patientId`) and HRN/MRN (`mrn`)** in log entries and registry imports. They are needed so credentialing/privileging authorities can verify each case against hospital records.
- Purpose (owner's statement, 2026-11-25): the log book is for private/personal record keeping. Its contents are shared only with healthcare professional governing bodies and authorities (credentialing, privileging, regulatory).
- Always include these fields when converting hospital registry or OT data into this log book.
- **Hard rule: identifiable patient data must never be committed or pushed to this repository (it is PUBLIC)**, and must never be put in issues, PR text, commit messages, artifacts or any external service. Generated import files go in `data/`, which is git-ignored. Before every commit, check that `git status` shows no data files.
- Show identifiers in chat replies only when needed. Summaries use counts and case refs (e.g. `SR-6700`).

## Registry import conventions (Year_2026.xlsx, sheet `tbl_sur_reg`)
- Match the owner in doctor columns only (Operating Doctor, Doctor Involve_1..3), never in patient fields. Use the regex `shakir|syakir|bathusha|batusha|badusha|bhatusha`; the owner's full name variants include "Mohd Shakir Batusha/Bathusha Bin Mohd Hussain/Hussin/Husain".
- Role mapping: Operating Doctor + "Surgeon" → P; Operating Doctor + "Supervisor" → ST; Involve_1 "Supervisor" → ST; Involve_1 "1st Assistant" → A. Where a co-surgeon is listed, log as P and flag it in notes for the owner to review.
- Date = date of Time Started (fall back to Date Entry). `patientRef` = `SR-<SurgID>`. Record id = `reg<year>-<SurgID>`, so re-imports update records instead of duplicating them.
- Blank morbidity → complication `UNK` (never `NONE`). "Type of Operation" is uninformative (all 1), so leave urgency blank.
- Classify domain/procedure by hand from the operation text and keep the original wording in `additional` ("Registry: …").

## Dev
- No build step. Tests: `node tests/analytics.test.js`.
