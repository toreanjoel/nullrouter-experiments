// Juice cells (elongated sacs lying along the radius) and air bubbles, embedded in the tets
// so they ride with the flesh. Each item has two anchors; a bubble's anchors coincide.
const CELL_COUNT = 64, BUBBLE_COUNT = 8;

function buildInclusions(mesh) {
  const n = CELL_COUNT + BUBBLE_COUNT;
  const idx = new Uint32Array(n * 8), w = new Float32Array(n * 8);
  const rad = new Float32Array(n), kind = new Float32Array(n);
  const rnd = mulberry32(2024);
  for (let i = 0; i < n; i++) {
    const cell = i < CELL_COUNT;
    const th = rnd() * 2 * Math.PI, ro = outerRadius(th), c = Math.cos(th), s = Math.sin(th);
    let r0, r1, y;
    if (cell) {
      const half = 0.07 + 0.08 * rnd();
      const mid = RING.hole + 0.06 + half + rnd() * (ro - RING.hole - 0.14 - 2 * half);
      r0 = mid - half; r1 = mid + half;
      y = (rnd() * 2 - 1) * 0.13;
      rad[i] = 0.022 + 0.018 * rnd();
    } else {
      r0 = r1 = RING.hole + 0.1 + rnd() * (ro - RING.hole - 0.2);
      y = (rnd() * 2 - 1) * 0.12;
      rad[i] = 0.018 + 0.027 * rnd();
    }
    kind[i] = cell ? 0 : 1;
    embedPoint(mesh, r0 * c, y, r0 * s, idx, w, i * 8);
    embedPoint(mesh, r1 * c, y, r1 * s, idx, w, i * 8 + 4);
  }
  return { n, idx, w, rad, kind, inst: new Float32Array(n * 8) };
}

// Instance layout (8 floats): centre xyz, half-axis xyz, radius, kind.
function updateInclusions(B, inc) {
  const x = B.x, I = inc.idx, W = inc.w, out = inc.inst;
  for (let i = 0; i < inc.n; i++) {
    let ax = 0, ay = 0, az = 0, bx = 0, by = 0, bz = 0;
    for (let k = 0; k < 4; k++) {
      const ia = I[i * 8 + k] * 3, wa = W[i * 8 + k];
      const ib = I[i * 8 + 4 + k] * 3, wb = W[i * 8 + 4 + k];
      ax += wa * x[ia]; ay += wa * x[ia + 1]; az += wa * x[ia + 2];
      bx += wb * x[ib]; by += wb * x[ib + 1]; bz += wb * x[ib + 2];
    }
    const o = i * 8;
    out[o] = (ax + bx) / 2; out[o + 1] = (ay + by) / 2; out[o + 2] = (az + bz) / 2;
    out[o + 3] = (bx - ax) / 2; out[o + 4] = (by - ay) / 2; out[o + 5] = (bz - az) / 2;
    out[o + 6] = inc.rad[i]; out[o + 7] = inc.kind[i];
  }
}
