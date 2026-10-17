// XPBD tetrahedral soft body: co-rotational shape matching, volume, strain limits, edge damping, floor friction.
const SIM = { substeps: 8, g: 9.81, firm: 0.55, damp: 0.35, muS: 0.9, muK: 0.6, lift: 0.1, strainLo: 0.6, strainHi: 1.5, vmax: 12 };
const GRAMS_PER_UNIT3 = 27 * 1.3;

let NP = 0, NT = 0, NE = 0, TETS, EDGES;
let X, XP, V, XS, XR, IW, MS, REST, TR, TRM, TQ, TV0, EL0;
let totalMass = 0, restVolume = 0;
const A9 = new Float64Array(9), BQ = new Float64Array([0, 0, 0, 1]), BR = new Float64Array(9), BODY = new Float64Array(6);
const restC = new Float64Array(3);

function simInit(mesh) {
  NP = mesh.N; NT = mesh.NT; TETS = mesh.tets; EDGES = mesh.edges; NE = EDGES.length / 2;
  REST = mesh.rest;
  X = new Float64Array(NP * 3); XP = new Float64Array(NP * 3); V = new Float64Array(NP * 3);
  XS = new Float64Array(NP * 3); XR = new Float32Array(NP * 3);
  MS = new Float64Array(NP); IW = new Float64Array(NP);
  totalMass = 0;
  for (let i = 0; i < NP; i++) { MS[i] = mesh.mass[i]; IW[i] = 1 / MS[i]; totalMass += MS[i]; }
  restC.fill(0);
  for (let i = 0; i < NP; i++) for (let k = 0; k < 3; k++) restC[k] += MS[i] * REST[i * 3 + k] / totalMass;
  TV0 = mesh.vol0; restVolume = 0;
  for (let t = 0; t < NT; t++) restVolume += TV0[t];
  TR = new Float64Array(NT * 12); TRM = new Float64Array(NT * 12); TQ = new Float64Array(NT * 4);
  for (let t = 0; t < NT; t++) {
    let mt = 0, cx = 0, cy = 0, cz = 0;
    for (let j = 0; j < 4; j++) {
      const i = TETS[t * 4 + j], m = MS[i];
      mt += m; cx += m * REST[i * 3]; cy += m * REST[i * 3 + 1]; cz += m * REST[i * 3 + 2];
    }
    cx /= mt; cy /= mt; cz /= mt;
    for (let j = 0; j < 4; j++) {
      const i = TETS[t * 4 + j];
      TR[t * 12 + j * 3] = REST[i * 3] - cx; TR[t * 12 + j * 3 + 1] = REST[i * 3 + 1] - cy; TR[t * 12 + j * 3 + 2] = REST[i * 3 + 2] - cz;
    }
    // TRM = m S⁻¹ r with S = Σ m r rᵀ, so Σ m x TRMᵀ is the deformation gradient and the rotation update converges in one step.
    let s00 = 0, s01 = 0, s02 = 0, s11 = 0, s12 = 0, s22 = 0;
    for (let j = 0; j < 4; j++) {
      const m = MS[TETS[t * 4 + j]], rx = TR[t * 12 + j * 3], ry = TR[t * 12 + j * 3 + 1], rz = TR[t * 12 + j * 3 + 2];
      s00 += m * rx * rx; s01 += m * rx * ry; s02 += m * rx * rz; s11 += m * ry * ry; s12 += m * ry * rz; s22 += m * rz * rz;
    }
    const c00 = s11 * s22 - s12 * s12, c01 = s02 * s12 - s01 * s22, c02 = s01 * s12 - s02 * s11;
    const c11 = s00 * s22 - s02 * s02, c12 = s01 * s02 - s00 * s12, c22 = s00 * s11 - s01 * s01;
    const idet = 1 / (s00 * c00 + s01 * c01 + s02 * c02);
    for (let j = 0; j < 4; j++) {
      const m = MS[TETS[t * 4 + j]] * idet, o = t * 12 + j * 3, rx = TR[o], ry = TR[o + 1], rz = TR[o + 2];
      TRM[o] = m * (c00 * rx + c01 * ry + c02 * rz);
      TRM[o + 1] = m * (c01 * rx + c11 * ry + c12 * rz);
      TRM[o + 2] = m * (c02 * rx + c12 * ry + c22 * rz);
    }
  }
  EL0 = new Float64Array(NE);
  for (let e = 0; e < NE; e++) {
    const a = EDGES[e * 2] * 3, b = EDGES[e * 2 + 1] * 3;
    EL0[e] = Math.hypot(REST[b] - REST[a], REST[b + 1] - REST[a + 1], REST[b + 2] - REST[a + 2]);
  }
  simReset();
}

