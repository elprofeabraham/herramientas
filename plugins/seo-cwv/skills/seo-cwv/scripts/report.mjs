// Builds a branded, self-contained HTML report from report.json.
// Usage: node scripts/report.mjs <report.json> [brandColorHex] [brandName]
// Output: report.html next to the json. Convert to PDF with scripts/pdf.mjs.
import fs from "node:fs";
import path from "node:path";

const jsonPath = process.argv[2];
if (!jsonPath) { console.error("Uso: node scripts/report.mjs <report.json> [color] [marca]"); process.exit(1); }
const r = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
const ACCENT = process.argv[3] || "#0FA3A3";
const BRAND = process.argv[4] || "Auditoría SEO + Core Web Vitals";

const COL = { verde: "#1D9A6C", ambar: "#E0A500", rojo: "#D64545", "n/a": "#9AA0A6" };
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const ms = (v) => (v == null ? "—" : v >= 1000 ? (v / 1000).toFixed(2) + " s" : Math.round(v) + " ms");
const cls = (v) => (v == null ? "—" : Number(v).toFixed(3));
const flag = (v, good) => (v == null ? "n/a" : v <= good ? "verde" : v <= good * 1.5 ? "ambar" : "rojo");
const dot = (state) => `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;background:${COL[state]};margin-right:6px;vertical-align:middle"></span>`;
const th = r.cwv.thresholds;

function cwvRow(label, key, good, unit = true) {
  const m = r.cwv.mobile?.[key], d = r.cwv.desktop?.[key];
  const val = (v) => (unit ? ms(v) : cls(v));
  return `<tr><td>${label}</td>
    <td>${dot(flag(m, good))}${val(m)}</td>
    <td>${dot(flag(d, good))}${val(d)}</td></tr>`;
}
function findingsList(f) {
  if (!f || !f.length) return `<span style="color:${COL.verde}">✓ Sin problemas</span>`;
  return "<ul>" + f.map(([s, t]) => `<li>${dot(s)}${esc(t)}</li>`).join("") + "</ul>";
}

const mob = r.cwv.mobile || {}, des = r.cwv.desktop || {};
const scoreColor = (n) => (n >= 90 ? COL.verde : n >= 50 ? COL.ambar : COL.rojo);
const gauge = (n, label) => `<div class="gauge"><div class="num" style="color:${scoreColor(n)}">${n ?? "—"}</div><div class="lbl">${label}</div></div>`;

const pagesHtml = r.seoPages.map((p) => p.error
  ? `<tr><td colspan="2">${esc(p.url)} — <span style="color:${COL.rojo}">error</span></td></tr>`
  : `<tr><td style="max-width:340px;word-break:break-all">${esc(p.url)}</td><td>${findingsList(p.findings)}</td></tr>`).join("");

// ---------- Interpretación en lenguaje cotidiano (dinámica) ----------
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const joinNat = (a) => a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1];
const good = (v, g) => v != null && v <= g;

const minScore = Math.min(mob.score ?? 100, des.score ?? 100);
const overallWord = minScore >= 90 ? "está muy bien" : minScore >= 50 ? "está bien, con cosas por pulir" : "necesita mejoras";
const qualifier = minScore >= 90 ? "eso es sobresaliente (arriba de 90 se considera excelente)"
  : minScore >= 50 ? "va por buen camino, pero hay margen de mejora"
  : "conviene ponerle atención";

const pos = [];
if (good(des.lcp, th.lcp) && good(mob.lcp, th.lcp * 1.5)) pos.push("carga rápido");
else if (good(des.lcp, th.lcp)) pos.push("carga rápido en computadora");
if (good(mob.cls, th.cls) && good(des.cls, th.cls)) pos.push("no se mueve ni “brinca” mientras carga");
if (good(mob.tbt, th.tbt) && good(des.tbt, th.tbt)) pos.push("responde al instante al tocarla");
if ((mob.seoScore ?? 0) >= 90) pos.push("los buscadores la entienden bien");
const cwvSentence = pos.length ? `<b>${cap(joinNat(pos))}.</b> ` : "";

