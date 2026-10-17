// Smooth render surface (rounded, scalloped ring) and juice cells / bubbles, all embedded in the tet mesh.
const SURF_STRIDE = 12; // pos.xyz,1 | normal.xyz,0 | tet quat xyzw

function buildSurface(mesh, locate) {
  const NT = SHAPE.scallops * 12;
  const H = SHAPE.thick / 2, b = SHAPE.bevel, ri = SHAPE.hole;
  // Profile of the rounded cross-section, closed loop: [kind, segments].
  const prof = (ro) => {
    const out = [];
    const line = (r0, y0, r1, y1, n) => { for (let k = 0; k < n; k++) out.push(r0 + (r1 - r0) * k / n, y0 + (y1 - y0) * k / n); };
    const arc = (cr, cy, a0, a1, n) => { for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * k / n; out.push(cr + b * Math.cos(a), cy + b * Math.sin(a)); } };
    const P = Math.PI / 2;
    line(ri + b, H, ro - b, H, 16);
    arc(ro - b, H - b, P, 0, 6);
    line(ro, H - b, ro, -H + b, 2);
    arc(ro - b, -H + b, 0, -P, 6);
    line(ro - b, -H, ri + b, -H, 16);
    arc(ri + b, -H + b, -P, -2 * P, 6);
    line(ri, -H + b, ri, H - b, 2);
    arc(ri + b, H - b, 2 * P, P, 6);
    return out;
  };
  const NP = prof(1).length / 2;
  const nRV = NT * NP;
  const restPos = new Float32Array(nRV * 4);
  for (let i = 0; i < NT; i++) {
    const th = (i / NT) * Math.PI * 2, p = prof(outerRadius(th));
    for (let j = 0; j < NP; j++) {
      const v = i * NP + j;
      restPos[4 * v] = p[2 * j] * Math.cos(th); restPos[4 * v + 1] = p[2 * j + 1]; restPos[4 * v + 2] = p[2 * j] * Math.sin(th);
    }
  }
  let idx = new Uint32Array(NT * NP * 6);
  let k = 0;
  for (let i = 0; i < NT; i++) {
    for (let j = 0; j < NP; j++) {
      const a = i * NP + j, b2 = ((i + 1) % NT) * NP + j, c = ((i + 1) % NT) * NP + (j + 1) % NP, d = i * NP + (j + 1) % NP;
      idx[k++] = a; idx[k++] = b2; idx[k++] = c; idx[k++] = a; idx[k++] = c; idx[k++] = d;
    }
  }
  // Outward winding: closed-mesh signed volume must be positive.
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const A = 4 * idx[t], Bq = 4 * idx[t + 1], C = 4 * idx[t + 2], r = restPos;
    vol += r[A] * (r[Bq + 1] * r[C + 2] - r[Bq + 2] * r[C + 1]) - r[A + 1] * (r[Bq] * r[C + 2] - r[Bq + 2] * r[C]) + r[A + 2] * (r[Bq] * r[C + 1] - r[Bq + 1] * r[C]);
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }

  const tetOf = new Int32Array(nRV), bary = new Float32Array(nRV * 4);
  for (let v = 0; v < nRV; v++) {
    const L = locate(restPos[4 * v], restPos[4 * v + 1], restPos[4 * v + 2]);
    tetOf[v] = L[0]; bary.set(L.slice(1), 4 * v);
  }

  return { nRV, NT, NP, restPos, idx, tetOf, bary, dyn: new Float32Array(nRV * SURF_STRIDE), nrm: new Float32Array(nRV * 3) };
}

