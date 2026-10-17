// Smooth render surface (rounded, scalloped ring) skinned onto the tets.
function createSurface(sim) {
  const NTH = SCALLOPS * 12, NF = 8, NC = 6, NW = 2, NP = 2 * (NF + NW) + 4 * NC;
  const nv = NTH * NP;
  const rest = new Float32Array(nv * 3);
  const prof = new Float64Array(NP * 2);
  function profile(ro) {   // closed rounded-rect loop in (r, y)
    const ri = R_IN, b = BEVEL, T = THICK; let k = 0;
    const put = (r, y) => { prof[k++] = r; prof[k++] = y; };
    const arc = (cr, cy, a0) => { for (let i = 0; i < NC; i++) { const a = a0 + (Math.PI / 2) * i / NC; put(cr + b * Math.cos(a), cy + b * Math.sin(a)); } };
    for (let i = 0; i < NF; i++) put(ri + b + (ro - ri - 2 * b) * i / NF, 0);
    arc(ro - b, b, -Math.PI / 2);
    for (let i = 0; i < NW; i++) put(ro, b + (T - 2 * b) * i / NW);
    arc(ro - b, T - b, 0);
    for (let i = 0; i < NF; i++) put(ro - b - (ro - ri - 2 * b) * i / NF, T);
    arc(ri + b, T - b, Math.PI / 2);
    for (let i = 0; i < NW; i++) put(ri, T - b - (T - 2 * b) * i / NW);
    arc(ri + b, b, Math.PI);
  }
  for (let i = 0; i < NTH; i++) {
    const th = TAU * i / NTH, c = Math.cos(th), s = Math.sin(th);
    profile(outerR(th));
    for (let j = 0; j < NP; j++) { const k = (i * NP + j) * 3, r = prof[j * 2]; rest[k] = r * c; rest[k + 1] = prof[j * 2 + 1]; rest[k + 2] = r * s; }
  }
  const ntri = NTH * NP * 2, idx = new Uint32Array(ntri * 3);
  let q = 0;
  for (let i = 0; i < NTH; i++) for (let j = 0; j < NP; j++) {
    const i1 = (i + 1) % NTH, j1 = (j + 1) % NP;
    const a = i * NP + j, b = i1 * NP + j, c = i1 * NP + j1, d = i * NP + j1;
    idx[q++] = a; idx[q++] = b; idx[q++] = c; idx[q++] = a; idx[q++] = c; idx[q++] = d;
  }
  const signedVolume = (P, stride) => {
    let vol = 0;
    for (let t = 0; t < ntri * 3; t += 3) {
      const a = idx[t] * stride, b = idx[t + 1] * stride, c = idx[t + 2] * stride;
      vol += P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1]) + P[a + 1] * (P[b + 2] * P[c] - P[b] * P[c + 2]) + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c]);
    }
    return vol / 6;
  };
  if (signedVolume(rest, 3) < 0) for (let t = 0; t < ntri * 3; t += 3) { const s = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = s; }
  const restVolume = signedVolume(rest, 3);

  // embedding
  const etet = new Uint32Array(nv), ew = new Float32Array(nv * 4), tmp = [0, 0, 0, 0];
  for (let i = 0; i < nv; i++) { etet[i] = sim.embed(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2], tmp); ew.set(tmp, i * 4); }

  const vb = new Float32Array(nv * 6);      // interleaved position, normal
  const nrm = new Float32Array(nv * 3);
  const tets = sim.tets;
  function update(rp) {
    for (let i = 0; i < nv; i++) {
      const t4 = etet[i] * 4, w4 = i * 4;
      const a = tets[t4] * 3, b = tets[t4 + 1] * 3, c = tets[t4 + 2] * 3, d = tets[t4 + 3] * 3;
      const w0 = ew[w4], w1 = ew[w4 + 1], w2 = ew[w4 + 2], w3 = ew[w4 + 3], o = i * 6;
      vb[o] = rp[a] * w0 + rp[b] * w1 + rp[c] * w2 + rp[d] * w3;
      vb[o + 1] = rp[a + 1] * w0 + rp[b + 1] * w1 + rp[c + 1] * w2 + rp[d + 1] * w3;
      vb[o + 2] = rp[a + 2] * w0 + rp[b + 2] * w1 + rp[c + 2] * w2 + rp[d + 2] * w3;
    }
    nrm.fill(0);
    for (let t = 0; t < ntri * 3; t += 3) {
      const ia = idx[t], ib = idx[t + 1], ic = idx[t + 2], a = ia * 6, b = ib * 6, c = ic * 6;
      const ux = vb[b] - vb[a], uy = vb[b + 1] - vb[a + 1], uz = vb[b + 2] - vb[a + 2];
      const vx = vb[c] - vb[a], vy = vb[c + 1] - vb[a + 1], vz = vb[c + 2] - vb[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      nrm[ia * 3] += nx; nrm[ia * 3 + 1] += ny; nrm[ia * 3 + 2] += nz;
      nrm[ib * 3] += nx; nrm[ib * 3 + 1] += ny; nrm[ib * 3 + 2] += nz;
      nrm[ic * 3] += nx; nrm[ic * 3 + 1] += ny; nrm[ic * 3 + 2] += nz;
    }
    for (let i = 0; i < nv; i++) {
      const k = i * 3, nx = nrm[k], ny = nrm[k + 1], nz = nrm[k + 2], il = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-20);
      vb[i * 6 + 3] = nx * il; vb[i * 6 + 4] = ny * il; vb[i * 6 + 5] = nz * il;
    }
  }

  // Möller–Trumbore against the skinned surface; the hole has no triangles, so rays pass through it
  const hit = { t: 0, x: 0, y: 0, z: 0 };
  function raycast(ox, oy, oz, dx, dy, dz) {
    let best = Infinity;
    for (let t = 0; t < ntri * 3; t += 3) {
      const a = idx[t] * 6, b = idx[t + 1] * 6, c = idx[t + 2] * 6;
      const e1x = vb[b] - vb[a], e1y = vb[b + 1] - vb[a + 1], e1z = vb[b + 2] - vb[a + 2];
      const e2x = vb[c] - vb[a], e2y = vb[c + 1] - vb[a + 1], e2z = vb[c + 2] - vb[a + 2];
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const id = 1 / det, sx = ox - vb[a], sy = oy - vb[a + 1], sz = oz - vb[a + 2];
      const u = (sx * px + sy * py + sz * pz) * id; if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const vv = (dx * qx + dy * qy + dz * qz) * id; if (vv < 0 || u + vv > 1) continue;
      const tt = (e2x * qx + e2y * qy + e2z * qz) * id;
      if (tt > 1e-4 && tt < best) best = tt;
    }
    if (best === Infinity) return null;
    hit.t = best; hit.x = ox + dx * best; hit.y = oy + dy * best; hit.z = oz + dz * best;
    return hit;
  }

  return { nv, ntri, rest, idx, vb, update, raycast, restVolume, volume: () => signedVolume(vb, 6) };
}

