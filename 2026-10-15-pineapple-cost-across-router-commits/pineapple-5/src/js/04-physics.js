// XPBD tetrahedral soft body: co-rotational shape matching, volume, strain limits, edge damping, floor friction, grab.
const GRAVITY = 12;
const SUBSTEPS = 10;
const STEP = 1 / 60;
const MAX_PATCH = 160;

function createBody(mesh) {
  const { nv, nt, tets, edges, rest } = mesh;
  const ne = edges.length / 2;
  const B = {
    mesh, nv, nt, ne,
    x: new Float64Array(nv * 3), xp: new Float64Array(nv * 3), v: new Float64Array(nv * 3),
    m: new Float64Array(nv), w: new Float64Array(nv),
    restVol: new Float64Array(nt), DmInv: new Float64Array(nt * 9), q: new Float64Array(nt * 4),
    restOff: new Float64Array(nt * 12),
    edgeLen: new Float64Array(ne),
    restVolume: 0,
    // Tunables from the panel.
    firmness: 0.55, damping: 0.35,
    // Grab patch.
    grab: {
      active: false, n: 0, idx: new Int32Array(MAX_PATCH), wt: new Float64Array(MAX_PATCH),
      off: new Float64Array(MAX_PATCH * 3), target: new Float64Array(3), axis: new Float64Array(3), twist: 0,
    },
  };

  for (let t = 0; t < nt; t++) {
    const a = tets[4 * t], b = tets[4 * t + 1], c = tets[4 * t + 2], d = tets[4 * t + 3];
    const V = tetVolume(rest, a, b, c, d);
    B.restVol[t] = V; B.restVolume += V;
    for (const i of [a, b, c, d]) B.m[i] += V / 4;
    // Dm = [b-a, c-a, d-a] (columns), store its inverse row-major.
    const m = new Float64Array(9);
    for (let k = 0; k < 3; k++) {
      const j = [b, c, d][k];
      m[k] = rest[3 * j] - rest[3 * a]; m[3 + k] = rest[3 * j + 1] - rest[3 * a + 1]; m[6 + k] = rest[3 * j + 2] - rest[3 * a + 2];
    }
    invert3(m, B.DmInv, 9 * t);
    // Rest offsets from the tet centroid (equal weights inside a tet).
    const cx = (rest[3 * a] + rest[3 * b] + rest[3 * c] + rest[3 * d]) / 4;
    const cy = (rest[3 * a + 1] + rest[3 * b + 1] + rest[3 * c + 1] + rest[3 * d + 1]) / 4;
    const cz = (rest[3 * a + 2] + rest[3 * b + 2] + rest[3 * c + 2] + rest[3 * d + 2]) / 4;
    [a, b, c, d].forEach((j, k) => {
      B.restOff[12 * t + 3 * k] = rest[3 * j] - cx;
      B.restOff[12 * t + 3 * k + 1] = rest[3 * j + 1] - cy;
      B.restOff[12 * t + 3 * k + 2] = rest[3 * j + 2] - cz;
    });
  }
  for (let i = 0; i < nv; i++) B.w[i] = 1 / B.m[i];
  for (let e = 0; e < ne; e++) {
    const a = edges[2 * e], b = edges[2 * e + 1];
    B.edgeLen[e] = Math.hypot(rest[3 * a] - rest[3 * b], rest[3 * a + 1] - rest[3 * b + 1], rest[3 * a + 2] - rest[3 * b + 2]);
  }
  resetBody(B);
  return B;
}

function invert3(m, out, o) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, Bc = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * Bc + c * C;
  out[o] = A / det; out[o + 1] = -(b * i - c * h) / det; out[o + 2] = (b * f - c * e) / det;
  out[o + 3] = Bc / det; out[o + 4] = (a * i - c * g) / det; out[o + 5] = -(a * f - c * d) / det;
  out[o + 6] = C / det; out[o + 7] = -(a * h - b * g) / det; out[o + 8] = (a * e - b * d) / det;
}

function resetBody(B) {
  const { rest } = B.mesh;
  for (let i = 0; i < B.nv; i++) {
    B.x[3 * i] = rest[3 * i]; B.x[3 * i + 1] = rest[3 * i + 1] + DROP_HEIGHT; B.x[3 * i + 2] = rest[3 * i + 2];
  }
  B.xp.set(B.x); B.v.fill(0);
  for (let t = 0; t < B.nt; t++) { B.q[4 * t] = 0; B.q[4 * t + 1] = 0; B.q[4 * t + 2] = 0; B.q[4 * t + 3] = 1; }
  B.grab.active = false;
}

