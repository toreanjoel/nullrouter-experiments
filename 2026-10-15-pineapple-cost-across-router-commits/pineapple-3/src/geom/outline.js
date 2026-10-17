// Scalloped outer edge: 14 shallow arcs with softened cusps (mirrored in common.wgsl).
function outerRadius(theta) {
  let u = (theta / (2 * Math.PI)) * RING.scallops;
  u -= Math.floor(u);
  const s = Math.sin(Math.PI * u), e = RING.scallopSoft;
  const b = (Math.sqrt(s * s + e * e) - e) / (Math.sqrt(1 + e * e) - e);
  return RING.R - RING.scallopDepth * (1 - b);
}

// True when (x, z) lies inside the scalloped annulus, `margin` in from both edges.
function inAnnulus(x, z, margin) {
  const r = Math.hypot(x, z);
  return r > RING.hole + margin && r < outerRadius(Math.atan2(z, x)) - margin;
}
