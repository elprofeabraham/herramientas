// SEO + Core Web Vitals auditor (READ-ONLY). Node ESM, no dependencies (Node 18+).
// Usage: node scripts/audit.mjs <config.json>
// Produces: report.json (data) + report.html (branded, self-contained) + updates history.json
// Never modifies the audited site — only fetches public URLs + the PageSpeed API.

import fs from "node:fs";
import path from "node:path";

const cfgPath = process.argv[2];
if (!cfgPath) { console.error("Uso: node scripts/audit.mjs <config.json>"); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

const SITE = cfg.url.replace(/\/+$/, "") + "/";
const KEY = process.env.PAGESPEED_API_KEY || cfg.pagespeed_api_key || "";
const MAX_PAGES = cfg.max_pages ?? 5;
const PSI_RUNS = cfg.psi_runs ?? 3; // varias pasadas: la mediana mata la varianza de Lighthouse
const OUT = cfg.out_dir || path.dirname(cfgPath);

// Entidades de anuncios/terceros conocidas (para detectar "el CWV lo matan los anuncios").
const AD_ENTITIES = /pubmatic|rubicon|magnite|seedtag|smartadserver|smart adserver|inmobi|beeswax|infolinks|criteo|taboola|outbrain|adsense|doubleclick|google\/?ad|googlesyndication|amazon-adsystem|openx|indexexchange|sovrn|33across|a-?mo\.net|prebid|teads|sharethrough|yieldmo|gumgum|empowerlocal|adform|verizon|yahoo|ad manager|gam/i;

const THRESHOLDS = {
  lcp: 2500, tbt: 200, fcp: 1800, cls: 0.1, si: 3400, ttfb: 600, inp: 200,
};

const UA_MOBILE = "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";

// ---------- helpers ----------
async function getText(url, opts = {}) {
  const r = await fetch(url, { redirect: "follow", headers: opts.headers || {} });
  const body = await r.text();
  return { status: r.status, body, headers: r.headers };
}
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} en ${url}`);
  return r.json();
}
const flag = (v, good) => (v == null ? "n/a" : v <= good ? "verde" : v <= good * 1.5 ? "ambar" : "rojo");

// ---------- PageSpeed (una pasada, con diagnósticos accionables) ----------
async function pagespeedOnce(strategy) {
  if (!KEY) return { error: "Sin PAGESPEED_API_KEY" };
  const u = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(SITE)}&key=${KEY}&strategy=${strategy}&category=performance&category=seo&category=accessibility&category=best-practices`;
  try {
    const d = await getJson(u);
    const a = d.lighthouseResult?.audits || {};
    const cats = d.lighthouseResult?.categories || {};
    const num = (k) => a[k]?.numericValue ?? null;
    const originId = d.loadingExperience?.id;

    // Terceros / anuncios: la causa raíz más común de TBT/LCP alto.
    const tpItems = a["third-party-summary"]?.details?.items || [];
    const tpMapped = tpItems.map((it) => ({
      entity: typeof it.entity === "string" ? it.entity : (it.entity?.text || it.entity?.url || "—"),
      blocking: Math.round(it.blockingTime || 0),
      transfer: Math.round(it.transferSize || 0),
      mainThread: Math.round(it.mainThreadTime || 0),
    }));
    tpMapped.sort((x, y) => y.blocking - x.blocking);
    const adEntities = [...new Set(tpMapped.filter((t) => AD_ENTITIES.test(t.entity)).map((t) => t.entity))];

    // Elemento LCP (para saber QUÉ tarda: hero, slider, etc.)
    const lcpEl = a["largest-contentful-paint-element"]?.details?.items?.[0]?.items?.[0]?.node?.snippet
      || a["largest-contentful-paint-element"]?.details?.items?.[0]?.node?.snippet || null;

    return {
      score: Math.round((cats.performance?.score ?? 0) * 100),
      seoScore: Math.round((cats.seo?.score ?? 0) * 100),
      a11yScore: Math.round((cats.accessibility?.score ?? 0) * 100),
      bpScore: Math.round((cats["best-practices"]?.score ?? 0) * 100),
      lcp: num("largest-contentful-paint"),
      tbt: num("total-blocking-time"),
      fcp: num("first-contentful-paint"),
      cls: num("cumulative-layout-shift"),
      si: num("speed-index"),
      ttfb: num("server-response-time"),
      inp: num("interaction-to-next-paint"),
      renderBlocking: (a["render-blocking-resources"]?.details?.items || []).length,
      unoptImages: (a["uses-optimized-images"]?.details?.items || []).length,
      crawlOrigin: originId === "ORIGIN",
      // ---- diagnósticos accionables (nuevos) ----
      diag: {
        totalBytes: num("total-byte-weight"),                 // peso total de la página
        mainThread: num("mainthread-work-breakdown"),         // trabajo del hilo principal
        jsBootup: num("bootup-time"),                         // tiempo de ejecución de JS
        renderBlockingMs: a["render-blocking-resources"]?.details?.overallSavingsMs ?? null,
        unusedJs: a["unused-javascript"]?.details?.overallSavingsBytes ?? null,
        unusedCss: a["unused-css-rules"]?.details?.overallSavingsBytes ?? null,
        imageSavings: a["uses-optimized-images"]?.details?.overallSavingsBytes
          ?? a["modern-image-formats"]?.details?.overallSavingsBytes ?? null,
        cacheSavings: a["uses-long-cache-ttl"]?.details?.overallSavingsBytes ?? null,
        lcpElement: lcpEl,
        thirdPartyBlocking: tpMapped.reduce((s, t) => s + t.blocking, 0),
        thirdPartyTop: tpMapped.slice(0, 6),
        adsDetected: adEntities.length > 0,
        adEntities,
      },
    };
  } catch (e) {
    return { error: String(e.message || e) };
  }
}

