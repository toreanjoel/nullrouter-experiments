// Grab: a soft patch of tet vertices pulled toward a hand target that has bounded reach,
// is lifted so the held patch never goes into the floor, and twists about the view axis.
const GRAB_RADIUS = 0.3, GRAB_REACH = 0.85, GRAB_PULL = 0.16, GRAB_MAX = 256;
const GRAB = {
  on: false, n: 0,
  idx: new Int32Array(GRAB_MAX), wgt: new Float32Array(GRAB_MAX), off: new Float32Array(GRAB_MAX * 3),
  T: new Float32Array(3), Tc: new Float32Array(3), pn: new Float32Array(3), pd: 0,
  axis: new Float32Array(3), twist: 0, R: new Float32Array(9),
};

// Hit point (hx,hy,hz) on the surface; fwd = camera forward (drag plane normal).
function grabBegin(B, hx, hy, hz, fwd) {
  const x = B.x;
  let n = 0;
  for (let i = 0; i < B.nv && n < GRAB_MAX; i++) {
    const d = Math.hypot(x[i * 3] - hx, x[i * 3 + 1] - hy, x[i * 3 + 2] - hz);
    if (d < GRAB_RADIUS) {
      const f = 1 - d / GRAB_RADIUS;
      GRAB.idx[n] = i; GRAB.wgt[n] = f * f; n++;
    }
  }
  if (n === 0) { // fall back to the nearest vertex
    let best = 0, bd = Infinity;
    for (let i = 0; i < B.nv; i++) {
      const d = Math.hypot(x[i * 3] - hx, x[i * 3 + 1] - hy, x[i * 3 + 2] - hz);
      if (d < bd) { bd = d; best = i; }
    }
    GRAB.idx[0] = best; GRAB.wgt[0] = 1; n = 1;
  }
  for (let k = 0; k < n; k++) {
    const i = GRAB.idx[k] * 3;
    GRAB.off[k * 3] = x[i] - hx; GRAB.off[k * 3 + 1] = x[i + 1] - hy; GRAB.off[k * 3 + 2] = x[i + 2] - hz;
  }
  GRAB.n = n;
  GRAB.pn[0] = -fwd[0]; GRAB.pn[1] = -fwd[1]; GRAB.pn[2] = -fwd[2];
  GRAB.pd = GRAB.pn[0] * hx + GRAB.pn[1] * hy + GRAB.pn[2] * hz;
  GRAB.axis[0] = fwd[0]; GRAB.axis[1] = fwd[1]; GRAB.axis[2] = fwd[2];
  GRAB.T[0] = hx; GRAB.T[1] = hy; GRAB.T[2] = hz;
  GRAB.twist = 0;
  GRAB.on = true;
}

// Pointer ray (origin o, dir d) → hand target on the camera-facing drag plane.
function grabSetRay(ox, oy, oz, dx, dy, dz) {
  const pn = GRAB.pn, den = pn[0] * dx + pn[1] * dy + pn[2] * dz;
  if (Math.abs(den) < 1e-6) return;
  const t = (GRAB.pd - (pn[0] * ox + pn[1] * oy + pn[2] * oz)) / den;
  if (t <= 0) return;
  GRAB.T[0] = ox + dx * t; GRAB.T[1] = oy + dy * t; GRAB.T[2] = oz + dz * t;
}

function grabEnd() { GRAB.on = false; GRAB.n = 0; }

// Once per step: twist matrix, reach-bounded and floor-guarded target.
function grabPrepare(B) {
  const a = GRAB.axis, R = GRAB.R, c = Math.cos(GRAB.twist), s = Math.sin(GRAB.twist), t = 1 - c;
  R[0] = c + t * a[0] * a[0]; R[1] = t * a[0] * a[1] - s * a[2]; R[2] = t * a[0] * a[2] + s * a[1];
  R[3] = t * a[0] * a[1] + s * a[2]; R[4] = c + t * a[1] * a[1]; R[5] = t * a[1] * a[2] - s * a[0];
  R[6] = t * a[0] * a[2] - s * a[1]; R[7] = t * a[1] * a[2] + s * a[0]; R[8] = c + t * a[2] * a[2];

  // Where the held point is now: weighted mean of (x_k − R o_k).
  const x = B.x, off = GRAB.off;
  let ax = 0, ay = 0, az = 0, ws = 0, minY = Infinity;
  for (let k = 0; k < GRAB.n; k++) {
    const i = GRAB.idx[k] * 3, wk = GRAB.wgt[k], ox = off[k * 3], oy = off[k * 3 + 1], oz = off[k * 3 + 2];
    const rx = R[0] * ox + R[1] * oy + R[2] * oz, ry = R[3] * ox + R[4] * oy + R[5] * oz, rz = R[6] * ox + R[7] * oy + R[8] * oz;
    ax += wk * (x[i] - rx); ay += wk * (x[i + 1] - ry); az += wk * (x[i + 2] - rz); ws += wk;
    if (ry < minY) minY = ry;
  }
  ax /= ws; ay /= ws; az /= ws;
  let dx = GRAB.T[0] - ax, dy = GRAB.T[1] - ay, dz = GRAB.T[2] - az;
  const d = Math.hypot(dx, dy, dz);
  if (d > GRAB_REACH) { const k = GRAB_REACH / d; dx *= k; dy *= k; dz *= k; }
  const Tc = GRAB.Tc;
  Tc[0] = ax + dx; Tc[1] = ay + dy; Tc[2] = az + dz;
  const hr = Math.hypot(Tc[0], Tc[2]);
  if (hr > 3.2) { Tc[0] *= 3.2 / hr; Tc[2] *= 3.2 / hr; }
  if (Tc[1] > 3.0) Tc[1] = 3.0;
  const floorGap = SIM.floorY + 0.01;
  if (Tc[1] + minY < floorGap) Tc[1] = floorGap - minY;
}

// Per substep: pull each patch vertex a weighted fraction toward its goal.
function grabSolve(B) {
  const x = B.x, R = GRAB.R, Tc = GRAB.Tc, off = GRAB.off;
  for (let k = 0; k < GRAB.n; k++) {
    const i = GRAB.idx[k] * 3, f = GRAB_PULL * GRAB.wgt[k];
    const ox = off[k * 3], oy = off[k * 3 + 1], oz = off[k * 3 + 2];
    const gx = Tc[0] + R[0] * ox + R[1] * oy + R[2] * oz;
    const gy = Tc[1] + R[3] * ox + R[4] * oy + R[5] * oz;
    const gz = Tc[2] + R[6] * ox + R[7] * oy + R[8] * oz;
    x[i] += (gx - x[i]) * f; x[i + 1] += (gy - x[i + 1]) * f; x[i + 2] += (gz - x[i + 2]) * f;
  }
}