function updateSurface(S, B) {
  const { nRV, tetOf, bary, dyn, idx, nrm } = S;
  const x = B.x, tets = B.mesh.tets, q = B.q;
  for (let v = 0; v < nRV; v++) {
    const t = tetOf[v], o = SURF_STRIDE * v;
    const a = 3 * tets[4 * t], b = 3 * tets[4 * t + 1], c = 3 * tets[4 * t + 2], d = 3 * tets[4 * t + 3];
    const w0 = bary[4 * v], w1 = bary[4 * v + 1], w2 = bary[4 * v + 2], w3 = bary[4 * v + 3];
    dyn[o] = w0 * x[a] + w1 * x[b] + w2 * x[c] + w3 * x[d];
    dyn[o + 1] = w0 * x[a + 1] + w1 * x[b + 1] + w2 * x[c + 1] + w3 * x[d + 1];
    dyn[o + 2] = w0 * x[a + 2] + w1 * x[b + 2] + w2 * x[c + 2] + w3 * x[d + 2];
    dyn[o + 3] = 1;
    dyn[o + 8] = q[4 * t]; dyn[o + 9] = q[4 * t + 1]; dyn[o + 10] = q[4 * t + 2]; dyn[o + 11] = q[4 * t + 3];
  }
  nrm.fill(0);
  for (let t = 0; t < idx.length; t += 3) {
    const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2];
    const A = SURF_STRIDE * ia, Bq = SURF_STRIDE * ib, C = SURF_STRIDE * ic;
    const ux = dyn[Bq] - dyn[A], uy = dyn[Bq + 1] - dyn[A + 1], uz = dyn[Bq + 2] - dyn[A + 2];
    const vx = dyn[C] - dyn[A], vy = dyn[C + 1] - dyn[A + 1], vz = dyn[C + 2] - dyn[A + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    nrm[3 * ia] += nx; nrm[3 * ia + 1] += ny; nrm[3 * ia + 2] += nz;
    nrm[3 * ib] += nx; nrm[3 * ib + 1] += ny; nrm[3 * ib + 2] += nz;
    nrm[3 * ic] += nx; nrm[3 * ic + 1] += ny; nrm[3 * ic + 2] += nz;
  }
  for (let v = 0; v < nRV; v++) {
    const nx = nrm[3 * v], ny = nrm[3 * v + 1], nz = nrm[3 * v + 2], l = 1 / (Math.hypot(nx, ny, nz) || 1);
    const o = SURF_STRIDE * v;
    dyn[o + 4] = nx * l; dyn[o + 5] = ny * l; dyn[o + 6] = nz * l; dyn[o + 7] = 0;
  }
}

// Juice cells (type 0: elongated sacs along the radius) and air bubbles (type 1).
const CELL_STRIDE = 8; // center.xyz, type | axis.xyz (half length), radius
function buildInclusions(locate, rnd) {
  const list = [];
  for (let i = 0; i < 70; i++) {
    const th = rnd() * Math.PI * 2, R = outerRadius(th);
    const r = 0.64 + rnd() * (R - 0.8), half = 0.06 + rnd() * 0.07, rad = 0.016 + rnd() * 0.014;
    const y = (rnd() * 2 - 1) * (0.2 - rad - 0.03);
    const tilt = (rnd() - 0.5) * 0.4;
    list.push([r * Math.cos(th), y, r * Math.sin(th), 0, Math.cos(th + tilt) * half, (rnd() - 0.5) * 0.02, Math.sin(th + tilt) * half, rad]);
  }
  for (let i = 0; i < 12; i++) {
    const th = rnd() * Math.PI * 2, R = outerRadius(th);
    const r = 0.6 + rnd() * (R - 0.75), rad = 0.012 + rnd() * 0.02;
    const y = (rnd() * 2 - 1) * (0.18 - rad);
    list.push([r * Math.cos(th), y, r * Math.sin(th), 1, rad, 0, 0, rad]);
  }
  const n = list.length;
  const rest = new Float32Array(n * CELL_STRIDE), tetOf = new Int32Array(n), bary = new Float32Array(n * 4);
  list.forEach((c, i) => {
    rest.set(c, i * CELL_STRIDE);
    const L = locate(c[0], c[1], c[2]);
    tetOf[i] = L[0]; bary.set(L.slice(1), 4 * i);
  });
  return { n, rest, tetOf, bary, data: new Float32Array(n * CELL_STRIDE) };
}

function updateInclusions(I, B) {
  const { n, rest, tetOf, bary, data } = I;
  const x = B.x, tets = B.mesh.tets, Di = B.DmInv;
  for (let i = 0; i < n; i++) {
    const t = tetOf[i], o = CELL_STRIDE * i;
    const a = 3 * tets[4 * t], b = 3 * tets[4 * t + 1], c = 3 * tets[4 * t + 2], d = 3 * tets[4 * t + 3];
    const w0 = bary[4 * i], w1 = bary[4 * i + 1], w2 = bary[4 * i + 2], w3 = bary[4 * i + 3];
    for (let k = 0; k < 3; k++) data[o + k] = w0 * x[a + k] + w1 * x[b + k] + w2 * x[c + k] + w3 * x[d + k];
    data[o + 3] = rest[o + 3];
    // Axis follows the local deformation gradient F = Ds * DmInv.
    const rx = rest[o + 4], ry = rest[o + 5], rz = rest[o + 6], m = 9 * t;
    const px = Di[m] * rx + Di[m + 1] * ry + Di[m + 2] * rz;
    const py = Di[m + 3] * rx + Di[m + 4] * ry + Di[m + 5] * rz;
    const pz = Di[m + 6] * rx + Di[m + 7] * ry + Di[m + 8] * rz;
    for (let k = 0; k < 3; k++) data[o + 4 + k] = (x[b + k] - x[a + k]) * px + (x[c + k] - x[a + k]) * py + (x[d + k] - x[a + k]) * pz;
    data[o + 7] = rest[o + 7];
  }
}
