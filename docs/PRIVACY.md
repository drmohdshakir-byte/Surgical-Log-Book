# Privacy & data protection

This repository is **public**. It contains only application code, never logbook data.

## Where your data lives
- Records are stored in your browser's **IndexedDB** on the device you use. Nothing is sent to any server. The page loads no external scripts or fonts, and its Content-Security-Policy blocks network connections.
- If you use the GitHub Pages copy, GitHub serves only the code files. Your records stay inside your own browser.
- Each browser and device has its own separate store. To move records, export a JSON backup and import it on the other device.

## What to record
Personal health data is sensitive personal data under Malaysia's Personal Data Protection Act 2010. MOH/hospital policies on patient confidentiality and medical records also apply. For a personal logbook:
- **Do not** record patient names, NRIC/passport numbers, full MRNs, addresses, phone numbers or photographs.
- Use a **de-identified reference** in `patientRef` (for example your own running code, or the last 3–4 MRN digits combined with the date) that only you can link back through the hospital system.
- Age, sex, diagnosis and procedure are usually enough for privileging and CV purposes.
- If you plan to use the data for **research or publication**, you need institutional approval: NMRR registration and MREC/ethics review, as your institution requires. A personal logbook is not by itself an approved research dataset.

## Backups
- Export a JSON backup regularly (Data & settings → Full backup). The app shows the date of your last backup.
- Store backups in an access-controlled location, such as an encrypted drive or your institution-approved storage. **Do not commit them to this repository.** `.gitignore` blocks `*.json`, `*.xlsx` and export files as a safety net.
- Clearing browser data or uninstalling the browser deletes the local store. The app asks the browser for "persistent storage" to lower the risk of automatic eviction, but a backup is the only real safeguard.
