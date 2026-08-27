# El Profe Abraham · Herramientas

Catálogo de **skills de IA para Claude Code** de El Profe Abraham. Este repo es dos cosas a la vez:

1. **Marketplace de plugins** → la gente instala cualquier skill con `/plugin`.
2. **Fuente de las fichas web** → cada skill tiene su página en `elprofeabraham.com/herramientas/<slug>`.

Todo sale de **una sola fuente de verdad** por skill: un archivo en `fichas/`. Corres el generador y se
actualizan las páginas web **y** el `marketplace.json` juntos.

## Instalar una skill (lo que ve tu audiencia)

```bash
/plugin marketplace add elprofeabraham/herramientas
/plugin install seo-cwv@elprofeabraham
```

En la app de escritorio es igual: abre `/plugin`, busca la skill en el catálogo `elprofeabraham` y dale Instalar.

## Estructura

```
catalogo.json                 ← datos globales (nombre, owner, GitHub, CTA)
fichas/<skill>.json           ← FUENTE DE VERDAD por skill (esto es lo único que editas)
plugins/<skill>/              ← el plugin instalable
  .claude-plugin/plugin.json
  skills/<skill>/             ← la skill (SKILL.md, scripts, references…)
generar.mjs                   ← genera todo lo de abajo
.claude-plugin/marketplace.json   ← (generado) catálogo de plugins
web/herramientas/index.html       ← (generado) lista de herramientas
web/herramientas/<slug>/index.html ← (generado) ficha por skill
```

> **`web/` es lo que se publica en Cloudflare Pages.** Configura el proyecto de Pages con
> carpeta de salida (build output) = `web`, sin comando de build (es HTML estático), o corre
> `node generar.mjs` como build.

## Agregar una skill nueva (3 pasos)

1. **Copia la skill** a `plugins/<nombre>/skills/<nombre>/` y crea `plugins/<nombre>/.claude-plugin/plugin.json`.
   ⚠️ No subas credenciales ni configs de clientes (revisa `config/`).
2. **Copia una ficha** existente: `cp fichas/seo-cwv.json fichas/<nombre>.json` y edita los valores
   (`slug`, `nombre`, `unaLinea`, `queHace`, `queNecesitas`, `queEs`, `comoSeUsa`, `gancho`, `marketplace`).
3. **Genera:** `node generar.mjs`. Listo — nueva página web + entrada en el marketplace.

El `slug` define la URL: `slug: "carousel-skill"` → `elprofeabraham.com/herramientas/carousel-skill`.

## Regenerar

```bash
node generar.mjs
```
