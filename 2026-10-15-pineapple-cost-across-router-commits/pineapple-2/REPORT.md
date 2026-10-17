# Pineapple 2: build record

Snapshot of `pineapple-jelly.html` as of 2026-10-16, saved as `pineapple-2.html`.
Source: nullrouter score `score-5afc1f54` (copied here as `score.svg`), spec `spec-5afc1f`.

## Cost

| Metric | Value |
|---|---|
| Total cost | **$7.34** |
| Tokens | 10.7M |
| Turns | 72 |
| Read per written | 61:1 |
| $ per M output | $42.17 |

Prices are list prices (the run was on a subscription), as recorded per call by nullrouter. The score was taken at 01:15.

### Where the money went

| Item | Cost |
|---|---|
| Output | $3.48 |
| Cache reads | $2.07 |
| New context | $1.79 |

### Which models

| Model | Cost |
|---|---|
| claude-opus-5-5 | $7.34 |

## Compared

| Run | Cost | Tokens | Turns | Read:written |
|---|---|---|---|---|
| pineapple-1 | $8.53 | 9.3M | 116 | 47:1 |
| pineapple-2 | $7.34 | 10.7M | 72 | 61:1 |

## What was built

One self-contained HTML file (about 93 KB, inline JS, WGSL and CSS). Source is split under `src/` (15 JS modules, 10 WGSL shaders, `index.html`, `style.css`) and joined by `node build.mjs` into `pineapple-jelly.html`.

- JS: math, outline, delaunay, tets, surface, inclusions, sim, grab, actions, skin, camera, gpu, passes, ui, main.
- WGSL passes: studio, shadow, height, scene, cells, backface, jelly, overlay, tonemap.

## Not verified in this record

- Only the cost figures (from the score) and the file layout were read when this record was written; nothing was re-run.
- Browser / WebGPU check of the page, interaction feel, and phone layout.
