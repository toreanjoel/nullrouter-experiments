// Wiring: build the specimen, start WebGPU, handle grab / twist / orbit input and run the fixed-step loop.
const GRAMS_PER_UNIT3 = 27 * 1.3;          // 1 unit = 3 cm, 1.3 g/cm³
const MICROJ_PER_KE = GRAMS_PER_UNIT3 * 1e-3 * 0.03 * 0.03 * 1e6;
const REACH = 2.4;

async function main() {
  const canvas = document.getElementById('gl');
  let gpu;
  try { gpu = await initGPU(canvas); } catch (e) { showFallback(e.message); return; }
  gpu.device.lost.then((info) => showFallback('The GPU device was lost: ' + (info.message || info.reason)));

  const rnd = mulberry32(12);
  const mesh = buildTetMesh();
  const locate = makeTetLocator(mesh);
  const body = createBody(mesh);
  const surf = buildSurface(mesh, locate);
  const incl = buildInclusions(locate, rnd);
  updateSurface(surf, body); updateInclusions(incl, body);

  let R;
  try { R = createRenderer(gpu, surf, incl, body); } catch (e) { showFallback(e.message); return; }
  const cam = R.cam;

  const ui = createUI({
    setFirmness: (v) => { body.firmness = v; },
    setDamping: (v) => { body.damping = v; },
    nudge: () => { nudge(body, rnd); ui.say('Nudged.'); },
    turnOver: () => { endGrab(); turnOver(body, cam.right[0], cam.right[2]); ui.say('Over it goes.'); },
    reset: () => { endGrab(); resetBody(body); acc = 0; },
  });

  // Canvas size follows its box, capped for fill rate.
  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const s = Math.min(1, Math.sqrt(3.2e6 / (w * h)));
    w = Math.max(1, Math.floor(w * s)); h = Math.max(1, Math.floor(h * s));
    canvas.width = w; canvas.height = h;
    R.resize(w, h);
    R.updateCamera();
  };
  new ResizeObserver(fit).observe(canvas);
  fit();

  // ---- Input -------------------------------------------------------------
  const ro = new Float64Array(3), rd = new Float64Array(3), c = new Float64Array(3);
  const pointers = new Map();
  let mode = null, grabId = -1, twistId = -1, twistAngle = 0, lastX = 0, lastY = 0;
  const plane = { p: new Float64Array(3), n: new Float64Array(3) };
  let hover = null;

  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const ray = (x, y) => R.rayAt(x, y, canvas.clientWidth, canvas.clientHeight, ro, rd);

  function endGrab() {
    body.grab.active = false; mode = null; grabId = -1; twistId = -1;
    canvas.classList.remove('grabbing');
  }

  function dragTo(x, y) {
    ray(x, y);
    const den = rd[0] * plane.n[0] + rd[1] * plane.n[1] + rd[2] * plane.n[2];
    if (Math.abs(den) < 1e-5) return;
    const t = ((plane.p[0] - ro[0]) * plane.n[0] + (plane.p[1] - ro[1]) * plane.n[1] + (plane.p[2] - ro[2]) * plane.n[2]) / den;
    if (t <= 0) return;
    const T = body.grab.target;
    for (let k = 0; k < 3; k++) T[k] = ro[k] + rd[k] * t;
    // Bounded reach: the held patch can lead the body, not leave it behind.
    bodyCentroid(body, c);
    const dx = T[0] - c[0], dy = T[1] - c[1], dz = T[2] - c[2], l = Math.hypot(dx, dy, dz);
    if (l > REACH) { const s = REACH / l; T[0] = c[0] + dx * s; T[1] = c[1] + dy * s; T[2] = c[2] + dz * s; }
    T[1] = Math.min(Math.max(T[1], 0.02), 3.2);
  }

  const pairAngle = () => {
    const a = pointers.get(grabId), b = pointers.get(twistId);
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };

  canvas.addEventListener('pointerdown', (e) => {
    const p = local(e);
    pointers.set(e.pointerId, p);
    canvas.setPointerCapture(e.pointerId);
    if (mode === 'grab' && twistId < 0) { twistId = e.pointerId; twistAngle = pairAngle(); return; }
    if (mode) return;
    ray(p[0], p[1]);
    const hit = pickSurface(surf, body, ro, rd);
    if (hit.hit && beginGrab(body, hit.rest, hit.p, cam.fwd)) {
      mode = 'grab'; grabId = e.pointerId;
      plane.p.set(hit.p); plane.n.set(cam.fwd);
      canvas.classList.add('grabbing');
      const rr = Math.hypot(hit.rest[0], hit.rest[2]);
      ui.say(rr < SHAPE.hole + 0.2 ? 'Holding the inner edge.' : rr > 1.1 ? 'Holding the outer edge.' : 'Holding the flesh.');
    } else {
      mode = 'orbit'; grabId = e.pointerId;
      canvas.classList.add('orbit');
      if (hit.hole) ui.say('Through the hole — nothing to hold there.');
    }
    lastX = p[0]; lastY = p[1];
  });

  canvas.addEventListener('pointermove', (e) => {
    const p = local(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p);
    if (mode === 'grab') {
      if (e.pointerId === grabId) dragTo(p[0], p[1]);
      if (twistId >= 0 && pointers.has(twistId) && pointers.has(grabId)) {
        const a = pairAngle();
        let d = a - twistAngle;
        if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI;
        body.grab.twist += d; twistAngle = a;
      }
    } else if (mode === 'orbit' && e.pointerId === grabId) {
      cam.yaw -= (p[0] - lastX) * 0.006;
      cam.pitch = Math.min(1.35, Math.max(0.1, cam.pitch + (p[1] - lastY) * 0.005));
      lastX = p[0]; lastY = p[1];
    } else if (!mode) {
      hover = p;
    }
  });

  const release = (e) => {
    pointers.delete(e.pointerId);
    if (e.pointerId === twistId) { twistId = -1; return; }
    if (e.pointerId === grabId) {
      if (mode === 'grab') endGrab();
      mode = null; grabId = -1;
      canvas.classList.remove('orbit');
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => { hover = null; canvas.classList.remove('can-grab'); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (mode === 'grab') body.grab.twist += d * 0.004;
    else cam.dist = Math.min(11, Math.max(3.6, cam.dist * Math.exp(d * 0.001)));
  }, { passive: false });

  // ---- Loop ----------------------------------------------------------------
  const stats = { volume: 1, ke: 0 };
  const massG = body.restVolume * GRAMS_PER_UNIT3;
  const renderOpts = { tint: ui.tint, time: 0, exposure: 1.0, showMesh: false };
  let acc = 0, last = performance.now(), lastRead = 0, dirty = true;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!ui.paused) {
      acc += dt * (ui.slow ? 0.25 : 1);
      let n = 0;
      while (acc >= STEP && n < 4) { stepBody(body); acc -= STEP; n++; }
      if (n === 4) acc = 0;
      if (n) dirty = true;
    }
    if (dirty) { updateSurface(surf, body); updateInclusions(incl, body); dirty = false; }
    // Camera drifts after the specimen so a toss never carries it out of frame (not while holding it).
    if (mode !== 'grab') {
      bodyCentroid(body, c);
      cam.target[0] += (c[0] - cam.target[0]) * 0.03;
      cam.target[2] += (c[2] - cam.target[2]) * 0.03;
    }
    if (hover && !mode) {
      ray(hover[0], hover[1]);
      canvas.classList.toggle('can-grab', pickSurface(surf, body, ro, rd).hit);
      hover = null;
    }
    renderOpts.tint = ui.tint; renderOpts.time = now / 1000; renderOpts.showMesh = ui.showMesh;
    R.render(renderOpts);
    if (now - lastRead > 200) {
      bodyStats(body, stats);
      ui.readouts(massG, stats.volume, stats.ke * MICROJ_PER_KE);
      lastRead = now;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
