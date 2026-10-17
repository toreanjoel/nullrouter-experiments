// Render surface: a fine bevelled ring (rounded-rectangle cross-section swept around the
// scalloped outline), each vertex skinned to the tet it sits in. Rest positions feed the zones.
function profilePoints(rmin, rmax, h, b, outR, outY) {
  const { top, wall, bevel } = SURF, hp = Math.PI / 2;
  let j = 0;
  const push = (r, y) => { outR[j] = r; outY[j] = y; j++; };
  for (let k = 0; k < top; k++) push(rmin + b + ((rmax - rmin - 2 * b) * k) / top, h);
  for (let k = 0; k < bevel; k++) { const a = hp * (1 - k / bevel); push(rmax - b + b * Math.cos(a), h - b + b * Math.sin(a)); }
  for (let k = 0; k < wall; k++) push(rmax, h - b - (2 * (h - b) * k) / wall);
  for (let k = 0; k < bevel; k++) { const a = -hp * (k / bevel); push(rmax - b + b * Math.cos(a), -h + b + b * Math.sin(a)); }
  for (let k = 0; k < top; k++) push(rmax - b - ((rmax - rmin - 2 * b) * k) / top, -h);
  for (let k = 0; k < bevel; k++) { const a = -hp - hp * (k / bevel); push(rmin + b + b * Math.cos(a), -h + b + b * Math.sin(a)); }
  for (let k = 0; k < wall; k++) push(rmin, -h + b + (2 * (h - b) * k) / wall);
  for (let k = 0; k < bevel; k++) { const a = Math.PI - hp * (k / bevel); push(rmin + b + b * Math.cos(a), h - b + b * Math.sin(a)); }
  return j;
}

function buildSurface(mesh) {
  const NT = RING.scallops * SURF.perScallop;
  const M = 2 * SURF.top + 2 * SURF.wall + 4 * SURF.bevel;
  const ns = NT * M;
  const rest = new Float32Array(ns * 3);
  const pr = new Float64Array(M), py = new Float64Array(M);
  for (let i = 0; i < NT; i++) {
    const th = (2 * Math.PI * i) / NT, c = Math.cos(th), s = Math.sin(th);
    profilePoints(RING.hole, outerRadius(th), RING.H / 2, RING.bevel, pr, py);
    for (let j = 0; j < M; j++) {
      const v = (i * M + j) * 3;
      rest[v] = pr[j] * c; rest[v + 1] = py[j]; rest[v + 2] = pr[j] * s;
    }
  }

  // Quads (θi, j) → (θi+1, j) → (θi+1, j+1) → (θi, j+1); CCW seen from outside.
  const ntri = NT * M * 2;
  const tris = new Uint32Array(ntri * 3);
  let q = 0;
  for (let i = 0; i < NT; i++) {
    const i1 = (i + 1) % NT;
    for (let j = 0; j < M; j++) {
      const j1 = (j + 1) % M;
      const a = i * M + j, b = i1 * M + j, c = i1 * M + j1, d = i * M + j1;
      tris[q++] = a; tris[q++] = b; tris[q++] = c;
      tris[q++] = a; tris[q++] = c; tris[q++] = d;
    }
  }

  const idx = new Uint32Array(ns * 4), w = new Float32Array(ns * 4);
  for (let v = 0; v < ns; v++) embedPoint(mesh, rest[v * 3], rest[v * 3 + 1], rest[v * 3 + 2], idx, w, v * 4);

  return {
    ns, ntri, rest, tris, idx, w,
    pos: new Float32Array(ns * 3), nrm: new Float32Array(ns * 3), vbuf: new Float32Array(ns * 6),
  };
}

// Deformed positions and smooth normals from the tet mesh, interleaved for upload.
function skinSurface(B, S) {
  const x = B.x, I = S.idx, W = S.w, P = S.pos, N = S.nrm, out = S.vbuf, ns = S.ns, T = S.tris;
  for (let v = 0; v < ns; v++) {
    const o = v * 4, a = I[o] * 3, b = I[o + 1] * 3, c = I[o + 2] * 3, d = I[o + 3] * 3;
    const wa = W[o], wb = W[o + 1], wc = W[o + 2], wd = W[o + 3];
    P[v * 3] = wa * x[a] + wb * x[b] + wc * x[c] + wd * x[d];
    P[v * 3 + 1] = wa * x[a + 1] + wb * x[b + 1] + wc * x[c + 1] + wd * x[d + 1];
    P[v * 3 + 2] = wa * x[a + 2] + wb * x[b + 2] + wc * x[c + 2] + wd * x[d + 2];
  }
  N.fill(0);
  for (let t = 0; t < S.ntri * 3; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
    const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
    N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
    N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
  }
  for (let v = 0; v < ns; v++) {
    const o = v * 3, nx = N[o], ny = N[o + 1], nz = N[o + 2];
    const il = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-20);
    const k = v * 6;
    out[k] = P[o]; out[k + 1] = P[o + 1]; out[k + 2] = P[o + 2];
    out[k + 3] = nx * il; out[k + 4] = ny * il; out[k + 5] = nz * il;
  }
}