function stepBody(B) {
  const dt = STEP / SUBSTEPS;
  const kShape = 0.003 * Math.pow(50, B.firmness);
  const kDamp = 1 - Math.exp(-dt * 90 * B.damping);
  const settle = Math.exp(-dt * 0.25);
  const { x, xp, v, nv } = B;
  for (let s = 0; s < SUBSTEPS; s++) {
    for (let i = 0; i < nv * 3; i += 3) {
      v[i + 1] -= GRAVITY * dt;
      xp[i] = x[i]; xp[i + 1] = x[i + 1]; xp[i + 2] = x[i + 2];
      x[i] += v[i] * dt; x[i + 1] += v[i + 1] * dt; x[i + 2] += v[i + 2] * dt;
    }
    if (B.grab.active) solveGrab(B);
    solveTets(B, kShape, dt);
    solveStrain(B);
    solveFloor(B);
    const inv = 1 / dt;
    for (let i = 0; i < nv * 3; i++) v[i] = (x[i] - xp[i]) * inv * settle;
    dampEdges(B, kDamp);
  }
}

function solveGrab(B) {
  const g = B.grab, x = B.x, k = 0.35;
  const ax = g.axis[0], ay = g.axis[1], az = g.axis[2];
  const c = Math.cos(g.twist), s = Math.sin(g.twist);
  for (let p = 0; p < g.n; p++) {
    const i = g.idx[p];
    const ox = g.off[3 * p], oy = g.off[3 * p + 1], oz = g.off[3 * p + 2];
    // Rodrigues rotation of the offset about the view axis.
    const d = ax * ox + ay * oy + az * oz;
    const cx = ay * oz - az * oy, cy = az * ox - ax * oz, cz = ax * oy - ay * ox;
    const gx = g.target[0] + ox * c + cx * s + ax * d * (1 - c);
    const gy = Math.max(0.012, g.target[1] + oy * c + cy * s + ay * d * (1 - c));
    const gz = g.target[2] + oz * c + cz * s + az * d * (1 - c);
    const f = k * g.wt[p];
    x[3 * i] += (gx - x[3 * i]) * f; x[3 * i + 1] += (gy - x[3 * i + 1]) * f; x[3 * i + 2] += (gz - x[3 * i + 2]) * f;
  }
}

