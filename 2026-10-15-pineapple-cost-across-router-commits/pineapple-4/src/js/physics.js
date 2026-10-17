// XPBD tetrahedral soft body: co-rotational shape matching per tet (warm-started quaternion),
// tet volume constraints, hard edge strain limits, edge damping, floor contact with Coulomb
// friction and the soft grab patch. All state lives in preallocated typed arrays.
const SIM = {
  substeps: 10, gravity: 20, muS: 0.65, muK: 0.45,
  strainLo: 0.55, strainHi: 1.8, volCompliance: 1e-8,
  grabCompliance: 2e-4, grabMaxStep: 0.06, grabRadius: 0.32, reach: 2.3, arena: 2.6,
  airDamping: 0.2, maxSpeed: 40,
};
const GRAB_MAX = 256;

// Scratch for rotation extraction: AM is the 3×3 input (row-major), RM the resulting rotation.
const AM = new Float64Array(9), RM = new Float64Array(9);

function quatToMat(qx, qy, qz, qw) {
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz;
  const wx = qw * qx, wy = qw * qy, wz = qw * qz;
  RM[0] = 1 - 2 * (yy + zz); RM[1] = 2 * (xy - wz); RM[2] = 2 * (xz + wy);
  RM[3] = 2 * (xy + wz); RM[4] = 1 - 2 * (xx + zz); RM[5] = 2 * (yz - wx);
  RM[6] = 2 * (xz - wy); RM[7] = 2 * (yz + wx); RM[8] = 1 - 2 * (xx + yy);
}

// Müller et al. 2016: iterate the quaternion q[o..o+3] towards the rotation of AM; leaves it in RM.
// Robust for inverted AM, which is what lets crushed tets recover.
function extractRotation(q, o, iters) {
  let qx = q[o], qy = q[o + 1], qz = q[o + 2], qw = q[o + 3];
  for (let it = 0; it < iters; it++) {
    quatToMat(qx, qy, qz, qw);
    let ox = 0, oy = 0, oz = 0, den = 0;
    for (let c = 0; c < 3; c++) {
      ox += RM[3 + c] * AM[6 + c] - RM[6 + c] * AM[3 + c];
      oy += RM[6 + c] * AM[c] - RM[c] * AM[6 + c];
      oz += RM[c] * AM[3 + c] - RM[3 + c] * AM[c];
      den += RM[c] * AM[c] + RM[3 + c] * AM[3 + c] + RM[6 + c] * AM[6 + c];
    }
    den = 1 / (Math.abs(den) + 1e-9);
    ox *= den; oy *= den; oz *= den;
    const ang = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (ang < 1e-9) break;
    const hs = Math.sin(0.5 * ang) / ang, dw = Math.cos(0.5 * ang);
    const dx = ox * hs, dy = oy * hs, dz = oz * hs;
    const nx = dw * qx + dx * qw + dy * qz - dz * qy;
    const ny = dw * qy - dx * qz + dy * qw + dz * qx;
    const nz = dw * qz + dx * qy - dy * qx + dz * qw;
    const nw = dw * qw - dx * qx - dy * qy - dz * qz;
    const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    qx = nx * il; qy = ny * il; qz = nz * il; qw = nw * il;
  }
  q[o] = qx; q[o + 1] = qy; q[o + 2] = qz; q[o + 3] = qw;
  quatToMat(qx, qy, qz, qw);
}

