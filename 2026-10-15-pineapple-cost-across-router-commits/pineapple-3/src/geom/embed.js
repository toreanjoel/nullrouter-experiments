// Locates a rest-space point in the tet mesh: 4 vertex ids + barycentric weights.
// Points slightly outside (bevel arcs between outline samples) get the nearest tet, extrapolated.
const EMBED_B = new Float64Array(4);

function embedPoint(mesh, px, py, pz, idxOut, wOut, o) {
  const P = mesh.pos, T = mesh.tris;
  let bestT = 0, bestMin = -Infinity;
  for (let t = 0; t < mesh.ntri; t++) {
    const a = T[t * 3] * 3, b = T[t * 3 + 1] * 3, c = T[t * 3 + 2] * 3;
    const ax = P[a], az = P[a + 2], bx = P[b], bz = P[b + 2], cx = P[c], cz = P[c + 2];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
    const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
    const mn = Math.min(l1, l2, 1 - l1 - l2);
    if (mn > bestMin) { bestMin = mn; bestT = t; }
  }
  const l = Math.max(0, Math.min(mesh.L - 1, Math.floor((py - mesh.y0) / mesh.dy)));
  let bestTet = 0;
  bestMin = -Infinity;
  for (let k = 0; k < 3; k++) {
    const tet = (bestT * mesh.L + l) * 3 + k;
    tetBary(P, mesh.tets, tet, px, py, pz, EMBED_B);
    const mn = Math.min(EMBED_B[0], EMBED_B[1], EMBED_B[2], EMBED_B[3]);
    if (mn > bestMin) { bestMin = mn; bestTet = tet; }
  }
  tetBary(P, mesh.tets, bestTet, px, py, pz, EMBED_B);
  for (let k = 0; k < 4; k++) { idxOut[o + k] = mesh.tets[bestTet * 4 + k]; wOut[o + k] = EMBED_B[k]; }
}

function tetBary(x, tets, t, px, py, pz, out) {
  const a = tets[t * 4] * 3, b = tets[t * 4 + 1] * 3, c = tets[t * 4 + 2] * 3, d = tets[t * 4 + 3] * 3;
  const ax = x[a], ay = x[a + 1], az = x[a + 2];
  const e1x = x[b] - ax, e1y = x[b + 1] - ay, e1z = x[b + 2] - az;
  const e2x = x[c] - ax, e2y = x[c + 1] - ay, e2z = x[c + 2] - az;
  const e3x = x[d] - ax, e3y = x[d + 1] - ay, e3z = x[d + 2] - az;
  const rx = px - ax, ry = py - ay, rz = pz - az;
  // Cramer's rule with det[u v w] = u · (v × w)
  const c23x = e2y * e3z - e2z * e3y, c23y = e2z * e3x - e2x * e3z, c23z = e2x * e3y - e2y * e3x;
  const det = e1x * c23x + e1y * c23y + e1z * c23z;
  const b1 = (rx * c23x + ry * c23y + rz * c23z) / det;
  const cr3x = ry * e3z - rz * e3y, cr3y = rz * e3x - rx * e3z, cr3z = rx * e3y - ry * e3x;
  const b2 = (e1x * cr3x + e1y * cr3y + e1z * cr3z) / det;
  const c2rx = e2y * rz - e2z * ry, c2ry = e2z * rx - e2x * rz, c2rz = e2x * ry - e2y * rx;
  const b3 = (e1x * c2rx + e1y * c2ry + e1z * c2rz) / det;
  out[0] = 1 - b1 - b2 - b3; out[1] = b1; out[2] = b2; out[3] = b3;
}