function solveTets(B, kShape, dt) {
  const { x, w, q, DmInv, restOff, restVol } = B;
  const tets = B.mesh.tets;
  for (let t = 0; t < B.nt; t++) {
    const i0 = 3 * tets[4 * t], i1 = 3 * tets[4 * t + 1], i2 = 3 * tets[4 * t + 2], i3 = 3 * tets[4 * t + 3];
    const x0 = x[i0], y0 = x[i0 + 1], z0 = x[i0 + 2];
    const e1x = x[i1] - x0, e1y = x[i1 + 1] - y0, e1z = x[i1 + 2] - z0;
    const e2x = x[i2] - x0, e2y = x[i2 + 1] - y0, e2z = x[i2 + 2] - z0;
    const e3x = x[i3] - x0, e3y = x[i3 + 1] - y0, e3z = x[i3 + 2] - z0;
    // F = Ds * DmInv (row-major DmInv).
    const o = 9 * t;
    const d0 = DmInv[o], d1 = DmInv[o + 1], d2 = DmInv[o + 2], d3 = DmInv[o + 3], d4 = DmInv[o + 4], d5 = DmInv[o + 5], d6 = DmInv[o + 6], d7 = DmInv[o + 7], d8 = DmInv[o + 8];
    const f00 = e1x * d0 + e2x * d3 + e3x * d6, f01 = e1x * d1 + e2x * d4 + e3x * d7, f02 = e1x * d2 + e2x * d5 + e3x * d8;
    const f10 = e1y * d0 + e2y * d3 + e3y * d6, f11 = e1y * d1 + e2y * d4 + e3y * d7, f12 = e1y * d2 + e2y * d5 + e3y * d8;
    const f20 = e1z * d0 + e2z * d3 + e3z * d6, f21 = e1z * d1 + e2z * d4 + e3z * d7, f22 = e1z * d2 + e2z * d5 + e3z * d8;

    // Warm-started rotation extraction (Müller et al. 2016); always a proper rotation, so inversions recover.
    let qx = q[4 * t], qy = q[4 * t + 1], qz = q[4 * t + 2], qw = q[4 * t + 3];
    let r00 = 1, r01 = 0, r02 = 0, r10 = 0, r11 = 1, r12 = 0, r20 = 0, r21 = 0, r22 = 1;
    for (let it = 0; it < 2; it++) {
      r00 = 1 - 2 * (qy * qy + qz * qz); r01 = 2 * (qx * qy - qw * qz); r02 = 2 * (qx * qz + qw * qy);
      r10 = 2 * (qx * qy + qw * qz); r11 = 1 - 2 * (qx * qx + qz * qz); r12 = 2 * (qy * qz - qw * qx);
      r20 = 2 * (qx * qz - qw * qy); r21 = 2 * (qy * qz + qw * qx); r22 = 1 - 2 * (qx * qx + qy * qy);
      // omega = sum_c (R_c x F_c) / |sum_c R_c . F_c|
      let wx = (r10 * f20 - r20 * f10) + (r11 * f21 - r21 * f11) + (r12 * f22 - r22 * f12);
      let wy = (r20 * f00 - r00 * f20) + (r21 * f01 - r01 * f21) + (r22 * f02 - r02 * f22);
      let wz = (r00 * f10 - r10 * f00) + (r01 * f11 - r11 * f01) + (r02 * f12 - r12 * f02);
      const den = Math.abs(r00 * f00 + r10 * f10 + r20 * f20 + r01 * f01 + r11 * f11 + r21 * f21 + r02 * f02 + r12 * f12 + r22 * f22) + 1e-9;
      wx /= den; wy /= den; wz /= den;
      const ang = Math.hypot(wx, wy, wz);
      if (ang < 1e-9) break;
      const sa = Math.sin(ang * 0.5) / ang, ca = Math.cos(ang * 0.5);
      const ux = wx * sa, uy = wy * sa, uz = wz * sa;
      const nx = ca * qx + ux * qw + uy * qz - uz * qy;
      const ny = ca * qy - ux * qz + uy * qw + uz * qx;
      const nz = ca * qz + ux * qy - uy * qx + uz * qw;
      const nw = ca * qw - ux * qx - uy * qy - uz * qz;
      const l = 1 / Math.hypot(nx, ny, nz, nw);
      qx = nx * l; qy = ny * l; qz = nz * l; qw = nw * l;
    }
    r00 = 1 - 2 * (qy * qy + qz * qz); r01 = 2 * (qx * qy - qw * qz); r02 = 2 * (qx * qz + qw * qy);
    r10 = 2 * (qx * qy + qw * qz); r11 = 1 - 2 * (qx * qx + qz * qz); r12 = 2 * (qy * qz - qw * qx);
    r20 = 2 * (qx * qz - qw * qy); r21 = 2 * (qy * qz + qw * qx); r22 = 1 - 2 * (qx * qx + qy * qy);
    q[4 * t] = qx; q[4 * t + 1] = qy; q[4 * t + 2] = qz; q[4 * t + 3] = qw;

    // Shape matching: pull each vertex toward the rotated rest shape about the (mass-weighted) centroid.
    const w0 = w[i0 / 3], w1 = w[i1 / 3], w2 = w[i2 / 3], w3 = w[i3 / 3];
    const m0 = 1 / w0, m1 = 1 / w1, m2 = 1 / w2, m3 = 1 / w3, mt = m0 + m1 + m2 + m3;
    const cx = (x[i0] * m0 + x[i1] * m1 + x[i2] * m2 + x[i3] * m3) / mt;
    const cy = (x[i0 + 1] * m0 + x[i1 + 1] * m1 + x[i2 + 1] * m2 + x[i3 + 1] * m3) / mt;
    const cz = (x[i0 + 2] * m0 + x[i1 + 2] * m1 + x[i2 + 2] * m2 + x[i3 + 2] * m3) / mt;
    // Rest centroid with the same mass weights.
    const ro = 12 * t;
    const rcx = (restOff[ro] * m0 + restOff[ro + 3] * m1 + restOff[ro + 6] * m2 + restOff[ro + 9] * m3) / mt;
    const rcy = (restOff[ro + 1] * m0 + restOff[ro + 4] * m1 + restOff[ro + 7] * m2 + restOff[ro + 10] * m3) / mt;
    const rcz = (restOff[ro + 2] * m0 + restOff[ro + 5] * m1 + restOff[ro + 8] * m2 + restOff[ro + 11] * m3) / mt;
    const ids = TMP_IDS; ids[0] = i0; ids[1] = i1; ids[2] = i2; ids[3] = i3;
    for (let k = 0; k < 4; k++) {
      const ox = restOff[ro + 3 * k] - rcx, oy = restOff[ro + 3 * k + 1] - rcy, oz = restOff[ro + 3 * k + 2] - rcz;
      const i = ids[k];
      x[i] += (cx + r00 * ox + r01 * oy + r02 * oz - x[i]) * kShape;
      x[i + 1] += (cy + r10 * ox + r11 * oy + r12 * oz - x[i + 1]) * kShape;
      x[i + 2] += (cz + r20 * ox + r21 * oy + r22 * oz - x[i + 2]) * kShape;
    }

    // Volume constraint (XPBD, zero compliance): C = V - V0.
    const a1x = x[i1] - x[i0], a1y = x[i1 + 1] - x[i0 + 1], a1z = x[i1 + 2] - x[i0 + 2];
    const a2x = x[i2] - x[i0], a2y = x[i2 + 1] - x[i0 + 1], a2z = x[i2 + 2] - x[i0 + 2];
    const a3x = x[i3] - x[i0], a3y = x[i3 + 1] - x[i0 + 1], a3z = x[i3 + 2] - x[i0 + 2];
    const g1x = (a2y * a3z - a2z * a3y) / 6, g1y = (a2z * a3x - a2x * a3z) / 6, g1z = (a2x * a3y - a2y * a3x) / 6;
    const g2x = (a3y * a1z - a3z * a1y) / 6, g2y = (a3z * a1x - a3x * a1z) / 6, g2z = (a3x * a1y - a3y * a1x) / 6;
    const g3x = (a1y * a2z - a1z * a2y) / 6, g3y = (a1z * a2x - a1x * a2z) / 6, g3z = (a1x * a2y - a1y * a2x) / 6;
    const g0x = -g1x - g2x - g3x, g0y = -g1y - g2y - g3y, g0z = -g1z - g2z - g3z;
    const C = a1x * g1x + a1y * g1y + a1z * g1z - restVol[t];
    const den = w0 * (g0x * g0x + g0y * g0y + g0z * g0z) + w1 * (g1x * g1x + g1y * g1y + g1z * g1z) +
      w2 * (g2x * g2x + g2y * g2y + g2z * g2z) + w3 * (g3x * g3x + g3y * g3y + g3z * g3z);
    if (den < 1e-14) continue;
    const lam = -C / den;
    x[i0] += lam * w0 * g0x; x[i0 + 1] += lam * w0 * g0y; x[i0 + 2] += lam * w0 * g0z;
    x[i1] += lam * w1 * g1x; x[i1 + 1] += lam * w1 * g1y; x[i1 + 2] += lam * w1 * g1z;
    x[i2] += lam * w2 * g2x; x[i2 + 1] += lam * w2 * g2y; x[i2 + 2] += lam * w2 * g2z;
    x[i3] += lam * w3 * g3x; x[i3 + 1] += lam * w3 * g3y; x[i3 + 2] += lam * w3 * g3z;
  }
}
const TMP_IDS = new Int32Array(4);

