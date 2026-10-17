// Per-frame skinning of the render surface and the inclusions from the interpolated particles XR.
let SURF, INCL, SKIN_POS, SKIN_DYN, INST;
const RQ = new Float64Array(9);

function skinInit(surf, incl) {
  SURF = surf; INCL = incl;
  SKIN_POS = new Float32Array(surf.NV * 3);
  SKIN_DYN = new Float32Array(surf.NV * 6);
  INST = new Float32Array(incl.n * 16);
}

function skinSurface() {
  const { NV, nT, nS, idx4, w4 } = SURF, P = SKIN_POS, D = SKIN_DYN;
  for (let v = 0; v < NV; v++) {
    const o = v * 4, a = idx4[o] * 3, b = idx4[o + 1] * 3, c = idx4[o + 2] * 3, d = idx4[o + 3] * 3;
    const wa = w4[o], wb = w4[o + 1], wc = w4[o + 2], wd = w4[o + 3];
    P[v * 3] = wa * XR[a] + wb * XR[b] + wc * XR[c] + wd * XR[d];
    P[v * 3 + 1] = wa * XR[a + 1] + wb * XR[b + 1] + wc * XR[c + 1] + wd * XR[d + 1];
    P[v * 3 + 2] = wa * XR[a + 2] + wb * XR[b + 2] + wc * XR[c + 2] + wd * XR[d + 2];
  }
  for (let i = 0; i < nT; i++) {
    const ip = ((i + nT - 1) % nT) * nS, in_ = ((i + 1) % nT) * nS, ic = i * nS;
    for (let j = 0; j < nS; j++) {
      const jp = (j + nS - 1) % nS, jn = (j + 1) % nS;
      const u0 = (ip + j) * 3, u1 = (in_ + j) * 3, v0 = (ic + jp) * 3, v1 = (ic + jn) * 3;
      const ux = P[u1] - P[u0], uy = P[u1 + 1] - P[u0 + 1], uz = P[u1 + 2] - P[u0 + 2];
      const vx = P[v1] - P[v0], vy = P[v1 + 1] - P[v0 + 1], vz = P[v1 + 2] - P[v0 + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = 1 / (Math.sqrt(nx * nx + ny * ny + nz * nz) + 1e-20);
      const v = ic + j, q = v * 6;
      D[q] = P[v * 3]; D[q + 1] = P[v * 3 + 1]; D[q + 2] = P[v * 3 + 2];
      D[q + 3] = nx * l; D[q + 4] = ny * l; D[q + 5] = nz * l;
    }
  }
}

function skinInclusions() {
  const { n, idx4, w4, tet, axes, kind } = INCL;
  for (let k = 0; k < n; k++) {
    const o = k * 4, a = idx4[o] * 3, b = idx4[o + 1] * 3, c = idx4[o + 2] * 3, d = idx4[o + 3] * 3;
    const wa = w4[o], wb = w4[o + 1], wc = w4[o + 2], wd = w4[o + 3];
    const q = k * 16;
    INST[q] = wa * XR[a] + wb * XR[b] + wc * XR[c] + wd * XR[d];
    INST[q + 1] = wa * XR[a + 1] + wb * XR[b + 1] + wc * XR[c + 1] + wd * XR[d + 1];
    INST[q + 2] = wa * XR[a + 2] + wb * XR[b + 2] + wc * XR[c + 2] + wd * XR[d + 2];
    INST[q + 3] = kind[k];
    quatToMat(TQ, tet[k] * 4, RQ);
    for (let ax = 0; ax < 3; ax++) {
      const sx = axes[k * 9 + ax * 3], sy = axes[k * 9 + ax * 3 + 1], sz = axes[k * 9 + ax * 3 + 2], r = q + 4 + ax * 4;
      INST[r] = RQ[0] * sx + RQ[3] * sy + RQ[6] * sz;
      INST[r + 1] = RQ[1] * sx + RQ[4] * sy + RQ[7] * sz;
      INST[r + 2] = RQ[2] * sx + RQ[5] * sy + RQ[8] * sz;
      INST[r + 3] = 0;
    }
  }
}
