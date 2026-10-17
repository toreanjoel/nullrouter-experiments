// Extrudes the 2D triangulation into prism layers, 3 tets per prism (diagonals chosen by vertex index so faces conform).
function buildTetMesh() {
  const P2 = buildPoints(), tri = delaunay(P2);
  const n2 = P2.length / 2, L = RING.layers, N = n2 * (L + 1), nTri = tri.length / 3;
  const rest = new Float32Array(N * 3);
  for (let k = 0; k <= L; k++) {
    for (let i = 0; i < n2; i++) {
      const p = (k * n2 + i) * 3;
      rest[p] = P2[i * 2]; rest[p + 1] = k * RING.T / L; rest[p + 2] = P2[i * 2 + 1];
    }
  }

  const NT = nTri * L * 3, tets = new Uint32Array(NT * 4);
  let t = 0;
  const s = [0, 0, 0];
  for (let f = 0; f < nTri; f++) {
    s[0] = tri[f * 3]; s[1] = tri[f * 3 + 1]; s[2] = tri[f * 3 + 2];
    s.sort((a, b) => a - b);
    for (let k = 0; k < L; k++) {
      const o0 = k * n2, o1 = (k + 1) * n2;
      const A = s[0] + o0, B = s[1] + o0, C = s[2] + o0, A1 = s[0] + o1, B1 = s[1] + o1, C1 = s[2] + o1;
      tets.set([A, B, C, C1], t * 4); t++;
      tets.set([A, B, B1, C1], t * 4); t++;
      tets.set([A, A1, B1, C1], t * 4); t++;
    }
  }

  const vol0 = new Float32Array(NT), mass = new Float64Array(N);
  for (let i = 0; i < NT; i++) {
    let v = tetVolume(rest, tets, i);
    if (v < 0) { const a = tets[i * 4 + 2]; tets[i * 4 + 2] = tets[i * 4 + 3]; tets[i * 4 + 3] = a; v = -v; }
    vol0[i] = v;
    for (let j = 0; j < 4; j++) mass[tets[i * 4 + j]] += v / 4;
  }

  const edgeMap = new Map();
  for (let i = 0; i < NT; i++) {
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const u = tets[i * 4 + a], v = tets[i * 4 + b];
      const key = u < v ? u * 1048576 + v : v * 1048576 + u;
      if (!edgeMap.has(key)) edgeMap.set(key, u < v ? [u, v] : [v, u]);
    }
  }
  const edges = new Uint32Array(edgeMap.size * 2);
  let e = 0;
  for (const [u, v] of edgeMap.values()) { edges[e++] = u; edges[e++] = v; }

  // Uniform grid over the 2D triangles for point location.
  const cell = 0.2, gn = Math.ceil(2 * (RING.R + 0.2) / cell), grid = Array.from({ length: gn * gn }, () => []);
  const g = v => Math.min(gn - 1, Math.max(0, Math.floor((v + RING.R + 0.2) / cell)));
  for (let f = 0; f < nTri; f++) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let j = 0; j < 3; j++) {
      const x = P2[tri[f * 3 + j] * 2], z = P2[tri[f * 3 + j] * 2 + 1];
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    for (let gz = g(z0); gz <= g(z1); gz++) for (let gx = g(x0); gx <= g(x1); gx++) grid[gz * gn + gx].push(f);
  }

  return { n2, N, NT, nTri, rest, tets, vol0, mass, edges, P2, tri, grid, gn, g };
}

function tetVolume(X, T, i) {
  const a = T[i * 4] * 3, b = T[i * 4 + 1] * 3, c = T[i * 4 + 2] * 3, d = T[i * 4 + 3] * 3;
  const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
  const vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2];
  const wx = X[d] - X[a], wy = X[d + 1] - X[a + 1], wz = X[d + 2] - X[a + 2];
  return (ux * (vy * wz - vz * wy) + uy * (vz * wx - vx * wz) + uz * (vx * wy - vy * wx)) / 6;
}

// Finds the tet holding rest-space point p and its barycentric weights (may extrapolate slightly near the outline).
function bindPoint(mesh, px, py, pz, outIdx, outW, o) {
  const { P2, tri, grid, gn, g, n2 } = mesh;
  let best = -1, bestMin = -1e9;
  const cx = g(px), cz = g(pz);
  for (let rad = 0; rad <= 2 && bestMin < -1e-6; rad++) {
    for (let gz = Math.max(0, cz - rad); gz <= Math.min(gn - 1, cz + rad); gz++) {
      for (let gx = Math.max(0, cx - rad); gx <= Math.min(gn - 1, cx + rad); gx++) {
        for (const f of grid[gz * gn + gx]) {
          const a = tri[f * 3] * 2, b = tri[f * 3 + 1] * 2, c = tri[f * 3 + 2] * 2;
          const d = (P2[b + 1] - P2[c + 1]) * (P2[a] - P2[c]) + (P2[c] - P2[b]) * (P2[a + 1] - P2[c + 1]);
          const l0 = ((P2[b + 1] - P2[c + 1]) * (px - P2[c]) + (P2[c] - P2[b]) * (pz - P2[c + 1])) / d;
          const l1 = ((P2[c + 1] - P2[a + 1]) * (px - P2[c]) + (P2[a] - P2[c]) * (pz - P2[c + 1])) / d;
          const m = Math.min(l0, l1, 1 - l0 - l1);
          if (m > bestMin) { bestMin = m; best = f; }
        }
      }
    }
  }
  const L = RING.layers;
  const k = Math.min(L - 1, Math.max(0, Math.floor(py / (RING.T / L))));
  let bt = 0, bm = -1e9;
  const w = [0, 0, 0, 0];
  for (let j = 0; j < 3; j++) {
    const ti = (best * L + k) * 3 + j;
    tetBary(mesh.rest, mesh.tets, ti, px, py, pz, w);
    const m = Math.min(w[0], w[1], w[2], w[3]);
    if (m > bm) { bm = m; bt = ti; }
  }
  tetBary(mesh.rest, mesh.tets, bt, px, py, pz, w);
  for (let j = 0; j < 4; j++) { outIdx[o + j] = mesh.tets[bt * 4 + j]; outW[o + j] = w[j]; }
  return bt;
}

function tetBary(X, T, i, px, py, pz, w) {
  const a = T[i * 4] * 3, b = T[i * 4 + 1] * 3, c = T[i * 4 + 2] * 3, d = T[i * 4 + 3] * 3;
  const m00 = X[b] - X[a], m10 = X[b + 1] - X[a + 1], m20 = X[b + 2] - X[a + 2];
  const m01 = X[c] - X[a], m11 = X[c + 1] - X[a + 1], m21 = X[c + 2] - X[a + 2];
  const m02 = X[d] - X[a], m12 = X[d + 1] - X[a + 1], m22 = X[d + 2] - X[a + 2];
  const rx = px - X[a], ry = py - X[a + 1], rz = pz - X[a + 2];
  const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
  const b1 = (rx * (m11 * m22 - m12 * m21) - m01 * (ry * m22 - m12 * rz) + m02 * (ry * m21 - m11 * rz)) / det;
  const b2 = (m00 * (ry * m22 - m12 * rz) - rx * (m10 * m22 - m12 * m20) + m02 * (m10 * rz - ry * m20)) / det;
  const b3 = (m00 * (m11 * rz - ry * m21) - m01 * (m10 * rz - ry * m20) + rx * (m10 * m21 - m11 * m20)) / det;
  w[0] = 1 - b1 - b2 - b3; w[1] = b1; w[2] = b2; w[3] = b3;
}