// Hard edge strain limits.
function solveStrain(B) {
  const { x, w, edgeLen } = B, edges = B.mesh.edges;
  for (let e = 0; e < B.ne; e++) {
    const a = 3 * edges[2 * e], b = 3 * edges[2 * e + 1];
    const dx = x[b] - x[a], dy = x[b + 1] - x[a + 1], dz = x[b + 2] - x[a + 2];
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz), L = edgeLen[e];
    let target;
    if (l > L * 1.9) target = L * 1.9; else if (l < L * 0.4) target = L * 0.4; else continue;
    if (l < 1e-9) continue;
    const wa = w[a / 3], wb = w[b / 3], s = (l - target) / (l * (wa + wb));
    x[a] += dx * s * wa; x[a + 1] += dy * s * wa; x[a + 2] += dz * s * wa;
    x[b] -= dx * s * wb; x[b + 1] -= dy * s * wb; x[b + 2] -= dz * s * wb;
  }
}

// Floor at y = 0 with Coulomb friction (static/kinetic) on the substep displacement.
function solveFloor(B) {
  const { x, xp } = B, muS = 0.9, muK = 0.65;
  for (let i = 0; i < B.nv * 3; i += 3) {
    const pen = -x[i + 1];
    if (pen <= 0) continue;
    x[i + 1] = 0;
    const tx = x[i] - xp[i], tz = x[i + 2] - xp[i + 2], tl = Math.hypot(tx, tz);
    if (tl < muS * pen) { x[i] = xp[i]; x[i + 2] = xp[i + 2]; } else {
      const f = Math.min(1, (muK * pen) / tl);
      x[i] -= tx * f; x[i + 2] -= tz * f;
    }
  }
}

