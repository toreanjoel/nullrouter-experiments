// Bowyer–Watson Delaunay triangulation of 2D points; returns CCW triangles as a flat index array.
function delaunay(px, py) {
  const n = px.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, px[i]); maxX = Math.max(maxX, px[i]);
    minY = Math.min(minY, py[i]); maxY = Math.max(maxY, py[i]);
  }
  const d = Math.max(maxX - minX, maxY - minY) * 20, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  const X = new Float64Array(n + 3), Y = new Float64Array(n + 3);
  X.set(px); Y.set(py);
  X[n] = mx - d; Y[n] = my - d;
  X[n + 1] = mx + d; Y[n + 1] = my - d;
  X[n + 2] = mx; Y[n + 2] = my + d;

  const tri = (a, b, c) => {
    const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
    const D = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / D;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / D;
    return { a, b, c, ux, uy, r2: (ax - ux) * (ax - ux) + (ay - uy) * (ay - uy) };
  };

  let tris = [tri(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const x = X[i], y = Y[i];
    const keep = [], edges = new Map();
    const addEdge = (u, v) => {
      const k = u < v ? u * 1e6 + v : v * 1e6 + u;
      const e = edges.get(k);
      if (e) e.count++; else edges.set(k, { u, v, count: 1 });
    };
    for (const t of tris) {
      const dx = x - t.ux, dy = y - t.uy;
      if (dx * dx + dy * dy < t.r2) { addEdge(t.a, t.b); addEdge(t.b, t.c); addEdge(t.c, t.a); }
      else keep.push(t);
    }
    for (const e of edges.values()) if (e.count === 1) keep.push(tri(e.u, e.v, i));
    tris = keep;
  }

  const out = [];
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    const cr = (X[t.b] - X[t.a]) * (Y[t.c] - Y[t.a]) - (Y[t.b] - Y[t.a]) * (X[t.c] - X[t.a]);
    if (cr > 0) out.push(t.a, t.b, t.c); else out.push(t.a, t.c, t.b);
  }
  return out;
}
