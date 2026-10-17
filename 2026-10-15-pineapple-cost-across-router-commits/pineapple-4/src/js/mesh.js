// Builds the ring: the scalloped-annulus tet mesh for physics, the bevelled render surface,
// the embedding of surface points in the tets, and the juice cells and bubbles.
const RING = { R: 1.36, r: 0.5, T: 0.5, bevel: 0.12, scallops: 14, scallopDepth: 0.05, h: 0.17, layers: 2 };

// Outer edge radius at angle th: 14 shallow humps with softened cusps (mirrored in zones.wgsl).
function outerRadius(th) {
  const s = Math.abs(Math.sin(RING.scallops * 0.5 * th)), e = 0.03, se = Math.sqrt(e);
  const hump = (Math.sqrt(s * s + e) - se) / (Math.sqrt(1 + e) - se);
  return RING.R - RING.scallopDepth * (1 - hump);
}

function tetVolume(x, a, b, c, d) {
  a *= 3; b *= 3; c *= 3; d *= 3;
  const e1x = x[b] - x[a], e1y = x[b + 1] - x[a + 1], e1z = x[b + 2] - x[a + 2];
  const e2x = x[c] - x[a], e2y = x[c + 1] - x[a + 1], e2z = x[c + 2] - x[a + 2];
  const e3x = x[d] - x[a], e3y = x[d + 1] - x[a + 1], e3z = x[d + 2] - x[a + 2];
  return (e1x * (e2y * e3z - e2z * e3y) + e1y * (e2z * e3x - e2x * e3z) + e1z * (e2x * e3y - e2y * e3x)) / 6;
}

