// Owns the GPU buffers and the frame uniform; uploads the body each frame and encodes the passes:
// skin → shadow + height → scene → back faces → jelly (+ mesh) → tone map.
const LIGHT_DIR = (() => { const v = [-0.5, 0.85, -0.55], l = Math.hypot(...v); return v.map(c => c / l); })();
const KEY_COLOR = [1.62, 1.56, 1.46];

const Renderer = {
  frame: new Float32Array(96), // layout mirrors `Frame` in common.wgsl
  lightVP: new Float32Array(16), heightVP: new Float32Array(16),
  inc: null, instData: null, passes: null, cmds: [null],
};

function initRenderer(tm, surf, inc, body) {
  const R = Renderer, S = GPUBufferUsage.STORAGE, U = GPUBufferUsage.UNIFORM, I = GPUBufferUsage.INDEX;
  R.inc = inc;
  R.nV = surf.nV; R.nIdx = surf.index.length; R.nInst = inc.n;
  R.frameBuf = gpuEmpty(R.frame.byteLength, U, 'frame');
  R.physBuf = gpuBuffer(body.posF32, S, 'phys');
  R.tetBuf = gpuBuffer(Uint32Array.from(tm.tets), S, 'tets');
  R.embedBuf = gpuBuffer(new Uint8Array(surf.embBuf), S, 'embed');
  R.restBuf = gpuBuffer(surf.rest, S, 'rest');
  R.skinPos = gpuEmpty(16 * surf.nV, S, 'skinPos');
  R.skinNrm = gpuEmpty(16 * surf.nV, S, 'skinNrm');
  R.surfIdx = gpuBuffer(surf.index, I, 'surfIdx');
  R.edgeIdx = gpuBuffer(tm.bedges, I, 'edgeIdx'); R.nEdgeIdx = tm.bedges.length;
  R.instData = new Float32Array(16 * inc.n);
  R.instBuf = gpuBuffer(R.instData, S, 'inst');

  const view = new Float32Array(16), proj = new Float32Array(16);
  const L = LIGHT_DIR;
  M4.lookAt(view, [L[0] * 8, L[1] * 8, L[2] * 8], [0, 0, 0], [0, 1, 0]);
  M4.ortho(proj, -3.2, 3.2, -3.2, 3.2, 1, 16);
  M4.mul(R.lightVP, proj, view);
  M4.lookAt(view, [0, -0.05, 0], [0, 1, 0], [0, 0, 1]);
  M4.ortho(proj, -3, 3, -3, 3, 0, 4);
  M4.mul(R.heightVP, proj, view);
  R.shadowVPBuf = gpuBuffer(R.lightVP, U, 'shadowVP');
  R.heightVPBuf = gpuBuffer(R.heightVP, U, 'heightVP');

  const f = R.frame;
  f.set(R.lightVP, 16); f.set(R.heightVP, 32);
  f[52] = L[0]; f[53] = L[1]; f[54] = L[2];
  f[89] = surf.normalSign; f[90] = surf.nTh; f[91] = surf.nP;
  f[92] = KEY_COLOR[0]; f[93] = KEY_COLOR[1]; f[94] = KEY_COLOR[2];

  const skin = createSkinPass(R), depth = createDepthPasses(R), scene = createScenePass(R);
  const back = createBackPass(R), jelly = createJellyPass(R), tone = createTonemapPass(R);
  R.passes = { skin, depth, scene, back, jelly, tone };
}

function rendererResize() {
  const P = Renderer.passes;
  P.scene.resize(); P.back.resize(); P.jelly.resize(); P.tone.resize();
}

// Juice cells and bubbles: rebuild each instance's axes from its three embedded points.
function updateInstances(body) {
  const { idx, w, kind, n } = Renderer.inc, out = Renderer.instData, x = body.x, T = body.tets;
  for (let i = 0; i < n; i++) {
    const o = 16 * i;
    for (let k = 0; k < 3; k++) {
      const e = 12 * i + 4 * k, t = 4 * idx[e], b1 = w[e + 1], b2 = w[e + 2], b3 = w[e + 3], b0 = 1 - b1 - b2 - b3;
      const a = 3 * T[t], b = 3 * T[t + 1], c = 3 * T[t + 2], d = 3 * T[t + 3];
      for (let j = 0; j < 3; j++) out[o + 4 * k + j] = b0 * x[a + j] + b1 * x[b + j] + b2 * x[c + j] + b3 * x[d + j];
    }
    // out[o..2] = centre, out[o+4..6] = radial end, out[o+8..10] = vertical end → axes X, Y, Z and centre.
    const cx = out[o], cy = out[o + 1], cz = out[o + 2];
    const Xx = out[o + 4] - cx, Xy = out[o + 5] - cy, Xz = out[o + 6] - cz;
    let Yx = out[o + 8] - cx, Yy = out[o + 9] - cy, Yz = out[o + 10] - cz;
    const lx = Math.sqrt(Xx * Xx + Xy * Xy + Xz * Xz) + 1e-9, nx = Xx / lx, ny = Xy / lx, nz = Xz / lx;
    const dp = nx * Yx + ny * Yy + nz * Yz;
    Yx -= nx * dp; Yy -= ny * dp; Yz -= nz * dp;
    const Zx = ny * Yz - nz * Yy, Zy = nz * Yx - nx * Yz, Zz = nx * Yy - ny * Yx; // |Z| = |Y|
    out[o] = Xx; out[o + 1] = Xy; out[o + 2] = Xz; out[o + 3] = 0;
    out[o + 4] = Yx; out[o + 5] = Yy; out[o + 6] = Yz; out[o + 7] = 0;
    out[o + 8] = Zx; out[o + 9] = Zy; out[o + 10] = Zz; out[o + 11] = 0;
    out[o + 12] = cx; out[o + 13] = cy; out[o + 14] = cz; out[o + 15] = kind[i];
  }
}

function renderFrame(body, view) {
  const R = Renderer, f = R.frame, q = GPU.device.queue, c = Camera;
  f.set(c.viewProj, 0);
  f[48] = c.eye[0]; f[49] = c.eye[1]; f[50] = c.eye[2];
  f[56] = view.tint.abs[0]; f[57] = view.tint.abs[1]; f[58] = view.tint.abs[2];
  f[60] = view.scatter[0]; f[61] = view.scatter[1]; f[62] = view.scatter[2]; f[63] = view.exposure;
  const rot = body.rot;
  f[64] = rot[0]; f[65] = rot[1]; f[66] = rot[2];
  f[68] = rot[3]; f[69] = rot[4]; f[70] = rot[5];
  f[72] = rot[6]; f[73] = rot[7]; f[74] = rot[8];
  f[76] = body.com[0]; f[77] = body.com[1]; f[78] = body.com[2];
  f[80] = body.restCom[0]; f[81] = body.restCom[1]; f[82] = body.restCom[2];
  f[84] = GPU.width; f[85] = GPU.height; f[86] = 1 / GPU.width; f[87] = 1 / GPU.height;
  f[88] = view.showMesh ? 1 : 0;
  q.writeBuffer(R.frameBuf, 0, f);
  q.writeBuffer(R.physBuf, 0, body.posF32);
  updateInstances(body);
  q.writeBuffer(R.instBuf, 0, R.instData);

  const enc = GPU.device.createCommandEncoder(), P = R.passes;
  P.skin.encode(enc);
  P.depth.encode(enc);
  P.scene.encode(enc);
  P.back.encode(enc);
  P.jelly.encode(enc, view.showMesh);
  P.tone.encode(enc);
  R.cmds[0] = enc.finish();
  q.submit(R.cmds);
}
