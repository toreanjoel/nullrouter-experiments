// Static scene geometry: the studio cyclorama sweep and a unit sphere for cells and bubbles.
function buildCyclorama() {
  // Profile in (z, y): floor → quarter-circle cove → back wall. Extruded along x.
  const prof = [];
  for (let k = 0; k <= 12; k++) { const z = 14 - (19 * k) / 12; prof.push([z, 0, 0, 1]); }
  const R = 5;
  for (let k = 1; k <= 16; k++) {
    const a = (k / 16) * (Math.PI / 2);
    prof.push([-5 - R * Math.sin(a), R - R * Math.cos(a), Math.sin(a), Math.cos(a)]);
  }
  for (let k = 1; k <= 4; k++) prof.push([-10, 5 + (11 * k) / 4, 1, 0]);
  const nx = 24, verts = [], idx = [];
  for (let i = 0; i <= nx; i++) {
    const x = -16 + (32 * i) / nx;
    for (const [z, y, nz, ny] of prof) verts.push(x, y, z, 0, ny, nz);
  }
  const np = prof.length;
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < np - 1; j++) {
      const a = i * np + j, b = (i + 1) * np + j;
      idx.push(a, b, b + 1, a, b + 1, a + 1);
    }
  }
  return { verts: new Float32Array(verts), idx: new Uint32Array(idx) };
}

function buildSphere(nu, nv) {
  const verts = [], idx = [];
  for (let j = 0; j <= nv; j++) {
    const t = (j / nv) * Math.PI;
    for (let i = 0; i <= nu; i++) {
      const p = (i / nu) * Math.PI * 2;
      // x is the long axis of the ellipsoid.
      verts.push(Math.cos(t), Math.sin(t) * Math.cos(p), Math.sin(t) * Math.sin(p));
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + nu + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { verts: new Float32Array(verts), idx: new Uint16Array(idx) };
}