let reds = 0;
for (const [k, g] of [["lcp", th.lcp], ["fcp", th.fcp], ["si", th.si], ["tbt", th.tbt], ["cls", th.cls], ["ttfb", th.ttfb]])
  for (const dev of [mob, des]) if (flag(dev[k], g) === "rojo") reds++;
const closer = reds > 0
  ? "Hay puntos marcados en rojo que conviene revisar (mira la tabla de abajo)."
  : "No hay nada urgente que arreglar; lo que aparece en amarillo son detalles finos, no problemas.";

const verdict = `<div class="verdict">
  <h3>En pocas palabras 👇</h3>
  <p>Tu página <span class="big">${overallWord}</span>. Google la califica con <b>${mob.score ?? "—"} de 100 en celular</b> y <b>${des.score ?? "—"} de 100 en computadora</b> — ${qualifier}. ${cwvSentence}${closer}</p>
  <div class="key">
    <span><i style="background:${COL.verde}"></i> Verde = está bien, nada que hacer</span>
    <span><i style="background:${COL.ambar}"></i> Amarillo = se puede pulir, pero no es grave</span>
    <span><i style="background:${COL.rojo}"></i> Rojo = conviene atenderlo</span>
  </div>
</div>`;

const plain = `<h2>¿Qué significa cada número? (en cristiano)</h2>
<div class="plain">
  <div class="row"><b>LCP — “¿tarda en verse?”</b><span class="txt">Cuánto tarda en aparecer lo principal de la página. Ojo: el número se mide con una <b>prueba de estrés</b> (Google simula el celular más lento y la peor señal de internet), así que tus visitantes reales lo ven mucho más rápido. Tu caso: ${ms(mob.lcp)} en celular · ${ms(des.lcp)} en computadora.</span></div>
  <div class="row"><b>CLS — “¿brinca?”</b><span class="txt">Si los textos y botones se mueven solos mientras carga (eso molesta y hace que la gente le pique a lo que no quería). Mientras más cerca de 0, mejor. Tu caso: ${cls(mob.cls)} en celular · ${cls(des.cls)} en computadora.</span></div>
  <div class="row"><b>TBT — “¿se traba?”</b><span class="txt">Si la página se queda “pensando” y no responde al tocarla. Tu caso: ${ms(mob.tbt)} en celular · ${ms(des.tbt)} en computadora.</span></div>
  <div class="row"><b>FCP — “¿cuándo veo algo?”</b><span class="txt">Cuándo aparece el primer contenido en pantalla. Igual que el LCP, el número es de la prueba de estrés; en la vida real es casi inmediato.</span></div>
  <div class="row"><b>TTFB — “¿responde el servidor?”</b><span class="txt">Lo que tarda tu servidor en contestar antes de empezar a mostrar nada. Tu caso: ${ms(mob.ttfb)} en celular · ${ms(des.ttfb)} en computadora.</span></div>
</div>`;

