# ToraDelia / תורה דיליה

## Windows Portable release notes

- PDF documents are downloaded as data and their text is extracted inside the application with the bundled PDF.js worker.
- PDF card previews display extracted text in the same in-app preview surface used for Word documents. They do not open the browser's native PDF viewer.
- Printing a PDF uses the extracted text and the same HTML printing flow as Word documents.
- Electron kiosk printing is enabled to avoid opening Chromium's print preview.
- Handwriting PDF retrieval can fall back to the local student registration record when the dedicated Google Sheets name mapping is unavailable.
- The Windows build runs ESLint and TypeScript checks, builds the Next.js standalone app and Electron portable app, validates the ZIP contents, and uploads a separate immutable versioned package.

Extract the ZIP while preserving its folder structure, then launch `ToraDelia-Kiosk.exe`.
