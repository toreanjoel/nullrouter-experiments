// XPBD step: per-tet co-rotational shape matching + volume, hard edge strain limits, grab,
// floor contact with Coulomb friction, then relative-velocity damping along edges.
const TS_A = new Float64Array(9), TS_R = new Float64Array(9);

function stepBody(B, dt) {
  const ns = SIM.substeps, h = dt / ns;
  const aS = 1 / (B.E * h * h), aV = SIM.volCompliance / (h * h);
  const kd = 1 - Math.exp(-B.damp * h), ka = Math.exp(-SIM.airDamp * h);
  if (GRAB.on) grabPrepare(B);
  for (let s = 0; s < ns; s++) {
    integrate(B, h);
    solveTets(B, aS, aV);
    limitEdges(B);
    if (GRAB.on) grabSolve(B);
    floorContact(B);
    updateVelocities(B, h, ka);
    dampEdges(B, kd);
  }
}

function integrate(B, h) {
  const x = B.x, p = B.p, v = B.v, g = SIM.gravity * h;
  for (let i = 0; i < B.nv * 3; i += 3) {
    v[i + 1] -= g;
    p[i] = x[i]; p[i + 1] = x[i + 1]; p[i + 2] = x[i + 2];
    x[i] += v[i] * h; x[i + 1] += v[i + 1] * h; x[i + 2] += v[i + 2] * h;
  }
}

function solveTets(B, aS, aV) {
  const x = B.x, m = B.m, w = B.w, T = B.tets, ro = B.ro, A = TS_A, R = TS_R, iters = SIM.rotIters;
  for (let t = 0; t < B.nt; t++) {
    const t4 = t * 4, M = B.Mt[t];
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 4; k++) {
      const i = T[t4 + k], mi = m[i];
      cx += mi * x[i * 3]; cy += mi * x[i * 3 + 1]; cz += mi * x[i * 3 + 2];
    }
    cx /= M; cy /= M; cz /= M;

    // Apq = Σ m (x − c)(X − Xc)^T, row-major
    A[0] = A[1] = A[2] = A[3] = A[4] = A[5] = A[6] = A[7] = A[8] = 0;
    for (let k = 0; k < 4; k++) {
      const i = T[t4 + k], mi = m[i], o = t * 12 + k * 3;
      const dx = mi * (x[i * 3] - cx), dy = mi * (x[i * 3 + 1] - cy), dz = mi * (x[i * 3 + 2] - cz);
      const qx = ro[o], qy = ro[o + 1], qz = ro[o + 2];
      A[0] += dx * qx; A[1] += dx * qy; A[2] += dx * qz;
      A[3] += dy * qx; A[4] += dy * qy; A[5] += dy * qz;
      A[6] += dz * qx; A[7] += dz * qy; A[8] += dz * qz;
    }
    extractRotation(A, B.q, t4, iters);
    quatToMat3(B.q, t4, R);

    // Uniform fraction toward goals keeps momentum: f = w̄ / (w̄ + α̃), w̄ = 4 / M.
    const f = 1 / (1 + (aS / B.V0[t]) * (M / 4));
    for (let k = 0; k < 4; k++) {
      const i = T[t4 + k] * 3, o = t * 12 + k * 3;
      const qx = ro[o], qy = ro[o + 1], qz = ro[o + 2];
      x[i] += (cx + R[0] * qx + R[1] * qy + R[2] * qz - x[i]) * f;
      x[i + 1] += (cy + R[3] * qx + R[4] * qy + R[5] * qz - x[i + 1]) * f;
      x[i + 2] += (cz + R[6] * qx + R[7] * qy + R[8] * qz - x[i + 2]) * f;
    }

    // Volume: C = V − V0
    const a = T[t4] * 3, b = T[t4 + 1] * 3, c = T[t4 + 2] * 3, d = T[t4 + 3] * 3;
    const e1x = x[b] - x[a], e1y = x[b + 1] - x[a + 1], e1z = x[b + 2] - x[a + 2];
    const e2x = x[c] - x[a], e2y = x[c + 1] - x[a + 1], e2z = x[c + 2] - x[a + 2];
    const e3x = x[d] - x[a], e3y = x[d + 1] - x[a + 1], e3z = x[d + 2] - x[a + 2];
    const gbx = (e2y * e3z - e2z * e3y) / 6, gby = (e2z * e3x - e2x * e3z) / 6, gbz = (e2x * e3y - e2y * e3x) / 6;
    const gcx = (e3y * e1z - e3z * e1y) / 6, gcy = (e3z * e1x - e3x * e1z) / 6, gcz = (e3x * e1y - e3y * e1x) / 6;
    const gdx = (e1y * e2z - e1z * e2y) / 6, gdy = (e1z * e2x - e1x * e2z) / 6, gdz = (e1x * e2y - e1y * e2x) / 6;
    const gax = -gbx - gcx - gdx, gay = -gby - gcy - gdy, gaz = -gbz - gcz - gdz;
    const V = e1x * gbx + e1y * gby + e1z * gbz;
    const wa = w[a / 3], wb = w[b / 3], wc = w[c / 3], wd = w[d / 3];
    const den = wa * (gax * gax + gay * gay + gaz * gaz) + wb * (gbx * gbx + gby * gby + gbz * gbz) +
      wc * (gcx * gcx + gcy * gcy + gcz * gcz) + wd * (gdx * gdx + gdy * gdy + gdz * gdz) + aV;
    if (den < 1e-20) continue;
    const dl = -(V - B.V0[t]) / den;
    x[a] += wa * dl * gax; x[a + 1] += wa * dl * gay; x[a + 2] += wa * dl * gaz;
    x[b] += wb * dl * gbx; x[b + 1] += wb * dl * gby; x[b + 2] += wb * dl * gbz;
    x[c] += wc * dl * gcx; x[c + 1] += wc * dl * gcy; x[c + 2] += wc * dl * gcz;
    x[d] += wd * dl * gdx; x[d + 1] += wd * dl * gdy; x[d + 2] += wd * dl * gdz;
  }
}