function simReset() {
  for (let i = 0; i < NP * 3; i++) { X[i] = REST[i] + (i % 3 === 1 ? SIM.lift : 0); V[i] = 0; XS[i] = X[i]; XR[i] = X[i]; }
  for (let t = 0; t < NT; t++) { TQ[t * 4] = 0; TQ[t * 4 + 1] = 0; TQ[t * 4 + 2] = 0; TQ[t * 4 + 3] = 1; }
  BQ[0] = BQ[1] = BQ[2] = 0; BQ[3] = 1;
}

function simStep(dt) {
  const n = SIM.substeps, h = dt / n;
  const kSM = 0.006 * Math.pow(40, SIM.firm);
  const kd = 0.00005 + 0.006 * SIM.damp * SIM.damp;
  const volA = 2e-9 / (h * h);
  let v2 = 0;
  for (let i = 0; i < NP * 3; i++) v2 += V[i] * V[i];
  v2 /= NP;
  const settle = v2 < 0.01 && !GRAB.active ? 2.5 * (1 - v2 / 0.01) : 0;
  const air = 1 - h * (0.12 + settle);
  XS.set(X);
  for (let s = 0; s < n; s++) {
    const gh = SIM.g * h;
    for (let i = 0; i < NP; i++) {
      const p = i * 3;
      V[p + 1] -= gh;
      XP[p] = X[p]; XP[p + 1] = X[p + 1]; XP[p + 2] = X[p + 2];
      X[p] += V[p] * h; X[p + 1] += V[p + 1] * h; X[p + 2] += V[p + 2] * h;
    }
    solveShape(kSM);
    solveVolume(volA);
    solveStrain();
    grabSolve();
    solveFloor();
    const ih = air / h, vmax2 = SIM.vmax * SIM.vmax;
    for (let i = 0; i < NP; i++) {
      const p = i * 3;
      let vx = (X[p] - XP[p]) * ih, vy = (X[p + 1] - XP[p + 1]) * ih, vz = (X[p + 2] - XP[p + 2]) * ih;
      const v2 = vx * vx + vy * vy + vz * vz;
      if (v2 > vmax2) { const f = SIM.vmax / Math.sqrt(v2); vx *= f; vy *= f; vz *= f; }
      V[p] = vx; V[p + 1] = vy; V[p + 2] = vz;
    }
    dampEdges(kd);
  }
  dampRigid(0.003 + 0.15 * Math.pow(SIM.damp, 1.6));
}

