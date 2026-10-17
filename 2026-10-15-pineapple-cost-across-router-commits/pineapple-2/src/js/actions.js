let nudgeSeed = mulberry32(99);

function actionNudge() {
  const th = nudgeSeed() * Math.PI * 2, px = Math.cos(th) * RING.R, pz = Math.sin(th) * RING.R;
  for (let i = 0; i < NP; i++) {
    const p = i * 3, d = Math.hypot(REST[p] - px, REST[p + 2] - pz), w = Math.max(0, 1 - d / 1.1);
    V[p + 1] += 0.9 + 2.6 * w * w;
    V[p] -= Math.cos(th) * 0.5 * w; V[p + 2] -= Math.sin(th) * 0.5 * w;
  }
}

// Toss with a spin about the screen's horizontal axis; ω chosen so it turns ~180° before landing.
function actionTurnOver() {
  grabEnd();
  let ax = CAM.right[0], az = CAM.right[2];
  const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
  const up = 5.4, w = Math.PI * SIM.g / (2 * up) * 1.12;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < NP; i++) { const m = MS[i]; cx += m * X[i * 3]; cy += m * X[i * 3 + 1]; cz += m * X[i * 3 + 2]; }
  cx /= totalMass; cy /= totalMass; cz /= totalMass;
  for (let i = 0; i < NP; i++) {
    const p = i * 3, rx = X[p] - cx, ry = X[p + 1] - cy, rz = X[p + 2] - cz;
    V[p] = w * (-az * ry);
    V[p + 1] = up + w * (az * rx - ax * rz);
    V[p + 2] = w * (ax * ry);
  }
}

function actionReset() {
  grabEnd();
  simReset();
}
