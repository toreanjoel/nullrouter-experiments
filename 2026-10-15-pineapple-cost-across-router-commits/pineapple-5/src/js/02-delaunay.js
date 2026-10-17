// Bowyer–Watson 2D Delaunay triangulation. pts: [x0,y0,x1,y1,...]. Returns flat CCW triangle indices.
function delaunay2D(pts) {
  const n = pts.length / 2;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, pts[2 * i]); maxX = Math.max(maxX, pts[2 * i]);
    minY = Math.min(minY, pts[2 * i + 1]); maxY = Math.max(maxY, pts[2 * i + 1]);
  }
  const d = Math.max(maxX - minX, maxY - minY) * 20, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const P = pts.slice();
  P.push(cx - d, cy - d, cx + d, cy - d, cx, cy + d);

  // Triangle: [a, b, c, circumX, circumY, r2]
  const make = (a, b, c) => {
    const ax = P[2 * a], ay = P[2 * a + 1], bx = P[2 * b], by = P[2 * b + 1], qx = P[2 * c], qy = P[2 * c + 1];
    const D = 2 * (ax * (by - qy) + bx * (qy - ay) + qx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = qx * qx + qy * qy;
    const ux = (a2 * (by - qy) + b2 * (qy - ay) + c2 * (ay - by)) / D;
    const uy = (a2 * (qx - bx) + b2 * (ax - qx) + c2 * (bx - ax)) / D;
    return [a, b, c, ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
  };

  let tris = [make(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const px = P[2 * i], py = P[2 * i + 1];
    const keep = [], edges = new Map();
    for (const t of tris) {
      if ((px - t[3]) ** 2 + (py - t[4]) ** 2 < t[5] * (1 - 1e-12)) {
        for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
          const k = u < v ? u * 100000 + v : v * 100000 + u;
          edges.set(k, edges.has(k) ? null : [u, v]);
        }
      } else keep.push(t);
    }
    for (const e of edges.values()) if (e) keep.push(make(e[0], e[1], i));
    tris = keep;
  }

  const out = [];
  for (const t of tris) {
    if (t[0] >= n || t[1] >= n || t[2] >= n) continue;
    let [a, b, c] = t;
    const cross = (P[2 * b] - P[2 * a]) * (P[2 * c + 1] - P[2 * a + 1]) - (P[2 * b + 1] - P[2 * a + 1]) * (P[2 * c] - P[2 * a]);
    if (cross < 0) [b, c] = [c, b];
    out.push(a, b, c);
  }
  return out;
}
