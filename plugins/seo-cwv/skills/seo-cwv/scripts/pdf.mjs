// Converts an HTML report to PDF using headless Chrome/Edge (no external deps).
// Usage: node scripts/pdf.mjs <report.html> [output.pdf]
// Works on Windows, macOS and Linux as long as Chrome, Chromium or Edge is installed.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const inArg = process.argv[2];
if (!inArg) { console.error("Uso: node scripts/pdf.mjs <report.html> [salida.pdf]"); process.exit(1); }
const inHtml = path.resolve(inArg);
if (!fs.existsSync(inHtml)) { console.error("No existe: " + inHtml); process.exit(1); }
const outPdf = path.resolve(process.argv[3] || inHtml.replace(/\.html?$/i, "") + ".pdf");

const candidates = process.platform === "win32"
  ? [
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
      (process.env.LOCALAPPDATA || "") + "/Google/Chrome/Application/chrome.exe",
      "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
      "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    ]
  : process.platform === "darwin"
  ? [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ]
  : [
      "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium", "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge", "/snap/bin/chromium",
    ];

const chrome = candidates.find((p) => { try { return fs.existsSync(p); } catch { return false; } });
if (!chrome) {
  console.error("No encontré Chrome/Chromium/Edge. Instala uno o abre el .html y usa 'Imprimir → Guardar como PDF'.");
  process.exit(2);
}

const fileUrl = "file:///" + inHtml.replace(/\\/g, "/");
const res = spawnSync(chrome, [
  "--headless", "--disable-gpu", "--no-pdf-header-footer",
  `--print-to-pdf=${outPdf}`, fileUrl,
], { stdio: "ignore" });

if (res.error || !fs.existsSync(outPdf)) {
  console.error("No se pudo generar el PDF." + (res.error ? " " + res.error.message : ""));
  process.exit(3);
}
console.log(outPdf);
