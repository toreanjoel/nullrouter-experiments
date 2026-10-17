// Juice cells (radial ellipsoids) and air bubbles, placed in rest space and bound to tets so they ride with the flesh.
function buildInclusions(mesh) {
  const rnd = mulberry32(12);
  const items = [];
  const nCells = 96, nBubbles = 14;
  let tries = 0;
  while (items.length < nCells && tries++ < 5000) {
    const th = rnd() * Math.PI * 2, rho = 0.7 + rnd() * 0.46, y = 0.13 + rnd() * 0.24;
    const L = 0.07 + rnd() * 0.06, W = 0.018 + rnd() * 0.016, H = 0.016 + rnd() * 0.012;
    const x = rho * Math.cos(th), z = rho * Math.sin(th);
    if (items.some(o => Math.hypot(o.x - x, (o.y - y) * 1.6, o.z - z) < 0.11)) continue;
    const tilt = (rnd() - 0.5) * 0.35, c = Math.cos(th + tilt), s = Math.sin(th + tilt);
    const lift = (rnd() - 0.5) * 0.25;
    items.push({ x, y, z, kind: 0,
      ax: [c * L, lift * L, s * L], ay: [-s * W, 0, c * W], az: [-lift * c * H, H, -lift * s * H] });
  }
  for (let b = 0; b < nBubbles; b++) {
    const th = rnd() * Math.PI * 2, rho = 0.64 + rnd() * 0.58, y = 0.1 + rnd() * 0.3, r = 0.014 + rnd() * 0.026;
    items.push({ x: rho * Math.cos(th), y, z: rho * Math.sin(th), kind: 1, ax: [r, 0, 0], ay: [0, r, 0], az: [0, 0, r] });
  }
  const n = items.length;
  const idx4 = new Uint32Array(n * 4), w4 = new Float32Array(n * 4), tet = new Uint32Array(n);
  const axes = new Float32Array(n * 9), kind = new Float32Array(n);
  items.forEach((o, i) => {
    tet[i] = bindPoint(mesh, o.x, o.y, o.z, idx4, w4, i * 4);
    axes.set(o.ax, i * 9); axes.set(o.ay, i * 9 + 3); axes.set(o.az, i * 9 + 6);
    kind[i] = o.kind;
  });
  return { n, idx4, w4, tet, axes, kind };
}