// Pulls velocities toward the whole body's rigid motion (v_cm + ω × r): damps every wobble mode, keeps spin and drift.
function dampRigid(k) {
  if (k <= 0) return;
  let cx = 0, cy = 0, cz = 0, vx = 0, vy = 0, vz = 0;
  for (let i = 0; i < NP; i++) {
    const p = i * 3, m = MS[i];
    cx += m * X[p]; cy += m * X[p + 1]; cz += m * X[p + 2]; vx += m * V[p]; vy += m * V[p + 1]; vz += m * V[p + 2];
  }
  const iM = 1 / totalMass;
  cx *= iM; cy *= iM; cz *= iM; vx *= iM; vy *= iM; vz *= iM;
  let lx = 0, ly = 0, lz = 0, i00 = 0, i01 = 0, i02 = 0, i11 = 0, i12 = 0, i22 = 0;
  for (let i = 0; i < NP; i++) {
    const p = i * 3, m = MS[i];
    const px = X[p] - cx, py = X[p + 1] - cy, pz = X[p + 2] - cz;
    const ux = V[p] - vx, uy = V[p + 1] - vy, uz = V[p + 2] - vz;
    lx += m * (py * uz - pz * uy); ly += m * (pz * ux - px * uz); lz += m * (px * uy - py * ux);
    const q = px * px + py * py + pz * pz;
    i00 += m * (q - px * px); i11 += m * (q - py * py); i22 += m * (q - pz * pz);
    i01 -= m * px * py; i02 -= m * px * pz; i12 -= m * py * pz;
  }
  const c00 = i11 * i22 - i12 * i12, c01 = i02 * i12 - i01 * i22, c02 = i01 * i12 - i02 * i11;
  const c11 = i00 * i22 - i02 * i02, c12 = i01 * i02 - i00 * i12, c22 = i00 * i11 - i01 * i01;
  const id = 1 / (i00 * c00 + i01 * c01 + i02 * c02);
  const wx = (c00 * lx + c01 * ly + c02 * lz) * id, wy = (c01 * lx + c11 * ly + c12 * lz) * id, wz = (c02 * lx + c12 * ly + c22 * lz) * id;
  for (let i = 0; i < NP; i++) {
    const p = i * 3, px = X[p] - cx, py = X[p + 1] - cy, pz = X[p + 2] - cz;
    V[p] += k * (vx + wy * pz - wz * py - V[p]);
    V[p + 1] += k * (vy + wz * px - wx * pz - V[p + 1]);
    V[p + 2] += k * (vz + wx * py - wy * px - V[p + 2]);
  }
}

