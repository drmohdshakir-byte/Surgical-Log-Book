# Privacy & data protection

This repository is **public**. It contains only application code, never logbook data.

## Where your data lives
- Records are stored in your browser's **IndexedDB** on the device you use. Nothing is sent to any server. The page loads no external scripts or fonts, and its Content-Security-Policy blocks network connections.
- If you use the GitHub Pages copy, GitHub serves only the code files. Your records stay inside your own browser.
- Each browser and device has its own separate store. To move records, export a JSON backup and import it on the other device.

## Patient identifiers
The owner has decided to record **patient name, NRIC/passport number and HRN/MRN**, so that credentialing and privileging authorities can verify each case against hospital records.

This makes the logbook and its exports **identifiable personal health data** under Malaysia's Personal Data Protection Act 2010 and MOH confidentiality rules. In practice:
- Records exist only in this browser and in files you export. The app sends nothing anywhere.
- Lock the device and browser profile you use: screen lock, no shared user accounts.
- Every JSON or CSV export, and the "case list" appendix, contains identifiers. Treat them like medical records: encrypted or access-controlled storage only, and no personal email or messaging apps.
- The privileging report shows identifiers **only** when "append case list with patient identifiers" is ticked. Share it with the credentialing committee only.
- **Never commit exports to this public repository.** `.gitignore` blocks `data/`, `*.json`, `*.xlsx` and export file names as a safety net, but it is not a guarantee. Check `git status` before committing.
- Research or publication use still needs institutional approval (NMRR and MREC/ethics review). Identifiers must be removed from any research dataset.

## Backups
- Export a JSON backup regularly (Data & settings → Full backup). The app shows the date of your last backup.
- Store backups in an access-controlled location, such as an encrypted drive or your institution-approved storage. Backups contain patient identifiers. **Do not commit them to this repository.** `.gitignore` blocks `*.json`, `*.xlsx` and export files as a safety net.
- Clearing browser data or uninstalling the browser deletes the local store. The app asks the browser for "persistent storage" to lower the risk of automatic eviction, but a backup is the only real safeguard.
