// The specimen's rest shape: a scalloped annulus, extruded and bevelled. y is the thickness axis.
const SHAPE = {
  outer: 1.36,
  hole: 0.5,
  thick: 0.5,
  bevel: 0.12,
  scallops: 14,
  scallopDepth: 0.05,
};

// Outer radius at angle th: 14 rounded lobes reaching SHAPE.outer, softened notches between them.
function outerRadius(th) {
  const c = Math.cos(SHAPE.scallops * 0.5 * th);
  const e = 0.02;
  const b = (Math.sqrt(c * c + e) - Math.sqrt(e)) / (Math.sqrt(1 + e) - Math.sqrt(e));
  return SHAPE.outer - SHAPE.scallopDepth * (1 - b);
}

// Rest height of the body's centre above the floor at reset.
const DROP_HEIGHT = SHAPE.thick * 0.5 + 0.35;