// One warm-started Müller rotation update per tet, then each vertex moves toward c + R·r.
function solveShape(k) {
  for (let t = 0; t < NT; t++) {
    const t4 = t * 4, t12 = t * 12;
    const j0 = TETS[t4], j1 = TETS[t4 + 1], j2 = TETS[t4 + 2], j3 = TETS[t4 + 3];
    const i0 = j0 * 3, i1 = j1 * 3, i2 = j2 * 3, i3 = j3 * 3;
    const m0 = MS[j0], m1 = MS[j1], m2 = MS[j2], m3 = MS[j3];
    const im = 1 / (m0 + m1 + m2 + m3);
    const x0 = X[i0], y0 = X[i0 + 1], z0 = X[i0 + 2], x1 = X[i1], y1 = X[i1 + 1], z1 = X[i1 + 2];
    const x2 = X[i2], y2 = X[i2 + 1], z2 = X[i2 + 2], x3 = X[i3], y3 = X[i3 + 1], z3 = X[i3 + 2];
    const cx = (m0 * x0 + m1 * x1 + m2 * x2 + m3 * x3) * im;
    const cy = (m0 * y0 + m1 * y1 + m2 * y2 + m3 * y3) * im;
    const cz = (m0 * z0 + m1 * z1 + m2 * z2 + m3 * z3) * im;
    // F = Σ m x (S⁻¹r)ᵀ (Σ m r = 0), columns a0..a2
    const ra0 = TRM[t12], rb0 = TRM[t12 + 1], rc0 = TRM[t12 + 2], ra1 = TRM[t12 + 3], rb1 = TRM[t12 + 4], rc1 = TRM[t12 + 5];
    const ra2 = TRM[t12 + 6], rb2 = TRM[t12 + 7], rc2 = TRM[t12 + 8], ra3 = TRM[t12 + 9], rb3 = TRM[t12 + 10], rc3 = TRM[t12 + 11];
    const a00 = x0 * ra0 + x1 * ra1 + x2 * ra2 + x3 * ra3, a10 = y0 * ra0 + y1 * ra1 + y2 * ra2 + y3 * ra3, a20 = z0 * ra0 + z1 * ra1 + z2 * ra2 + z3 * ra3;
    const a01 = x0 * rb0 + x1 * rb1 + x2 * rb2 + x3 * rb3, a11 = y0 * rb0 + y1 * rb1 + y2 * rb2 + y3 * rb3, a21 = z0 * rb0 + z1 * rb1 + z2 * rb2 + z3 * rb3;
    const a02 = x0 * rc0 + x1 * rc1 + x2 * rc2 + x3 * rc3, a12 = y0 * rc0 + y1 * rc1 + y2 * rc2 + y3 * rc3, a22 = z0 * rc0 + z1 * rc1 + z2 * rc2 + z3 * rc3;
    let qx = TQ[t4], qy = TQ[t4 + 1], qz = TQ[t4 + 2], qw = TQ[t4 + 3];
    let xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
    let r00 = 1 - 2 * (yy + zz), r10 = 2 * (xy + wz), r20 = 2 * (xz - wy);
    let r01 = 2 * (xy - wz), r11 = 1 - 2 * (xx + zz), r21 = 2 * (yz + wx);
    let r02 = 2 * (xz + wy), r12 = 2 * (yz - wx), r22 = 1 - 2 * (xx + yy);
    const ox = (r10 * a20 - r20 * a10) + (r11 * a21 - r21 * a11) + (r12 * a22 - r22 * a12);
    const oy = (r20 * a00 - r00 * a20) + (r21 * a01 - r01 * a21) + (r22 * a02 - r02 * a22);
    const oz = (r00 * a10 - r10 * a00) + (r01 * a11 - r11 * a01) + (r02 * a12 - r12 * a02);
    const id = 1.5 / (Math.abs(r00 * a00 + r10 * a10 + r20 * a20 + r01 * a01 + r11 * a11 + r21 * a21 + r02 * a02 + r12 * a12 + r22 * a22) + 1e-9);
    const wvx = ox * id, wvy = oy * id, wvz = oz * id, w2 = wvx * wvx + wvy * wvy + wvz * wvz;
    if (w2 > 1e-18) {
      let s = 0.5, c = 1;
      if (w2 > 0.09) { const w = Math.sqrt(w2), wc = Math.min(w, 1); s = Math.sin(wc * 0.5) / w; c = Math.cos(wc * 0.5); }
      const px = wvx * s, py = wvy * s, pz = wvz * s;
      const nx = c * qx + px * qw + py * qz - pz * qy;
      const ny = c * qy - px * qz + py * qw + pz * qx;
      const nz = c * qz + px * qy - py * qx + pz * qw;
      const nw = c * qw - px * qx - py * qy - pz * qz;
      const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
      qx = nx * l; qy = ny * l; qz = nz * l; qw = nw * l;
      TQ[t4] = qx; TQ[t4 + 1] = qy; TQ[t4 + 2] = qz; TQ[t4 + 3] = qw;
      xx = qx * qx; yy = qy * qy; zz = qz * qz; xy = qx * qy; xz = qx * qz; yz = qy * qz; wx = qw * qx; wy = qw * qy; wz = qw * qz;
      r00 = 1 - 2 * (yy + zz); r10 = 2 * (xy + wz); r20 = 2 * (xz - wy);
      r01 = 2 * (xy - wz); r11 = 1 - 2 * (xx + zz); r21 = 2 * (yz + wx);
      r02 = 2 * (xz + wy); r12 = 2 * (yz - wx); r22 = 1 - 2 * (xx + yy);
    }
    let rx = TR[t12], ry = TR[t12 + 1], rz = TR[t12 + 2];
    X[i0] = x0 + k * (cx + r00 * rx + r01 * ry + r02 * rz - x0);
    X[i0 + 1] = y0 + k * (cy + r10 * rx + r11 * ry + r12 * rz - y0);
    X[i0 + 2] = z0 + k * (cz + r20 * rx + r21 * ry + r22 * rz - z0);
    rx = TR[t12 + 3]; ry = TR[t12 + 4]; rz = TR[t12 + 5];
    X[i1] = x1 + k * (cx + r00 * rx + r01 * ry + r02 * rz - x1);
    X[i1 + 1] = y1 + k * (cy + r10 * rx + r11 * ry + r12 * rz - y1);
    X[i1 + 2] = z1 + k * (cz + r20 * rx + r21 * ry + r22 * rz - z1);
    rx = TR[t12 + 6]; ry = TR[t12 + 7]; rz = TR[t12 + 8];
    X[i2] = x2 + k * (cx + r00 * rx + r01 * ry + r02 * rz - x2);
    X[i2 + 1] = y2 + k * (cy + r10 * rx + r11 * ry + r12 * rz - y2);
    X[i2 + 2] = z2 + k * (cz + r20 * rx + r21 * ry + r22 * rz - z2);
    rx = TR[t12 + 9]; ry = TR[t12 + 10]; rz = TR[t12 + 11];
    X[i3] = x3 + k * (cx + r00 * rx + r01 * ry + r02 * rz - x3);
    X[i3 + 1] = y3 + k * (cy + r10 * rx + r11 * ry + r12 * rz - y3);
    X[i3 + 2] = z3 + k * (cz + r20 * rx + r21 * ry + r22 * rz - z3);
  }
}

