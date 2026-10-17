// Per frame: skin the surface, place the inclusions, write uniforms and encode the six passes.
const FRAME = { submit: [null], overlay: false, tint: 0, time: 0 };

function passesInit() {
  PassShadow.init();
  PassHeight.init();
  PassScene.init();
  PassBack.init();
  PassOverlay.init();
  PassJelly.init();
  PassTonemap.init();
}

function passesResize() {
  PassScene.resize();
  PassBack.resize();
  PassJelly.resize();
  PassTonemap.resize();
}

function writeUniforms(B) {
  const u = G.uData, L = LIGHT.dir, t = TINTS[FRAME.tint].rgb;
  u.set(CAM.viewProj, 0);
  u.set(CAM.invViewProj, 16);
  u.set(LIGHT.viewProj, 32);
  u.set(LIGHT.heightVP, 48);
  u.set(B.rot4, 64);
  u[80] = CAM.eye[0]; u[81] = CAM.eye[1]; u[82] = CAM.eye[2]; u[83] = 1;
  u[84] = L[0]; u[85] = L[1]; u[86] = L[2]; u[87] = 0.09;
  u[88] = t[0]; u[89] = t[1]; u[90] = t[2]; u[91] = FRAME.tint;
  u[92] = G.w; u[93] = G.h; u[94] = 1 / G.w; u[95] = 1 / G.h;
  u[96] = FRAME.time; u[97] = EXPOSURE; u[98] = FRAME.overlay ? 0.32 : 0; u[99] = HEIGHT_HALF;
  u[100] = LIGHT.near; u[101] = LIGHT.far; u[102] = LIGHT.half; u[103] = 1 / SHADOW_SIZE;
  G.device.queue.writeBuffer(G.ubuf, 0, u);
}

function renderFrame(B, S, inc) {
  skinSurface(B, S);
  updateInclusions(B, inc);
  bodyFrame(B);
  writeUniforms(B);
  const q = G.device.queue;
  q.writeBuffer(G.surfVB, 0, S.vbuf);
  q.writeBuffer(G.instVB, 0, inc.inst);
  if (FRAME.overlay) q.writeBuffer(G.physVB, 0, B.x);
  const enc = G.device.createCommandEncoder();
  PassShadow.encode(enc);
  PassHeight.encode(enc);
  PassScene.encode(enc);
  PassBack.encode(enc);
  PassJelly.encode(enc, FRAME.overlay);
  PassTonemap.encode(enc);
  FRAME.submit[0] = enc.finish();
  q.submit(FRAME.submit);
}
