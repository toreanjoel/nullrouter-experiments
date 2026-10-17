// Ray picking against the deformed render surface. Knows when a ray slips through the empty hole.
const PICK = { hit: false, hole: false, t: 0, tri: 0, u: 0, v: 0, p: new Float64Array(3), rest: new Float64Array(3) };
const _pc = new Float64Array(3);

function pickSurface(S, B, o, d) {
  const { dyn, idx, restPos } = S;
  // Bounding sphere around the body centroid as an early out.
  bodyCentroid(B, _pc);
  const cx = _pc[0] - o[0], cy = _pc[1] - o[1], cz = _pc[2] - o[2];
  const tc = cx * d[0] + cy * d[1] + cz * d[2];
  const miss2 = cx * cx + cy * cy + cz * cz - tc * tc;
  PICK.hit = false; PICK.hole = false;
  if (miss2 > 3.2 * 3.2) return PICK;
  let best = Infinity;
  for (let t = 0; t < idx.length; t += 3) {
    const A = SURF_STRIDE * idx[t], Bq = SURF_STRIDE * idx[t + 1], C = SURF_STRIDE * idx[t + 2];
    const e1x = dyn[Bq] - dyn[A], e1y = dyn[Bq + 1] - dyn[A + 1], e1z = dyn[Bq + 2] - dyn[A + 2];
    const e2x = dyn[C] - dyn[A], e2y = dyn[C + 1] - dyn[A + 1], e2z = dyn[C + 2] - dyn[A + 2];
    const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const sx = o[0] - dyn[A], sy = o[1] - dyn[A + 1], sz = o[2] - dyn[A + 2];
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const t2 = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (t2 > 1e-4 && t2 < best) { best = t2; PICK.tri = t; PICK.u = u; PICK.v = v; }
  }
  if (best < Infinity) {
    PICK.hit = true; PICK.t = best;
    for (let k = 0; k < 3; k++) PICK.p[k] = o[k] + d[k] * best;
    const a = 4 * idx[PICK.tri], b = 4 * idx[PICK.tri + 1], c = 4 * idx[PICK.tri + 2], w = 1 - PICK.u - PICK.v;
    for (let k = 0; k < 3; k++) PICK.rest[k] = w * restPos[a + k] + PICK.u * restPos[b + k] + PICK.v * restPos[c + k];
  } else {
    // A miss whose ray runs close to the centroid went through the hole.
    PICK.hole = miss2 < (SHAPE.hole + 0.1) ** 2;
  }
  return PICK;
}

// Collect the soft patch around a rest-space hit point, with smooth weights.
function beginGrab(B, restHit, worldHit, axis) {
  const g = B.grab, rest = B.mesh.rest, R = 0.32;
  g.n = 0;
  for (let i = 0; i < B.nv && g.n < MAX_PATCH; i++) {
    const dx = rest[3 * i] - restHit[0], dy = rest[3 * i + 1] - restHit[1], dz = rest[3 * i + 2] - restHit[2];
    const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dd < R) {
      const s = 1 - (dd / R) ** 2;
      g.idx[g.n] = i; g.wt[g.n] = s * s; g.n++;
    }
  }
  if (g.n === 0) return false;
  for (let p = 0; p < g.n; p++) {
    const i = g.idx[p];
    for (let k = 0; k < 3; k++) g.off[3 * p + k] = B.x[3 * i + k] - worldHit[k];
  }
  g.target.set(worldHit); g.axis.set(axis); g.twist = 0; g.active = true;
  return true;
}