function solveVolume(alpha) {
  for (let t = 0; t < NT; t++) {
    const a = TETS[t * 4], b = TETS[t * 4 + 1], c = TETS[t * 4 + 2], d = TETS[t * 4 + 3];
    const a3 = a * 3, b3 = b * 3, c3 = c * 3, d3 = d * 3;
    const ux = X[b3] - X[a3], uy = X[b3 + 1] - X[a3 + 1], uz = X[b3 + 2] - X[a3 + 2];
    const vx = X[c3] - X[a3], vy = X[c3 + 1] - X[a3 + 1], vz = X[c3 + 2] - X[a3 + 2];
    const wx = X[d3] - X[a3], wy = X[d3 + 1] - X[a3 + 1], wz = X[d3 + 2] - X[a3 + 2];
    const g1x = (vy * wz - vz * wy) / 6, g1y = (vz * wx - vx * wz) / 6, g1z = (vx * wy - vy * wx) / 6;
    const g2x = (wy * uz - wz * uy) / 6, g2y = (wz * ux - wx * uz) / 6, g2z = (wx * uy - wy * ux) / 6;
    const g3x = (uy * vz - uz * vy) / 6, g3y = (uz * vx - ux * vz) / 6, g3z = (ux * vy - uy * vx) / 6;
    const g0x = -g1x - g2x - g3x, g0y = -g1y - g2y - g3y, g0z = -g1z - g2z - g3z;
    const vol = ux * g1x + uy * g1y + uz * g1z;
    const wa = IW[a], wb = IW[b], wc = IW[c], wd = IW[d];
    const den = wa * (g0x * g0x + g0y * g0y + g0z * g0z) + wb * (g1x * g1x + g1y * g1y + g1z * g1z) +
      wc * (g2x * g2x + g2y * g2y + g2z * g2z) + wd * (g3x * g3x + g3y * g3y + g3z * g3z) + alpha;
    if (den < 1e-14) continue;
    const l = -(vol - TV0[t]) / den;
    X[a3] += l * wa * g0x; X[a3 + 1] += l * wa * g0y; X[a3 + 2] += l * wa * g0z;
    X[b3] += l * wb * g1x; X[b3 + 1] += l * wb * g1y; X[b3 + 2] += l * wb * g1z;
    X[c3] += l * wc * g2x; X[c3 + 1] += l * wc * g2y; X[c3 + 2] += l * wc * g2z;
    X[d3] += l * wd * g3x; X[d3 + 1] += l * wd * g3y; X[d3 + 2] += l * wd * g3z;
  }
}

function solveStrain() {
  const lo = SIM.strainLo, hi = SIM.strainHi;
  for (let e = 0; e < NE; e++) {
    const a = EDGES[e * 2], b = EDGES[e * 2 + 1], a3 = a * 3, b3 = b * 3;
    const dx = X[b3] - X[a3], dy = X[b3 + 1] - X[a3 + 1], dz = X[b3 + 2] - X[a3 + 2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz), L0 = EL0[e];
    let target;
    if (L > hi * L0) target = hi * L0; else if (L < lo * L0) target = lo * L0; else continue;
    if (L < 1e-9) continue;
    const wa = IW[a], wb = IW[b], c = (L - target) / (L * (wa + wb));
    X[a3] += wa * c * dx; X[a3 + 1] += wa * c * dy; X[a3 + 2] += wa * c * dz;
    X[b3] -= wb * c * dx; X[b3 + 1] -= wb * c * dy; X[b3 + 2] -= wb * c * dz;
  }
}