const median = (arr) => {
  const v = arr.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

// Corre N pasadas y devuelve la MEDIANA (headline) + rango de las métricas volátiles.
// La varianza de Lighthouse es enorme en sitios con anuncios: una sola medición engaña.
async function pagespeed(strategy) {
  const runs = [];
  for (let i = 0; i < PSI_RUNS; i++) {
    const r = await pagespeedOnce(strategy);
    if (!r.error) runs.push(r);
    else if (i === PSI_RUNS - 1 && !runs.length) return r; // todas fallaron
  }
  if (!runs.length) return { error: "Sin datos de PageSpeed" };
  const pick = (k) => median(runs.map((r) => r[k]));
  // diagnósticos: los de la corrida cuyo score de performance es la mediana
  const scores = runs.map((r) => r.score);
  const medScore = median(scores);
  const repRun = runs.reduce((best, r) =>
    Math.abs(r.score - medScore) < Math.abs(best.score - medScore) ? r : best, runs[0]);
  const rng = (k) => { const xs = runs.map((r) => r[k]).filter((x) => x != null); return xs.length ? [Math.min(...xs), Math.max(...xs)] : null; };
  return {
    score: Math.round(pick("score")), seoScore: Math.round(pick("seoScore")),
    a11yScore: Math.round(pick("a11yScore")), bpScore: Math.round(pick("bpScore")),
    lcp: pick("lcp"), tbt: pick("tbt"), fcp: pick("fcp"), cls: pick("cls"),
    si: pick("si"), ttfb: pick("ttfb"), inp: pick("inp"),
    renderBlocking: repRun.renderBlocking, unoptImages: repRun.unoptImages,
    crawlOrigin: repRun.crawlOrigin, diag: repRun.diag,
    runs: runs.length,
    range: { lcp: rng("lcp"), tbt: rng("tbt"), score: rng("score") },
  };
}

// ---------- On-page SEO (regex heuristics; read-only) ----------
function seoChecks(html, url) {
  const pick = (re) => { const m = html.match(re); return m ? m[1].trim() : null; };
  const all = (re) => { const out = []; let m; while ((m = re.exec(html))) out.push(m[1]); return out; };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i);
  const robots = pick(/<meta[^>]+name=["']robots["'][^>]+content=["']([\s\S]*?)["']/i);
  const canonical = pick(/<link[^>]+rel=["']canonical["'][^>]+href=["']([\s\S]*?)["']/i);
  const lang = pick(/<html[^>]*\blang=["']([\s\S]*?)["']/i);
  const viewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const h1s = all(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  const h2s = all(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
  const imgs = all(/<img\b([^>]*)>/gi);
  const imgsNoAlt = imgs.filter((a) => !/\balt\s*=/i.test(a)).length;
  const og = {
    title: /<meta[^>]+property=["']og:title["']/i.test(html),
    desc: /<meta[^>]+property=["']og:description["']/i.test(html),
    image: /<meta[^>]+property=["']og:image["']/i.test(html),
  };
  const ld = all(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const schemaTypes = [];
  for (const block of ld) {
    const t = block.match(/"@type"\s*:\s*"([^"]+)"/g) || [];
    t.forEach((x) => schemaTypes.push(x.replace(/.*"([^"]+)"$/, "$1")));
  }
  const textOnly = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const words = (textOnly.match(/\b\w+\b/g) || []).length;
  return {
    url,
    title, titleLen: title?.length ?? 0,
    desc, descLen: desc?.length ?? 0,
    robots, canonical, lang, viewport,
    h1Count: h1s.length, h2Count: h2s.length,
    imgCount: imgs.length, imgsNoAlt,
    og, schemaTypes: [...new Set(schemaTypes)],
    words,
  };
}

function seoFindings(s) {
  const f = [];
  if (!s.title) f.push(["rojo", "Falta <title>"]);
  else if (s.titleLen < 30 || s.titleLen > 65) f.push(["ambar", `Título de ${s.titleLen} car. (ideal 30–65)`]);
  if (!s.desc) f.push(["rojo", "Falta meta description"]);
  else if (s.descLen < 70 || s.descLen > 165) f.push(["ambar", `Meta description de ${s.descLen} car. (ideal 70–165)`]);
  if (s.h1Count === 0) f.push(["rojo", "Sin H1"]);
  else if (s.h1Count > 1) f.push(["ambar", `${s.h1Count} H1 (debe ser 1)`]);
  if (!s.canonical) f.push(["ambar", "Sin canonical"]);
  if (!s.lang) f.push(["ambar", "Sin atributo lang en <html>"]);
  if (!s.viewport) f.push(["rojo", "Sin meta viewport (mobile)"]);
  if (s.imgsNoAlt > 0) f.push(["ambar", `${s.imgsNoAlt}/${s.imgCount} imágenes sin alt`]);
  if (!s.og.title || !s.og.image) f.push(["ambar", "Open Graph incompleto (title/image)"]);
  if (s.schemaTypes.length === 0) f.push(["ambar", "Sin datos estructurados (schema.org)"]);
  if (/noindex/i.test(s.robots || "")) f.push(["rojo", "meta robots = noindex (¡no se indexa!)"]);
  if (s.words < 300) f.push(["ambar", `Poco contenido (${s.words} palabras)`]);
  return f;
}

// AEO — Answer Engine Optimization (para IA / motores de respuesta / snippets).
function aeoChecks(s, hasLlmsTxt) {
  const types = (s.schemaTypes || []).map((t) => t.toLowerCase());
  const has = (t) => types.some((x) => x.includes(t));
  const f = [];
  if (!has("faq")) f.push(["ambar", "Sin schema FAQPage (ideal para respuestas directas en IA/Google)"]);
  if (!has("article") && !has("newsarticle") && !has("blogposting")) f.push(["ambar", "Sin schema Article/NewsArticle (contenido editorial)"]);
  if (!has("organization") && !has("website")) f.push(["ambar", "Sin schema Organization/WebSite (entidad de marca)"]);
  if (!has("breadcrumb")) f.push(["ambar", "Sin BreadcrumbList (contexto de navegación)"]);
  if (!hasLlmsTxt) f.push(["ambar", "Sin /llms.txt (estándar emergente para guiar a los modelos de IA)"]);
  if ((s.h2Count ?? 0) < 2) f.push(["ambar", "Pocos subtítulos H2 (los motores de respuesta extraen mejor con secciones claras)"]);
  if (!s.desc) f.push(["rojo", "Sin meta description (clave para el resumen que muestra la IA)"]);
  if ((s.words ?? 0) < 500) f.push(["ambar", "Contenido corto para AEO (los motores prefieren respuestas completas)"]);
  return { schemaTypes: s.schemaTypes || [], hasLlmsTxt, findings: f };
}

// ---------- Anomalías on-page (enlaces basura / dominios sospechosos) ----------
// De casos reales: enlaces placeholder rotos ("Www.404sos.net"), pixeles/trackers dudosos
// (p.ej. *.xyz), y hosts de terceros que conviene que un humano revise.
function findAnomalies(html, site) {
  const host = (() => { try { return new URL(site).host.replace(/^www\./, ""); } catch { return ""; } })();
  const findings = [];
  // Enlaces <a> externos con pinta de basura/placeholder.
  const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  const seen = new Set();
  while ((m = linkRe.exec(html))) {
    const href = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const low = href.toLowerCase();
    if (/^(#|mailto:|tel:|javascript:)/.test(low)) continue;
    let h = ""; try { h = new URL(href, site).host.toLowerCase(); } catch { /* href malformada = ya es sospechosa */ }
    const key = href + "|" + text;
    if (seen.has(key)) continue;
    const reasons = [];
    if (/\s/.test(href) || /https?:\/\/www\.[A-Z]/.test(href)) reasons.push("href malformada");     // "http://Www.404sos.net"
    if (/\b(404|test|placeholder|todo|lorem|ejemplo|xxxx?|dummy|cambiar|pendiente|\.md\b)/i.test(text)) reasons.push("texto de placeholder");
    if (/\.(xyz|top|click|gq|tk|ml)\b/i.test(h) && h && !h.endsWith(host)) reasons.push("TLD de riesgo");
    if (reasons.length) {
      findings.push(["ambar", `Enlace a revisar (${reasons.join(", ")}): "${text.slice(0, 50)}" → ${href.slice(0, 80)}`]);
      seen.add(key);
    }
    if (findings.length >= 15) break;
  }
  // Hosts de <script>/<iframe> de terceros (para ojo humano; marca los "de riesgo").
  const hosts = new Set();
  const srcRe = /<(?:script|iframe)\b[^>]*\bsrc=["']([^"']+)["']/gi;
  while ((m = srcRe.exec(html))) {
    try { const h = new URL(m[1], site).host.toLowerCase(); if (h && !h.endsWith(host)) hosts.add(h); } catch {}
  }
  const thirdPartyHosts = [...hosts];
  const risky = thirdPartyHosts.filter((h) => /\.(xyz|top|click|gq|tk|ml)$/i.test(h) || /pixel|track|cookie/i.test(h));
  for (const h of risky) findings.push(["rojo", `Script/iframe de dominio sospechoso (revisar de dónde sale): ${h}`]);
  // Anuncios detectados en el HTML estático (más fiable que PSI: los servidores de Google a veces
  // NO reciben los mismos anuncios que un navegador real, y third-party-summary sale vacío).
  const adHosts = thirdPartyHosts.filter((h) => AD_ENTITIES.test(h)
    || /adservice|adsystem|googlesyndication|doubleclick|adnxs|adroll|moatads|scorecardresearch|adsafeprotected/i.test(h));
  return { findings, thirdPartyHosts, adHosts };
}

// ---------- sitemap ----------
async function sitemapUrls() {
  try {
    const { body } = await getText(SITE + "sitemap.xml");
    let locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]);
    // if it's a sitemap index, fetch the first child
    if (/sitemapindex/i.test(body) && locs[0]) {
      const child = await getText(locs[0]);
      locs = [...child.body.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => m[1]);
    }
    return locs;
  } catch { return []; }
}

// ---------- main ----------
(async () => {
  console.error(`Auditando ${SITE} ...`);
  const [mobile, desktop] = await Promise.all([pagespeed("mobile"), pagespeed("desktop")]);

  const home = await getText(SITE, { headers: { "User-Agent": UA_MOBILE } });
  const homeSeo = seoChecks(home.body, SITE);

  const robotsTxt = await getText(SITE + "robots.txt").catch(() => ({ status: 0, body: "" }));
  const sitemapOk = /sitemap/i.test(robotsTxt.body) || (await getText(SITE + "sitemap.xml").then((r) => r.status === 200).catch(() => false));

  const urls = (await sitemapUrls()).slice(0, MAX_PAGES);
  const pages = [];
  for (const u of urls) {
    try { const r = await getText(u, { headers: { "User-Agent": UA_MOBILE } }); pages.push({ ...seoChecks(r.body, u), status: r.status }); }
    catch (e) { pages.push({ url: u, error: String(e.message || e) }); }
  }

  // Robustness: did we actually get HTML? (avoid false "your SEO is terrible" on a 403/login/redirect)
  const looksHtml = /<html|<!doctype/i.test(home.body);
  const homeOk = home.status === 200 && looksHtml;
  const fetchError = homeOk ? null : `No se pudo rastrear la portada (HTTP ${home.status}${looksHtml ? "" : ", respuesta no-HTML"}). Puede ser bloqueo, login o redirección — revisa el acceso antes de confiar en el SEO on-page.`;

  // AEO (Answer Engine Optimization): señales para motores de respuesta / IA.
  const llms = await getText(SITE + "llms.txt").then((r) => r.status === 200).catch(() => false);
  const aeo = aeoChecks(homeSeo, llms);

  // Anomalías on-page (enlaces basura / dominios sospechosos) — solo si la portada se rastreó.
  const anomalies = homeOk ? findAnomalies(home.body, SITE) : { findings: [], thirdPartyHosts: [], adHosts: [] };

  // Stack de anuncios: combina lo que vio PSI con lo hallado en el HTML estático (más fiable).
  const adFromPsi = [...new Set([...(mobile.diag?.adEntities || []), ...(desktop.diag?.adEntities || [])])];
  const adStack = {
    detected: (anomalies.adHosts?.length || 0) > 0 || adFromPsi.length > 0,
    hosts: [...new Set([...(anomalies.adHosts || []), ...adFromPsi])],
  };

  // Cabeceras del servidor (gzip / caché) — antes había que sacarlas con curl a mano.
  const hget = (n) => home.headers?.get?.(n) || null;
  const serverHeaders = {
    server: hget("server"),
    contentEncoding: hget("content-encoding"),
    cacheControl: hget("cache-control"),
    vary: hget("vary"),
    xCache: hget("x-cache") || hget("x-nginx-cache") || hget("cf-cache-status") || null,
  };

  const report = {
    site: SITE,
    generatedAt: new Date().toISOString(),
    stack: cfg.stack || {},
    fetchOk: homeOk,
    fetchError,
    homeStatus: home.status,
    cwv: { mobile, desktop, thresholds: THRESHOLDS },
    seoHome: homeOk ? { ...homeSeo, findings: seoFindings(homeSeo) } : { ...homeSeo, findings: [["rojo", fetchError]] },
    seoPages: pages.map((p) => (p.error ? p : { ...p, findings: seoFindings(p) })),
    aeo,
    robots: { status: robotsTxt.status, hasDisallowAll: /Disallow:\s*\/\s*$/im.test(robotsTxt.body), sitemapDeclared: /sitemap/i.test(robotsTxt.body) },
    sitemapReachable: sitemapOk,
    llmsTxt: llms,
    ampDetected: /i-amphtml/i.test(home.body),
    mobileCrawlOk: !mobile.crawlOrigin ? true : true, // origin data presence is informational
    anomalies,
    adStack,
    serverHeaders,
    psiRuns: PSI_RUNS,
  };

  // history
  const histPath = path.join(OUT, "history.json");
  let hist = [];
  try { hist = JSON.parse(fs.readFileSync(histPath, "utf8")); } catch {}
  const prev = hist[hist.length - 1];
  report.delta = prev ? {
    mobileScore: (mobile.score ?? 0) - (prev.mobile?.score ?? 0),
    lcp: (mobile.lcp ?? 0) - (prev.mobile?.lcp ?? 0),
    tbt: (mobile.tbt ?? 0) - (prev.mobile?.tbt ?? 0),
  } : null;
  // Historial compacto (sin diagnósticos pesados) para comparar semana a semana.
  const slim = (s) => s?.error ? { error: s.error } : {
    score: s.score, lcp: s.lcp, tbt: s.tbt, fcp: s.fcp, cls: s.cls, si: s.si, ttfb: s.ttfb,
    runs: s.runs, range: s.range, adsDetected: s.diag?.adsDetected ?? null,
  };
  hist.push({ timestamp: report.generatedAt, mobile: slim(mobile), desktop: slim(desktop), amp: report.ampDetected });
  fs.writeFileSync(histPath, JSON.stringify(hist, null, 2));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.error(`Listo: report.json + history.json — ${PSI_RUNS} pasada(s)/estrategia.`);
  if (adStack.detected) console.error(`⚠ Anuncios/terceros detectados como causa probable de TBT/LCP: ${adStack.hosts.slice(0,6).join(", ")}`);
  if (anomalies.findings.length) console.error(`⚠ ${anomalies.findings.length} anomalía(s) on-page a revisar (ver report.json → anomalies).`);
  console.log(JSON.stringify({ ok: true, out: path.join(OUT, "report.json"),
    mobileScore: mobile.score, desktopScore: desktop.score,
    mobileRange: mobile.range?.score, adsDetected: adStack.detected }) );
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
