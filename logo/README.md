# ClutchX3D logo

The mark is an **X built from horizontal print layers**: two diagonal strokes sliced into seven layers, like a model on the print bed. The top layer is gold, the "layer being printed". In the wordmark the mark stands in for the X: `CLUTCH [mark] 3D`.

| Folder | Contents |
| --- | --- |
| `svg/` | Vector masters. `logo-horizontal` (primary), `logo-stacked`, `mark`, `app-icon`, each with `on-dark` and mono variants |
| `png/` | Raster exports at several widths, transparent background |
| `favicon/` | `favicon.svg`, `favicon.ico`, PNG favicons, `apple-touch-icon.png`, `icon-192/512.png`, `site.webmanifest` |
| `source/` | Generator script and the Chakra Petch Bold font (SIL OFL) the wordmark is outlined from |

**Colours:** Cobalt `#2B44E6` (dark backgrounds `#6E82FF`), Gold `#D9A23A`, Ink `#1B1F27`, PLA white `#F3F5F7`.
**Typeface:** Chakra Petch Bold for the wordmark. The website uses Chakra Petch for headings and Barlow for body text.

To regenerate: `cd logo/source && npm i opentype.js && node generate-logo.mjs && node export-png.cjs` (the PNG export uses `sharp` from `clutchx3d/node_modules`). The script also rewrites `clutchx3d/web/src/three/markGeometry.js`, the same geometry the 3D hero prints.
