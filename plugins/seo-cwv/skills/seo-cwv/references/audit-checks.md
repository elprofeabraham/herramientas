# Qué revisa la auditoría (SEO · AEO · CWV)

## Core Web Vitals (vía PageSpeed Insights API — necesita PAGESPEED_API_KEY)
| Métrica | Bueno | Qué es |
|---|---|---|
| LCP | < 2500 ms | Carga del elemento principal (suele ser la imagen hero) |
| TBT | < 200 ms | Tiempo que el hilo está bloqueado por JS |
| CLS | < 0.1 | Estabilidad visual (que no "salte" el layout) |
| FCP | < 1800 ms | Primer pintado |
| Speed Index | < 3400 ms | Qué tan rápido se ve completo |
| TTFB | < 600 ms | Respuesta del servidor |
Score = performance.score × 100. Se guarda historial para comparar semana a semana.

### Multi-pasada (mediana + rango) — clave contra la varianza
`audit.mjs` corre **`psi_runs` pasadas** por estrategia (def. 3, configúralo en el JSON del sitio) y
reporta la **mediana** como titular y el **rango [min–max]** de LCP/TBT/score. En sitios con anuncios
un solo número no significa nada (visto: TBT 153↔1275 ms en la misma página).

### Diagnósticos accionables (por qué está lento) — en `cwv.*.diag`
`totalBytes` (peso de página), `mainThread` (trabajo del hilo principal), `jsBootup` (ejecución JS),
`renderBlockingMs`, `unusedJs`, `unusedCss`, `imageSavings`, `cacheSavings`, `lcpElement` (qué tarda),
y **terceros/anuncios**: `thirdPartyBlocking`, `thirdPartyTop` (top por blocking time) y
`adsDetected`/`adEntities`. Regla: TTFB bueno + LCP/TBT malo ⇒ la causa es el JS de terceros (anuncios).

### Cabeceras del servidor — en `serverHeaders`
`server`, `contentEncoding` (gzip/br), `cacheControl`, `vary`, `xCache` (x-cache / x-nginx-cache / cf-cache-status).
En medios, `no-store` en el HTML es normal; lo relevante es la caché de servidor y de estáticos.

### Anomalías on-page — en `anomalies`
Enlaces basura/placeholder o con href malformada (p.ej. `http://Www.404sos.net`), texto tipo
"placeholder/test/.md", y **scripts/iframes de dominios sospechosos** (`*.xyz`, pixeles/trackers).
Se marcan para revisión humana; NO se tocan en modo auditar.

## SEO on-page (rastreo del HTML público — portada + páginas del sitemap)
Título (30–65), meta description (70–165), un solo H1, jerarquía H2+, `alt` en imágenes,
`canonical`, atributo `lang`, meta `viewport`, Open Graph (title/image), datos estructurados
(schema.org), `robots.txt` (sin Disallow general), `sitemap.xml`, meta robots (no `noindex`),
volumen de contenido.

## AEO — Answer Engine Optimization (para IA / motores de respuesta / snippets)
Schema **FAQPage** (respuestas directas), **Article/NewsArticle**, **Organization/WebSite**
(entidad de marca), **BreadcrumbList**; **/llms.txt** (estándar emergente para guiar modelos);
secciones claras con H2; meta description (resumen que muestra la IA); contenido completo.

## Robustez
Si la portada responde 403 / login / redirección, el reporte lo marca como "no rastreable"
y NO reporta el SEO como malo por error de red.