function limitEdges(B) {
  const x = B.x, w = B.w, E = B.edges, lo = SIM.strainMin, hi = SIM.strainMax;
  for (let e = 0; e < B.ne; e++) {
    const ia = E[e * 2], ib = E[e * 2 + 1], a = ia * 3, b = ib * 3;
    const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz), L0 = B.L0[e];
    let C;
    if (L > L0 * hi) C = L - L0 * hi;
    else if (L < L0 * lo) C = L - L0 * lo;
    else continue;
    if (L < 1e-9) continue;
    const wa = w[ia], wb = w[ib], s = C / ((wa + wb) * L);
    x[a] += wa * s * dx; x[a + 1] += wa * s * dy; x[a + 2] += wa * s * dz;
    x[b] -= wb * s * dx; x[b + 1] -= wb * s * dy; x[b + 2] -= wb * s * dz;
  }
}

function floorContact(B) {
  const x = B.x, p = B.p, fy = SIM.floorY;
  for (let i = 0; i < B.nv * 3; i += 3) {
    if (x[i + 1] >= fy) continue;
    const depth = fy - x[i + 1];
    x[i + 1] = fy;
    const dx = x[i] - p[i], dz = x[i + 2] - p[i + 2], dl = Math.sqrt(dx * dx + dz * dz);
    if (dl < SIM.muS * depth) { x[i] = p[i]; x[i + 2] = p[i + 2]; }
    else if (dl > 0) {
      const k = Math.min((SIM.muK * depth) / dl, 1);
      x[i] -= dx * k; x[i + 2] -= dz * k;
    }
  }
}

function updateVelocities(B, h, ka) {
  const x = B.x, p = B.p, v = B.v, ih = 1 / h, vmax = SIM.maxSpeed;
  for (let i = 0; i < B.nv * 3; i += 3) {
    let vx = (x[i] - p[i]) * ih, vy = (x[i + 1] - p[i + 1]) * ih, vz = (x[i + 2] - p[i + 2]) * ih;
    const s = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (s > vmax) { const k = vmax / s; vx *= k; vy *= k; vz *= k; }
    v[i] = vx * ka; v[i + 1] = vy * ka; v[i + 2] = vz * ka;
  }
}

function dampEdges(B, kd) {
  const x = B.x, v = B.v, w = B.w, E = B.edges;
  for (let e = 0; e < B.ne; e++) {
    const ia = E[e * 2], ib = E[e * 2 + 1], a = ia * 3, b = ib * 3;
    let nx = x[b] - x[a], ny = x[b + 1] - x[a + 1], nz = x[b + 2] - x[a + 2];
    const L = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (L < 1e-9) continue;
    nx /= L; ny /= L; nz /= L;
    const vn = (v[b] - v[a]) * nx + (v[b + 1] - v[a + 1]) * ny + (v[b + 2] - v[a + 2]) * nz;
    const wa = w[ia], wb = w[ib], s = (kd * vn) / (wa + wb);
    v[a] += wa * s * nx; v[a + 1] += wa * s * ny; v[a + 2] += wa * s * nz;
    v[b] -= wb * s * nx; v[b + 1] -= wb * s * ny; v[b + 2] -= wb * s * nz;
  }
}
