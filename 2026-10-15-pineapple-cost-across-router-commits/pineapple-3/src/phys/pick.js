// Ray pick against the deformed render surface. A ray that misses the flesh but crosses the
// ring's mid-plane inside the hole is reported as `through` (it went through the empty hole).
const PICK = { hit: false, through: false, x: 0, y: 0, z: 0 };

function pickSurface(B, S, ox, oy, oz, dx, dy, dz) {
  const P = S.pos, T = S.tris;
  let best = Infinity;
  for (let t = 0; t < S.ntri * 3; t += 3) {
    const a = T[t] * 3, b = T[t + 1] * 3, c = T[t + 2] * 3;
    const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
    const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (tt > 1e-4 && tt < best) best = tt;
  }
  PICK.hit = best < Infinity;
  PICK.through = false;
  if (PICK.hit) {
    PICK.x = ox + dx * best; PICK.y = oy + dy * best; PICK.z = oz + dz * best;
    return PICK;
  }
  // Body axis = rest +y rotated into world (column 1 of the body rotation).
  const R = B.rot, nx = R[1], ny = R[4], nz = R[7], c = B.c;
  const den = dx * nx + dy * ny + dz * nz;
  if (Math.abs(den) > 0.1) {
    const t = ((c[0] - ox) * nx + (c[1] - oy) * ny + (c[2] - oz) * nz) / den;
    if (t > 0) {
      const hx = ox + dx * t - c[0], hy = oy + dy * t - c[1], hz = oz + dz * t - c[2];
      PICK.through = Math.sqrt(hx * hx + hy * hy + hz * hz) < RING.hole;
    }
  }
  return PICK;
}
