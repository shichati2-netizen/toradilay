const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const pdfjsRoot = path.join(root, "node_modules", "pdfjs-dist");
const publicRoot = path.join(root, "public");
const workerSource = path.join(pdfjsRoot, "legacy", "build", "pdf.worker.mjs");
const workerTarget = path.join(publicRoot, "pdf.worker.mjs");

if (!fs.existsSync(workerSource)) {
  console.error("PDF.js worker is missing:", workerSource);
  process.exit(1);
}

fs.mkdirSync(publicRoot, { recursive: true });
fs.copyFileSync(workerSource, workerTarget);

for (const directory of ["cmaps", "standard_fonts"]) {
  const source = path.join(pdfjsRoot, directory);
  const target = path.join(publicRoot, "pdfjs", directory);
  if (!fs.existsSync(source)) {
    console.error("PDF.js resource directory is missing:", source);
    process.exit(1);
  }
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true });
}

console.log("Prepared the matching PDF.js worker, CMaps and standard fonts in public/");
