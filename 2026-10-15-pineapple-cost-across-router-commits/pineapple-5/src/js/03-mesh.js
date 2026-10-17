// Tetrahedral mesh: Delaunay of the scalloped annulus (outline + hex lattice), extruded into prisms → 3 tets each.
function buildTetMesh() {
  const h = 0.17;            // lattice spacing
  const nOut = 84, nIn = 26; // outline samples
  const layers = 2;          // prism layers through the thickness
  const pts = [];
  for (let i = 0; i < nOut; i++) {
    const th = (i / nOut) * Math.PI * 2, r = outerRadius(th);
    pts.push(r * Math.cos(th), r * Math.sin(th));
  }
  for (let i = 0; i < nIn; i++) {
    const th = ((i + 0.5) / nIn) * Math.PI * 2;
    pts.push(SHAPE.hole * Math.cos(th), SHAPE.hole * Math.sin(th));
  }
  const rowH = h * Math.sqrt(3) / 2;
  for (let row = -12; row <= 12; row++) {
    for (let col = -12; col <= 12; col++) {
      const x = col * h + (row & 1 ? h / 2 : 0), z = row * rowH;
      const r = Math.hypot(x, z), th = Math.atan2(z, x);
      if (r > SHAPE.hole + 0.6 * h && r < outerRadius(th) - 0.6 * h) pts.push(x, z);
    }
  }
  const n2 = pts.length / 2;

  // Keep triangles whose centroid lies in the flesh: holes skipped.
  const all = delaunay2D(pts), tris = [];
  for (let t = 0; t < all.length; t += 3) {
    const a = all[t], b = all[t + 1], c = all[t + 2];
    const x = (pts[2 * a] + pts[2 * b] + pts[2 * c]) / 3, z = (pts[2 * a + 1] + pts[2 * b + 1] + pts[2 * c + 1]) / 3;
    const r = Math.hypot(x, z);
    if (r > SHAPE.hole && r < outerRadius(Math.atan2(z, x))) tris.push(a, b, c);
  }

  const nv = n2 * (layers + 1);
  const rest = new Float64Array(nv * 3);
  for (let l = 0; l <= layers; l++) {
    const y = -SHAPE.thick / 2 + (l / layers) * SHAPE.thick;
    for (let i = 0; i < n2; i++) {
      const v = l * n2 + i;
      rest[3 * v] = pts[2 * i]; rest[3 * v + 1] = y; rest[3 * v + 2] = pts[2 * i + 1];
    }
  }

  // Sorting each triangle by index gives every shared quad face the same diagonal.
  const tets = [];
  const nTri = tris.length / 3;
  for (let l = 0; l < layers; l++) {
    for (let t = 0; t < nTri; t++) {
      const s = [tris[3 * t], tris[3 * t + 1], tris[3 * t + 2]].sort((p, q) => p - q);
      const a = l * n2 + s[0], b = l * n2 + s[1], c = l * n2 + s[2];
      const A = a + n2, B = b + n2, C = c + n2;
      tets.push(a, b, c, C, a, b, B, C, a, A, B, C);
    }
  }
  const nt = tets.length / 4;
  const T = new Uint32Array(tets);
  for (let t = 0; t < nt; t++) {
    if (tetVolume(rest, T[4 * t], T[4 * t + 1], T[4 * t + 2], T[4 * t + 3]) < 0) {
      const k = T[4 * t + 2]; T[4 * t + 2] = T[4 * t + 3]; T[4 * t + 3] = k;
    }
  }

  const edgeSet = new Set(), edges = [];
  const pairs = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
  for (let t = 0; t < nt; t++) {
    for (const [p, q] of pairs) {
      let u = T[4 * t + p], v = T[4 * t + q];
      if (u > v) [u, v] = [v, u];
      const k = u * nv + v;
      if (!edgeSet.has(k)) { edgeSet.add(k); edges.push(u, v); }
    }
  }

  return { rest, tets: T, edges: new Uint32Array(edges), nv, nt, n2, layers, pts2: pts, tris2: new Uint32Array(tris), nTri };
}