// Relative-velocity damping along edges (internal damping, leaves rigid motion alone).
function dampEdges(B, k) {
  if (k <= 0) return;
  const { x, v, w } = B, edges = B.mesh.edges;
  for (let e = 0; e < B.ne; e++) {
    const a = 3 * edges[2 * e], b = 3 * edges[2 * e + 1];
    let nx = x[b] - x[a], ny = x[b + 1] - x[a + 1], nz = x[b + 2] - x[a + 2];
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    const vn = (v[b] - v[a]) * nx + (v[b + 1] - v[a + 1]) * ny + (v[b + 2] - v[a + 2]) * nz;
    const wa = w[a / 3], wb = w[b / 3], s = (k * vn) / (wa + wb);
    v[a] += nx * s * wa; v[a + 1] += ny * s * wa; v[a + 2] += nz * s * wa;
    v[b] -= nx * s * wb; v[b + 1] -= ny * s * wb; v[b + 2] -= nz * s * wb;
  }
}

function bodyCentroid(B, out) {
  let cx = 0, cy = 0, cz = 0, mt = 0;
  for (let i = 0; i < B.nv; i++) {
    const m = B.m[i]; mt += m;
    cx += B.x[3 * i] * m; cy += B.x[3 * i + 1] * m; cz += B.x[3 * i + 2] * m;
  }
  out[0] = cx / mt; out[1] = cy / mt; out[2] = cz / mt;
  return out;
}

// Give the whole body a rigid velocity: linear vel + spin omega about its centroid.
const _c = new Float64Array(3);
function setRigidVelocity(B, vx, vy, vz, ox, oy, oz) {
  bodyCentroid(B, _c);
  for (let i = 0; i < B.nv; i++) {
    const rx = B.x[3 * i] - _c[0], ry = B.x[3 * i + 1] - _c[1], rz = B.x[3 * i + 2] - _c[2];
    B.v[3 * i] = vx + oy * rz - oz * ry;
    B.v[3 * i + 1] = vy + oz * rx - ox * rz;
    B.v[3 * i + 2] = vz + ox * ry - oy * rx;
  }
}

// Toss with a spin about a horizontal axis so it flips and lands on its other face.
function turnOver(B, axX, axZ) {
  const l = Math.hypot(axX, axZ) || 1;
  B.grab.active = false;
  const vy = 6.2, air = (2 * vy) / GRAVITY, w = (Math.PI / air) * 1.04;
  setRigidVelocity(B, 0, vy, 0, (axX / l) * w, 0, (axZ / l) * w);
}

function nudge(B, rnd) {
  const phi = rnd() * Math.PI * 2;
  bodyCentroid(B, _c);
  for (let i = 0; i < B.nv; i++) {
    const rx = B.x[3 * i] - _c[0], rz = B.x[3 * i + 2] - _c[2];
    const side = (rx * Math.cos(phi) + rz * Math.sin(phi)) / SHAPE.outer;
    B.v[3 * i + 1] += 1.7 + 1.5 * Math.max(0, side);
    B.v[3 * i] += 0.4 * Math.cos(phi); B.v[3 * i + 2] += 0.4 * Math.sin(phi);
  }
}

function bodyStats(B, out) {
  let vol = 0, ke = 0;
  const t4 = B.mesh.tets;
  for (let t = 0; t < B.nt; t++) vol += tetVolume(B.x, t4[4 * t], t4[4 * t + 1], t4[4 * t + 2], t4[4 * t + 3]);
  for (let i = 0; i < B.nv; i++) {
    const vx = B.v[3 * i], vy = B.v[3 * i + 1], vz = B.v[3 * i + 2];
    ke += 0.5 * B.m[i] * (vx * vx + vy * vy + vz * vz);
  }
  out.volume = vol / B.restVolume; out.ke = ke;
  return out;
}
