const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const source = path.join(root, ".next", "standalone");
const target = path.join(root, "standalone");

if (!fs.existsSync(path.join(source, "server.js"))) {
  console.error("Next.js standalone output was not found. Ensure next.config.ts has output: 'standalone'.");
  process.exit(1);
}
fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });
const staticSource = path.join(root, ".next", "static");
const staticTarget = path.join(target, ".next", "static");
if (fs.existsSync(staticSource)) {
  fs.mkdirSync(path.dirname(staticTarget), { recursive: true });
  fs.cpSync(staticSource, staticTarget, { recursive: true });
}
const publicSource = path.join(root, "public");
if (fs.existsSync(publicSource)) fs.cpSync(publicSource, path.join(target, "public"), { recursive: true });
// PDF.js loads its worker dynamically at runtime. Ensure the worker is present
// in the Portable standalone package even when Next's file tracer omits it.
const pdfWorkerRelative = path.join("node_modules", "pdfjs-dist", "legacy", "build", "pdf.worker.mjs");
const pdfWorkerSource = path.join(root, pdfWorkerRelative);
const pdfWorkerTarget = path.join(target, pdfWorkerRelative);
if (fs.existsSync(pdfWorkerSource)) {
  fs.mkdirSync(path.dirname(pdfWorkerTarget), { recursive: true });
  fs.copyFileSync(pdfWorkerSource, pdfWorkerTarget);
  console.log("Included PDF.js worker at", pdfWorkerTarget);
} else {
  console.warn("PDF.js worker was not found at", pdfWorkerSource);
}
console.log("Prepared Next.js standalone app at", target);
