// ===== SIM-BEGIN =====
const R_OUT = 1.36, R_IN = 0.5, THICK = 0.5, BEVEL = 0.12, SCALLOPS = 14, SCALLOP_D = 0.05;
const TAU = Math.PI * 2;
const DT = 1 / 60, SUBSTEPS = 12, GRAVITY = 25;
const G_PER_UNIT3 = 27 * 1.3;              // 1 unit = 3 cm, 1.3 g/cm³
const outerR = th => { const c = Math.cos(SCALLOPS * 0.5 * th); return R_OUT - SCALLOP_D * (1 - Math.sqrt(c * c + 0.02) / Math.sqrt(1.02)); };

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// Bowyer–Watson. Returns [[a,b,c], ...] over the input points.
function delaunay(xs, ys) {
  const n = xs.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) { minX = Math.min(minX, xs[i]); maxX = Math.max(maxX, xs[i]); minY = Math.min(minY, ys[i]); maxY = Math.max(maxY, ys[i]); }
  const d = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const px = xs.concat([mx - d, mx, mx + d]), py = ys.concat([my - d, my + d, my - d]);
  const circ = (a, b, c) => {
    const ax = px[a], ay = py[a], bx = px[b], by = py[b], cx = px[c], cy = py[c];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D;
    return [a, b, c, ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
  };
  let tris = [circ(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const x = px[i], y = py[i], edges = new Map(), keep = [];
    const add = (a, b) => { const k = a < b ? a * 100000 + b : b * 100000 + a; const e = edges.get(k); if (e) e[2]++; else edges.set(k, [a, b, 1]); };
    for (const t of tris) {
      const dx = x - t[3], dy = y - t[4];
      if (dx * dx + dy * dy < t[5]) { add(t[0], t[1]); add(t[1], t[2]); add(t[2], t[0]); } else keep.push(t);
    }
    for (const e of edges.values()) if (e[2] === 1) keep.push(circ(e[0], e[1], i));
    tris = keep;
  }
  return tris.filter(t => t[0] < n && t[1] < n && t[2] < n).map(t => [t[0], t[1], t[2]]);
}

function createSim() {
  // ---- 2D section: scalloped annulus = outline samples + hex lattice
  const xs = [], zs = [];
  const NO = 70, NI = 24, H = 0.19, LAYERS = 2;
  for (let k = 0; k < NO; k++) { const th = TAU * (k + 0.5) / NO, r = outerR(th); xs.push(r * Math.cos(th)); zs.push(r * Math.sin(th)); }
  for (let k = 0; k < NI; k++) { const th = TAU * (k + 0.5) / NI; xs.push(R_IN * Math.cos(th)); zs.push(R_IN * Math.sin(th)); }
  for (let j = -9; j <= 9; j++) for (let i = -9; i <= 9; i++) {
    const x = (i + (j & 1) * 0.5) * H, z = j * H * Math.sqrt(3) / 2, r = Math.hypot(x, z);
    if (r > R_IN + 0.55 * H && r < outerR(Math.atan2(z, x)) - 0.55 * H) { xs.push(x); zs.push(z); }
  }
  const rnd = mulberry32(7);
  for (let i = 0; i < xs.length; i++) { xs[i] += (rnd() - 0.5) * 2e-5; zs[i] += (rnd() - 0.5) * 2e-5; }
  const tris = delaunay(xs, zs).filter(([a, b, c]) => {
    const cx = (xs[a] + xs[b] + xs[c]) / 3, cz = (zs[a] + zs[b] + zs[c]) / 3, r = Math.hypot(cx, cz);
    const area = Math.abs((xs[b] - xs[a]) * (zs[c] - zs[a]) - (xs[c] - xs[a]) * (zs[b] - zs[a])) / 2;
    return r > R_IN && r < outerR(Math.atan2(cz, cx)) && area > 1e-6;   // holes skipped
  });

  // ---- extrude into prisms → 3 tets each (split by global vertex order so faces conform)
  const n2 = xs.length, np = n2 * (LAYERS + 1);
  const X = new Float32Array(np * 3);
  for (let l = 0; l <= LAYERS; l++) for (let i = 0; i < n2; i++) {
    const k = (l * n2 + i) * 3; X[k] = xs[i]; X[k + 1] = THICK * l / LAYERS; X[k + 2] = zs[i];
  }
  const tetList = [];
  for (const t of tris) {
    const [a, b, c] = t.slice().sort((p, q) => p - q);
    for (let l = 0; l < LAYERS; l++) {
      const o = l * n2, u = (l + 1) * n2;
      tetList.push([a + o, b + o, c + o, c + u], [a + o, b + o, b + u, c + u], [a + o, a + u, b + u, c + u]);
    }
  }
  const nt = tetList.length;
  const tets = new Uint32Array(nt * 4), restVol = new Float32Array(nt), mass = new Float64Array(np);
  const sub = (o, a, b) => { o[0] = X[a * 3] - X[b * 3]; o[1] = X[a * 3 + 1] - X[b * 3 + 1]; o[2] = X[a * 3 + 2] - X[b * 3 + 2]; return o; };
  const e1 = [0, 0, 0], e2 = [0, 0, 0], e3 = [0, 0, 0];
  const vol6 = t => { sub(e1, t[1], t[0]); sub(e2, t[2], t[0]); sub(e3, t[3], t[0]);
    return (e1[1] * e2[2] - e1[2] * e2[1]) * e3[0] + (e1[2] * e2[0] - e1[0] * e2[2]) * e3[1] + (e1[0] * e2[1] - e1[1] * e2[0]) * e3[2]; };
  let totalVol = 0;
  for (let t = 0; t < nt; t++) {
    const q = tetList[t];
    if (vol6(q) < 0) { const s = q[2]; q[2] = q[3]; q[3] = s; }
    const v = vol6(q) / 6;
    restVol[t] = v; totalVol += v;
    for (let k = 0; k < 4; k++) { tets[t * 4 + k] = q[k]; mass[q[k]] += v / 4; }
  }
  const w = new Float64Array(np);
  for (let i = 0; i < np; i++) w[i] = 1 / mass[i];

  // per-tet rest shape about the mass-weighted centroid, normalised weights, Dm⁻¹
  const restQ = new Float32Array(nt * 12), tw = new Float32Array(nt * 4), dmInv = new Float32Array(nt * 9);
  for (let t = 0; t < nt; t++) {
    let mt = 0, cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 4; k++) { const i = tets[t * 4 + k]; mt += mass[i]; }
    for (let k = 0; k < 4; k++) { const i = tets[t * 4 + k], f = mass[i] / mt; tw[t * 4 + k] = f; cx += X[i * 3] * f; cy += X[i * 3 + 1] * f; cz += X[i * 3 + 2] * f; }
    for (let k = 0; k < 4; k++) { const i = tets[t * 4 + k]; restQ[t * 12 + k * 3] = X[i * 3] - cx; restQ[t * 12 + k * 3 + 1] = X[i * 3 + 1] - cy; restQ[t * 12 + k * 3 + 2] = X[i * 3 + 2] - cz; }
    const i0 = tets[t * 4];
    const m = [];
    for (let k = 1; k < 4; k++) { const i = tets[t * 4 + k]; m.push(X[i * 3] - X[i0 * 3], X[i * 3 + 1] - X[i0 * 3 + 1], X[i * 3 + 2] - X[i0 * 3 + 2]); }
    // columns are edges: Dm[r][c] = m[c*3+r]
    const a = m[0], b = m[3], c = m[6], d = m[1], e = m[4], f = m[7], g = m[2], h = m[5], ii = m[8];
    const A = e * ii - f * h, B = -(d * ii - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C, id = 1 / det;
    const inv = [A, -(b * ii - c * h), b * f - c * e, B, a * ii - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
    for (let k = 0; k < 9; k++) dmInv[t * 9 + k] = inv[k] * id;   // row-major
  }

  // edges and boundary faces
  const edgeSet = new Map(), faceMap = new Map();
  const TF = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
  for (let t = 0; t < nt; t++) {
    const q = tets.subarray(t * 4, t * 4 + 4);
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) { const i = Math.min(q[a], q[b]), j = Math.max(q[a], q[b]); edgeSet.set(i * np + j, [i, j]); }
    for (const f of TF) { const s = [q[f[0]], q[f[1]], q[f[2]]].sort((p, r) => p - r); const k = (s[0] * np + s[1]) * np + s[2]; faceMap.set(k, faceMap.has(k) ? null : s); }
  }
  const ne = edgeSet.size, edges = new Uint32Array(ne * 2), edgeLen = new Float32Array(ne);
  let ei = 0;
  for (const [i, j] of edgeSet.values()) { edges[ei * 2] = i; edges[ei * 2 + 1] = j; edgeLen[ei] = Math.hypot(X[i * 3] - X[j * 3], X[i * 3 + 1] - X[j * 3 + 1], X[i * 3 + 2] - X[j * 3 + 2]); ei++; }
  const lineSet = new Map();
  for (const s of faceMap.values()) if (s) for (const [a, b] of [[s[0], s[1]], [s[1], s[2]], [s[0], s[2]]]) lineSet.set(a * np + b, [a, b]);
  const lines = new Uint32Array(lineSet.size * 2);
  ei = 0; for (const [a, b] of lineSet.values()) { lines[ei++] = a; lines[ei++] = b; }

  // 2D triangle grid for embedding
  const GC = 0.15, G0 = -1.6, GN = Math.ceil(3.2 / GC);
  const grid = Array.from({ length: GN * GN }, () => []);
  const triInv = new Float64Array(tris.length * 6);
  tris.forEach(([a, b, c], ti) => {
    const x0 = xs[a], z0 = zs[a], ax = xs[b] - x0, az = zs[b] - z0, bx = xs[c] - x0, bz = zs[c] - z0, det = ax * bz - az * bx;
    triInv.set([bz / det, -bx / det, -az / det, ax / det, x0, z0], ti * 6);
    const lo = v => Math.max(0, Math.floor((v - G0) / GC)), hi = v => Math.min(GN - 1, Math.floor((v - G0) / GC));
    for (let gx = lo(Math.min(x0, xs[b], xs[c])); gx <= hi(Math.max(x0, xs[b], xs[c])); gx++)
      for (let gz = lo(Math.min(z0, zs[b], zs[c])); gz <= hi(Math.max(z0, zs[b], zs[c])); gz++) grid[gz * GN + gx].push(ti);
  });
  // point (rest space) → tet index, barycentric weights in out[0..3]
  function embed(px, py, pz, out) {
    const cx = Math.floor((px - G0) / GC), cz = Math.floor((pz - G0) / GC);
    let best = -Infinity, bt = 0;
    for (let gz = Math.max(0, cz - 1); gz <= Math.min(GN - 1, cz + 1); gz++) for (let gx = Math.max(0, cx - 1); gx <= Math.min(GN - 1, cx + 1); gx++)
      for (const ti of grid[gz * GN + gx]) {
        const m = triInv.subarray(ti * 6, ti * 6 + 6), dx = px - m[4], dz = pz - m[5];
        const l1 = m[0] * dx + m[1] * dz, l2 = m[2] * dx + m[3] * dz, mn = Math.min(l1, l2, 1 - l1 - l2);
        if (mn > best) { best = mn; bt = ti; }
      }
    const layer = Math.max(0, Math.min(LAYERS - 1, Math.floor(py / (THICK / LAYERS))));
    let bestT = 0; best = -Infinity;
    for (let k = 0; k < 3; k++) {
      const t = (bt * LAYERS + layer) * 3 + k, i0 = tets[t * 4] * 3, D = dmInv.subarray(t * 9, t * 9 + 9);
      const dx = px - X[i0], dy = py - X[i0 + 1], dz = pz - X[i0 + 2];
      const l1 = D[0] * dx + D[1] * dy + D[2] * dz, l2 = D[3] * dx + D[4] * dy + D[5] * dz, l3 = D[6] * dx + D[7] * dy + D[8] * dz;
      const mn = Math.min(l1, l2, l3, 1 - l1 - l2 - l3);
      if (mn > best) { best = mn; bestT = t; out[0] = 1 - l1 - l2 - l3; out[1] = l1; out[2] = l2; out[3] = l3; }
    }
    return bestT;
  }

  // ---- state
  const x = new Float64Array(np * 3), pv = new Float64Array(np * 3), v = new Float64Array(np * 3), xs0 = new Float64Array(np * 3);
  const quat = new Float32Array(nt * 4);
  const P = { shapeA: 285, edgeDamp: 6, airDamp: 0.25, sMax: 1.75, sMin: 0.55, muS: 0.5, muK: 0.35, grabK: 0.16, reach: 2.4, maxPull: 0.02 };
  const grab = { active: false, n: 0, idx: new Int32Array(256), off: new Float64Array(768), wt: new Float64Array(256), tgt: new Float64Array(768),
    g: new Float64Array(3), axis: new Float64Array([0, 0, 1]), twist: 0 };
  const com = new Float64Array(3), bodyQ = new Float64Array([1, 0, 0, 0]);
  let settleT = 0;

  function reset() {
    for (let i = 0; i < np; i++) { x[i * 3] = X[i * 3]; x[i * 3 + 1] = X[i * 3 + 1] + 0.06; x[i * 3 + 2] = X[i * 3 + 2]; }
    v.fill(0); xs0.set(x); pv.set(x);
    for (let t = 0; t < nt; t++) { quat[t * 4] = 1; quat[t * 4 + 1] = quat[t * 4 + 2] = quat[t * 4 + 3] = 0; }
    bodyQ.set([1, 0, 0, 0]); grab.active = false; settleT = 0;
  }

  // ---- constraints
  function solveShape() {
    const k = 1 / (1 + P.shapeA);
    for (let t = 0; t < nt; t++) {
      const t4 = t * 4, t12 = t * 12;
      const i0 = tets[t4] * 3, i1 = tets[t4 + 1] * 3, i2 = tets[t4 + 2] * 3, i3 = tets[t4 + 3] * 3;
      const w0 = tw[t4], w1 = tw[t4 + 1], w2 = tw[t4 + 2], w3 = tw[t4 + 3];
      const cx = x[i0] * w0 + x[i1] * w1 + x[i2] * w2 + x[i3] * w3;
      const cy = x[i0 + 1] * w0 + x[i1 + 1] * w1 + x[i2 + 1] * w2 + x[i3 + 1] * w3;
      const cz = x[i0 + 2] * w0 + x[i1 + 2] * w1 + x[i2 + 2] * w2 + x[i3 + 2] * w3;
      let a00 = 0, a01 = 0, a02 = 0, a10 = 0, a11 = 0, a12 = 0, a20 = 0, a21 = 0, a22 = 0;
      for (let j = 0; j < 4; j++) {
        const i = tets[t4 + j] * 3, wj = tw[t4 + j];
        const dx = (x[i] - cx) * wj, dy = (x[i + 1] - cy) * wj, dz = (x[i + 2] - cz) * wj;
        const qx = restQ[t12 + j * 3], qy = restQ[t12 + j * 3 + 1], qz = restQ[t12 + j * 3 + 2];
        a00 += dx * qx; a01 += dx * qy; a02 += dx * qz;
        a10 += dy * qx; a11 += dy * qy; a12 += dy * qz;
        a20 += dz * qx; a21 += dz * qy; a22 += dz * qz;
      }
      // Müller et al. 2016 rotation extraction, warm-started from last substep
      let qw = quat[t4], qx = quat[t4 + 1], qy = quat[t4 + 2], qz = quat[t4 + 3];
      let r00, r01, r02, r10, r11, r12, r20, r21, r22;
      for (let it = 0; it < 3; it++) {
        r00 = 1 - 2 * (qy * qy + qz * qz); r01 = 2 * (qx * qy - qw * qz); r02 = 2 * (qx * qz + qw * qy);
        r10 = 2 * (qx * qy + qw * qz); r11 = 1 - 2 * (qx * qx + qz * qz); r12 = 2 * (qy * qz - qw * qx);
        r20 = 2 * (qx * qz - qw * qy); r21 = 2 * (qy * qz + qw * qx); r22 = 1 - 2 * (qx * qx + qy * qy);
        if (it === 2) break;
        let ox = (r10 * a20 - r20 * a10) + (r11 * a21 - r21 * a11) + (r12 * a22 - r22 * a12);
        let oy = (r20 * a00 - r00 * a20) + (r21 * a01 - r01 * a21) + (r22 * a02 - r02 * a22);
        let oz = (r00 * a10 - r10 * a00) + (r01 * a11 - r11 * a01) + (r02 * a12 - r12 * a02);
        const den = 1 / (Math.abs(r00 * a00 + r10 * a10 + r20 * a20 + r01 * a01 + r11 * a11 + r21 * a21 + r02 * a02 + r12 * a12 + r22 * a22) + 1e-12);
        ox *= den; oy *= den; oz *= den;
        const ang = Math.sqrt(ox * ox + oy * oy + oz * oz);
        if (ang < 1e-9) { it = 1; continue; }
        const s = Math.sin(ang * 0.5) / ang, c = Math.cos(ang * 0.5);
        const dx = ox * s, dy = oy * s, dz = oz * s;
        const nw = c * qw - dx * qx - dy * qy - dz * qz;
        const nx = c * qx + dx * qw + dy * qz - dz * qy;
        const ny = c * qy + dy * qw + dz * qx - dx * qz;
        const nz = c * qz + dz * qw + dx * qy - dy * qx;
        const il = 1 / Math.sqrt(nw * nw + nx * nx + ny * ny + nz * nz);
        qw = nw * il; qx = nx * il; qy = ny * il; qz = nz * il;
      }
      quat[t4] = qw; quat[t4 + 1] = qx; quat[t4 + 2] = qy; quat[t4 + 3] = qz;
      for (let j = 0; j < 4; j++) {
        const i = tets[t4 + j] * 3;
        const qx_ = restQ[t12 + j * 3], qy_ = restQ[t12 + j * 3 + 1], qz_ = restQ[t12 + j * 3 + 2];
        x[i] += (cx + r00 * qx_ + r01 * qy_ + r02 * qz_ - x[i]) * k;
        x[i + 1] += (cy + r10 * qx_ + r11 * qy_ + r12 * qz_ - x[i + 1]) * k;
        x[i + 2] += (cz + r20 * qx_ + r21 * qy_ + r22 * qz_ - x[i + 2]) * k;
      }
    }
  }

  function solveVolume() {
    for (let t = 0; t < nt; t++) {
      const t4 = t * 4, a = tets[t4], b = tets[t4 + 1], c = tets[t4 + 2], d = tets[t4 + 3];
      const i0 = a * 3, i1 = b * 3, i2 = c * 3, i3 = d * 3;
      const ax = x[i1] - x[i0], ay = x[i1 + 1] - x[i0 + 1], az = x[i1 + 2] - x[i0 + 2];
      const bx = x[i2] - x[i0], by = x[i2 + 1] - x[i0 + 1], bz = x[i2 + 2] - x[i0 + 2];
      const cx = x[i3] - x[i0], cy = x[i3 + 1] - x[i0 + 1], cz = x[i3 + 2] - x[i0 + 2];
      // ∂V/∂x1 = b×c/6, ∂V/∂x2 = c×a/6, ∂V/∂x3 = a×b/6, ∂V/∂x0 = −sum
      const g1x = (by * cz - bz * cy) / 6, g1y = (bz * cx - bx * cz) / 6, g1z = (bx * cy - by * cx) / 6;
      const g2x = (cy * az - cz * ay) / 6, g2y = (cz * ax - cx * az) / 6, g2z = (cx * ay - cy * ax) / 6;
      const g3x = (ay * bz - az * by) / 6, g3y = (az * bx - ax * bz) / 6, g3z = (ax * by - ay * bx) / 6;
      const g0x = -g1x - g2x - g3x, g0y = -g1y - g2y - g3y, g0z = -g1z - g2z - g3z;
      const vol = ax * g1x * 1 + ay * g1y + az * g1z;   // a·(b×c)/6
      const W = w[a] * (g0x * g0x + g0y * g0y + g0z * g0z) + w[b] * (g1x * g1x + g1y * g1y + g1z * g1z)
              + w[c] * (g2x * g2x + g2y * g2y + g2z * g2z) + w[d] * (g3x * g3x + g3y * g3y + g3z * g3z);
      if (W < 1e-20) continue;
      const lam = -(vol - restVol[t]) / W;
      let s = lam * w[a]; x[i0] += s * g0x; x[i0 + 1] += s * g0y; x[i0 + 2] += s * g0z;
      s = lam * w[b]; x[i1] += s * g1x; x[i1 + 1] += s * g1y; x[i1 + 2] += s * g1z;
      s = lam * w[c]; x[i2] += s * g2x; x[i2 + 1] += s * g2y; x[i2 + 2] += s * g2z;
      s = lam * w[d]; x[i3] += s * g3x; x[i3 + 1] += s * g3y; x[i3 + 2] += s * g3z;
    }
  }

  function solveStrain() {
    const hi = P.sMax, lo = P.sMin;
    for (let e = 0; e < ne; e++) {
      const i = edges[e * 2], j = edges[e * 2 + 1], a = i * 3, b = j * 3;
      const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz), L0 = edgeLen[e];
      let target;
      if (len > L0 * hi) target = L0 * hi; else if (len < L0 * lo) target = L0 * lo; else continue;
      if (len < 1e-9) continue;
      const s = (len - target) / (len * (w[i] + w[j])), si = s * w[i], sj = s * w[j];
      x[a] += dx * si; x[a + 1] += dy * si; x[a + 2] += dz * si;
      x[b] -= dx * sj; x[b + 1] -= dy * sj; x[b + 2] -= dz * sj;
    }
  }

  function solveFloor() {
    const muS = P.muS, muK = P.muK;
    for (let i = 0; i < np; i++) {
      const k = i * 3;
      if (x[k + 1] >= 0) continue;
      const pen = -x[k + 1]; x[k + 1] = 0;
      const dx = x[k] - pv[k], dz = x[k + 2] - pv[k + 2], dl = Math.sqrt(dx * dx + dz * dz);
      if (dl < muS * pen) { x[k] = pv[k]; x[k + 2] = pv[k + 2]; }
      else if (dl > 0) { const f = Math.min(1, muK * pen / dl); x[k] -= dx * f; x[k + 2] -= dz * f; }
    }
  }

  function solveGrab() {
    const n = grab.n, K = P.grabK, mp = P.maxPull, idx = grab.idx, tg = grab.tgt, wt = grab.wt;
    for (let j = 0; j < n; j++) {
      const k = idx[j] * 3, f = wt[j] * K;
      let dx = (tg[j * 3] - x[k]) * f, dy = (tg[j * 3 + 1] - x[k + 1]) * f, dz = (tg[j * 3 + 2] - x[k + 2]) * f;
      const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (l > mp) { const s = mp / l; dx *= s; dy *= s; dz *= s; }
      x[k] += dx; x[k + 1] += dy; x[k + 2] += dz;
    }
  }

  function dampEdges(h) {
    const kd = 1 - Math.exp(-P.edgeDamp * h);
    for (let e = 0; e < ne; e++) {
      const i = edges[e * 2], j = edges[e * 2 + 1], a = i * 3, b = j * 3;
      let nx = x[b] - x[a], ny = x[b + 1] - x[a + 1], nz = x[b + 2] - x[a + 2];
      const il = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-12); nx *= il; ny *= il; nz *= il;
      const dv = ((v[b] - v[a]) * nx + (v[b + 1] - v[a + 1]) * ny + (v[b + 2] - v[a + 2]) * nz) * kd / (w[i] + w[j]);
      const si = dv * w[i], sj = dv * w[j];
      v[a] += nx * si; v[a + 1] += ny * si; v[a + 2] += nz * si;
      v[b] -= nx * sj; v[b + 1] -= ny * sj; v[b + 2] -= nz * sj;
    }
  }

  function computeCom() {
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < np; i++) { const m = mass[i]; cx += x[i * 3] * m; cy += x[i * 3 + 1] * m; cz += x[i * 3 + 2] * m; }
    com[0] = cx / totalVol; com[1] = cy / totalVol; com[2] = cz / totalVol;
    return com;
  }

  // once per step: twist the patch offsets, bound the reach, keep the patch above the floor
  function prepGrab() {
    const c = Math.cos(grab.twist), s = Math.sin(grab.twist), ax = grab.axis[0], ay = grab.axis[1], az = grab.axis[2];
    const off = grab.off, tg = grab.tgt, n = grab.n;
    let minY = Infinity;
    for (let j = 0; j < n; j++) {
      const ox = off[j * 3], oy = off[j * 3 + 1], oz = off[j * 3 + 2];
      const d = (ax * ox + ay * oy + az * oz) * (1 - c);
      const rx = ox * c + (ay * oz - az * oy) * s + ax * d;
      const ry = oy * c + (az * ox - ax * oz) * s + ay * d;
      const rz = oz * c + (ax * oy - ay * ox) * s + az * d;
      tg[j * 3] = rx; tg[j * 3 + 1] = ry; tg[j * 3 + 2] = rz;
      if (ry < minY) minY = ry;
    }
    computeCom();
    const g = grab.g;
    let dx = g[0] - com[0], dy = g[1] - com[1], dz = g[2] - com[2];
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l > P.reach) { const f = P.reach / l; dx *= f; dy *= f; dz *= f; }
    const gx = com[0] + dx, gz = com[2] + dz;
    const gy = Math.min(Math.max(com[1] + dy, 0.004 - minY), 3.2);
    for (let j = 0; j < n; j++) { tg[j * 3] += gx; tg[j * 3 + 1] += gy; tg[j * 3 + 2] += gz; }
  }

  function substep(h) {
    const gh = GRAVITY * h;
    for (let k = 0; k < np * 3; k += 3) {
      v[k + 1] -= gh;
      pv[k] = x[k]; pv[k + 1] = x[k + 1]; pv[k + 2] = x[k + 2];
      x[k] += v[k] * h; x[k + 1] += v[k + 1] * h; x[k + 2] += v[k + 2] * h;
    }
    if (grab.active) solveGrab();
    solveShape();
    solveVolume();
    solveStrain();
    solveFloor();
    const ih = 1 / h;
    for (let k = 0; k < np * 3; k++) v[k] = (x[k] - pv[k]) * ih;
    dampEdges(h);
  }

  function kinetic() {   // ½mv² in sim units (mass = volume)
    let e = 0;
    for (let i = 0; i < np; i++) { const k = i * 3; e += mass[i] * (v[k] * v[k] + v[k + 1] * v[k + 1] + v[k + 2] * v[k + 2]); }
    return e * 0.5;
  }

  function step() {
    xs0.set(x);
    if (grab.active) prepGrab();
    const h = DT / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) substep(h);
    // gentle settling: once it is nearly still and nobody holds it, bleed off the last shimmer
    const keM = kinetic() / totalVol;
    settleT = (!grab.active && keM < 0.02) ? Math.min(settleT + DT, 1.5) : 0;
    const f = Math.exp(-(P.airDamp + settleT * 1.4) * DT);
    for (let k = 0; k < np * 3; k++) v[k] *= f;
  }

  function interp(alpha, out) {
    for (let k = 0; k < np * 3; k++) out[k] = xs0[k] + (x[k] - xs0[k]) * alpha;
  }

  // whole-body rotation (for the hole test); returns normal in out[0..2], com in com
  function bodyNormal(out) {
    computeCom();
    let a00 = 0, a01 = 0, a02 = 0, a10 = 0, a11 = 0, a12 = 0, a20 = 0, a21 = 0, a22 = 0;
    for (let i = 0; i < np; i++) {
      const k = i * 3, m = mass[i];
      const dx = (x[k] - com[0]) * m, dy = (x[k + 1] - com[1]) * m, dz = (x[k + 2] - com[2]) * m;
      const qx = X[k], qy = X[k + 1] - THICK / 2, qz = X[k + 2];
      a00 += dx * qx; a01 += dx * qy; a02 += dx * qz; a10 += dy * qx; a11 += dy * qy; a12 += dy * qz; a20 += dz * qx; a21 += dz * qy; a22 += dz * qz;
    }
    let [qw, qx, qy, qz] = bodyQ;
    for (let it = 0; it < 12; it++) {
      const r00 = 1 - 2 * (qy * qy + qz * qz), r01 = 2 * (qx * qy - qw * qz), r02 = 2 * (qx * qz + qw * qy);
      const r10 = 2 * (qx * qy + qw * qz), r11 = 1 - 2 * (qx * qx + qz * qz), r12 = 2 * (qy * qz - qw * qx);
      const r20 = 2 * (qx * qz - qw * qy), r21 = 2 * (qy * qz + qw * qx), r22 = 1 - 2 * (qx * qx + qy * qy);
      const den = 1 / (Math.abs(r00 * a00 + r10 * a10 + r20 * a20 + r01 * a01 + r11 * a11 + r21 * a21 + r02 * a02 + r12 * a12 + r22 * a22) + 1e-12);
      const ox = ((r10 * a20 - r20 * a10) + (r11 * a21 - r21 * a11) + (r12 * a22 - r22 * a12)) * den;
      const oy = ((r20 * a00 - r00 * a20) + (r21 * a01 - r01 * a21) + (r22 * a02 - r02 * a22)) * den;
      const oz = ((r00 * a10 - r10 * a00) + (r01 * a11 - r11 * a01) + (r02 * a12 - r12 * a02)) * den;
      const ang = Math.hypot(ox, oy, oz);
      if (ang < 1e-9) break;
      const s = Math.sin(ang / 2) / ang, c = Math.cos(ang / 2), dx = ox * s, dy = oy * s, dz = oz * s;
      const nw = c * qw - dx * qx - dy * qy - dz * qz, nx = c * qx + dx * qw + dy * qz - dz * qy;
      const ny = c * qy + dy * qw + dz * qx - dx * qz, nz = c * qz + dz * qw + dx * qy - dy * qx;
      const il = 1 / Math.hypot(nw, nx, ny, nz); qw = nw * il; qx = nx * il; qy = ny * il; qz = nz * il;
    }
    bodyQ[0] = qw; bodyQ[1] = qx; bodyQ[2] = qy; bodyQ[3] = qz;
    out[0] = 2 * (qx * qy - qw * qz); out[1] = 1 - 2 * (qx * qx + qz * qz); out[2] = 2 * (qy * qz + qw * qx);
    return out;
  }

  // ---- handling
  function beginGrab(hx, hy, hz, ax, ay, az) {
    const R = 0.3;
    let n = 0;
    for (let i = 0; i < np && n < 256; i++) {
      const k = i * 3, dx = x[k] - hx, dy = x[k + 1] - hy, dz = x[k + 2] - hz, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < R) { const f = 1 - d / R; grab.idx[n] = i; grab.wt[n] = 0.15 + 0.85 * f * f; grab.off[n * 3] = dx; grab.off[n * 3 + 1] = dy; grab.off[n * 3 + 2] = dz; n++; }
    }
    if (n === 0) {   // always hold at least the nearest node
      let bi = 0, bd = Infinity;
      for (let i = 0; i < np; i++) { const k = i * 3, d = (x[k] - hx) ** 2 + (x[k + 1] - hy) ** 2 + (x[k + 2] - hz) ** 2; if (d < bd) { bd = d; bi = i; } }
      grab.idx[0] = bi; grab.wt[0] = 1; grab.off[0] = x[bi * 3] - hx; grab.off[1] = x[bi * 3 + 1] - hy; grab.off[2] = x[bi * 3 + 2] - hz; n = 1;
    }
    grab.n = n; grab.g[0] = hx; grab.g[1] = hy; grab.g[2] = hz;
    grab.axis[0] = ax; grab.axis[1] = ay; grab.axis[2] = az; grab.twist = 0; grab.active = true;
  }
  function setGrabTarget(gx, gy, gz) { grab.g[0] = gx; grab.g[1] = gy; grab.g[2] = gz; }
  function endGrab() { grab.active = false; }

  function addSpin(vx, vy, vz, wx, wy, wz) {
    computeCom();
    for (let i = 0; i < np; i++) {
      const k = i * 3, rx = x[k] - com[0], ry = x[k + 1] - com[1], rz = x[k + 2] - com[2];
      v[k] += vx + wy * rz - wz * ry; v[k + 1] += vy + wz * rx - wx * rz; v[k + 2] += vz + wx * ry - wy * rx;
    }
    settleT = 0;
  }
  function nudge(rand = Math.random) {
    const a = rand() * TAU;
    addSpin((rand() - 0.5) * 0.8, 3.0 + rand() * 0.8, (rand() - 0.5) * 0.8, Math.cos(a) * 2.4, (rand() - 0.5) * 1.6, Math.sin(a) * 2.4);
  }
  // toss with spin about the screen's horizontal axis (rx, rz) so it lands on its other face
  function turnOver(rx, rz) {
    endGrab();
    computeCom();
    v.fill(0);
    const l = Math.hypot(rx, rz) || 1;
    addSpin(-com[0] * 0.9, 8.6, -com[2] * 0.9, -rx / l * 5.2, 0, -rz / l * 5.2);
  }

  function volumeRatio() {
    let vol = 0;
    for (let t = 0; t < nt; t++) {
      const t4 = t * 4, i0 = tets[t4] * 3, i1 = tets[t4 + 1] * 3, i2 = tets[t4 + 2] * 3, i3 = tets[t4 + 3] * 3;
      const ax = x[i1] - x[i0], ay = x[i1 + 1] - x[i0 + 1], az = x[i1 + 2] - x[i0 + 2];
      const bx = x[i2] - x[i0], by = x[i2 + 1] - x[i0 + 1], bz = x[i2 + 2] - x[i0 + 2];
      const cx = x[i3] - x[i0], cy = x[i3 + 1] - x[i0 + 1], cz = x[i3 + 2] - x[i0 + 2];
      vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    }
    return vol / totalVol;
  }

  reset();
  return {
    np, nt, ne, n2, X, x, v, mass, tets, dmInv, lines, totalVol, P, grab, com,
    step, interp, reset, embed, beginGrab, setGrabTarget, endGrab, nudge, turnOver, kinetic, bodyNormal, computeCom, volumeRatio,
    isGrabbing: () => grab.active,
  };
}
