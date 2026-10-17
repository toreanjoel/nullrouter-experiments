// Smooth render surface: a torus-topology grid (θ × cross-section profile) of the bevelled, scalloped ring,
// each vertex embedded in a sim tet by barycentric weights.
function buildProfile() {
  const b = RING.bevel, T = RING.T, prof = [];
  const add = (t, aIn, aOut, y) => prof.push([t, aIn, aOut, y]);
  const arc = (n, from, to, f) => { for (let i = 0; i < n; i++) { const p = from + (to - from) * i / n; f(Math.cos(p), Math.sin(p)); } };
  const H = Math.PI / 2, nFace = 16, nArc = 7, nWall = 3;
  for (let i = 0; i < nFace; i++) { const u = i / nFace; add(u * u * (3 - 2 * u) * 0.7 + u * 0.3, b, b, T); }
  arc(nArc, H, 0, (c, s) => add(1, b, b - b * c, T - b + b * s));
  for (let i = 0; i < nWall; i++) add(1, b, 0, T - b - (T - 2 * b) * i / nWall);
  arc(nArc, 0, -H, (c, s) => add(1, b, b - b * c, b + b * s));
  for (let i = 0; i < nFace; i++) { const u = i / nFace; add(1 - (u * u * (3 - 2 * u) * 0.7 + u * 0.3), b, b, 0); }
  arc(nArc, -H, -2 * H, (c, s) => add(0, b + b * c, b, b + b * s));
  for (let i = 0; i < nWall; i++) add(0, 0, b, b + (T - 2 * b) * i / nWall);
  arc(nArc, 2 * H, H, (c, s) => add(0, b + b * c, b, T - b + b * s));
  return prof;
}

function buildSurface(mesh) {
  const prof = buildProfile(), nS = prof.length, nT = RING.lobes * 22, NV = nT * nS;
  const rest = new Float32Array(NV * 3), attr = new Float32Array(NV * 3);
  const idx4 = new Uint32Array(NV * 4), w4 = new Float32Array(NV * 4);
  for (let i = 0; i < nT; i++) {
    const th = i * 2 * Math.PI / nT, ro = outerR(th), c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j < nS; j++) {
      const [t, aIn, aOut, y] = prof[j];
      const rho = (1 - t) * (RING.r + aIn) + t * (ro - aOut);
      const v = i * nS + j;
      rest[v * 3] = rho * c; rest[v * 3 + 1] = y; rest[v * 3 + 2] = rho * s;
      attr[v * 3] = rho * c; attr[v * 3 + 1] = y - RING.T / 2; attr[v * 3 + 2] = rho * s;
      bindPoint(mesh, rho * c, y, rho * s, idx4, w4, v * 4);
    }
  }
  const index = new Uint32Array(nT * nS * 6);
  let k = 0;
  for (let i = 0; i < nT; i++) {
    const i1 = (i + 1) % nT;
    for (let j = 0; j < nS; j++) {
      const j1 = (j + 1) % nS;
      const a = i * nS + j, b = i1 * nS + j, c = i1 * nS + j1, d = i * nS + j1;
      index[k++] = a; index[k++] = b; index[k++] = c;
      index[k++] = a; index[k++] = c; index[k++] = d;
    }
  }
  return { NV, nT, nS, rest, attr, idx4, w4, index, nTri: index.length / 3 };
}