class SoftBody {
  constructor(tm) {
    const N = tm.N, M = tm.M;
    this.N = N; this.M = M;
    this.tets = tm.tets; this.edges = tm.edges; this.E = tm.edges.length / 2;
    this.bfaces = tm.bfaces; this.rest = tm.rest;
    this.onSurface = new Uint8Array(N);
    for (let i = 0; i < tm.bfaces.length; i++) this.onSurface[tm.bfaces[i]] = 1;
    this.x = new Float64Array(3 * N); this.p = new Float64Array(3 * N); this.v = new Float64Array(3 * N);
    this.mass = new Float64Array(N); this.w = new Float64Array(N);
    this.q = new Float64Array(12 * M); this.V0 = new Float64Array(M); this.quat = new Float64Array(4 * M);
    this.L0 = new Float64Array(this.E);
    this.firmness = 0.5; this.damping = 0.35;

    const r = this.rest, T = this.tets;
    let vol = 0;
    for (let t = 0; t < M; t++) {
      const V = tetVolume(r, T[4 * t], T[4 * t + 1], T[4 * t + 2], T[4 * t + 3]);
      this.V0[t] = V; vol += V;
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 4; k++) { const i = 3 * T[4 * t + k]; cx += r[i]; cy += r[i + 1]; cz += r[i + 2]; }
      cx *= 0.25; cy *= 0.25; cz *= 0.25;
      for (let k = 0; k < 4; k++) {
        const vi = T[4 * t + k], i = 3 * vi, o = 12 * t + 3 * k;
        this.q[o] = r[i] - cx; this.q[o + 1] = r[i + 1] - cy; this.q[o + 2] = r[i + 2] - cz;
        this.mass[vi] += V / 4;
      }
    }
    this.restVolume = vol;
    this.totalMass = 0;
    this.restCom = new Float64Array(3);
    for (let i = 0; i < N; i++) {
      const m = this.mass[i];
      this.w[i] = 1 / m; this.totalMass += m;
      this.restCom[0] += m * r[3 * i]; this.restCom[1] += m * r[3 * i + 1]; this.restCom[2] += m * r[3 * i + 2];
    }
    for (let k = 0; k < 3; k++) this.restCom[k] /= this.totalMass;
    for (let e = 0; e < this.E; e++) {
      const a = 3 * this.edges[2 * e], b = 3 * this.edges[2 * e + 1];
      this.L0[e] = Math.hypot(r[b] - r[a], r[b + 1] - r[a + 1], r[b + 2] - r[a + 2]);
    }