function solveFloor() {
  const muS = SIM.muS, muK = SIM.muK;
  for (let i = 0; i < NP; i++) {
    const p = i * 3;
    if (X[p + 1] >= 0) continue;
    const d = -X[p + 1];
    X[p + 1] = 0;
    const dx = X[p] - XP[p], dz = X[p + 2] - XP[p + 2], t = Math.sqrt(dx * dx + dz * dz);
    if (t < muS * d) { X[p] = XP[p]; X[p + 2] = XP[p + 2]; }
    else { const k = Math.min(1, muK * d / t); X[p] -= dx * k; X[p + 2] -= dz * k; }
  }
}

function dampEdges(kd) {
  for (let e = 0; e < NE; e++) {
    const a = EDGES[e * 2], b = EDGES[e * 2 + 1], a3 = a * 3, b3 = b * 3;
    let nx = X[b3] - X[a3], ny = X[b3 + 1] - X[a3 + 1], nz = X[b3 + 2] - X[a3 + 2];
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    const dv = (V[b3] - V[a3]) * nx + (V[b3 + 1] - V[a3 + 1]) * ny + (V[b3 + 2] - V[a3 + 2]) * nz;
    const wa = IW[a], wb = IW[b], s = kd * dv / (wa + wb);
    V[a3] += nx * s * wa; V[a3 + 1] += ny * s * wa; V[a3 + 2] += nz * s * wa;
    V[b3] -= nx * s * wb; V[b3 + 1] -= ny * s * wb; V[b3 + 2] -= nz * s * wb;
  }
}

// Render positions blended between the last two fixed steps.
function simInterpolate(alpha) {
  for (let i = 0; i < NP * 3; i++) XR[i] = XS[i] + (X[i] - XS[i]) * alpha;
}

// Whole-body centroid (BODY[0..2]), face normal (BODY[3..5]) and rotation BR, by shape matching over all particles.
function simBody() {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < NP; i++) { const m = MS[i]; cx += m * XR[i * 3]; cy += m * XR[i * 3 + 1]; cz += m * XR[i * 3 + 2]; }
  cx /= totalMass; cy /= totalMass; cz /= totalMass;
  A9.fill(0);
  for (let i = 0; i < NP; i++) {
    const m = MS[i], px = XR[i * 3] - cx, py = XR[i * 3 + 1] - cy, pz = XR[i * 3 + 2] - cz;
    const rx = (REST[i * 3] - restC[0]) * m, ry = (REST[i * 3 + 1] - restC[1]) * m, rz = (REST[i * 3 + 2] - restC[2]) * m;
    A9[0] += px * rx; A9[1] += py * rx; A9[2] += pz * rx;
    A9[3] += px * ry; A9[4] += py * ry; A9[5] += pz * ry;
    A9[6] += px * rz; A9[7] += py * rz; A9[8] += pz * rz;
  }
  extractRotation(A9, BQ, 0, 6);
  quatToMat(BQ, 0, BR);
  BODY[0] = cx; BODY[1] = cy; BODY[2] = cz; BODY[3] = BR[3]; BODY[4] = BR[4]; BODY[5] = BR[5];
}

function simVolume() {
  let v = 0;
  for (let t = 0; t < NT; t++) v += tetVolume(X, TETS, t);
  return v / restVolume;
}

// Kinetic energy in joules with 1 unit = 3 cm.
function simKinetic() {
  let e = 0;
  for (let i = 0; i < NP; i++) {
    const p = i * 3;
    e += MS[i] * (V[p] * V[p] + V[p + 1] * V[p + 1] + V[p + 2] * V[p + 2]);
  }
  return 0.5 * e * GRAMS_PER_UNIT3 / 1000 * 0.03 * 0.03;
}
