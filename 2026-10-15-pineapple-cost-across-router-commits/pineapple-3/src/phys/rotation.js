// Rotation of a 3x3 (row-major) matrix A by Müller et al. 2016: warm-started quaternion
// iteration at Q[o]. Robust for inverted A, which is what lets inverted tets recover.
function extractRotation(A, Q, o, iters) {
  let qx = Q[o], qy = Q[o + 1], qz = Q[o + 2], qw = Q[o + 3];
  for (let it = 0; it < iters; it++) {
    const r00 = 1 - 2 * (qy * qy + qz * qz), r01 = 2 * (qx * qy - qz * qw), r02 = 2 * (qx * qz + qy * qw);
    const r10 = 2 * (qx * qy + qz * qw), r11 = 1 - 2 * (qx * qx + qz * qz), r12 = 2 * (qy * qz - qx * qw);
    const r20 = 2 * (qx * qz - qy * qw), r21 = 2 * (qy * qz + qx * qw), r22 = 1 - 2 * (qx * qx + qy * qy);
    // Σ_k col_k(R) × col_k(A)
    let ox = r10 * A[6] - r20 * A[3], oy = r20 * A[0] - r00 * A[6], oz = r00 * A[3] - r10 * A[0];
    ox += r11 * A[7] - r21 * A[4]; oy += r21 * A[1] - r01 * A[7]; oz += r01 * A[4] - r11 * A[1];
    ox += r12 * A[8] - r22 * A[5]; oy += r22 * A[2] - r02 * A[8]; oz += r02 * A[5] - r12 * A[2];
    const dot = r00 * A[0] + r10 * A[3] + r20 * A[6] + r01 * A[1] + r11 * A[4] + r21 * A[7] + r02 * A[2] + r12 * A[5] + r22 * A[8];
    const sc = 1 / (Math.abs(dot) + 1e-9);
    ox *= sc; oy *= sc; oz *= sc;
    const wl = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (wl < 1e-9) break;
    const sn = Math.sin(0.5 * wl) / wl, dx = ox * sn, dy = oy * sn, dz = oz * sn, dw = Math.cos(0.5 * wl);
    const nx = dw * qx + dx * qw + dy * qz - dz * qy;
    const ny = dw * qy - dx * qz + dy * qw + dz * qx;
    const nz = dw * qz + dx * qy - dy * qx + dz * qw;
    const nw = dw * qw - dx * qx - dy * qy - dz * qz;
    const il = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
    qx = nx * il; qy = ny * il; qz = nz * il; qw = nw * il;
  }
  Q[o] = qx; Q[o + 1] = qy; Q[o + 2] = qz; Q[o + 3] = qw;
}
