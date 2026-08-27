# Playbook de arreglos (aplicar en WordPress/cPanel) — con red de seguridad

REGLA DE ORO: por cada arreglo → (1) RESPALDA, (2) muestra el plan y PIDE aprobación,
(3) aplica UNO, (4) RE-MIDE con PageSpeed, (5) registra en bitácora; si no mejora, REVIERTE.
Usa `scripts/wp.mjs` (WP-CLI por SSH con dryRun/backup). Nunca escribas credenciales en la skill.

## TBT alto (JS bloqueante)
- Detectar plugin AMP problemático: `wp plugin list --status=active`. Si "amp" está activo y
  el HTML trae `i-amphtml`, proponer desactivarlo/reconfigurarlo: `wp plugin deactivate amp`
  (SOLO tras aprobación; respaldar antes con export de settings).
- WP Rocket: activar "Delay JavaScript Execution" y "Load JS deferred". Vía WP-CLI/opciones
  o guiar al usuario en el dashboard si Rocket no expone la opción por CLI.

## LCP alto (imagen hero)
- Añadir `fetchpriority="high"` + `<link rel="preload">` a la imagen hero. Si usan WPCode,
  activar/insertar el snippet `elzenit-lcp-fix`. Respaldar el snippet antes de tocarlo.
- `preconnect` a `fonts.googleapis.com` / `fonts.gstatic.com` en el <head>.

## CLS (saltos de layout)
- Reservar dimensiones (width/height) en imágenes; revisar fuentes con `font-display: swap`.

## Imágenes sin optimizar
- Con Imagify/ShortPixel activo: `wp media regenerate` y forzar optimización masiva desde el plugin.

## Servidor / cPanel (.htaccess)
- Compresión gzip/brotli + cache-control de estáticos en `.htaccess`. SIEMPRE respaldar
  `.htaccess` antes: `backupRemote(cfg, "~/public_html/.htaccess")`. Cambios mínimos y verificados.

## SEO/AEO
- Rank Math: activar sitemap, schema Organization/Article/FAQ. Guiar en el dashboard o vía CLI.
- Crear `/llms.txt` con las secciones clave del sitio (AEO).
- Corregir title/meta/H1/alt según el reporte.

## Después de cada tanda
Limpiar caché (`wp rocket clean --confirm` o el plugin activo) y re-medir. Reportar el
antes/después y qué quedó en verde.
