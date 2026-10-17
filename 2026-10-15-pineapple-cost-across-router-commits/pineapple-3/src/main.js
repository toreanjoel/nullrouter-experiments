// Boot: build the body, start WebGPU (or show the fallback), run the fixed 60 Hz loop.
const APP = { B: null, S: null, INC: null, acc: 0, last: -1 };
const STEP = 1 / SIM.hz;

async function main() {
  const mesh = buildTetMesh();
  const B = createBody(mesh);
  APP.B = B;
  APP.S = buildSurface(mesh);
  APP.INC = buildInclusions(mesh);
  initLights();
  updateCamera(1.4);
  initPanel(B);
  initKeys(B);
  initReadouts(B);
  actReset(B);

  const canvas = document.getElementById('gl');
  let ok = false;
  try { ok = await gpuInit(canvas); } catch (err) { console.error(err); }
  if (!ok) { showFallback(); return; }
  gpuCreateMeshBuffers(B, APP.S, APP.INC);
  passesInit();
  initInput(canvas, B, APP.S);

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    const cap = 2.6e6, px = w * h;
    if (px > cap) { const k = Math.sqrt(cap / px); w = Math.round(w * k); h = Math.round(h * k); }
    if (w === G.w && h === G.h && G.ready) return;
    canvas.width = w; canvas.height = h;
    gpuResize(w, h);
    updateCamera(canvas.clientWidth / Math.max(1, canvas.clientHeight));
    passesResize();
    G.ready = true;
  };
  new ResizeObserver(fit).observe(canvas);
  fit();
  requestAnimationFrame(frame);
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!G.ready) return;
  const B = APP.B;
  const dt = APP.last < 0 ? STEP : Math.min((now - APP.last) / 1000, 0.1);
  APP.last = now;
  inputFrame(B, APP.S);
  if (!UI.paused) {
    APP.acc += dt;
    let n = 0;
    while (APP.acc >= STEP && n < 4) { stepBody(B, UI.slow ? STEP / 4 : STEP); APP.acc -= STEP; n++; }
    if (n === 4) APP.acc = 0;
    FRAME.time += dt;
  }
  renderFrame(B, APP.S, APP.INC);
  updateReadouts(B, now);
}

main();