// Bowyer–Watson Delaunay triangulation; returns CCW index triples.
function delaunay(px, py) {
  const n = px.length;
  const X = px.concat([-20, 20, 0]), Y = py.concat([-20, -20, 20]);
  const tri = (a, b, c) => {
    const ax = X[a], ay = Y[a], bx = X[b], by = Y[b], cx = X[c], cy = Y[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    if (d < 0) [b, c] = [c, b];
    return { a, b, c, x: ux, y: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  };
  let tris = [tri(n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const x = X[i], y = Y[i], keep = [], edges = new Map();
    for (const t of tris) {
      if ((x - t.x) ** 2 + (y - t.y) ** 2 < t.r2) {
        for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
          const k = Math.min(u, v) * 65536 + Math.max(u, v);
          if (edges.has(k)) edges.delete(k); else edges.set(k, [u, v]);
        }
      } else keep.push(t);
    }
    for (const [u, v] of edges.values()) keep.push(tri(u, v, i));
    tris = keep;
  }
  return tris.filter(t => t.a < n && t.b < n && t.c < n).map(t => [t.a, t.b, t.c]);
}

// 2D Delaunay of the scalloped annulus (outline samples plus a hex lattice, hole skipped),
// extruded into prism layers, each prism split into 3 tets with a rule that keeps shared faces conforming.
function buildTetMesh() {
  const { r, T, h, layers: L } = RING;
  const rng = mulberry32(7);
  const jit = () => (rng() - 0.5) * 2e-4;
  const px = [], py = [];
  const nOut = RING.scallops * 4, nIn = 20;
  for (let i = 0; i < nOut; i++) {
    const th = (i / nOut) * 2 * Math.PI, ro = outerRadius(th);
    px.push(ro * Math.cos(th) + jit()); py.push(ro * Math.sin(th) + jit());
  }
  for (let i = 0; i < nIn; i++) {
    const th = ((i + 0.5) / nIn) * 2 * Math.PI;
    px.push(r * Math.cos(th) + jit()); py.push(r * Math.sin(th) + jit());
  }
  const dy = (h * Math.sqrt(3)) / 2;
  for (let j = -12; j <= 12; j++) {
    for (let i = -12; i <= 12; i++) {
      const x = (i + (j & 1) * 0.5) * h, y = j * dy, rr = Math.hypot(x, y);
      if (rr < r + 0.55 * h || rr > outerRadius(Math.atan2(y, x)) - 0.55 * h) continue;
      px.push(x + (rng() - 0.5) * 0.02 * h); py.push(y + (rng() - 0.5) * 0.02 * h);
    }
  }
  const tri2 = delaunay(px, py).filter(([a, b, c]) => {
    const cx = (px[a] + px[b] + px[c]) / 3, cy = (py[a] + py[b] + py[c]) / 3, rc = Math.hypot(cx, cy);
    return rc > r && rc < outerRadius(Math.atan2(cy, cx));
  });

  const n2 = px.length, N = n2 * (L + 1);
  const rest = new Float64Array(3 * N);
  for (let l = 0; l <= L; l++) {
    for (let k = 0; k < n2; k++) {
      const i = l * n2 + k;
      rest[3 * i] = px[k]; rest[3 * i + 1] = -T / 2 + (l * T) / L; rest[3 * i + 2] = py[k];
    }
  }

  // Tet index = (triangle * L + layer) * 3 + k; the embedder relies on this order.
  const M = tri2.length * L * 3;
  const tets = new Int32Array(4 * M);
  let m = 0;
  for (const t of tri2) {
    const [a, b, c] = t.slice().sort((p, q) => p - q);
    for (let l = 0; l < L; l++) {
      const a0 = a + l * n2, b0 = b + l * n2, c0 = c + l * n2, A = a0 + n2, B = b0 + n2, C = c0 + n2;
      for (const q of [[a0, b0, c0, A], [b0, c0, A, B], [c0, A, B, C]]) {
        if (tetVolume(rest, q[0], q[1], q[2], q[3]) < 0) [q[2], q[3]] = [q[3], q[2]];
        tets.set(q, 4 * m++);
      }
    }
  }

  const edgeMap = new Map(), faceMap = new Map();
  const ekey = (a, b) => (a < b ? a * 100000 + b : b * 100000 + a);
  for (let t = 0; t < M; t++) {
    const v = tets.subarray(4 * t, 4 * t + 4);
    for (const [i, j] of [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]]) edgeMap.set(ekey(v[i], v[j]), [v[i], v[j]]);
    for (const [i, j, k] of [[1, 2, 3], [0, 3, 2], [0, 1, 3], [0, 2, 1]]) {
      const f = [v[i], v[j], v[k]], s = f.slice().sort((p, q) => p - q);
      const key = (s[0] * 100000 + s[1]) * 100000 + s[2];
      const e = faceMap.get(key);
      if (e) e.count++; else faceMap.set(key, { f, count: 1 });
    }
  }
  const edges = Int32Array.from([...edgeMap.values()].flat());
  const bf = [], bedgeMap = new Map();
  for (const { f, count } of faceMap.values()) {
    if (count !== 1) continue;
    bf.push(...f);
    for (const [i, j] of [[0, 1], [1, 2], [2, 0]]) bedgeMap.set(ekey(f[i], f[j]), [f[i], f[j]]);
  }
  return {
    N, M, n2, L, rest, tets, tri2, px, py, edges,
    bfaces: Int32Array.from(bf),
    bedges: Uint32Array.from([...bedgeMap.values()].flat()),
  };
}

// Returns embed(x, y, z, idx, w, o): finds the rest-space tet holding the point (or the nearest one,
// extrapolating) and writes its index to idx[o] and barycentrics b1..b3 to w[o+1..o+3].
function makeEmbedder(tm) {
  const { rest, tets, tri2, px, py, L } = tm, T = RING.T;
  const G = 20, lo = -1.6, cs = 3.2 / G;
  const cellOf = v => clamp(Math.floor((v - lo) / cs), 0, G - 1);
  const cells = Array.from({ length: G * G }, () => []);
  tri2.forEach(([a, b, c], ti) => {
    const x0 = cellOf(Math.min(px[a], px[b], px[c])), x1 = cellOf(Math.max(px[a], px[b], px[c]));
    const z0 = cellOf(Math.min(py[a], py[b], py[c])), z1 = cellOf(Math.max(py[a], py[b], py[c]));
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) cells[gz * G + gx].push(ti);
  });
  const bary2Min = (ti, x, z) => {
    const [a, b, c] = tri2[ti];
    const ax = px[a], az = py[a], bx = px[b], bz = py[b], cx = px[c], cz = py[c];
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
    const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
    return Math.min(l1, l2, 1 - l1 - l2);
  };
  const b = new Float64Array(4);
  const bary3 = (t, x, y, z) => {
    const a = 3 * tets[4 * t], i1 = 3 * tets[4 * t + 1], i2 = 3 * tets[4 * t + 2], i3 = 3 * tets[4 * t + 3];
    const e1x = rest[i1] - rest[a], e1y = rest[i1 + 1] - rest[a + 1], e1z = rest[i1 + 2] - rest[a + 2];
    const e2x = rest[i2] - rest[a], e2y = rest[i2 + 1] - rest[a + 1], e2z = rest[i2 + 2] - rest[a + 2];
    const e3x = rest[i3] - rest[a], e3y = rest[i3 + 1] - rest[a + 1], e3z = rest[i3 + 2] - rest[a + 2];
    const qx = x - rest[a], qy = y - rest[a + 1], qz = z - rest[a + 2];
    const det3 = (ux, uy, uz, vx, vy, vz, wx, wy, wz) => ux * (vy * wz - vz * wy) + uy * (vz * wx - vx * wz) + uz * (vx * wy - vy * wx);
    const det = det3(e1x, e1y, e1z, e2x, e2y, e2z, e3x, e3y, e3z);
    b[1] = det3(qx, qy, qz, e2x, e2y, e2z, e3x, e3y, e3z) / det;
    b[2] = det3(e1x, e1y, e1z, qx, qy, qz, e3x, e3y, e3z) / det;
    b[3] = det3(e1x, e1y, e1z, e2x, e2y, e2z, qx, qy, qz) / det;
    b[0] = 1 - b[1] - b[2] - b[3];
    return Math.min(b[0], b[1], b[2], b[3]);
  };
  return function embed(x, y, z, idx, w, o) {
    const gx = cellOf(x), gz = cellOf(z);
    let best = -1, bestMin = -Infinity;
    for (let rad = 0; rad <= 2 && bestMin < -1e-9; rad++) {
      for (let dz = -rad; dz <= rad; dz++) {
        for (let dx = -rad; dx <= rad; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
          const cx = gx + dx, cz = gz + dz;
          if (cx < 0 || cz < 0 || cx >= G || cz >= G) continue;
          for (const ti of cells[cz * G + cx]) {
            const mn = bary2Min(ti, x, z);
            if (mn > bestMin) { bestMin = mn; best = ti; }
          }
        }
      }
    }
    const l = clamp(Math.floor((y + T / 2) / (T / L)), 0, L - 1);
    let bm = -Infinity;
    for (let k = 0; k < 3; k++) {
      const t = (best * L + l) * 3 + k, mn = bary3(t, x, y, z);
      if (mn > bm) { bm = mn; idx[o] = t; w[o + 1] = b[1]; w[o + 2] = b[2]; w[o + 3] = b[3]; }
    }
  };
}

