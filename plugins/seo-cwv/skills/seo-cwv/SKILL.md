---
name: seo-cwv
description: Audit AND fix SEO / AEO / Core Web Vitals for a website. Runs a read-only audit (PageSpeed Insights API + on-page SEO + AEO/answer-engine signals) producing a branded PDF/HTML report with a green/amber/red scorecard and week-over-week history; THEN, on approval, connects to the site's WordPress (WP-CLI over SSH / REST) and cPanel to APPLY the fixes so Core Web Vitals go green — with backups, dry-run, one-change-at-a-time and re-measure. Multi-site via per-site config. Use when the user wants to audit or optimize a site's SEO/CWV, "get Core Web Vitals in green", check a client's site, or sell an audit/optimization service.
---

# seo-cwv — Auditar y optimizar SEO / AEO / Core Web Vitals

Una skill, dos modos: **AUDITAR** (solo lectura, seguro) y **OPTIMIZAR** (aplica cambios en
WordPress/cPanel, con red de seguridad). Multi-sitio: cada cliente es un archivo en `config/`.

## Requisitos
- `PAGESPEED_API_KEY` (Google) para Core Web Vitals. Pídela al usuario; no la hardcodees.
- Node 18+. Para OPTIMIZAR: acceso SSH con **WP-CLI** en el servidor (lo más potente),
  y/o Application Password de WordPress, y/o token de cPanel. Todo vive en el `config/<sitio>.json`
  del usuario (NUNCA en la skill). Ver `config/EXAMPLE-site.json`.

## MODO 1 — AUDITAR (seguro, empieza siempre por aquí)
1. Toma/crea `config/<sitio>.json` (copia el EXAMPLE; solo `url`, `stack` y `brand` bastan para auditar).
2. `PAGESPEED_API_KEY=... node scripts/audit.mjs config/<sitio>.json` → `report.json` + `history.json`.
   Rastrea CWV (móvil+escritorio), SEO on-page (portada + sitemap) y AEO. Si la portada no se
   puede rastrear (403/login), lo marca — NO reporta el SEO como malo por error de red.
3. `node scripts/report.mjs report.json "<colorMarca>" "<Nombre>"` → `report.html`.
   El reporte YA incluye: veredicto "En pocas palabras" (dinámico), leyenda del semáforo,
   puntuaciones separadas de celular y computadora, interpretación de cada métrica en
   lenguaje cotidiano ("en cristiano") y marca de agua diagonal con la marca.
4. `node scripts/pdf.mjs report.html "<Nombre>-reporte.pdf"` → PDF (usa Chrome/Edge headless,
   sin dependencias externas; Windows/Mac/Linux). Alternativa: abrir el HTML e Imprimir→PDF.
   Entrega: resumen en el chat + PDF descargable. Qué revisa: ver `references/audit-checks.md`.
5. Este modo NO toca el sitio. Úsalo también como carnada comercial (auditar el sitio de un
   prospecto antes de venderle).

## MODO 2 — OPTIMIZAR (aplica cambios — SOLO tras auditar y con aprobación)
Objetivo: dejar los Core Web Vitals en verde arreglando lo que el reporte marcó. Guardarraíles
NO NEGOCIABLES (ver `references/fixes.md`):
1. **Propón el plan** de arreglos priorizado (del reporte) y PIDE aprobación explícita.
2. **Respalda antes de tocar** cualquier archivo/opción (`backupRemote` en `scripts/wp.mjs`).
3. **Dry-run primero**: muestra el comando exacto (`{dryRun:true}`) antes de ejecutarlo.
4. **Un cambio a la vez → RE-MIDE** con PageSpeed → confirma que mejoró (o revierte con el backup).
5. **Bitácora**: registra cada cambio (qué, comando, resultado, backup) para poder deshacer.
6. Al terminar, limpia caché y **re-audita**; entrega el antes/después (qué quedó en verde).
Mecánica: `scripts/wp.mjs` corre WP-CLI por SSH con dry-run y backup. cPanel/.htaccess: respaldar
siempre antes. Recetas concretas (TBT/LCP/CLS/imágenes/servidor/SEO/AEO) en `references/fixes.md`.

## Seguridad y alcance
- Credenciales del cliente: en `config/<sitio>.json` local o variables de entorno. NUNCA en la skill,
  NUNCA en el repositorio, NUNCA en el reporte.
- Nada se modifica sin aprobación. En sitios en vivo de clientes, backups + re-medición son el producto.
- No inventes datos: si falta `PAGESPEED_API_KEY`, dilo (el reporte marca CWV como "sin datos").

## Vender esto (contexto de negocio)
Auditoría = producto de entrada (bajo riesgo, hasta recurrente/mensual). Optimización = premium
("dejamos tus CWV en verde"). El historial permite monitoreo continuo. Ver `references/audit-checks.md`.

## Lecciones de campo (aprendidas en sitios reales — respétalas)
1. **Una sola medición de PageSpeed engaña.** En sitios con anuncios la varianza es brutal
   (visto: TBT 153↔1275 ms y LCP 16↔38 s en la MISMA página, minutos aparte). `audit.mjs` ahora
   corre `psi_runs` pasadas (def. 3) y reporta **mediana + rango**. Al medir antes/después de un
   cambio, **calienta la caché primero** (2–3 visitas) y compara medianas, no números sueltos.
2. **El CWV lo suelen matar los anuncios, no el hosting.** Si el TTFB es bueno pero el LCP/TBT
   es malo, la causa casi siempre es el JS de terceros (header bidding/prebid, PubMatic, Rubicon…).
   El reporte ahora detecta `adsDetected` y lista `thirdPartyTop`. Ningún plugin de caché lo arregla:
   es lazy-load de anuncios / recortar redes / consolidar analítica → **conversación de negocio**, no un toggle.
3. **Antes de prometer arreglos, verifica qué es de pago.** WP-Optimize *gratis* NO trae lazy-load,
   WebP ni Auto-LCP (son premium). Revisa el plugin real antes de planear.
4. **En sitios de noticias, `Cache-Control: no-store` en el HTML es correcto** (quieres titulares
   frescos); lo que importa es la caché de servidor (TTFB) y la de estáticos, no cachear el HTML.
5. **Revisa anomalías on-page**: enlaces basura/placeholder rotos y dominios sospechosos
   (pixeles/trackers `*.xyz`). El reporte los marca en `anomalies` — trátalos como posible
   problema de calidad/seguridad y consulta al usuario antes de tocar.
6. **Verifica cada cambio en el HTML público** (curl con User-Agent de navegador completo; algunos
   hosts devuelven "Not Acceptable" a UAs simples). No confíes solo en el "Guardado" del panel.
7. **Multi-capa de caché = conflictos.** Dos plugins de page-cache activos (p.ej. WP Super Cache +
   WP-Optimize) se pisan; desactiva el que sobre. Ojo también con la capa nginx del hosting.

## Archivos
- `scripts/audit.mjs` — auditoría (CWV + SEO + AEO), solo lectura.
- `scripts/report.mjs` — reporte HTML branded (veredicto + interpretación coloquial + marca de agua).
- `scripts/pdf.mjs` — convierte el HTML a PDF con Chrome/Edge headless (sin dependencias).
- `scripts/wp.mjs` — helpers de aplicación (WP-CLI/SSH) con dry-run + backup.
- `config/EXAMPLE-site.json` — plantilla de configuración por sitio.
- `references/audit-checks.md` — qué se revisa. `references/fixes.md` — playbook de arreglos.