    this.grab = {
      active: false, n: 0, twist: 0,
      idx: new Int32Array(GRAB_MAX), wt: new Float64Array(GRAB_MAX),
      off: new Float64Array(3 * GRAB_MAX), tgt: new Float64Array(3 * GRAB_MAX),
      point: new Float64Array(3), axis: new Float64Array(3),
    };
    this.com = new Float64Array(3);
    this.rot = new Float64Array(9); // world-from-rest rotation of the whole body, column-major
    this.bq = new Float64Array([0, 0, 0, 1]);
    this.volumeRatio = 1; this.kinetic = 0;
    this.posF32 = new Float32Array(4 * N);
    this.reset();
  }

  reset() {
    const r = this.rest, x = this.x, N = this.N;
    const a = 0.14, c = Math.cos(a), s = Math.sin(a); // a slight tilt so it lands with a wobble
    let minY = Infinity;
    for (let i = 0; i < 3 * N; i += 3) {
      const y = r[i + 1] * c - r[i + 2] * s, z = r[i + 1] * s + r[i + 2] * c;
      x[i] = r[i]; x[i + 1] = y; x[i + 2] = z;
      if (y < minY) minY = y;
    }
    const lift = 0.45 - minY;
    for (let i = 0; i < 3 * N; i += 3) x[i + 1] += lift;
    this.p.set(x); this.v.fill(0);
    for (let t = 0; t < this.M; t++) { this.quat[4 * t] = 0; this.quat[4 * t + 1] = 0; this.quat[4 * t + 2] = 0; this.quat[4 * t + 3] = 1; }
    this.bq[0] = 0; this.bq[1] = 0; this.bq[2] = 0; this.bq[3] = 1;
    this.grab.active = false;
    this.updateFrame();
  }

  step(dt) {
    const n = SIM.substeps, h = dt / n, N3 = 3 * this.N, x = this.x, p = this.p, v = this.v;
    const aShape = Math.pow(10, -3.9 - 1.6 * this.firmness) / (h * h);
    const aVol = SIM.volCompliance / (h * h);
    const kDamp = Math.min(0.5, (1 + 60 * this.damping * this.damping) * h);
    const air = 1 - SIM.airDamping * h, gh = SIM.gravity * h, ih = 1 / h, vmax2 = SIM.maxSpeed * SIM.maxSpeed;
    for (let s = 0; s < n; s++) {
      for (let i = 0; i < N3; i += 3) {
        v[i + 1] -= gh;
        p[i] = x[i]; p[i + 1] = x[i + 1]; p[i + 2] = x[i + 2];
        x[i] += v[i] * h; x[i + 1] += v[i + 1] * h; x[i + 2] += v[i + 2] * h;
      }
      this.solveShape(aShape);
      this.solveVolume(aVol);
      if (this.grab.active) this.solveGrab(h);
      this.solveStrain();
      this.solveFloor();
      for (let i = 0; i < N3; i += 3) {
        let vx = (x[i] - p[i]) * ih, vy = (x[i + 1] - p[i + 1]) * ih, vz = (x[i + 2] - p[i + 2]) * ih;
        const sp = vx * vx + vy * vy + vz * vz;
        if (sp > vmax2) { const k = SIM.maxSpeed / Math.sqrt(sp); vx *= k; vy *= k; vz *= k; }
        v[i] = vx * air; v[i + 1] = vy * air; v[i + 2] = vz * air;
      }
      this.dampEdges(kDamp);
    }
  }

  // Pull each tet's vertices towards its rest shape, rotated by the tet's current best-fit rotation.
  solveShape(alpha) {
    const x = this.x, w = this.w, T = this.tets, Q = this.q, qa = this.quat, V0 = this.V0;
    for (let t = 0; t < this.M; t++) {
      const t4 = 4 * t, t12 = 12 * t;
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 4; k++) { const i = 3 * T[t4 + k]; cx += x[i]; cy += x[i + 1]; cz += x[i + 2]; }
      cx *= 0.25; cy *= 0.25; cz *= 0.25;
      let a00 = 0, a01 = 0, a02 = 0, a10 = 0, a11 = 0, a12 = 0, a20 = 0, a21 = 0, a22 = 0;
      for (let k = 0; k < 4; k++) {
        const i = 3 * T[t4 + k], o = t12 + 3 * k;
        const dx = x[i] - cx, dy = x[i + 1] - cy, dz = x[i + 2] - cz, qx = Q[o], qy = Q[o + 1], qz = Q[o + 2];
        a00 += dx * qx; a01 += dx * qy; a02 += dx * qz;
        a10 += dy * qx; a11 += dy * qy; a12 += dy * qz;
        a20 += dz * qx; a21 += dz * qy; a22 += dz * qz;
      }
      AM[0] = a00; AM[1] = a01; AM[2] = a02; AM[3] = a10; AM[4] = a11; AM[5] = a12; AM[6] = a20; AM[7] = a21; AM[8] = a22;
      extractRotation(qa, t4, 2);
      const at = alpha / V0[t];
      for (let k = 0; k < 4; k++) {
        const vi = T[t4 + k], i = 3 * vi, o = t12 + 3 * k;
        const qx = Q[o], qy = Q[o + 1], qz = Q[o + 2], f = w[vi] / (w[vi] + at);
        x[i] += (cx + RM[0] * qx + RM[1] * qy + RM[2] * qz - x[i]) * f;
        x[i + 1] += (cy + RM[3] * qx + RM[4] * qy + RM[5] * qz - x[i + 1]) * f;
        x[i + 2] += (cz + RM[6] * qx + RM[7] * qy + RM[8] * qz - x[i + 2]) * f;
      }
    }
  }

  solveVolume(alpha) {
    const x = this.x, w = this.w, T = this.tets, V0 = this.V0, s6 = 1 / 6;
    for (let t = 0; t < this.M; t++) {
      const v0 = T[4 * t], v1 = T[4 * t + 1], v2 = T[4 * t + 2], v3 = T[4 * t + 3];
      const i0 = 3 * v0, i1 = 3 * v1, i2 = 3 * v2, i3 = 3 * v3;
      const e1x = x[i1] - x[i0], e1y = x[i1 + 1] - x[i0 + 1], e1z = x[i1 + 2] - x[i0 + 2];
      const e2x = x[i2] - x[i0], e2y = x[i2 + 1] - x[i0 + 1], e2z = x[i2 + 2] - x[i0 + 2];
      const e3x = x[i3] - x[i0], e3y = x[i3 + 1] - x[i0 + 1], e3z = x[i3 + 2] - x[i0 + 2];
      const g1x = (e2y * e3z - e2z * e3y) * s6, g1y = (e2z * e3x - e2x * e3z) * s6, g1z = (e2x * e3y - e2y * e3x) * s6;
      const g2x = (e3y * e1z - e3z * e1y) * s6, g2y = (e3z * e1x - e3x * e1z) * s6, g2z = (e3x * e1y - e3y * e1x) * s6;
      const g3x = (e1y * e2z - e1z * e2y) * s6, g3y = (e1z * e2x - e1x * e2z) * s6, g3z = (e1x * e2y - e1y * e2x) * s6;
      const g0x = -(g1x + g2x + g3x), g0y = -(g1y + g2y + g3y), g0z = -(g1z + g2z + g3z);
      const V = e1x * g1x + e1y * g1y + e1z * g1z;
      const w0 = w[v0], w1 = w[v1], w2 = w[v2], w3 = w[v3];
      const den = w0 * (g0x * g0x + g0y * g0y + g0z * g0z) + w1 * (g1x * g1x + g1y * g1y + g1z * g1z)
        + w2 * (g2x * g2x + g2y * g2y + g2z * g2z) + w3 * (g3x * g3x + g3y * g3y + g3z * g3z) + alpha;
      if (den < 1e-12) continue;
      const lam = -(V - V0[t]) / den;
      x[i0] += lam * w0 * g0x; x[i0 + 1] += lam * w0 * g0y; x[i0 + 2] += lam * w0 * g0z;
      x[i1] += lam * w1 * g1x; x[i1 + 1] += lam * w1 * g1y; x[i1 + 2] += lam * w1 * g1z;
      x[i2] += lam * w2 * g2x; x[i2 + 1] += lam * w2 * g2y; x[i2 + 2] += lam * w2 * g2z;
      x[i3] += lam * w3 * g3x; x[i3 + 1] += lam * w3 * g3y; x[i3 + 2] += lam * w3 * g3z;
    }
  }

  solveGrab(h) {
    const g = this.grab, x = this.x, w = this.w, a = SIM.grabCompliance / (h * h), cap = SIM.grabMaxStep;
    for (let k = 0; k < g.n; k++) {
      const vi = g.idx[k], i = 3 * vi, f = (g.wt[k] * w[vi]) / (w[vi] + a);
      let dx = (g.tgt[3 * k] - x[i]) * f, dy = (g.tgt[3 * k + 1] - x[i + 1]) * f, dz = (g.tgt[3 * k + 2] - x[i + 2]) * f;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > cap) { const s = cap / l; dx *= s; dy *= s; dz *= s; }
      x[i] += dx; x[i + 1] += dy; x[i + 2] += dz;
    }
  }

  solveStrain() {
    const x = this.x, w = this.w, E = this.edges, L0 = this.L0, lo = SIM.strainLo, hi = SIM.strainHi;
    for (let e = 0; e < this.E; e++) {
      const va = E[2 * e], vb = E[2 * e + 1], a = 3 * va, b = 3 * vb;
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz), l0 = L0[e];
      let C;
      if (len > l0 * hi) C = len - l0 * hi;
      else if (len < l0 * lo) C = len - l0 * lo;
      else continue;
      const wa = w[va], wb = w[vb], s = C / ((wa + wb) * (len + 1e-12));
      x[a] += wa * s * dx; x[a + 1] += wa * s * dy; x[a + 2] += wa * s * dz;
      x[b] -= wb * s * dx; x[b + 1] -= wb * s * dy; x[b + 2] -= wb * s * dz;
    }
  }

  // Floor at y = 0; friction limits the tangential slide this substep by the penetration depth.
  solveFloor() {
    const x = this.x, p = this.p;
    for (let i = 0; i < 3 * this.N; i += 3) {
      const y = x[i + 1];
      if (y >= 0) continue;
      const pen = -y;
      x[i + 1] = 0;
      const dx = x[i] - p[i], dz = x[i + 2] - p[i + 2], dl = Math.sqrt(dx * dx + dz * dz);
      if (dl < SIM.muS * pen) { x[i] = p[i]; x[i + 2] = p[i + 2]; }
      else { const k = Math.min((SIM.muK * pen) / dl, 1); x[i] -= dx * k; x[i + 2] -= dz * k; }
    }
  }

  // Remove a fraction of the relative velocity along each edge (internal damping).
  dampEdges(k) {
    const x = this.x, v = this.v, w = this.w, E = this.edges;
    for (let e = 0; e < this.E; e++) {
      const va = E[2 * e], vb = E[2 * e + 1], a = 3 * va, b = 3 * vb;
      let nx = x[b] - x[a], ny = x[b + 1] - x[a + 1], nz = x[b + 2] - x[a + 2];
      const il = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-12);
      nx *= il; ny *= il; nz *= il;
      const rel = (v[b] - v[a]) * nx + (v[b + 1] - v[a + 1]) * ny + (v[b + 2] - v[a + 2]) * nz;
      const wa = w[va], wb = w[vb], imp = (rel * k) / (wa + wb);
      v[a] += nx * imp * wa; v[a + 1] += ny * imp * wa; v[a + 2] += nz * imp * wa;
      v[b] -= nx * imp * wb; v[b + 1] -= ny * imp * wb; v[b + 2] -= nz * imp * wb;
    }
  }

  // Grab a soft patch around the hit point; ax..az is the twist axis (the view direction).
  beginGrab(hx, hy, hz, ax, ay, az) {
    const g = this.grab, x = this.x, R = SIM.grabRadius;
    g.n = 0;
    let near = -1, nearD = Infinity;
    for (let i = 0; i < this.N && g.n < GRAB_MAX; i++) {
      const dx = x[3 * i] - hx, dy = x[3 * i + 1] - hy, dz = x[3 * i + 2] - hz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < nearD) { nearD = d; near = i; }
      if (d >= R) continue;
      const u = 1 - (d / R) * (d / R);
      g.idx[g.n] = i; g.wt[g.n] = u * u;
      g.off[3 * g.n] = dx; g.off[3 * g.n + 1] = dy; g.off[3 * g.n + 2] = dz;
      g.n++;
    }
    if (g.n === 0) {
      g.idx[0] = near; g.wt[0] = 1; g.n = 1;
      g.off[0] = x[3 * near] - hx; g.off[1] = x[3 * near + 1] - hy; g.off[2] = x[3 * near + 2] - hz;
    }
    g.axis[0] = ax; g.axis[1] = ay; g.axis[2] = az;
    g.twist = 0;
    g.active = true;
    this.setGrabTarget(hx, hy, hz);
  }

  setTwist(angle) {
    const g = this.grab;
    g.twist = clamp(angle, -2.6, 2.6);
    if (g.active) this.setGrabTarget(g.point[0], g.point[1], g.point[2]);
  }

  // Bounded reach: the target stays near the body and inside the arena. The patch keeps its shape
  // and is lifted as a whole rather than crushed when the target dips below the floor.
  setGrabTarget(tx, ty, tz) {
    const g = this.grab, c = this.com;
    let dx = tx - c[0], dy = ty - c[1], dz = tz - c[2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > SIM.reach) { const s = SIM.reach / d; dx *= s; dy *= s; dz *= s; }
    tx = c[0] + dx; ty = Math.min(c[1] + dy, 4); tz = c[2] + dz;
    const rr = Math.hypot(tx, tz);
    if (rr > SIM.arena) { tx *= SIM.arena / rr; tz *= SIM.arena / rr; }
    g.point[0] = tx; g.point[1] = ty; g.point[2] = tz;
    const ax = g.axis[0], ay = g.axis[1], az = g.axis[2];
    const cs = Math.cos(g.twist), sn = Math.sin(g.twist), oc = 1 - cs;
    let minY = Infinity;
    for (let k = 0; k < g.n; k++) {
      const ox = g.off[3 * k], oy = g.off[3 * k + 1], oz = g.off[3 * k + 2];
      const dot = ax * ox + ay * oy + az * oz;
      const rx = ox * cs + (ay * oz - az * oy) * sn + ax * dot * oc;
      const ry = oy * cs + (az * ox - ax * oz) * sn + ay * dot * oc;
      const rz = oz * cs + (ax * oy - ay * ox) * sn + az * dot * oc;
      g.tgt[3 * k] = tx + rx; g.tgt[3 * k + 1] = ty + ry; g.tgt[3 * k + 2] = tz + rz;
      if (ty + ry < minY) minY = ty + ry;
    }
    if (minY < 0) for (let k = 0; k < g.n; k++) g.tgt[3 * k + 1] -= minY;
  }

  endGrab() { this.grab.active = false; }

  // Toss with a spin about a horizontal axis (the screen's), so it flips onto its other face.
  toss(ax, ay, az) {
    this.grab.active = false;
    const x = this.x, v = this.v, c = this.com, spin = -3.6, up = 9;
    const wx = ax * spin, wy = ay * spin, wz = az * spin;
    for (let i = 0; i < 3 * this.N; i += 3) {
      const rx = x[i] - c[0], ry = x[i + 1] - c[1], rz = x[i + 2] - c[2];
      v[i] = wy * rz - wz * ry;
      v[i + 1] = up + wz * rx - wx * rz;
      v[i + 2] = wx * ry - wy * rx;
    }
  }

  nudge() {
    const x = this.x, v = this.v, c = this.com, a = Math.random() * 2 * Math.PI;
    const px = c[0] + Math.cos(a), pz = c[2] + Math.sin(a);
    for (let i = 0; i < 3 * this.N; i += 3) {
      const dx = x[i] - px, dz = x[i + 2] - pz, f = Math.exp(-(dx * dx + dz * dz) / 0.35);
      v[i] -= 0.5 * f * Math.cos(a); v[i + 1] += 3.4 * f + 0.8; v[i + 2] -= 0.5 * f * Math.sin(a);
    }
  }

  // Per-frame derived state: centre of mass, overall rotation, volume, kinetic energy, upload array.
  updateFrame() {
    const x = this.x, v = this.v, m = this.mass, r = this.rest, rc = this.restCom, c = this.com, N = this.N;
    c[0] = 0; c[1] = 0; c[2] = 0;
    let ke = 0;
    for (let i = 0; i < N; i++) {
      const j = 3 * i, mi = m[i];
      c[0] += mi * x[j]; c[1] += mi * x[j + 1]; c[2] += mi * x[j + 2];
      ke += 0.5 * mi * (v[j] * v[j] + v[j + 1] * v[j + 1] + v[j + 2] * v[j + 2]);
    }
    c[0] /= this.totalMass; c[1] /= this.totalMass; c[2] /= this.totalMass;
    this.kinetic = ke;
    AM.fill(0);
    for (let i = 0; i < N; i++) {
      const j = 3 * i, mi = m[i];
      const dx = x[j] - c[0], dy = x[j + 1] - c[1], dz = x[j + 2] - c[2];
      const qx = r[j] - rc[0], qy = r[j + 1] - rc[1], qz = r[j + 2] - rc[2];
      AM[0] += mi * dx * qx; AM[1] += mi * dx * qy; AM[2] += mi * dx * qz;
      AM[3] += mi * dy * qx; AM[4] += mi * dy * qy; AM[5] += mi * dy * qz;
      AM[6] += mi * dz * qx; AM[7] += mi * dz * qy; AM[8] += mi * dz * qz;
    }
    extractRotation(this.bq, 0, 6);
    const R = this.rot;
    R[0] = RM[0]; R[1] = RM[3]; R[2] = RM[6];
    R[3] = RM[1]; R[4] = RM[4]; R[5] = RM[7];
    R[6] = RM[2]; R[7] = RM[5]; R[8] = RM[8];
    let vol = 0;
    const T = this.tets;
    for (let t = 0; t < this.M; t++) vol += tetVolume(x, T[4 * t], T[4 * t + 1], T[4 * t + 2], T[4 * t + 3]);
    this.volumeRatio = vol / this.restVolume;
    const out = this.posF32;
    for (let i = 0; i < N; i++) { out[4 * i] = x[3 * i]; out[4 * i + 1] = x[3 * i + 1]; out[4 * i + 2] = x[3 * i + 2]; }
  }
}