// Bevelled render surface: a torus-like grid of (angle × cross-section profile). The profile is a
// rounded rectangle (bevel 0.12) from the hole wall to the scalloped rim, so both faces match.
function buildSurface(embed) {
  const { r, T, bevel: b } = RING, hy = T / 2;
  const nTh = RING.scallops * 16;
  const segs = [[0, 22], [1, 6], [2, 4], [3, 6], [4, 22], [5, 6], [6, 4], [7, 6]];
  const prof = [];
  for (const [s, k] of segs) for (let i = 0; i < k; i++) prof.push([s, i / k]);
  const nP = prof.length, nV = nTh * nP;
  const rest = new Float32Array(4 * nV);
  const embBuf = new ArrayBuffer(16 * nV), embU = new Uint32Array(embBuf), embF = new Float32Array(embBuf);
  const H = Math.PI / 2;
  for (let i = 0; i < nTh; i++) {
    const th = (i / nTh) * 2 * Math.PI, ro = outerRadius(th), c = Math.cos(th), s = Math.sin(th);
    for (let j = 0; j < nP; j++) {
      const [seg, a] = prof[j];
      let rho, y, phi;
      switch (seg) {
        case 0: rho = r + b + a * (ro - r - 2 * b); y = hy; break;
        case 1: phi = H - a * H; rho = ro - b + b * Math.cos(phi); y = hy - b + b * Math.sin(phi); break;
        case 2: rho = ro; y = hy - b - a * (T - 2 * b); break;
        case 3: phi = -a * H; rho = ro - b + b * Math.cos(phi); y = -hy + b + b * Math.sin(phi); break;
        case 4: rho = ro - b - a * (ro - r - 2 * b); y = -hy; break;
        case 5: phi = -H - a * H; rho = r + b + b * Math.cos(phi); y = -hy + b + b * Math.sin(phi); break;
        case 6: rho = r; y = -hy + b + a * (T - 2 * b); break;
        default: phi = Math.PI - a * H; rho = r + b + b * Math.cos(phi); y = hy - b + b * Math.sin(phi);
      }
      const v = i * nP + j, x = rho * c, z = rho * s;
      rest[4 * v] = x; rest[4 * v + 1] = y; rest[4 * v + 2] = z;
      embed(x, y, z, embU, embF, 4 * v);
    }
  }
  // Orient triangles outward: check the grid normal on the top face.
  const P = (i, j) => 4 * (((i + nTh) % nTh) * nP + ((j + nP) % nP));
  const j0 = 11, a = P(1, j0), bb = P(-1, j0), c1 = P(0, j0 + 1), c0 = P(0, j0 - 1);
  const dIx = rest[a] - rest[bb], dIz = rest[a + 2] - rest[bb + 2];
  const dJx = rest[c1] - rest[c0], dJz = rest[c1 + 2] - rest[c0 + 2];
  const normalSign = dIz * dJx - dIx * dJz > 0 ? 1 : -1;
  const index = new Uint32Array(nV * 6);
  let k = 0;
  for (let i = 0; i < nTh; i++) {
    const i1 = (i + 1) % nTh;
    for (let j = 0; j < nP; j++) {
      const j1 = (j + 1) % nP;
      const v00 = i * nP + j, v10 = i1 * nP + j, v01 = i * nP + j1, v11 = i1 * nP + j1;
      if (normalSign > 0) index.set([v00, v10, v11, v00, v11, v01], k);
      else index.set([v00, v11, v10, v00, v01, v11], k);
      k += 6;
    }
  }
  return { nTh, nP, nV, rest, embBuf, index, normalSign };
}

