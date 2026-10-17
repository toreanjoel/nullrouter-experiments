// Soft-body state: positions, velocities, masses and per-tet rest data (all preallocated).
function createBody(mesh) {
  const { nv, nt, ne, tets, edges } = mesh;
  const X = mesh.pos;
  const m = new Float32Array(nv), w = new Float32Array(nv);
  const V0 = new Float32Array(nt), Mt = new Float32Array(nt), ro = new Float32Array(nt * 12);
  let restVolume = 0;
  for (let t = 0; t < nt; t++) {
    const v = tetSignedVolume(X, tets[t * 4], tets[t * 4 + 1], tets[t * 4 + 2], tets[t * 4 + 3]);
    V0[t] = v; restVolume += v;
    for (let k = 0; k < 4; k++) m[tets[t * 4 + k]] += v / 4; // density 1 in model units
  }
  for (let i = 0; i < nv; i++) w[i] = 1 / m[i];
  // Mass-weighted rest offsets from each tet's centroid (shape matching).
  for (let t = 0; t < nt; t++) {
    let M = 0, cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 4; k++) {
      const i = tets[t * 4 + k], mi = m[i];
      M += mi; cx += mi * X[i * 3]; cy += mi * X[i * 3 + 1]; cz += mi * X[i * 3 + 2];
    }
    cx /= M; cy /= M; cz /= M; Mt[t] = M;
    for (let k = 0; k < 4; k++) {
      const i = tets[t * 4 + k];
      ro[t * 12 + k * 3] = X[i * 3] - cx; ro[t * 12 + k * 3 + 1] = X[i * 3 + 1] - cy; ro[t * 12 + k * 3 + 2] = X[i * 3 + 2] - cz;
    }
  }
  const L0 = new Float32Array(ne);
  for (let e = 0; e < ne; e++) {
    const a = edges[e * 2] * 3, b = edges[e * 2 + 1] * 3;
    L0[e] = Math.hypot(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]);
  }
  let totalM = 0, Xcx = 0, Xcy = 0, Xcz = 0;
  for (let i = 0; i < nv; i++) { totalM += m[i]; Xcx += m[i] * X[i * 3]; Xcy += m[i] * X[i * 3 + 1]; Xcz += m[i] * X[i * 3 + 2]; }
  const Xc = new Float32Array([Xcx / totalM, Xcy / totalM, Xcz / totalM]);
  const q = new Float32Array(nt * 4);
  for (let t = 0; t < nt; t++) q[t * 4 + 3] = 1;
  return {
    nv, nt, ne, tets, edges, X, m, w, V0, Mt, ro, L0, q, restVolume, totalM, Xc,
    x: new Float32Array(nv * 3), p: new Float32Array(nv * 3), v: new Float32Array(nv * 3),
    E: firmnessToE(0.55), damp: dampingToRate(0.35),
    // Whole-body frame, refreshed once per rendered frame.
    c: new Float32Array(3), bq: new Float32Array([0, 0, 0, 1]), rot: new Float32Array(9), rot4: new Float32Array(16),
  };
}

function bodyVolume(B) {
  let v = 0;
  const T = B.tets;
  for (let t = 0; t < B.nt; t++) v += tetSignedVolume(B.x, T[t * 4], T[t * 4 + 1], T[t * 4 + 2], T[t * 4 + 3]);
  return v;
}

// ½ Σ m v² in model units.
function bodyKinetic(B) {
  let k = 0;
  const v = B.v;
  for (let i = 0; i < B.nv; i++) k += B.m[i] * (v[i * 3] * v[i * 3] + v[i * 3 + 1] * v[i * 3 + 1] + v[i * 3 + 2] * v[i * 3 + 2]);
  return 0.5 * k;
}

const BODY_A = new Float64Array(9);

// Centroid and best-fit rotation of the whole body (rest → world), for zones and picking.
function bodyFrame(B) {
  const x = B.x, X = B.X, m = B.m, A = BODY_A;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < B.nv; i++) { cx += m[i] * x[i * 3]; cy += m[i] * x[i * 3 + 1]; cz += m[i] * x[i * 3 + 2]; }
  cx /= B.totalM; cy /= B.totalM; cz /= B.totalM;
  A.fill(0);
  for (let i = 0; i < B.nv; i++) {
    const mi = m[i];
    const dx = mi * (x[i * 3] - cx), dy = mi * (x[i * 3 + 1] - cy), dz = mi * (x[i * 3 + 2] - cz);
    const qx = X[i * 3] - B.Xc[0], qy = X[i * 3 + 1] - B.Xc[1], qz = X[i * 3 + 2] - B.Xc[2];
    A[0] += dx * qx; A[1] += dx * qy; A[2] += dx * qz;
    A[3] += dy * qx; A[4] += dy * qy; A[5] += dy * qz;
    A[6] += dz * qx; A[7] += dz * qy; A[8] += dz * qz;
  }
  extractRotation(A, B.bq, 0, 8);
  quatToMat3(B.bq, 0, B.rot);
  B.c[0] = cx; B.c[1] = cy; B.c[2] = cz;
  const R = B.rot, o = B.rot4;
  o[0] = R[0]; o[1] = R[3]; o[2] = R[6]; o[3] = 0;
  o[4] = R[1]; o[5] = R[4]; o[6] = R[7]; o[7] = 0;
  o[8] = R[2]; o[9] = R[5]; o[10] = R[8]; o[11] = 0;
  o[12] = cx; o[13] = cy; o[14] = cz; o[15] = 1;
}
