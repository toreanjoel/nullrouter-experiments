const TINTS = [
  { name: 'Golden', swatch: '#e7a726', absorb: [0.38, 1.25, 4.0], glow: [1.0, 0.72, 0.22] },
  { name: 'Amber', swatch: '#c8661a', absorb: [0.55, 1.9, 4.8], glow: [1.0, 0.48, 0.10] },
  { name: 'Rosé', swatch: '#df8790', absorb: [0.40, 2.1, 1.35], glow: [1.0, 0.45, 0.55] },
];
const $ = id => document.getElementById(id);

function ringIconPath() {
  let d = '';
  for (let i = 0; i <= 140; i++) { const th = TAU * i / 140, r = outerR(th) * 10.5; d += (i ? 'L' : 'M') + (r * Math.cos(th)).toFixed(2) + ' ' + (r * Math.sin(th)).toFixed(2); }
  const h = R_IN * 10.5;
  return d + `ZM${h} 0A${h} ${h} 0 1 0 ${-h} 0A${h} ${h} 0 1 0 ${h} 0Z`;
}

(async function main() {
  const canvas = $('gl');
  const sim = createSim();
  const surf = createSurface(sim);
  const inc = createInclusions(sim);
  const rp = new Float64Array(sim.np * 3);
  let R;
  try { R = await createRenderer(canvas, sim, surf, inc); }
  catch (e) { console.error(e); $('why').textContent = String(e.message || e).slice(0, 400); document.body.classList.add('nogpu'); return; }

  // ---------- state
  const S = { tint: 0, paused: false, slow: false, mesh: false, acc: 0, alpha: 1, frame: 0, last: performance.now() };
  const cam = { yaw: 0, pitch: 0.64, dist: 6.5, tx: 0, ty: 0.15, tz: 0, eye: new Float64Array(3), fwd: new Float64Array(3), right: new Float64Array(3) };
  const M = { view: new Float32Array(16), proj: new Float32Array(16), vp: new Float32Array(16), ivp: new Float64Array(16),
    lview: new Float32Array(16), lproj: new Float32Array(16), lvp: new Float32Array(16) };
  const KEY = (() => { const l = Math.hypot(-0.45, 1, 0.35); return [-0.45 / l, 1 / l, 0.35 / l]; })();
  const LD = 10, LRANGE = 10, LHALF = 2.9;
  let cssW = 1, cssH = 1, dpr = 1;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = Math.max(1, canvas.clientWidth); cssH = Math.max(1, canvas.clientHeight);
    const scale = Math.min(dpr, Math.sqrt(3.2e6 / (cssW * cssH)));
    const w = Math.max(1, Math.round(cssW * scale)), h = Math.max(1, Math.round(cssH * scale));
    canvas.width = w; canvas.height = h;
    R.resize(w, h);
  }
  new ResizeObserver(layout).observe(canvas);
  layout();

  function updateCamera() {
    const aspect = cssW / cssH, fov = 0.56;
    const panel = document.querySelector('.panel');
    const desktop = window.innerWidth > 760;
    const freeW = desktop ? cssW - panel.offsetWidth - 40 : cssW;
    const fit = 1.75 / (Math.tan(fov / 2) * (freeW / cssH));
    const dist = Math.max(cam.dist, fit);
    const cp = Math.cos(cam.pitch);
    const e = cam.eye;
    e[0] = cam.tx + dist * Math.sin(cam.yaw) * cp; e[1] = cam.ty + dist * Math.sin(cam.pitch); e[2] = cam.tz + dist * Math.cos(cam.yaw) * cp;
    lookAt(M.view, e[0], e[1], e[2], cam.tx, cam.ty, cam.tz);
    const shift = desktop ? (panel.offsetWidth + 40) / cssW : 0;   // centre the ring in the free area
    perspective(M.proj, fov, aspect, 0.1, 60, shift);
    mul4(M.vp, M.proj, M.view);
    invert4(M.ivp, M.vp);
    cam.fwd[0] = -M.view[2]; cam.fwd[1] = -M.view[6]; cam.fwd[2] = -M.view[10];
    cam.right[0] = M.view[0]; cam.right[1] = M.view[4]; cam.right[2] = M.view[8];
  }

  function writeUniforms() {
    const u = R.uData, c = sim.computeCom();
    const cx = c[0], cz = c[2];
    lookAt(M.lview, cx + KEY[0] * LD, 0.25 + KEY[1] * LD, cz + KEY[2] * LD, cx, 0.25, cz);
    ortho(M.lproj, -LHALF, LHALF, -LHALF, LHALF, LD - LRANGE / 2, LD + LRANGE / 2);
    mul4(M.lvp, M.lproj, M.lview);
    u.set(M.vp, 0); u.set(M.lvp, 16);
    u.fill(0, 32, 48);   // height map: x,z → clip xy, y → depth
    u[32] = 1 / 3; u[44] = -cx / 3; u[41] = 1 / 3; u[45] = -cz / 3; u[38] = 1 / 8; u[46] = 1 / 8; u[47] = 1;
    u[48] = cam.eye[0]; u[49] = cam.eye[1]; u[50] = cam.eye[2]; u[51] = performance.now() / 1000;
    u[52] = KEY[0]; u[53] = KEY[1]; u[54] = KEY[2]; u[55] = 1.6;
    const t = TINTS[S.tint];
    u[56] = t.absorb[0]; u[57] = t.absorb[1]; u[58] = t.absorb[2]; u[60] = t.glow[0]; u[61] = t.glow[1]; u[62] = t.glow[2];
    u[64] = canvas.width; u[65] = canvas.height; u[66] = 1 / canvas.width; u[67] = 1 / canvas.height;
    u[68] = 0.7; u[69] = S.frame % 64; u[70] = LRANGE; u[71] = cx * KEY[0] + 0.25 * KEY[1] + cz * KEY[2];
  }

  // ---------- picking
  const ray = { ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: 0 };
  function setRay(px, py) {
    const x = px / cssW * 2 - 1, y = 1 - py / cssH * 2, m = M.ivp;
    const un = (z, o) => { const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      o[0] = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w; o[1] = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w; o[2] = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w; };
    const a = [0, 0, 0], b = [0, 0, 0]; un(0, a); un(1, b);
    const l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    ray.ox = a[0]; ray.oy = a[1]; ray.oz = a[2]; ray.dx = (b[0] - a[0]) / l; ray.dy = (b[1] - a[1]) / l; ray.dz = (b[2] - a[2]) / l;
  }
  function project(x, y, z, o) {
    const m = M.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    o[0] = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * 0.5 + 0.5) * cssW;
    o[1] = (0.5 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / w * 0.5) * cssH;
  }
  // Ray hits the surface → grab there. Otherwise check where the ray crosses the ring's mid-plane:
  // through the empty hole only the inner edge is offered, outside only the outer edge, within a few pixels.
  function pick(px, py) {
    setRay(px, py);
    const h = surf.raycast(ray.ox, ray.oy, ray.oz, ray.dx, ray.dy, ray.dz);
    if (h) return [h.x, h.y, h.z];
    const n = [0, 0, 0]; sim.bodyNormal(n); const c = sim.com;
    const dn = ray.dx * n[0] + ray.dy * n[1] + ray.dz * n[2];
    let zone = 'any';
    if (Math.abs(dn) > 0.08) {
      const t = ((c[0] - ray.ox) * n[0] + (c[1] - ray.oy) * n[1] + (c[2] - ray.oz) * n[2]) / dn;
      const rr = Math.hypot(ray.ox + ray.dx * t - c[0], ray.oy + ray.dy * t - c[1], ray.oz + ray.dz * t - c[2]);
      zone = rr < R_IN ? 'inner' : rr > R_OUT - 0.1 ? 'outer' : 'any';
    }
    const tol = zone === 'inner' ? 12 : 24, s = [0, 0];   // the hole is small on screen: only grab right at its rim
    let best = -1, bd = tol * tol;
    for (let i = 0; i < sim.np; i++) {
      const rr = Math.hypot(sim.X[i * 3], sim.X[i * 3 + 2]);
      if (zone === 'inner' && rr > R_IN + 0.05) continue;
      if (zone === 'outer' && rr < R_OUT - 0.12) continue;
      project(sim.x[i * 3], sim.x[i * 3 + 1], sim.x[i * 3 + 2], s);
      const d = (s[0] - px) ** 2 + (s[1] - py) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best < 0 ? null : [sim.x[best * 3], sim.x[best * 3 + 1], sim.x[best * 3 + 2]];
  }

  // ---------- pointer handling
  const ptrs = new Map();
  let mode = null, plane = null, twistAngle0 = 0, twistBase = 0;
  const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const twoAngle = () => { const [a, b] = [...ptrs.values()]; return Math.atan2(b[1] - a[1], b[0] - a[0]); };
  function dragTo(px, py) {
    setRay(px, py);
    const n = cam.fwd, dn = ray.dx * n[0] + ray.dy * n[1] + ray.dz * n[2];
    if (Math.abs(dn) < 1e-4) return;
    const t = ((plane[0] - ray.ox) * n[0] + (plane[1] - ray.oy) * n[1] + (plane[2] - ray.oz) * n[2]) / dn;
    sim.setGrabTarget(ray.ox + ray.dx * t, ray.oy + ray.dy * t, ray.oz + ray.dz * t);
  }
  canvas.addEventListener('pointerdown', e => {
    const p = local(e);
    ptrs.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic or already released */ }
    if (ptrs.size === 2 && mode === 'grab') { twistAngle0 = twoAngle(); twistBase = sim.grab.twist; mode = 'twist'; return; }
    if (ptrs.size > 1) return;
    const hit = pick(p[0], p[1]);
    if (hit) {
      sim.beginGrab(hit[0], hit[1], hit[2], cam.fwd[0], cam.fwd[1], cam.fwd[2]);
      plane = hit; mode = 'grab'; canvas.classList.add('grabbing');
    } else mode = 'orbit';
  });
  canvas.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), p = local(e);
    ptrs.set(e.pointerId, p);
    if (mode === 'twist' && ptrs.size === 2) { sim.grab.twist = twistBase - (twoAngle() - twistAngle0); return; }
    if (mode === 'grab') dragTo(p[0], p[1]);
    else if (mode === 'orbit') {
      cam.yaw -= (p[0] - prev[0]) * 0.006;
      cam.pitch = Math.min(1.25, Math.max(0.18, cam.pitch + (p[1] - prev[1]) * 0.005));
    }
  });
  const up = e => {
    if (!ptrs.delete(e.pointerId)) return;
    if (mode === 'twist') { mode = 'grab'; const [p] = [...ptrs.values()]; if (p) dragTo(p[0], p[1]); return; }
    if (ptrs.size === 0) { if (mode === 'grab') sim.endGrab(); mode = null; canvas.classList.remove('grabbing'); }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (sim.isGrabbing()) sim.grab.twist += e.deltaY * 0.004;
    else cam.dist = Math.min(11, Math.max(3.6, cam.dist * Math.exp(e.deltaY * 0.001)));
  }, { passive: false });

  // ---------- panel
  const icon = ringIconPath();
  $('swatches').innerHTML = TINTS.map((t, i) => `<button class="swatch" data-i="${i}" aria-pressed="${i === 0}" title="${t.name}">
    <svg viewBox="-16 -16 32 32" aria-hidden="true"><path d="${icon}" fill="${t.swatch}" fill-rule="evenodd" stroke="#1d1a16" stroke-width=".7"/>
    <circle r="${(R_IN + 0.2) * 10.5}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.6"/></svg>${t.name}</button>`).join('');
  $('swatches').addEventListener('click', e => {
    const b = e.target.closest('.swatch'); if (!b) return;
    S.tint = +b.dataset.i;
    for (const s of $('swatches').children) s.setAttribute('aria-pressed', s === b);
    $('tintName').textContent = TINTS[S.tint].name;
  });
  const firm = $('firm'), damp = $('damp');
  const applySliders = () => {
    const f = firm.value / 100, d = damp.value / 100;
    sim.P.shapeA = Math.exp(Math.log(900) + (Math.log(90) - Math.log(900)) * f);
    sim.P.edgeDamp = 0.4 + 30 * Math.pow(d, 1.6);
    $('firmOut').textContent = firm.value; $('dampOut').textContent = damp.value;
  };
  firm.addEventListener('input', applySliders); damp.addEventListener('input', applySliders); applySliders();
  const setPaused = v => { S.paused = v; $('bPause').firstChild.textContent = v ? 'Resume ' : 'Pause '; };
  const turn = () => sim.turnOver(cam.right[0], cam.right[2]);
  const reset = () => { sim.reset(); S.acc = 0; };
  $('bNudge').onclick = () => sim.nudge();
  $('bFlip').onclick = turn;
  $('bReset').onclick = reset;
  $('bPause').onclick = () => setPaused(!S.paused);
  $('cMesh').onchange = e => { S.mesh = e.target.checked; };
  $('cSlow').onchange = e => { S.slow = e.target.checked; };
  window.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Space') { e.preventDefault(); if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); setPaused(!S.paused); }
    else if (e.code === 'KeyN') sim.nudge();
    else if (e.code === 'KeyT') turn();
    else if (e.code === 'KeyR') reset();
  });
  $('rMass').innerHTML = `${(surf.restVolume * G_PER_UNIT3).toFixed(1)}<small>g</small>`;
  $('colophon').textContent = `XPBD · ${sim.nt.toLocaleString('en')} tets · ${sim.np} nodes · 60 Hz × ${SUBSTEPS} · 1 unit ≈ 3 cm · 1.3 g/cm³`;
  const rVol = $('rVol'), rKin = $('rKin');

  // ---------- frame loop (no per-frame allocation in sim, skinning or uniforms)
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
    if (!S.paused) {
      S.acc += dt * (S.slow ? 0.25 : 1);
      let n = 0;
      while (S.acc >= DT && n < 4) { sim.step(); S.acc -= DT; n++; }
      if (n === 4) S.acc = 0;
      S.alpha = S.acc / DT;
    }
    sim.interp(S.alpha, rp);
    surf.update(rp);
    inc.update(rp);
    updateCamera();
    writeUniforms();
    R.draw(S.mesh, rp);
    if (S.frame++ % 8 === 0) {
      rVol.innerHTML = `${(surf.volume() / surf.restVolume * 100).toFixed(1)}<small>%</small>`;
      rKin.innerHTML = `${(sim.kinetic() * G_PER_UNIT3 * 1e-3 * 9e-4 * 1e6).toFixed(1)}<small>µJ</small>`;
    }
  }
  requestAnimationFrame(frame);
})();
