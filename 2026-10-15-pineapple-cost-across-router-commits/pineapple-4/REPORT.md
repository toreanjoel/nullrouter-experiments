# Pineapple 4: build record

Snapshot of `pineapple-4.html` as of 2026-10-16. It was built by `python3 build.py` into `dist/pineapple-jelly.html` and copied here.
Source: nullrouter score `score-3058e61a` (copied here as `score.svg`), spec `spec-3058e6`.

## Cost

| Metric | Value |
|---|---|
| Total cost | **$5.86** |
| Tokens | 3.9M |
| Turns | 26 |
| Read per written | 21:1 |
| $ per M output | $33.29 |

Prices are list prices (the run was on a subscription), as nullrouter recorded them per call. The run went from 20:01 to 20:28, and the score was taken at 20:29.

### Where the money went

| Item | Cost |
|---|---|
| Output | $3.51 |
| Compactions | $0.86 |
| New context | $0.75 |
| Cache reads | $0.70 |
| Model switches | $0.05 |

### Which models

| Model | Cost |
|---|---|
| claude-opus-5-5 | $5.80 |
| claude-sonnet-5-5 | $0.06 |

## Compared

| Run | Cost | Tokens | Turns | Read:written |
|---|---|---|---|---|
| pineapple-1 | $8.53 | 9.3M | 116 | 47:1 |
| pineapple-2 | $7.34 | 10.7M | 72 | 61:1 |
| pineapple-3 | $5.58 | 3.7M | 32 | 23:1 |
| pineapple-4 | $5.86 | 3.9M | 26 | 21:1 |

## What was built

One self-contained HTML file (about 117 KB, with inline JS, WGSL and CSS and no libraries). The source is split under `src/`: 15 JS modules, 12 WGSL shaders, `index.html` and `style.css`. `python3 build.py` joins them.

- CPU XPBD soft body: 696 vertices and 2,328 tets, a fixed 60 Hz step, small substeps with 1 iteration each, and no per-frame allocation.
- A bevelled skin of 17,024 vertices, all sitting inside the tets.
- Grab with a hole-aware pick, Turn it over (T), and the Firmness and Internal damping sliders, tints, and readouts for Mass, Volume % and Kinetic.
- Passes: shadow, contact-AO height map, scene, back depth, jelly, overlay and tone map. The height map is rendered from under the floor looking up.
- Additions the spec didn't ask for: dragging on empty space orbits the camera, and scrolling zooms.
- Shader compile errors are logged to the console as `[name.wgsl] line:col`.

## Verification

| Check | Result |
|---|---|
| Headless physics run in Node: volume while settling and under a hard stretch | 99.95% of rest (target ±5%) |
| Flip (T) | lands on the other face, no NaNs |
| Physics step time in Node | about 5.2 ms |
| Mass readout | about 85 g |

## Not done at this snapshot

- Nothing was run in a browser. The WGSL was never compiled.
- A `pow()` with a negative base in a shader was found. The run's notes don't confirm that it was fixed.
- Colours, softboxes and wobble speed are first guesses. Firmness and Internal damping may need retuning.
- Hand check in Chrome: that it renders, 60 fps, grabbing the inner edge versus clicking in the hole (which should orbit), Volume under a hard pull, the tinted shadow after T, the stacked layout and the fallback screen.