function tetVolume(x, a, b, c, d) {
  const ax = x[3 * b] - x[3 * a], ay = x[3 * b + 1] - x[3 * a + 1], az = x[3 * b + 2] - x[3 * a + 2];
  const bx = x[3 * c] - x[3 * a], by = x[3 * c + 1] - x[3 * a + 1], bz = x[3 * c + 2] - x[3 * a + 2];
  const cx = x[3 * d] - x[3 * a], cy = x[3 * d + 1] - x[3 * a + 1], cz = x[3 * d + 2] - x[3 * a + 2];
  return (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
}

// Locate rest point (x,y,z) in the tet mesh: returns [tet, b0, b1, b2, b3] (bary may be slightly outside for hull points).
function makeTetLocator(mesh) {
  const { pts2, tris2, nTri, n2, layers, rest, tets } = mesh;
  const cell = 0.12, span = 1.6, gn = Math.ceil((2 * span) / cell);
  const grid = Array.from({ length: gn * gn }, () => []);
  const gi = (v) => Math.max(0, Math.min(gn - 1, Math.floor((v + span) / cell)));
  for (let t = 0; t < nTri; t++) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const i = tris2[3 * t + k];
      x0 = Math.min(x0, pts2[2 * i]); x1 = Math.max(x1, pts2[2 * i]);
      z0 = Math.min(z0, pts2[2 * i + 1]); z1 = Math.max(z1, pts2[2 * i + 1]);
    }
    for (let gx = gi(x0); gx <= gi(x1); gx++) for (let gz = gi(z0); gz <= gi(z1); gz++) grid[gz * gn + gx].push(t);
  }
  const triScore = (t, x, z) => {
    const a = tris2[3 * t], b = tris2[3 * t + 1], c = tris2[3 * t + 2];
    const ax = pts2[2 * a], az = pts2[2 * a + 1];
    const v0x = pts2[2 * b] - ax, v0z = pts2[2 * b + 1] - az, v1x = pts2[2 * c] - ax, v1z = pts2[2 * c + 1] - az;
    const px = x - ax, pz = z - az, den = v0x * v1z - v1x * v0z;
    const u = (px * v1z - v1x * pz) / den, v = (v0x * pz - px * v0z) / den;
    return Math.min(u, v, 1 - u - v);
  };
  const bary = new Float64Array(4);
  return function locate(x, y, z) {
    let best = -1, bestS = -Infinity;
    const cx = gi(x), cz = gi(z);
    for (let r = 0; r <= 3 && bestS < 0; r++) {
      for (let gz = Math.max(0, cz - r); gz <= Math.min(gn - 1, cz + r); gz++) {
        for (let gx = Math.max(0, cx - r); gx <= Math.min(gn - 1, cx + r); gx++) {
          for (const t of grid[gz * gn + gx]) {
            const s = triScore(t, x, z);
            if (s > bestS) { bestS = s; best = t; }
          }
        }
      }
    }
    const fl = ((y + SHAPE.thick / 2) / SHAPE.thick) * layers;
    const l = Math.max(0, Math.min(layers - 1, Math.floor(fl)));
    let bt = -1, bs = -Infinity;
    const out = [0, 0, 0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const t = (l * nTri + best) * 3 + k;
      tetBary(rest, tets, t, x, y, z, bary);
      const s = Math.min(bary[0], bary[1], bary[2], bary[3]);
      if (s > bs) { bs = s; bt = t; out[1] = bary[0]; out[2] = bary[1]; out[3] = bary[2]; out[4] = bary[3]; }
    }
    out[0] = bt;
    return out;
  };
}

function tetBary(x, tets, t, px, py, pz, out) {
  const i0 = tets[4 * t], i1 = tets[4 * t + 1], i2 = tets[4 * t + 2], i3 = tets[4 * t + 3];
  const ox = x[3 * i0], oy = x[3 * i0 + 1], oz = x[3 * i0 + 2];
  const ax = x[3 * i1] - ox, ay = x[3 * i1 + 1] - oy, az = x[3 * i1 + 2] - oz;
  const bx = x[3 * i2] - ox, by = x[3 * i2 + 1] - oy, bz = x[3 * i2 + 2] - oz;
  const cx = x[3 * i3] - ox, cy = x[3 * i3 + 1] - oy, cz = x[3 * i3 + 2] - oz;
  const qx = px - ox, qy = py - oy, qz = pz - oz;
  const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  const u = (qx * (by * cz - bz * cy) - qy * (bx * cz - bz * cx) + qz * (bx * cy - by * cx)) / det;
  const v = (ax * (qy * cz - qz * cy) - ay * (qx * cz - qz * cx) + az * (qx * cy - qy * cx)) / det;
  const w = (ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)) / det;
  out[0] = 1 - u - v - w; out[1] = u; out[2] = v; out[3] = w;
}
