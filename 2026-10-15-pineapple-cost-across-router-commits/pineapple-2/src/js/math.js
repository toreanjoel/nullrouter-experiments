// Column-major 4x4 matrices in Float32Arrays; all functions write into `o`.
const m4 = {
  create: () => new Float32Array(16),
  perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[10] = far / (near - far); o[11] = -1; o[14] = near * far / (near - far);
    return o;
  },
  ortho(o, l, r, b, t, n, f) {
    o.fill(0);
    o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = 1 / (n - f);
    o[12] = (l + r) / (l - r); o[13] = (t + b) / (b - t); o[14] = n / (n - f); o[15] = 1;
    return o;
  },
  lookAt(o, ex, ey, ez, ax, ay, az, ux, uy, uz) {
    let zx = ex - ax, zy = ey - ay, zz = ez - az;
    let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
    let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
    l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * ex + xy * ey + xz * ez);
    o[13] = -(yx * ex + yy * ey + yz * ez);
    o[14] = -(zx * ex + zy * ey + zz * ez);
    o[15] = 1;
    return o;
  },
  mul(o, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
      o[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
      o[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
      o[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
      o[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
    }
    return o;
  },
  invert(o, m) {
    const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
    const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    const det = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
};

// Rotation part of A (3x3, columns a0..a2 at A[0..8]) by Müller et al. 2016, warm-started from q at Q[qi].
function extractRotation(A, Q, qi, iters) {
  let qx = Q[qi], qy = Q[qi + 1], qz = Q[qi + 2], qw = Q[qi + 3];
  for (let it = 0; it < iters; it++) {
    const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
    const r00 = 1 - 2 * (yy + zz), r10 = 2 * (xy + wz), r20 = 2 * (xz - wy);
    const r01 = 2 * (xy - wz), r11 = 1 - 2 * (xx + zz), r21 = 2 * (yz + wx);
    const r02 = 2 * (xz + wy), r12 = 2 * (yz - wx), r22 = 1 - 2 * (xx + yy);
    const ox = (r10 * A[2] - r20 * A[1]) + (r11 * A[5] - r21 * A[4]) + (r12 * A[8] - r22 * A[7]);
    const oy = (r20 * A[0] - r00 * A[2]) + (r21 * A[3] - r01 * A[5]) + (r22 * A[6] - r02 * A[8]);
    const oz = (r00 * A[1] - r10 * A[0]) + (r01 * A[4] - r11 * A[3]) + (r02 * A[7] - r12 * A[6]);
    const d = Math.abs(r00 * A[0] + r10 * A[1] + r20 * A[2] + r01 * A[3] + r11 * A[4] + r21 * A[5] + r02 * A[6] + r12 * A[7] + r22 * A[8]) + 1e-12;
    const wx_ = ox / d, wy_ = oy / d, wz_ = oz / d;
    const w = Math.sqrt(wx_ * wx_ + wy_ * wy_ + wz_ * wz_);
    if (w < 1e-9) break;
    let s = 0.5, c = 1;
    if (w > 0.3) { s = Math.sin(w * 0.5) / w; c = Math.cos(w * 0.5); }
    const px = wx_ * s, py = wy_ * s, pz = wz_ * s;
    const nx = c * qx + px * qw + py * qz - pz * qy;
    const ny = c * qy - px * qz + py * qw + pz * qx;
    const nz = c * qz + px * qy - py * qx + pz * qw;
    const nw = c * qw - px * qx - py * qy - pz * qz;
    const l = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    qx = nx * l; qy = ny * l; qz = nz * l; qw = nw * l;
  }
  Q[qi] = qx; Q[qi + 1] = qy; Q[qi + 2] = qz; Q[qi + 3] = qw;
}

// Writes the rotation matrix of quaternion Q[qi] into R (9, column-major).
function quatToMat(Q, qi, R) {
  const qx = Q[qi], qy = Q[qi + 1], qz = Q[qi + 2], qw = Q[qi + 3];
  const xx = qx * qx, yy = qy * qy, zz = qz * qz, xy = qx * qy, xz = qx * qz, yz = qy * qz, wx = qw * qx, wy = qw * qy, wz = qw * qz;
  R[0] = 1 - 2 * (yy + zz); R[1] = 2 * (xy + wz); R[2] = 2 * (xz - wy);
  R[3] = 2 * (xy - wz); R[4] = 1 - 2 * (xx + zz); R[5] = 2 * (yz + wx);
  R[6] = 2 * (xz + wy); R[7] = 2 * (yz - wx); R[8] = 1 - 2 * (xx + yy);
}

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
