# Pineapple 3: build record

Snapshot of `pineapple-3.html` as of 2026-10-16, built by `node build.mjs`.
Source: nullrouter score `score-31e2733e` (copied here as `score.svg`), spec `spec-31e273`.

## Cost

| Metric | Value |
|---|---|
| Total cost | **$5.58** |
| Tokens | 3.7M |
| Turns | 32 |
| Read per written | 23:1 |
| $ per M output | $35.58 |

Prices are list prices (the run was on a subscription), as recorded per call by nullrouter. The score was taken at 14:16.

### Where the money went

| Item | Cost |
|---|---|
| Output | $3.12 |
| New context | $1.67 |
| Cache reads | $0.67 |
| Model switches | $0.12 |

### Which models

| Model | Cost |
|---|---|
| claude-opus-5-5 | $5.45 |
| claude-sonnet-5-5 | $0.13 |

## Compared

| Run | Cost | Tokens | Turns | Read:written |
|---|---|---|---|---|
| pineapple-1 | $8.53 | 9.3M | 116 | 47:1 |
| pineapple-2 | $7.34 | 10.7M | 72 | 61:1 |
| pineapple-3 | $5.58 | 3.7M | 32 | 23:1 |

## What was built

One self-contained HTML file (about 98 KB, inline JS, WGSL and CSS, no libraries). Source is split under `src/` (31 JS modules, 9 WGSL shaders, `shell.html`, `style.css`) and joined by `node build.mjs`.

- CPU XPBD soft body at 60 Hz with 10 substeps: about 2,400 tets (3 levels, 2 prism layers), warm-started quaternion rotation, gravity 30 u/s².
- Separate bevelled render mesh (about 11k vertices) attached to the tets, skinned with normals on the CPU each frame.
- Grab with a hole-aware pick, scroll twist, Nudge, Turn it over (T), Reset, Firmness (`5e4·100^f`) and Internal damping (`1 + 120·d²`) sliders, ring swatches, readouts.
- Passes: shadow, height, scene, juice cells, back depth, jelly, overlay, tone map. Fallback screen; stacked layout below 820 px.

## Verification

| Check | Result |
|---|---|
| JS syntax of the joined script | passes |

## Not done at this snapshot

- Nothing was run in a browser: the WGSL is unvalidated, shader errors will only show in the console.
- Hand check in Chrome: it renders, grab and the hole hint, scroll twist, T lands on the other face, layout below 820 px, stiffness and damping feel.
