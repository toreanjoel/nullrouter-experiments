// Boot: check WebGPU, build the specimen, wire input and UI, then run the fixed 60 Hz loop.
(async function main() {
  const canvas = document.getElementById('gl');
  let ok = false;
  try { ok = await initGPU(canvas); } catch (err) { console.error(err); }
  if (!ok) { showFallback(); return; }
  GPU.device.lost.then(info => { console.error('WebGPU device lost:', info.message); showFallback(); });

  const tm = buildTetMesh();
  const embed = makeEmbedder(tm);
  const surf = buildSurface(embed);
  const inc = buildInclusions(embed);
  const body = new SoftBody(tm);
  initRenderer(tm, surf, inc, body);
  setupInteraction(canvas, body);
  setupUI(body);

  const STEP = 1 / 60, MAX_STEPS = 3;
  let last = performance.now(), acc = 0, frameNo = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!View.paused) {
      acc += dt * (View.slow ? 0.25 : 1);
      let n = 0;
      while (acc >= STEP && n < MAX_STEPS) { body.step(STEP); acc -= STEP; n++; }
      if (n === MAX_STEPS) acc = 0;
    }
    body.updateFrame();
    if (resizeTargets()) rendererResize();
    Camera.update(GPU.width / GPU.height);
    renderFrame(body, View);
    if ((frameNo++ & 7) === 0) updateReadouts(body);
  }
  requestAnimationFrame(frame);
})();