// Juice cells (elongated sacs along the radius) and air bubbles, carried by their tet's deformation.
function createInclusions(sim) {
  const rnd = mulberry32(12);
  const items = [];
  const inside = (r, th, y, m) => r > R_IN + m && r < outerR(th) - m && y > m && y < THICK - m;
  let tries = 0;
  while (items.length < 46 && tries++ < 4000) {
    const r = 0.66 + rnd() * 0.42, th = rnd() * TAU, y = 0.15 + rnd() * 0.2;
    const a = 0.06 + rnd() * 0.045, b = 0.017 + rnd() * 0.01, c = 0.018 + rnd() * 0.008;
    if (!inside(r - a, th, y, 0.06) || !inside(r + a, th, y, 0.06)) continue;
    if (items.some(o => o.kind === 0 && Math.abs(o.y - y) < 0.07 && Math.hypot((o.r - r) / 2.6, o.r * Math.atan2(Math.sin(o.th - th), Math.cos(o.th - th))) < 0.07)) continue;
    items.push({ kind: 0, r, th, y, a, b, c, tilt: (rnd() - 0.5) * 0.5 });
  }
  for (let k = 0; k < 9; k++) {
    const r = 0.6 + rnd() * 0.55, th = rnd() * TAU, y = 0.12 + rnd() * 0.26, s = 0.016 + rnd() * 0.024;
    items.push({ kind: 1, r, th, y, a: s, b: s, c: s, tilt: 0 });
  }
  const n = items.length, tet = new Uint32Array(n), w = new Float32Array(n * 4), S = new Float32Array(n * 9), kind = new Float32Array(n);
  const tmp = [0, 0, 0, 0];
  items.forEach((o, i) => {
    const cx = o.r * Math.cos(o.th), cz = o.r * Math.sin(o.th);
    tet[i] = sim.embed(cx, o.y, cz, tmp); w.set(tmp, i * 4); kind[i] = o.kind;
    // local axes: radial (long), up, tangential — with a little tilt in the radial/up plane
    const er = [Math.cos(o.th), 0, Math.sin(o.th)], et = [-Math.sin(o.th), 0, Math.cos(o.th)];
    const ct = Math.cos(o.tilt), st = Math.sin(o.tilt);
    const ax = [er[0] * ct, st, er[2] * ct], up = [-er[0] * st, ct, -er[2] * st];
    S.set([ax[0] * o.a, ax[1] * o.a, ax[2] * o.a, up[0] * o.c, up[1] * o.c, up[2] * o.c, et[0] * o.b, et[1] * o.b, et[2] * o.b], i * 9);
  });
  const data = new Float32Array(n * 16);
  const tets = sim.tets, dmInv = sim.dmInv;
  function update(rp) {
    for (let i = 0; i < n; i++) {
      const t = tet[i], t4 = t * 4, a = tets[t4] * 3, b = tets[t4 + 1] * 3, c = tets[t4 + 2] * 3, d = tets[t4 + 3] * 3;
      const D = t * 9, s = i * 9, o = i * 16, w4 = i * 4;
      // F = Ds · Dm⁻¹ ; M = F · S
      for (let r = 0; r < 3; r++) {
        const d1 = rp[b + r] - rp[a + r], d2 = rp[c + r] - rp[a + r], d3 = rp[d + r] - rp[a + r];
        const f0 = d1 * dmInv[D] + d2 * dmInv[D + 3] + d3 * dmInv[D + 6];
        const f1 = d1 * dmInv[D + 1] + d2 * dmInv[D + 4] + d3 * dmInv[D + 7];
        const f2 = d1 * dmInv[D + 2] + d2 * dmInv[D + 5] + d3 * dmInv[D + 8];
        for (let col = 0; col < 3; col++) data[o + col * 4 + r] = f0 * S[s + col * 3] + f1 * S[s + col * 3 + 1] + f2 * S[s + col * 3 + 2];
        data[o + 12 + r] = rp[a + r] * w[w4] + rp[b + r] * w[w4 + 1] + rp[c + r] * w[w4 + 2] + rp[d + r] * w[w4 + 3];
      }
      data[o + 3] = data[o + 7] = data[o + 11] = 0;
      data[o + 15] = kind[i];
    }
  }
  return { n, data, update };
}
// ===== SIM-END =====