// Juice cells (elongated sacs along the radius) and air bubbles, each tracked by three embedded
// points: centre, radial axis end and vertical axis end, so they stretch and turn with the flesh.
function buildInclusions(embed) {
  const rng = mulberry32(31);
  const nCells = 54, nBub = 10, n = nCells + nBub;
  const idx = new Int32Array(12 * n), w = new Float64Array(12 * n), kind = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const bubble = i >= nCells;
    const th = rng() * 2 * Math.PI, ro = outerRadius(th);
    const rad = bubble ? 0.014 + rng() * 0.022 : 0.022 + rng() * 0.02;
    const hl = bubble ? rad : 0.06 + rng() * 0.07;
    const lo = RING.r + 0.07 + hl, hi = ro - 0.08 - hl;
    const rho = lo + rng() * (hi - lo);
    const y = (rng() - 0.5) * (RING.T - 2 * (0.1 + rad));
    const c = Math.cos(th), s = Math.sin(th);
    embed(rho * c, y, rho * s, idx, w, 12 * i);
    embed((rho + hl) * c, y, (rho + hl) * s, idx, w, 12 * i + 4);
    embed(rho * c, y + rad, rho * s, idx, w, 12 * i + 8);
    kind[i] = bubble ? 1 : 0;
  }
  return { n, idx, w, kind };
}
