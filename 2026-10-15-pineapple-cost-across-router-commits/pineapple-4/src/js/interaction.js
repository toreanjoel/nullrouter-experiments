// Pointer, wheel and touch input. The pick ray is tested against the body's surface triangles, so a
// ray through the empty hole hits nothing; a near miss of an edge (within a few pixels) still grabs it.
// A hit starts the soft patch grab dragged on a camera-facing plane; the wheel or a second finger
// twists the patch. Anywhere else, dragging orbits and the wheel zooms.
function setupInteraction(canvas, body) {
  const O = new Float64Array(3), D = new Float64Array(3), hit = new Float64Array(3);
  const planeP = new Float64Array(3), planeN = new Float64Array(3);
  const pts = new Map();
  let grabId = null, orbitId = null, twistId = null, twist0 = 0, ang0 = 0;

  function rayAt(cx, cy) {
    const r = canvas.getBoundingClientRect();
    Camera.ray(((cx - r.left) / r.width) * 2 - 1, 1 - ((cy - r.top) / r.height) * 2, O, D);
  }

  // Möller–Trumbore against every surface triangle; nearest hit wins.
  function pickSurface() {
    const x = body.x, F = body.bfaces;
    let best = Infinity;
    for (let f = 0; f < F.length; f += 3) {
      const a = 3 * F[f], b = 3 * F[f + 1], c = 3 * F[f + 2];
      const e1x = x[b] - x[a], e1y = x[b + 1] - x[a + 1], e1z = x[b + 2] - x[a + 2];
      const e2x = x[c] - x[a], e2y = x[c + 1] - x[a + 1], e2z = x[c + 2] - x[a + 2];
      const px = D[1] * e2z - D[2] * e2y, py = D[2] * e2x - D[0] * e2z, pz = D[0] * e2y - D[1] * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-12) continue;
      const inv = 1 / det, sx = O[0] - x[a], sy = O[1] - x[a + 1], sz = O[2] - x[a + 2];
      const u = (sx * px + sy * py + sz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
      const v = (D[0] * qx + D[1] * qy + D[2] * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 1e-4 && t < best) best = t;
    }
    if (best === Infinity) return false;
    for (let k = 0; k < 3; k++) hit[k] = O[k] + D[k] * best;
    return true;
  }

  // Fallback for rays that just miss a silhouette: nearest surface vertex within 12 CSS px.
  function pickNear(cx, cy) {
    const r = canvas.getBoundingClientRect(), M = Camera.viewProj, x = body.x;
    const mx = cx - r.left, my = cy - r.top;
    let best = -1, bestD = 144;
    for (let i = 0; i < body.N; i++) {
      if (!body.onSurface[i]) continue;
      const X = x[3 * i], Y = x[3 * i + 1], Z = x[3 * i + 2];
      const w = M[3] * X + M[7] * Y + M[11] * Z + M[15];
      if (w <= 0) continue;
      const sx = ((M[0] * X + M[4] * Y + M[8] * Z + M[12]) / w * 0.5 + 0.5) * r.width;
      const sy = (0.5 - (M[1] * X + M[5] * Y + M[9] * Z + M[13]) / w * 0.5) * r.height;
      const d2 = (sx - mx) ** 2 + (sy - my) ** 2;
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    if (best < 0) return false;
    hit[0] = x[3 * best]; hit[1] = x[3 * best + 1]; hit[2] = x[3 * best + 2];
    return true;
  }

  function dragTo(cx, cy) {
    rayAt(cx, cy);
    const den = D[0] * planeN[0] + D[1] * planeN[1] + D[2] * planeN[2];
    if (Math.abs(den) < 1e-6) return;
    const t = ((planeP[0] - O[0]) * planeN[0] + (planeP[1] - O[1]) * planeN[1] + (planeP[2] - O[2]) * planeN[2]) / den;
    if (t <= 0) return;
    body.setGrabTarget(O[0] + D[0] * t, O[1] + D[1] * t, O[2] + D[2] * t);
  }

  function fingerAngle() {
    const a = pts.get(grabId), b = pts.get(twistId);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  function release(id) {
    pts.delete(id);
    if (id === grabId) {
      body.endGrab();
      grabId = null; twistId = null;
      canvas.classList.remove('grabbing');
    } else if (id === twistId) twistId = null;
    if (id === orbitId) orbitId = null;
  }

  canvas.addEventListener('pointerdown', e => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    if (grabId === null && orbitId === null) {
      rayAt(e.clientX, e.clientY);
      if (pickSurface() || pickNear(e.clientX, e.clientY)) {
        grabId = e.pointerId;
        planeP.set(hit); planeN.set(Camera.fwd);
        body.beginGrab(hit[0], hit[1], hit[2], Camera.fwd[0], Camera.fwd[1], Camera.fwd[2]);
        canvas.classList.add('grabbing');
      } else orbitId = e.pointerId;
    } else if (grabId !== null && twistId === null) {
      twistId = e.pointerId; twist0 = body.grab.twist; ang0 = fingerAngle();
    }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (twistId !== null && (e.pointerId === twistId || e.pointerId === grabId)) body.setTwist(twist0 + fingerAngle() - ang0);
    if (e.pointerId === grabId) dragTo(e.clientX, e.clientY);
    else if (e.pointerId === orbitId) {
      Camera.yaw -= dx * 0.006;
      Camera.pitch = clamp(Camera.pitch + dy * 0.004, 0.2, 1.25);
    }
  });

  canvas.addEventListener('pointerup', e => release(e.pointerId));
  canvas.addEventListener('pointercancel', e => release(e.pointerId));

  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (grabId !== null) body.setTwist(body.grab.twist + e.deltaY * 0.003);
    else Camera.zoom = clamp(Camera.zoom * Math.exp(e.deltaY * 0.001), 0.55, 1.8);
  }, { passive: false });
}
