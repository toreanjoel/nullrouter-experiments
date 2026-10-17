const RING = { R: 1.36, r: 0.5, T: 0.5, bevel: 0.12, lobes: 14, notch: 0.055, h: 0.15, layers: 3 };

// Scalloped outer radius: rounded lobes meeting in shallow notches.
function outerR(th) {
  const s = 1 - Math.abs(Math.sin(RING.lobes * 0.5 * th));
  return RING.R - RING.notch * s * s;
}

function outerRDeriv(th) {
  const e = 1e-4;
  return (outerR(th + e) - outerR(th - e)) / (2 * e);
}

// 2D points (x, z) of the annulus: outline samples, hole samples, then a hex lattice.
function buildPoints() {
  const h = RING.h, pts = [];
  const nO = RING.lobes * Math.max(4, Math.round(2 * Math.PI * RING.R / (0.72 * h) / RING.lobes));
  for (let k = 0; k < nO; k++) {
    const th = k * 2 * Math.PI / nO, r = outerR(th);
    pts.push(r * Math.cos(th), r * Math.sin(th));
  }
  const nI = Math.round(2 * Math.PI * RING.r / (0.75 * h));
  for (let k = 0; k < nI; k++) {
    const th = (k + 0.5) * 2 * Math.PI / nI;
    pts.push(RING.r * Math.cos(th), RING.r * Math.sin(th));
  }
  const dz = h * Math.sqrt(3) / 2, n = Math.ceil(RING.R / dz) + 1;
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const x = (i + (j & 1) * 0.5) * h, z = j * dz;
      const r = Math.hypot(x, z), th = Math.atan2(z, x);
      if (r > RING.r + 0.6 * h && r < outerR(th) - 0.6 * h) pts.push(x, z);
    }
  }
  return new Float64Array(pts);
}

function insideAnnulus(x, z) {
  const r = Math.hypot(x, z);
  return r > RING.r && r < outerR(Math.atan2(z, x));
}
