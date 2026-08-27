# Skill: Auditoría SEO · AEO · Core Web Vitals

Skill para **Claude Code** que audita un sitio web (velocidad, SEO y qué tan bien lo entiende la IA)
y genera un **reporte en PDF con los colores de tu marca**, con veredicto en lenguaje sencillo,
puntuaciones de celular y computadora, y marca de agua. Opcionalmente aplica arreglos en
WordPress/cPanel (con respaldos y aprobación).

Creada y compartida por **El Profe Abraham**.

## Requisitos
- [Node.js](https://nodejs.org) 18 o superior.
- Una **API key gratuita de PageSpeed Insights** (Google):
  https://developers.google.com/speed/docs/insights/v5/get-started
- Para generar PDF: tener Chrome, Chromium o Edge instalado (ya viene en casi todas las computadoras).

## Instalación
Copia la carpeta `seo-cwv` dentro de tus skills de Claude Code:
- Windows: `C:\Users\TU_USUARIO\.claude\skills\`
- Mac/Linux: `~/.claude/skills/`

Reinicia Claude Code y pídele: **"usa la skill seo-cwv para https://el-sitio-que-sea.com"**.

## Uso manual (sin Claude, desde la terminal)
```bash
# 1) Auditar (crea config/report.json)
PAGESPEED_API_KEY=TU_KEY node scripts/audit.mjs config/mi-sitio.json

# 2) Reporte HTML branded (color y nombre de tu marca)
node scripts/report.mjs config/report.json "#20C4C4" "Mi Marca"

# 3) PDF listo para compartir
node scripts/pdf.mjs config/report.html "Reporte-Mi-Marca.pdf"
```
En Windows (PowerShell), la key se pone así: `$env:PAGESPEED_API_KEY="TU_KEY"` antes del paso 1.

## Cada sitio = un archivo en `config/`
Copia `config/EXAMPLE-site.json`, renómbralo (ej. `config/mi-sitio.json`) y edita `url`, `brand` y `stack`.
Para **solo auditar** basta con `url`, `stack` y `brand`. Las credenciales (WordPress/SSH/cPanel)
solo hacen falta para el modo que APLICA arreglos.

## Seguridad
- **Nunca** compartas tus archivos de `config/` con credenciales o tu API key.
- El reporte es de **solo lectura**: no toca el sitio. Los arreglos requieren tu aprobación explícita.
