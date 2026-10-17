// Physics mesh: Delaunay of the scalloped annulus (outline + hex lattice, hole skipped),
// extruded into prism layers, each prism split into 3 tets with a consistent diagonal rule.
function buildTetMesh() {
  const px = [], pz = [];
  for (let k = 0; k < MESH.outerSamples; k++) {
    const th = (2 * Math.PI * k) / MESH.outerSamples, r = outerRadius(th);
    px.push(r * Math.cos(th)); pz.push(r * Math.sin(th));
  }
  for (let k = 0; k < MESH.innerSamples; k++) {
    const th = (2 * Math.PI * (k + 0.5)) / MESH.innerSamples;
    px.push(RING.hole * Math.cos(th)); pz.push(RING.hole * Math.sin(th));
  }
  const h = MESH.lattice, rowH = (h * Math.sqrt(3)) / 2, span = Math.ceil(RING.R / rowH) + 1;
  for (let j = -span; j <= span; j++) {
    for (let i = -span; i <= span; i++) {
      const x = i * h + (j & 1 ? h / 2 : 0), z = j * rowH;
      if (inAnnulus(x, z, 0.55 * h)) { px.push(x); pz.push(z); }
    }
  }

  // Tiny deterministic jitter breaks the co-circular outline samples for the triangulator only.
  const rnd = mulberry32(7);
  const jx = px.map((v) => v + (rnd() - 0.5) * 2e-6), jz = pz.map((v) => v + (rnd() - 0.5) * 2e-6);
  const all = delaunay(jx, jz);

  const kept = [];
  for (let t = 0; t < all.length; t += 3) {
    const a = all[t], b = all[t + 1], c = all[t + 2];
    const cx = (px[a] + px[b] + px[c]) / 3, cz = (pz[a] + pz[b] + pz[c]) / 3;
    if (inAnnulus(cx, cz, 0)) kept.push(a, b, c);
  }

  // Compact to the points actually used.
  const remap = new Int32Array(px.length).fill(-1);
  let np = 0;
  for (const v of kept) if (remap[v] < 0) remap[v] = np++;
  const qx = new Float64Array(np), qz = new Float64Array(np);
  for (let i = 0; i < px.length; i++) if (remap[i] >= 0) { qx[remap[i]] = px[i]; qz[remap[i]] = pz[i]; }
  const ntri = kept.length / 3;
  const tris = new Int32Array(kept.length);
  for (let i = 0; i < kept.length; i++) tris[i] = remap[kept[i]];

  const levels = MESH.levels, L = levels - 1, y0 = -RING.H / 2, dy = RING.H / L;
  const nv = np * levels;
  const pos = new Float32Array(nv * 3);
  for (let l = 0; l < levels; l++) {
    for (let i = 0; i < np; i++) {
      const v = (l * np + i) * 3;
      pos[v] = qx[i]; pos[v + 1] = y0 + l * dy; pos[v + 2] = qz[i];
    }
  }

  // Tet index of prism (triangle t, layer l), part k: (t * L + l) * 3 + k.
  const nt = ntri * L * 3;
  const tets = new Int32Array(nt * 4);
  let t4 = 0;
  const s = [0, 0, 0];
  for (let t = 0; t < ntri; t++) {
    s[0] = tris[t * 3]; s[1] = tris[t * 3 + 1]; s[2] = tris[t * 3 + 2];
    s.sort((a, b) => a - b);
    for (let l = 0; l < L; l++) {
      const b0 = s[0] + l * np, b1 = s[1] + l * np, b2 = s[2] + l * np;
      const u0 = b0 + np, u1 = b1 + np, u2 = b2 + np;
      const list = [b0, b1, b2, u0, b1, b2, u0, u1, b2, u0, u1, u2];
      for (let k = 0; k < 3; k++) {
        let a = list[k * 4], b = list[k * 4 + 1], c = list[k * 4 + 2], d = list[k * 4 + 3];
        if (tetSignedVolume(pos, a, b, c, d) < 0) { const tmp = c; c = d; d = tmp; }
        tets[t4++] = a; tets[t4++] = b; tets[t4++] = c; tets[t4++] = d;
      }
    }
  }

  const seen = new Set(), edgeList = [];
  const pairs = [0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3];
  for (let t = 0; t < nt; t++) {
    for (let k = 0; k < 12; k += 2) {
      const a = tets[t * 4 + pairs[k]], b = tets[t * 4 + pairs[k + 1]];
      const lo = Math.min(a, b), hi = Math.max(a, b), key = lo * nv + hi;
      if (!seen.has(key)) { seen.add(key); edgeList.push(lo, hi); }
    }
  }

  return {
    np, nv, pos, ntri, tris, nt, tets, L, y0, dy,
    edges: Int32Array.from(edgeList), ne: edgeList.length / 2,
  };
}

function tetSignedVolume(x, a, b, c, d) {
  const ax = x[a * 3], ay = x[a * 3 + 1], az = x[a * 3 + 2];
  const e1x = x[b * 3] - ax, e1y = x[b * 3 + 1] - ay, e1z = x[b * 3 + 2] - az;
  const e2x = x[c * 3] - ax, e2y = x[c * 3 + 1] - ay, e2z = x[c * 3 + 2] - az;
  const e3x = x[d * 3] - ax, e3y = x[d * 3 + 1] - ay, e3z = x[d * 3 + 2] - az;
  return (e1x * (e2y * e3z - e2z * e3y) + e1y * (e2z * e3x - e2x * e3z) + e1z * (e2x * e3y - e2y * e3x)) / 6;
}
