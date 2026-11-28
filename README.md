# ToraDelia / תורה דיליה

## Windows Portable release notes

- Student ID lookup checks the configured direct Google Sheets connection and the Apps Script registration webhook.
- A full name returned by the registration source is recognized even when the webhook does not return separate first-name and last-name fields.
- A temporary registration lookup failure is not treated as a missing name or an unregistered student.
- If an ID is registered but its audio or handwriting folder is missing, the application reports a folder/connection problem instead of claiming that no account exists.
- Voice folder lookup can use the full name from central registration when the local CSV is not available.
- Numeric Google Sheets ID cells are normalized to nine digits before comparison, preserving leading zeroes.

Extract the portable ZIP while preserving its folder structure, then launch `ToraDelia-Kiosk.exe`.
