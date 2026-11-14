# Phase 3 illustration manifest

Current art follows the supplied warm cream/black office references. All 25 entries in `client/src/lib/assets.json` are separate replaceable files, with source dimensions, alpha subject bounds, nominal rendered size, anchor, layer and provenance status. These are the active assets; old Phase 1 files remain only for compatibility/history.

Canvas `#fffdf7`, ink `#302d28`, paper `#f4efe5`, blush `#f4ded9`, sage `#b8c9a5`. Locally bundled Patrick Hand headings and Nunito Sans body text. Labels, member names, deadlines, percentages and actions stay in React/HTML.

| Key | Source canvas | Nominal slot | Layer | Source |
|---|---:|---:|---:|---|
| room-shell | 1200 × 650 | 1200 × 650 | 0 | [crafted-vector](client/public/assets/illustrations/phase3/room-shell.svg) |
| floor-rug | 1000 × 130 | 1000 × 130 | 1 | [crafted-vector](client/public/assets/illustrations/phase3/floor-rug.svg) |
| whiteboard-blank | 600 × 280 | 600 × 280 | 2 | [crafted-vector](client/public/assets/illustrations/phase3/whiteboard-blank.svg) |
| ceiling-lamp | 150 × 150 | 150 × 150 | 2 | [crafted-vector](client/public/assets/illustrations/phase3/ceiling-lamp.svg) |
| door-right | 130 × 340 | 130 × 340 | 1 | [crafted-vector](client/public/assets/illustrations/phase3/door-right.svg) |
| plant-large | 128 × 235 | 128 × 235 | 2 | [crafted-vector](client/public/assets/illustrations/phase3/plant-large.svg) |
| plant-small | 128 × 235 | 128 × 235 | 2 | [crafted-vector](client/public/assets/illustrations/phase3/plant-small.svg) |
| mug | 60 × 55 | 60 × 55 | 6 | [crafted-vector](client/public/assets/illustrations/phase3/mug.svg) |
| notebook | 90 × 40 | 90 × 40 | 6 | [crafted-vector](client/public/assets/illustrations/phase3/notebook.svg) |
| pencils | 48 × 65 | 48 × 65 | 6 | [crafted-vector](client/public/assets/illustrations/phase3/pencils.svg) |
| sticky-note | 130 × 115 | 130 × 115 | 2 | [crafted-vector](client/public/assets/illustrations/phase3/sticky-note.svg) |
| clipboard | 100 × 130 | 100 × 130 | 2 | [crafted-vector](client/public/assets/illustrations/phase3/clipboard.svg) |
| doodle-spark | 60 × 60 | 60 × 60 | 2 | [crafted-vector](client/public/assets/illustrations/phase3/doodle-spark.svg) |
| desk-top | 2172 × 724 | 495 × 134 | 5 | [generated-layer](client/public/assets/illustrations/phase3/desk.png) |
| chair | 1086 × 1448 | 124 × 204 | 3 | [generated-layer](client/public/assets/illustrations/phase3/chair.png) |
| laptop-front | 1448 × 1086 | 110 × 66 | 6 | [generated-layer](client/public/assets/illustrations/phase3/laptop.png) |
| bookshelf-files | 971 × 1619 | 122 × 260 | 2 | [generated-layer](client/public/assets/illustrations/phase3/bookshelf.png) |
| submit-tray-sign | 1086 × 1448 | 119 × 177 | 2 | [generated-layer](client/public/assets/illustrations/phase3/cabinet.png) |
| cat | 1222 × 1287 | 152 × 156 | 4 | [generated-layer](client/public/assets/illustrations/phase3/cat.png) |
| donut | 1293 × 1216 | 152 × 156 | 4 | [generated-layer](client/public/assets/illustrations/phase3/donut.png) |
| pencil | 200 × 230 | 152 × 156 | 4 | [crafted-vector-png](client/public/assets/illustrations/phase3/pencil.png) |
| office-01 | 560 × 300 | 560 × 300 | 0 | [crafted-vector](client/public/assets/illustrations/phase3/office-01.svg) |
| office-02 | 560 × 300 | 560 × 300 | 0 | [crafted-vector](client/public/assets/illustrations/phase3/office-02.svg) |
| office-03 | 560 × 300 | 560 × 300 | 0 | [crafted-vector](client/public/assets/illustrations/phase3/office-03.svg) |
| office-04 | 560 × 300 | 560 × 300 | 0 | [crafted-vector](client/public/assets/illustrations/phase3/office-04.svg) |

## Composition and bounds

`Art.tsx` fits transparent padding with an SVG viewport using the registry's alpha subject bounds. It preserves PNG bytes and does not remove backgrounds. Wall shell, board and rug can stretch to their containers; furniture preserves its aspect ratio. Every subject uses a bottom-center anchor except centered card thumbnails. The baseline is the bottom of its bounds/slot. `officeLayout()` controls room width independently of project data.

The rendered order is wall (0), rug/door (1), cabinet/board/plant (2), chair (3), avatar (4), desk surface/legs (5), laptop and small props (6–7), member name/hotspot (8–9), chat (10). The plant overlaps the left cabinet slightly, as in the reference. Desks combine legs and top in one replaceable PNG; the filing cabinet and empty tray/sign are one separate PNG.

- 1–4 members: room minimum 1120px; two-member groups share a single centered desk.
- 5–6 members: room minimum 1220px; three paired desks and 132px avatar slots fit a 1280px browser with normal page gutters.
- 7–8 members: minimum 2000px; four paired desks, horizontal room scrolling, 152px avatar slots. Hotspots can be brought into view with keyboard focus.
- One 650px logical room composition scales uniformly to the available workspace. Miniature previews retain their own 1120×650 composition. Phase 4 moves the full workspace seat row down 20 logical pixels so names clear the board; saved avatar transforms are unchanged.
- Avatar scale, flip and offset are applied only to the cutout. Desk and laptop layers remain fixed. Uploaded PNG files are displayed as supplied.

`OfficeHero` and `AvatarPreview` scale the same modular room. An empty hero contains no fabricated profiles/projects. The avatar preview uses a larger central cutout. Four standalone authored SVG room arrangements supply project thumbnails; the stored thumbnail choice remains stable.

## Replacing art

1. Keep generated PNGs in `client/public/assets/illustrations/phase3/`, with native alpha. Keep any new furniture on the same frontal perspective.
2. Adjust the mappings/vector source in `scripts/compose-assets.ts`, then run `npm run assets`. The script reads dimensions and alpha bounds, checks transparency, writes authored vectors and regenerates the registry. It never rewrites the generated raster inputs or legacy preset files. No image service runs.
3. Preset paths are shared in `shared/presets.ts`; update those paths alongside a preset replacement. Old saved records resolve through their original paths. Do not overwrite legacy avatar PNGs or user uploads.
4. Check `npm run test`, the seated preview, card thumbnails, and 2/4/6/8-member offices. Keep dynamic text in HTML.

Generation prompts and accepted/rejected candidates: [ASSET_GENERATION_PHASE3.md](ASSET_GENERATION_PHASE3.md). Historical Phase 1 prompts: [ASSET_GENERATION.md](ASSET_GENERATION.md).
