// View camera (fixed orbit, framed for the aspect), key-light and top-down height-map matrices.
const CAM = {
  eye: new Float32Array(3), target: new Float32Array([0, 0.35, 0]), up: new Float32Array([0, 1, 0]),
  fov: (34 * Math.PI) / 180, aspect: 1,
  view: new Float32Array(16), proj: new Float32Array(16), viewProj: new Float32Array(16), invViewProj: new Float32Array(16),
  fwd: new Float32Array(3), right: new Float32Array(3),
};
const LIGHT = {
  dir: new Float32Array(3), near: 1, far: 18, half: 3.4,
  view: new Float32Array(16), proj: new Float32Array(16), viewProj: new Float32Array(16),
  heightView: new Float32Array(16), heightProj: new Float32Array(16), heightVP: new Float32Array(16),
};
const RAY = new Float32Array(6);
const RAY_V = new Float32Array(8);

function updateCamera(aspect) {
  CAM.aspect = aspect;
  const el = 0.6, dist = 5.6 * (aspect < 1.3 ? Math.pow(1.3 / aspect, 0.9) : 1);
  const t = CAM.target;
  CAM.eye[0] = t[0]; CAM.eye[1] = t[1] + dist * Math.sin(el); CAM.eye[2] = t[2] + dist * Math.cos(el);
  m4LookAt(CAM.view, CAM.eye, t, CAM.up);
  m4Perspective(CAM.proj, CAM.fov, aspect, 0.1, 60);
  m4Mul(CAM.viewProj, CAM.proj, CAM.view);
  m4Invert(CAM.invViewProj, CAM.viewProj);
  let fx = t[0] - CAM.eye[0], fy = t[1] - CAM.eye[1], fz = t[2] - CAM.eye[2];
  const l = Math.hypot(fx, fy, fz); fx /= l; fy /= l; fz /= l;
  CAM.fwd[0] = fx; CAM.fwd[1] = fy; CAM.fwd[2] = fz;
  // right = fwd × up
  let rx = -fz, rz = fx;
  const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
  CAM.right[0] = rx; CAM.right[1] = 0; CAM.right[2] = rz;
}

function initLights() {
  const d = LIGHT.dir, l = Math.hypot(LIGHT_DIR[0], LIGHT_DIR[1], LIGHT_DIR[2]);
  d[0] = LIGHT_DIR[0] / l; d[1] = LIGHT_DIR[1] / l; d[2] = LIGHT_DIR[2] / l;
  const dist = 9, eye = [d[0] * dist, d[1] * dist + 0.3, d[2] * dist], target = [0, 0.3, 0];
  m4LookAt(LIGHT.view, eye, target, [0, 1, 0]);
  m4Ortho(LIGHT.proj, -LIGHT.half, LIGHT.half, -LIGHT.half, LIGHT.half, LIGHT.near, LIGHT.far);
  m4Mul(LIGHT.viewProj, LIGHT.proj, LIGHT.view);
  m4LookAt(LIGHT.heightView, [0, 8, 0], [0, 0, 0], [0, 0, -1]);
  m4Ortho(LIGHT.heightProj, -HEIGHT_HALF, HEIGHT_HALF, -HEIGHT_HALF, HEIGHT_HALF, 0.5, 12);
  m4Mul(LIGHT.heightVP, LIGHT.heightProj, LIGHT.heightView);
}

// Canvas CSS pixel (px, py) of a cw × ch canvas → world ray in RAY (origin xyz, unit dir xyz).
function screenRay(px, py, cw, ch) {
  const nx = (2 * px) / cw - 1, ny = 1 - (2 * py) / ch, M = CAM.invViewProj, v = RAY_V;
  for (let k = 0; k < 2; k++) {
    const z = k;
    const x = M[0] * nx + M[4] * ny + M[8] * z + M[12];
    const y = M[1] * nx + M[5] * ny + M[9] * z + M[13];
    const zz = M[2] * nx + M[6] * ny + M[10] * z + M[14];
    const w = M[3] * nx + M[7] * ny + M[11] * z + M[15];
    v[k * 4] = x / w; v[k * 4 + 1] = y / w; v[k * 4 + 2] = zz / w;
  }
  let dx = v[4] - v[0], dy = v[5] - v[1], dz = v[6] - v[2];
  const l = Math.hypot(dx, dy, dz);
  RAY[0] = CAM.eye[0]; RAY[1] = CAM.eye[1]; RAY[2] = CAM.eye[2];
  RAY[3] = dx / l; RAY[4] = dy / l; RAY[5] = dz / l;
  return RAY;
}
