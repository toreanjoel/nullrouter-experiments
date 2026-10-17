# Pineapple 5: build record

This is a snapshot of `pineapple-5.html` as of 2026-10-17. `node build.mjs` built it into `dist/pineapple-jelly.html`, and the file was copied here from there.
Source: nullrouter score `score-fd0c7e05` (copied here as `score.svg`), spec `spec-fd0c7e`.

## Cost

| Metric | Value |
|---|---|
| Total cost | **$3.74** |
| Tokens | 2.9M |
| Turns | 32 |
| Read per written | 27:1 |
| $ per M output | $35.63 |

These are list prices (the run was on a subscription), as nullrouter recorded them for each call. The run went from 23:59 on 16 Oct to 00:16 on 17 Oct, and the score was taken at 00:21.

### Where the money went

| Item | Cost |
|---|---|
| Output | $2.09 |
| New context | $1.07 |
| Cache reads | $0.53 |
| Model switches | $0.05 |

### Which models

| Model | Cost |
|---|---|
| claude-opus-5-5 | $3.68 |
| claude-sonnet-5-5 | $0.06 |

## Compared

| Run | Cost | Tokens | Turns | Read:written |
|---|---|---|---|---|
| pineapple-1 | $8.53 | 9.3M | 116 | 47:1 |
| pineapple-2 | $7.34 | 10.7M | 72 | 61:1 |
| pineapple-3 | $5.58 | 3.7M | 32 | 23:1 |
| pineapple-4 | $5.86 | 3.9M | 26 | 21:1 |
| pineapple-5 | $3.74 | 2.9M | 32 | 27:1 |

## What was built

It is one self-contained HTML file of about 89 KB, with inline JS, WGSL and CSS and no libraries. The source is split under `src/` into 11 JS modules, 8 WGSL shaders, `index.html` and `style.css`. `node build.mjs` joins them and runs `node --check` on the joined script.

- Mesh: a Delaunay triangulation of a scalloped annulus, extruded into tets. It has 786 vertices and 2,484 tets.
- Physics: CPU XPBD with co-rotational shape matching, volume constraints, strain limits, edge damping and floor friction. The grab patch can twist, and "Turn it over" (T) tosses the ring.
- Picking: a ray through the hole counts as passing through.
- Passes: shadow, height AO, scene (MSAA), jelly back-face depth, jelly (MSAA) with a mesh overlay, and tone map.
- UI: an editorial panel, tints, sliders, buttons, key bindings, readouts and a WebGPU fallback.
- The run added something the spec didn't ask for: the camera follows the ring after a flip.

## Verification

| Check | Result |
|---|---|
| Headless mesh and physics run in Node: settle | about 100% of rest volume |
| Flip (T) | lands on the other face, sliding about 2.3 units toward the camera |
| Ray through the centre | registers as through the hole |
| Physics step time in Node | about 7 ms |
| `node --check` on the joined script (inside `build.mjs`) | passes |

## Not done at this snapshot

- Nothing was run in a browser, and the WGSL was never validated or compiled. Expect compile errors on first open.
- The Firmness and damping defaults are guesses.
- Nothing visual was checked: tint, the shadow tinted by the jelly, the mesh overlay, ¼ speed, and the mobile layout.
- At about 7 ms a step, slow devices may fall behind 60 Hz.
- Hand check: pull and twist the inner edge, press T a few times, and toggle Show mesh and ¼ speed.
