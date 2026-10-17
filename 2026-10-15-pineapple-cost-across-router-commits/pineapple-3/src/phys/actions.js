// Nudge, turn over (toss with spin about the screen's horizontal axis) and reset.
const ACT_C = new Float32Array(3);

function bodyCentroid(B, out) {
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < B.nv; i++) { const m = B.m[i]; cx += m * B.x[i * 3]; cy += m * B.x[i * 3 + 1]; cz += m * B.x[i * 3 + 2]; }
  out[0] = cx / B.totalM; out[1] = cy / B.totalM; out[2] = cz / B.totalM;
}

// Lift one side and add a little yaw so it wobbles.
function actNudge(B) {
  bodyCentroid(B, ACT_C);
  const a = Math.random() * 2 * Math.PI, ux = Math.cos(a), uz = Math.sin(a);
  const spin = (Math.random() - 0.5) * 2.4;
  for (let i = 0; i < B.nv; i++) {
    const o = i * 3, rx = B.x[o] - ACT_C[0], rz = B.x[o + 2] - ACT_C[2];
    const side = Math.max(0, rx * ux + rz * uz) / RING.R;
    B.v[o] += -spin * rz;
    B.v[o + 1] += 3.2 * (0.3 + 0.7 * side);
    B.v[o + 2] += spin * rx;
  }
}

// Launch so the ring turns half over while airborne: flight time t = 2 vy / g, ω = π / t.
function actTurnOver(B, axis) {
  bodyCentroid(B, ACT_C);
  const g = SIM.gravity, vy = Math.sqrt(2 * g * 1.8), w = (1.08 * Math.PI * g) / (2 * vy);
  let ax = axis[0], az = axis[2];
  const l = Math.hypot(ax, az) || 1;
  ax /= l; az /= l;
  const wx = ax * w, wz = az * w;
  for (let i = 0; i < B.nv; i++) {
    const o = i * 3;
    const rx = B.x[o] - ACT_C[0], ry = B.x[o + 1] - ACT_C[1], rz = B.x[o + 2] - ACT_C[2];
    // v = (0, vy, 0) + ω × r, ω = (wx, 0, wz)
    B.v[o] = -wz * ry;
    B.v[o + 1] = vy + wz * rx - wx * rz;
    B.v[o + 2] = wx * ry;
  }
}

// Rest shape, slightly tilted, dropped from a small height.
function actReset(B) {
  const tilt = 0.08, c = Math.cos(tilt), s = Math.sin(tilt), lift = RING.H / 2 + 0.35;
  for (let i = 0; i < B.nv; i++) {
    const o = i * 3, X = B.X[o], Y = B.X[o + 1], Z = B.X[o + 2];
    B.x[o] = X; B.x[o + 1] = Y * c - Z * s + lift; B.x[o + 2] = Y * s + Z * c;
    B.p[o] = B.x[o]; B.p[o + 1] = B.x[o + 1]; B.p[o + 2] = B.x[o + 2];
    B.v[o] = 0; B.v[o + 1] = 0; B.v[o + 2] = 0;
  }
  for (let t = 0; t < B.nt; t++) {
    B.q[t * 4] = Math.sin(tilt / 2); B.q[t * 4 + 1] = 0; B.q[t * 4 + 2] = 0; B.q[t * 4 + 3] = Math.cos(tilt / 2);
  }
  B.bq[0] = Math.sin(tilt / 2); B.bq[1] = 0; B.bq[2] = 0; B.bq[3] = Math.cos(tilt / 2);
  grabEnd();
}
