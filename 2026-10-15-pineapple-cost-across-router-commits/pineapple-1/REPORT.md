# Pineapple 1 — build record

Snapshot of `pineapple-jelly.html` as of 2026-10-15, saved as `pineapple-1.html`.
Source: nullrouter score `score-259d374a` (copied here as `score.svg`), spec `spec-259d37`.

## Cost

| Metric | Value |
|---|---|
| Total cost | **$8.53** |
| Tokens | 9.3M |
| Turns | 116 |
| Read per written | 47:1 |
| $ per M output | $43.91 |

Prices are list prices (the run itself was on a subscription), as recorded per call by nullrouter.

### Where the money went

| Item | Cost |
|---|---|
| Output | $3.88 |
| New context | $2.25 |
| Cache reads | $1.72 |
| Compactions | $0.61 |
| Model switches | $0.07 |

### Which models

| Model | Cost |
|---|---|
| claude-opus-5-5 | $8.45 |
| claude-sonnet-5-5 | $0.07 |

## What was built

One self-contained HTML file (≈66 KB, inline JS/CSS, no libraries, no build step):

- WebGPU renderer with a fallback screen for no WebGPU, shader errors or a lost device.
- CPU XPBD soft body at 60 Hz with 12 substeps. The pineapple ring: R 1.36, hole 0.5, thickness 0.5, bevel 0.12, 14 scallops.
- Grab, twist, lift, Turn (T), Nudge (N), Reset, Pause, ¼ speed, Firmness and Internal damping sliders, tints, mesh overlay.
- Render: PCSS tinted shadow, contact AO, cyclorama, juice cells, bubbles, refraction, Beer–Lambert with milky in-scatter, Fresnel reflections, GGX highlights, PBR Neutral tone map.

## Verification (headless, Dawn/Metal)

| Check | Result |
|---|---|
| WGSL and validation errors | none |
| CPU frame / sim step | ~4.2 ms / ~3.4 ms |
| Settle | lands by 1 s, Kinetic 0 from 2 s, Volume 99.98% |
| Grab outer edge | lowest Volume 99.0%, rest in 1.83 s |
| Grab inner edge | lowest Volume 99.5%, rest in 1.15 s |
| Drag into floor | lowest Volume 99.4%, rest in 0.77 s |
| Turn | flips face each toss, lowest Volume 98.2%, rest in ~1.87 s |

## Not done at this snapshot

- Hand check in a real Chrome or Brave: panel feel, real pointer/touch/wheel input, frame rate at DPR 2.
- The "not laid out in the scene correctly" complaint was never pinned down; the cyclorama and camera change is a guess.
