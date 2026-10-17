const CAM = {
  eye: new Float32Array(3), at: new Float32Array(3), right: new Float32Array(3), fwd: new Float32Array(3),
  fov: 0.6, aspect: 1, view: m4.create(), proj: m4.create(), vp: m4.create(), ivp: m4.create(),
};
const RAY = new Float64Array(6);
const v4 = new Float64Array(8);

// Frames the ring; on wide screens it sits left of the panel, on narrow ones it is pulled back to fit.
function cameraUpdate(w, h, wide) {
  const aspect = w / h;
  CAM.aspect = aspect;
  const halfW = 2.0, halfH = 1.55;
  const tv = Math.tan(CAM.fov / 2), th = tv * aspect;
  const dist = Math.max(halfH / tv, halfW / th, 5.2) + 1.0;
  const el = 0.52, az = 0.32;
  const shift = wide ? Math.min(0.9, 0.18 * dist * th) : 0;
  CAM.at[0] = shift; CAM.at[1] = 0.12; CAM.at[2] = 0;
  CAM.eye[0] = CAM.at[0] + dist * Math.cos(el) * Math.sin(az);
  CAM.eye[1] = CAM.at[1] + dist * Math.sin(el);
  CAM.eye[2] = CAM.at[2] + dist * Math.cos(el) * Math.cos(az);
  m4.lookAt(CAM.view, CAM.eye[0], CAM.eye[1], CAM.eye[2], CAM.at[0], CAM.at[1], CAM.at[2], 0, 1, 0);
  m4.perspective(CAM.proj, CAM.fov, aspect, 0.1, 80);
  m4.mul(CAM.vp, CAM.proj, CAM.view);
  m4.invert(CAM.ivp, CAM.vp);
  CAM.right[0] = CAM.view[0]; CAM.right[1] = CAM.view[4]; CAM.right[2] = CAM.view[8];
  CAM.fwd[0] = -CAM.view[2]; CAM.fwd[1] = -CAM.view[6]; CAM.fwd[2] = -CAM.view[10];
}

// World ray through a CSS pixel of the canvas into RAY (origin, unit direction).
function cameraRay(px, py, cw, ch) {
  const nx = px / cw * 2 - 1, ny = 1 - py / ch * 2, m = CAM.ivp;
  for (let k = 0; k < 2; k++) {
    const z = k;
    const x = m[0] * nx + m[4] * ny + m[8] * z + m[12];
    const y = m[1] * nx + m[5] * ny + m[9] * z + m[13];
    const zz = m[2] * nx + m[6] * ny + m[10] * z + m[14];
    const w = m[3] * nx + m[7] * ny + m[11] * z + m[15];
    v4[k * 3] = x / w; v4[k * 3 + 1] = y / w; v4[k * 3 + 2] = zz / w;
  }
  let dx = v4[3] - v4[0], dy = v4[4] - v4[1], dz = v4[5] - v4[2];
  const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
  RAY[0] = v4[0]; RAY[1] = v4[1]; RAY[2] = v4[2]; RAY[3] = dx / l; RAY[4] = dy / l; RAY[5] = dz / l;
}
