const DT = 1 / 60;
const LIGHT = { dir: [0, 0, 0], vp: m4.create(), hvp: m4.create(), color: [2.45, 2.36, 2.2], exposure: 0.44 };
let canvasEl, acc = 0, last = -1, frameNo = 0, cssW = 0, cssH = 0;

function lightInit() {
  const l = Math.hypot(-0.5, 1, 0.62);
  LIGHT.dir[0] = -0.5 / l; LIGHT.dir[1] = 1 / l; LIGHT.dir[2] = 0.62 / l;
  const view = m4.create(), proj = m4.create();
  m4.lookAt(view, LIGHT.dir[0] * 10, LIGHT.dir[1] * 10 + 0.25, LIGHT.dir[2] * 10, 0, 0.25, 0, 0, 1, 0);
  m4.ortho(proj, -2.8, 2.8, -2.8, 2.8, 1, 20);
  m4.mul(LIGHT.vp, proj, view);
  m4.lookAt(view, 0, HEIGHT_MIN_Y, 0, 0, 0, 0, 0, 0, -1);
  m4.ortho(proj, -3, 3, -3, 3, 0, 4);
  m4.mul(LIGHT.hvp, proj, view);
}
const HEIGHT_MIN_Y = -1;

function checkResize() {
  const w = canvasEl.clientWidth, h = canvasEl.clientHeight;
  if (w === cssW && h === cssH && G.tex.msColor) return;
  cssW = w; cssH = h;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
  const max = 2.4e6;
  if (pw * ph > max) { const s = Math.sqrt(max / (pw * ph)); pw = Math.round(pw * s); ph = Math.round(ph * s); }
  if (gpuResize(pw, ph)) bindGroupsResize();
  cameraUpdate(pw, ph, window.innerWidth > 760);
}

function fillUniforms(t) {
  const tint = TINTS[STATE.tint];
  FU.set(CAM.vp, 0); FU.set(CAM.ivp, 16); FU.set(LIGHT.vp, 32); FU.set(LIGHT.hvp, 48);
  FU[64] = CAM.eye[0]; FU[65] = CAM.eye[1]; FU[66] = CAM.eye[2]; FU[67] = t;
  FU[68] = LIGHT.dir[0]; FU[69] = LIGHT.dir[1]; FU[70] = LIGHT.dir[2]; FU[71] = 0.8;
  FU[72] = LIGHT.color[0]; FU[73] = LIGHT.color[1]; FU[74] = LIGHT.color[2]; FU[75] = 1;
  FU[76] = tint.absorb[0]; FU[77] = tint.absorb[1]; FU[78] = tint.absorb[2]; FU[79] = 1.0;
  FU[80] = tint.scatter[0]; FU[81] = tint.scatter[1]; FU[82] = tint.scatter[2]; FU[83] = 0.85;
  for (let k = 0; k < 3; k++) FU[84 + k] = 0.1 + 0.5 * Math.exp(-tint.absorb[k] * 0.55) * tint.scatter[k];
  FU[87] = 1;
  FU[88] = G.w; FU[89] = G.h; FU[90] = LIGHT.exposure; FU[91] = frameNo;
  FU[92] = BODY[0]; FU[93] = BODY[1]; FU[94] = BODY[2]; FU[95] = 0;
  FU[96] = BODY[3]; FU[97] = BODY[4]; FU[98] = BODY[5]; FU[99] = 0;
}

function frame(t) {
  requestAnimationFrame(frame);
  if (last < 0) last = t;
  const dt = Math.min((t - last) / 1000, 0.1);
  last = t;
  checkResize();
  if (!STATE.paused) {
    acc += dt * (STATE.slow ? 0.25 : 1);
    let n = 0;
    while (acc >= DT && n < 3) { grabTargets(); simStep(DT); acc -= DT; n++; }
    if (acc >= DT) acc = 0;
  }
  simInterpolate(STATE.paused ? 1 : acc / DT);
  simBody();
  skinSurface();
  skinInclusions();
  hoverUpdate(canvasEl);
  fillUniforms(t / 1000);
  renderFrame(STATE.mesh);
  if (frameNo % 8 === 0) readouts();
  frameNo++;
}

async function main() {
  uiInit();
  canvasEl = $('view');
  const err = await gpuInit(canvasEl);
  if (err) { showFallback(err); return; }
  const mesh = buildTetMesh();
  simInit(mesh);
  grabInit();
  skinInit(buildSurface(mesh), buildInclusions(mesh));
  lightInit();
  gpuBuffers(mesh);
  pipelinesInit();
  passesInit();
  pointerInit(canvasEl);
  simInterpolate(1);
  simBody();
  requestAnimationFrame(frame);
}

main().catch(e => { console.error(e); showFallback(String(e && e.message || e)); });
