// Ray picking on the skinned surface and a soft patch attachment with bounded reach, floor guard and twist.
const GRAB = {
  active: false, count: 0, idx: null, w: null, off: null, tgt: null,
  px: 0, py: 0, pz: 0, hx: 0, hy: 0, hz: 0, nx: 0, ny: 0, nz: 1, twist: 0,
  radius: 0.34, k: 0.22, reach: 1.3, floorGap: 0.025,
};
const HIT = { t: 0, tri: 0, u: 0, v: 0 };

function grabInit() {
  GRAB.idx = new Int32Array(NP); GRAB.w = new Float64Array(NP);
  GRAB.off = new Float64Array(NP * 3); GRAB.tgt = new Float64Array(NP * 3);
}

// Nearest ray hit on the deformed surface, either facing; returns Infinity on a miss.
function pickSurface(ox, oy, oz, dx, dy, dz) {
  const P = SKIN_POS, I = SURF.index, n = SURF.nTri;
  let best = Infinity;
  for (let f = 0; f < n; f++) {
    const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
    const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t > 1e-4 && t < best) { best = t; HIT.tri = f; HIT.u = u; HIT.v = v; }
  }
  HIT.t = best;
  return best;
}

// True when a ray that missed the flesh passes through the ring's hole.
function throughHole(ox, oy, oz, dx, dy, dz) {
  const cx = BODY[0], cy = BODY[1], cz = BODY[2], nx = BODY[3], ny = BODY[4], nz = BODY[5];
  const dn = dx * nx + dy * ny + dz * nz;
  if (Math.abs(dn) < 1e-4) return false;
  const t = ((cx - ox) * nx + (cy - oy) * ny + (cz - oz) * nz) / dn;
  if (t < 0) return false;
  return Math.hypot(ox + dx * t - cx, oy + dy * t - cy, oz + dz * t - cz) < RING.r * 1.05;
}

function grabStart(ox, oy, oz, dx, dy, dz) {
  if (!isFinite(pickSurface(ox, oy, oz, dx, dy, dz))) return throughHole(ox, oy, oz, dx, dy, dz) ? 'hole' : 'miss';
  const I = SURF.index, R = SURF.rest, f = HIT.tri, u = HIT.u, v = HIT.v, w0 = 1 - u - v;
  const a = I[f * 3] * 3, b = I[f * 3 + 1] * 3, c = I[f * 3 + 2] * 3;
  const rx = w0 * R[a] + u * R[b] + v * R[c], ry = w0 * R[a + 1] + u * R[b + 1] + v * R[c + 1], rz = w0 * R[a + 2] + u * R[b + 2] + v * R[c + 2];
  const hx = ox + dx * HIT.t, hy = oy + dy * HIT.t, hz = oz + dz * HIT.t;
  const r = GRAB.radius;
  let n = 0, nearest = 0, nd = Infinity;
  for (let i = 0; i < NP; i++) {
    const d = Math.hypot(REST[i * 3] - rx, REST[i * 3 + 1] - ry, REST[i * 3 + 2] - rz);
    if (d < nd) { nd = d; nearest = i; }
    if (d >= r) continue;
    const s = 1 - (d / r) * (d / r);
    GRAB.idx[n] = i; GRAB.w[n] = s * s; n++;
  }
  if (n === 0) { GRAB.idx[0] = nearest; GRAB.w[0] = 1; n = 1; }
  for (let j = 0; j < n; j++) {
    const p = GRAB.idx[j] * 3;
    GRAB.off[j * 3] = X[p] - hx; GRAB.off[j * 3 + 1] = X[p + 1] - hy; GRAB.off[j * 3 + 2] = X[p + 2] - hz;
  }
  GRAB.count = n; GRAB.active = true; GRAB.twist = 0;
  GRAB.hx = GRAB.px = hx; GRAB.hy = GRAB.py = hy; GRAB.hz = GRAB.pz = hz;
  GRAB.nx = CAM.fwd[0]; GRAB.ny = CAM.fwd[1]; GRAB.nz = CAM.fwd[2];
  grabTargets();
  return 'grab';
}

function grabMove(ox, oy, oz, dx, dy, dz) {
  if (!GRAB.active) return;
  const dn = dx * GRAB.nx + dy * GRAB.ny + dz * GRAB.nz;
  if (Math.abs(dn) < 1e-5) return;
  const t = ((GRAB.hx - ox) * GRAB.nx + (GRAB.hy - oy) * GRAB.ny + (GRAB.hz - oz) * GRAB.nz) / dn;
  if (t <= 0) return;
  GRAB.px = ox + dx * t; GRAB.py = oy + dy * t; GRAB.pz = oz + dz * t;
}

function grabEnd() { GRAB.active = false; GRAB.count = 0; }

// Per fixed step: clamp reach, rotate the patch by the twist and keep it off the floor.
function grabTargets() {
  if (!GRAB.active) return;
  let px = GRAB.px - BODY[0], py = GRAB.py - BODY[1], pz = GRAB.pz - BODY[2];
  const L = Math.hypot(px, py, pz), max = RING.R + GRAB.reach;
  if (L > max) { const s = max / L; px *= s; py *= s; pz *= s; }
  px += BODY[0]; py += BODY[1]; pz += BODY[2];
  const kx = GRAB.nx, ky = GRAB.ny, kz = GRAB.nz, c = Math.cos(GRAB.twist), s = Math.sin(GRAB.twist);
  let minY = Infinity;
  for (let j = 0; j < GRAB.count; j++) {
    const ox = GRAB.off[j * 3], oy = GRAB.off[j * 3 + 1], oz = GRAB.off[j * 3 + 2];
    const kd = kx * ox + ky * oy + kz * oz;
    const cx = ky * oz - kz * oy, cy = kz * ox - kx * oz, cz = kx * oy - ky * ox;
    const tx = px + ox * c + cx * s + kx * kd * (1 - c);
    const ty = py + oy * c + cy * s + ky * kd * (1 - c);
    const tz = pz + oz * c + cz * s + kz * kd * (1 - c);
    GRAB.tgt[j * 3] = tx; GRAB.tgt[j * 3 + 1] = ty; GRAB.tgt[j * 3 + 2] = tz;
    if (ty < minY) minY = ty;
  }
  if (minY < GRAB.floorGap) {
    const lift = GRAB.floorGap - minY;
    for (let j = 0; j < GRAB.count; j++) GRAB.tgt[j * 3 + 1] += lift;
  }
}

function grabSolve() {
  if (!GRAB.active) return;
  const k = GRAB.k;
  for (let j = 0; j < GRAB.count; j++) {
    const p = GRAB.idx[j] * 3, s = GRAB.w[j] * k;
    X[p] += (GRAB.tgt[j * 3] - X[p]) * s;
    X[p + 1] += (GRAB.tgt[j * 3 + 1] - X[p + 1]) * s;
    X[p + 2] += (GRAB.tgt[j * 3 + 2] - X[p + 2]) * s;
  }
}