// ---------- Nuevas secciones (varianza, diagnóstico, anomalías) ----------
const kb = (b) => (b == null ? null : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB");
const sTime = (v) => (v == null ? "—" : v >= 1000 ? (v / 1000).toFixed(1) + " s" : Math.round(v) + " ms");

const rng = (a, f) => (a && a.length === 2 ? `${f(a[0])}–${f(a[1])}` : "—");
const varianceNote = (mob.runs || des.runs)
  ? `<p class="sub" style="margin:6px 0 0">Medición basada en la <b>mediana de ${mob.runs ?? des.runs} pasada(s)</b> por dispositivo. Rango observado en celular — LCP: <b>${rng(mob.range?.lcp, sTime)}</b> · TBT: <b>${rng(mob.range?.tbt, sTime)}</b>. ${
      (mob.range?.tbt && mob.range.tbt[1] - mob.range.tbt[0] > 400)
      ? "⚠️ El rango es muy amplio: los números bailan de una carga a otra (típico de sitios con muchos anuncios/JS de terceros), así que léelos como referencia, no al milímetro." : ""}</p>`
  : "";

const dg = mob.diag || {};
const diagRows = [
  ["Peso total de la página", kb(dg.totalBytes)],
  ["Trabajo del hilo principal", sTime(dg.mainThread)],
  ["Ejecución de JavaScript", sTime(dg.jsBootup)],
  ["Recursos que bloquean el pintado", dg.renderBlockingMs != null ? `~${sTime(dg.renderBlockingMs)} de ahorro` : null],
  ["JavaScript sin usar", kb(dg.unusedJs)],
  ["CSS sin usar", kb(dg.unusedCss)],
  ["Ahorro posible en imágenes", kb(dg.imageSavings)],
  ["Ahorro por caché de estáticos", kb(dg.cacheSavings)],
].filter(([, v]) => v != null && v !== "—");

const adDetected = dg.adsDetected || r.adStack?.detected;
const adList = [...new Set([...(dg.adEntities || []), ...((r.adStack?.hosts) || [])])].slice(0, 8);
const adsCallout = adDetected
  ? `<div style="margin:10px 0;padding:12px 16px;border-radius:10px;background:#FFF6E5;border:1px solid ${COL.ambar};color:#7a5a00;font-size:13px">
      <b>La velocidad la frena, sobre todo, la publicidad.</b> Se detectaron redes de anuncios / scripts de terceros
      (${esc(adList.join(", "))}) que cargan mucho JavaScript y disparan el bloqueo.
      Esto <b>no se arregla con un plugin de caché</b>: se mejora aplazando/reduciendo anuncios y consolidando la analítica.</div>`
  : "";

const tpRows = (dg.thirdPartyTop || []).filter((t) => t.blocking > 0).slice(0, 6)
  .map((t) => `<tr><td>${esc(t.entity)}</td><td>${sTime(t.blocking)}</td><td>${kb(t.transfer) || "—"}</td></tr>`).join("");

const diagSection = (diagRows.length || adsCallout || tpRows)
  ? `<h2>¿Por qué está lento? (diagnóstico)</h2>
     ${adsCallout}
     ${diagRows.length ? `<table><tbody>${diagRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</tbody></table>` : ""}
     ${dg.lcpElement ? `<div class="sub" style="margin-top:8px">Elemento más pesado (LCP): <code>${esc(String(dg.lcpElement).slice(0, 120))}</code></div>` : ""}
     ${tpRows ? `<div class="sub" style="margin-top:12px">Terceros que más bloquean:</div>
       <table><thead><tr><th>Servicio</th><th>Bloqueo</th><th>Peso</th></tr></thead><tbody>${tpRows}</tbody></table>` : ""}`
  : "";

const anomFindings = r.anomalies?.findings || [];
const anomaliesSection = anomFindings.length
  ? `<h2>Anomalías a revisar 🔍</h2>
     <p class="plain" style="margin:0 0 8px">Detalles de calidad/seguridad encontrados en la portada. <b>No se tocaron</b>; conviene revisarlos:</p>
     ${findingsList(anomFindings)}`
  : "";

const sh = r.serverHeaders || {};
const headersSection = (sh.server || sh.cacheControl || sh.contentEncoding || sh.xCache)
  ? `<tr><td>Servidor / caché</td><td class="sub" style="border:none">${esc([sh.server, sh.contentEncoding ? "compresión: " + sh.contentEncoding : "sin compresión declarada", sh.xCache ? "capa caché: " + sh.xCache : null, sh.cacheControl ? "cache-control: " + sh.cacheControl : null].filter(Boolean).join(" · "))}</td></tr>`
  : "";

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>${esc(BRAND)} — ${esc(r.site)}</title>
<style>
  :root{--accent:${ACCENT};--ink:#1c1c1e;--muted:#6b7075;--line:#e6e6e6;}
  *{box-sizing:border-box} body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:var(--ink);margin:0;padding:40px;max-width:900px;margin:auto}
  *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  h1{font-size:26px;margin:0} h2{font-size:18px;border-left:4px solid var(--accent);padding-left:10px;margin:34px 0 12px}
  .sub{color:var(--muted);font-size:13px;margin-top:4px}
  .bar{height:6px;background:var(--accent);border-radius:3px;margin:18px 0 8px}
  table{width:100%;border-collapse:collapse;font-size:14px;margin-top:6px}
  th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
  th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px}
  .gauges{display:flex;gap:22px;margin:14px 0}
  .gauge{flex:1;text-align:center;border:1px solid var(--line);border-radius:12px;padding:16px}
  .gauge .num{font-size:40px;font-weight:800;line-height:1} .gauge .lbl{color:var(--muted);font-size:12px;margin-top:6px}
  ul{margin:4px 0;padding-left:18px} li{margin:2px 0;font-size:13px}
  .foot{margin-top:40px;color:var(--muted);font-size:11px;border-top:1px solid var(--line);padding-top:12px}
  .pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600}
  .verdict{background:#f7fbfb;border:1px solid var(--line);border-left:5px solid var(--accent);border-radius:12px;padding:18px 20px;margin:22px 0 6px}
  .verdict h3{margin:0 0 6px;font-size:17px} .verdict p{margin:0;font-size:14px;line-height:1.55}
  .verdict .big{font-weight:800;color:${COL.verde}}
  .key{display:flex;gap:18px;flex-wrap:wrap;margin:12px 0 0;font-size:12.5px}
  .key span{display:flex;align-items:center;gap:7px} .key i{width:12px;height:12px;border-radius:50%;display:inline-block}
  .plain{font-size:13.5px;line-height:1.55}
  .plain .row{display:flex;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}
  .plain .row:last-child{border-bottom:none} .plain .row b{flex:0 0 160px} .plain .row .txt{color:#333}
  .credit{display:flex;align-items:center;gap:8px;margin-top:6px;color:var(--muted);font-size:11px} .credit b{color:var(--accent)}
  .watermark{position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-32deg);
    font-size:70px;font-weight:800;letter-spacing:2px;color:var(--accent);opacity:.07;
    white-space:nowrap;z-index:0;pointer-events:none;text-align:center;line-height:1.25}
  .watermark small{display:block;font-size:24px;font-weight:600;letter-spacing:1px}
  body>*:not(.watermark){position:relative;z-index:1}
</style></head><body>
<div class="watermark">${esc(BRAND).toUpperCase()}<small>auditoría SEO · CWV</small></div>
<div class="bar"></div>
<h1>${esc(BRAND)}</h1>
<div class="sub">${esc(r.site)} · ${new Date(r.generatedAt).toLocaleString("es-MX")}</div>
${r.fetchOk ? "" : `<div style="margin-top:14px;padding:12px 16px;border-radius:10px;background:#FBE9E7;border:1px solid ${COL.rojo};color:#8a2b1f;font-size:13px">⚠️ ${esc(r.fetchError)}</div>`}

${verdict}

<h2>Puntuaciones en celular 📱</h2>
<div class="gauges">
  ${gauge(mob.score, "Rendimiento")}
  ${gauge(mob.seoScore, "SEO")}
  ${gauge(mob.a11yScore, "Accesibilidad")}
  ${gauge(mob.bpScore, "Buenas prácticas")}
</div>

<h2>Puntuaciones en computadora 💻</h2>
<div class="gauges">
  ${gauge(des.score, "Rendimiento")}
  ${gauge(des.seoScore, "SEO")}
  ${gauge(des.a11yScore, "Accesibilidad")}
  ${gauge(des.bpScore, "Buenas prácticas")}
</div>

<h2>Core Web Vitals</h2>
<table><thead><tr><th>Métrica</th><th>Móvil</th><th>Escritorio</th></tr></thead><tbody>
  ${cwvRow("LCP (carga)", "lcp", th.lcp)}
  ${cwvRow("TBT (bloqueo)", "tbt", th.tbt)}
  ${cwvRow("FCP (1er pintado)", "fcp", th.fcp)}
  ${cwvRow("CLS (estabilidad)", "cls", th.cls, false)}
  ${cwvRow("Speed Index", "si", th.si)}
  ${cwvRow("TTFB (servidor)", "ttfb", th.ttfb)}
</tbody></table>
${varianceNote}

${plain}

${diagSection}

<h2>Estado técnico</h2>
<table><tbody>
  <tr><td>Rastreo móvil</td><td>${r.mobileCrawlOk ? dot("verde") + "OK" : dot("rojo") + "Con problemas"}</td></tr>
  <tr><td>Plugin AMP</td><td>${r.ampDetected ? dot("rojo") + "Activo (puede afectar TBT)" : dot("verde") + "No detectado"}</td></tr>
  <tr><td>sitemap.xml</td><td>${r.sitemapReachable ? dot("verde") + "Accesible" : dot("ambar") + "No encontrado"}</td></tr>
  <tr><td>llms.txt (IA)</td><td>${r.llmsTxt ? dot("verde") + "Presente" : dot("ambar") + "Ausente"}</td></tr>
  <tr><td>robots.txt</td><td>${r.robots.status === 200 ? dot("verde") + "OK" : dot("ambar") + "No encontrado"}${r.robots.hasDisallowAll ? " · " + dot("rojo") + "Disallow / (bloquea todo)" : ""}</td></tr>
  ${headersSection}
</tbody></table>

<h2>SEO on-page — Portada</h2>
${findingsList(r.seoHome.findings)}
<div class="sub" style="margin-top:8px">Título: “${esc(r.seoHome.title)}” (${r.seoHome.titleLen}) · H1: ${r.seoHome.h1Count} · H2: ${r.seoHome.h2Count} · Schema: ${r.seoHome.schemaTypes.join(", ") || "—"} · Palabras: ${r.seoHome.words}</div>

<h2>SEO on-page — Páginas del sitemap</h2>
<table><thead><tr><th>URL</th><th>Hallazgos</th></tr></thead><tbody>${pagesHtml || '<tr><td colspan="2">Sin páginas rastreadas</td></tr>'}</tbody></table>


<h2>AEO — Que la IA te recomiende (ChatGPT, Gemini, Google)</h2>
<p class="plain" style="margin:0 0 10px">Esto mide qué tan fácil le resulta a la inteligencia artificial <b>entender y citar tu página</b> cuando alguien pregunta por ti. Lo de abajo son <b>ideas opcionales</b> para aparecer todavía más, no fallas:</p>
${findingsList(r.aeo.findings)}
<div class="sub" style="margin-top:8px">Schema detectado: ${r.aeo.schemaTypes.join(", ") || "—"} · llms.txt: ${r.llmsTxt ? "✓" : "✗"}</div>

${anomaliesSection}

<div class="foot">Auditoría automatizada de solo lectura. Umbrales: LCP&lt;${th.lcp}ms · TBT&lt;${th.tbt}ms · FCP&lt;${th.fcp}ms · CLS&lt;${th.cls} · TTFB&lt;${th.ttfb}ms. No se realizaron cambios en el sitio.
<div class="credit">◆ Reporte generado con la skill de auditoría <b>SEO · CWV</b>${BRAND && BRAND !== "Auditoría SEO + Core Web Vitals" ? " de " + esc(BRAND) : ""}</div></div>
</body></html>`;

const outHtml = path.join(path.dirname(jsonPath), "report.html");
fs.writeFileSync(outHtml, html);
console.log(outHtml);
