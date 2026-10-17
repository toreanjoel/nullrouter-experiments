// Bowyer–Watson Delaunay of 2D points; triangles outside the annulus (hole, notches) are dropped.
function delaunay(P) {
  const n = P.length / 2;
  const rnd = mulberry32(7);
  const X = new Float64Array(n + 3), Z = new Float64Array(n + 3);
  for (let i = 0; i < n; i++) { X[i] = P[i * 2] + (rnd() - 0.5) * 1e-7; Z[i] = P[i * 2 + 1] + (rnd() - 0.5) * 1e-7; }
  X[n] = -100; Z[n] = -100; X[n + 1] = 100; Z[n + 1] = -100; X[n + 2] = 0; Z[n + 2] = 100;

  let tris = [];
  const addTri = (a, b, c) => {
    const ax = X[a], az = Z[a], bx = X[b], bz = Z[b], cx = X[c], cz = Z[c];
    const d = 2 * (ax * (bz - cz) + bx * (cz - az) + cx * (az - bz));
    const a2 = ax * ax + az * az, b2 = bx * bx + bz * bz, c2 = cx * cx + cz * cz;
    const ux = (a2 * (bz - cz) + b2 * (cz - az) + c2 * (az - bz)) / d;
    const uz = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    tris.push({ a, b, c, ux, uz, r2: (ax - ux) ** 2 + (az - uz) ** 2 });
  };
  addTri(n, n + 1, n + 2);

  for (let p = 0; p < n; p++) {
    const px = X[p], pz = Z[p];
    const edges = new Map(), keep = [];
    for (const t of tris) {
      if ((px - t.ux) ** 2 + (pz - t.uz) ** 2 < t.r2) {
        for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
          const k = u < v ? u * 65536 + v : v * 65536 + u;
          if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]);
        }
      } else keep.push(t);
    }
    tris = keep;
    for (const [u, v] of edges.values()) addTri(u, v, p);
  }

  const out = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const cx = (X[t.a] + X[t.b] + X[t.c]) / 3, cz = (Z[t.a] + Z[t.b] + Z[t.c]) / 3;
    if (!insideAnnulus(cx, cz)) continue;
    const area = (X[t.b] - X[t.a]) * (Z[t.c] - Z[t.a]) - (X[t.c] - X[t.a]) * (Z[t.b] - Z[t.a]);
    if (Math.abs(area) < 1e-6) continue;
    out.push(t.a, t.b, t.c);
  }
  return new Uint32Array(out);
}
