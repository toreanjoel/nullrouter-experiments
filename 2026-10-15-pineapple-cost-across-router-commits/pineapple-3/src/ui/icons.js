// Tiny pineapple-ring icon for the tint swatches: scalloped disc with a hole, inline SVG.
function ringIconSVG(fill) {
  const c = 18, k = 16 / RING.R, n = 140;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const th = (2 * Math.PI * i) / n, r = outerRadius(th) * k;
    d += (i ? 'L' : 'M') + (c + r * Math.cos(th)).toFixed(2) + ' ' + (c + r * Math.sin(th)).toFixed(2);
  }
  const h = RING.hole * k;
  d += `Z M${c + h} ${c} A${h} ${h} 0 1 0 ${c - h} ${c} A${h} ${h} 0 1 0 ${c + h} ${c}Z`;
  const core = (RING.hole + 0.2) * k;
  return `<svg viewBox="0 0 36 36" aria-hidden="true"><path d="${d}" fill="${fill}" fill-rule="evenodd" stroke="#1d1b17" stroke-width=".7"/>` +
    `<circle cx="${c}" cy="${c}" r="${core}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="2.2"/></svg>`;
}
