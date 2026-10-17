// ---------- matrices (column-major)
function perspective(o, fovy, aspect, near, far, shift) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  o.fill(0); o[0] = f / aspect; o[5] = f; o[8] = shift; o[10] = far * nf; o[11] = -1; o[14] = far * near * nf;
}
function ortho(o, l, r, b, t, n, f) {
  o.fill(0); o[0] = 2 / (r - l); o[5] = 2 / (t - b); o[10] = 1 / (n - f); o[12] = -(r + l) / (r - l); o[13] = -(t + b) / (t - b); o[14] = n / (n - f); o[15] = 1;
}
function lookAt(o, ex, ey, ez, tx, ty, tz) {
  let zx = ex - tx, zy = ey - ty, zz = ez - tz; let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = zz, xy = 0, xz = -zx; l = Math.hypot(xx, xz); xx /= l; xz /= l;   // up = +y
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0; o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0; o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
  o[12] = -(xx * ex + xy * ey + xz * ez); o[13] = -(yx * ex + yy * ey + yz * ez); o[14] = -(zx * ex + zy * ey + zz * ez); o[15] = 1;
}
function mul4(o, a, b) {
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++)
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
}
function invert4(o, m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7];
  const a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const id = 1 / (b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06);
  o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * id; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * id;
  o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * id; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * id;
  o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * id; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * id;
  o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * id; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * id;
  o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * id; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * id;
  o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * id; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * id;
  o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * id; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * id;
  o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * id; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * id;
}

// ---------- static meshes
function cycloramaMesh() {   // floor curving up into a back wall
  const prof = [];
  prof.push([14, 0, 0, 1], [0, 0, 0, 1], [-5, 0, 0, 1]);
  for (let i = 1; i <= 16; i++) { const a = (Math.PI / 2) * i / 16; prof.push([-5 - 4 * Math.sin(a), 4 - 4 * Math.cos(a), Math.sin(a), Math.cos(a)]); }
  prof.push([-9, 18, 1, 0]);
  const xs = [-18, -6, 6, 18], v = [], idx = [];
  for (const [z, y, nz, ny] of prof) for (const x of xs) v.push(x, y, z, 0, ny, nz);
  for (let j = 0; j < prof.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
    const a = j * xs.length + i, b = a + 1, c = a + xs.length, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  return { v: new Float32Array(v), i: new Uint32Array(idx) };
}
function sphereMesh(nu = 16, nv = 10) {
  const v = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const t = Math.PI * j / nv, p = TAU * i / nu; v.push(Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p));
  }
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1; idx.push(a, b, c, b, d, c);
  }
  return { v: new Float32Array(v), i: new Uint32Array(idx) };
}

// ---------- renderer
async function createRenderer(canvas, sim, surf, inc) {
  if (!navigator.gpu) throw new Error('navigator.gpu is not available');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('no WebGPU adapter');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });

  device.pushErrorScope('validation');
  const module = device.createShaderModule({ code: WGSL });
  const info = await module.getCompilationInfo();
  const errs = info.messages.filter(m => m.type === 'error');
  if (errs.length) throw new Error('WGSL: ' + errs.map(m => `${m.lineNum}:${m.linePos} ${m.message}`).join('\n'));

  const GPUB = GPUBufferUsage, GPUT = GPUTextureUsage, VS = GPUShaderStage.VERTEX, FS = GPUShaderStage.FRAGMENT;
  const buf = (data, usage) => { const b = device.createBuffer({ size: Math.ceil(data.byteLength / 4) * 4, usage: usage | GPUB.COPY_DST }); device.queue.writeBuffer(b, 0, data); return b; };

  const uData = new Float32Array(72);
  const ubuf = device.createBuffer({ size: uData.byteLength, usage: GPUB.UNIFORM | GPUB.COPY_DST });
  const jellyVB = device.createBuffer({ size: surf.vb.byteLength, usage: GPUB.VERTEX | GPUB.COPY_DST });
  const restVB = buf(surf.rest, GPUB.VERTEX);
  const jellyIB = buf(surf.idx, GPUB.INDEX);
  const cyc = cycloramaMesh(), cycVB = buf(cyc.v, GPUB.VERTEX), cycIB = buf(cyc.i, GPUB.INDEX);
  const sph = sphereMesh(), sphVB = buf(sph.v, GPUB.VERTEX), sphIB = buf(sph.i, GPUB.INDEX);
  const instVB = device.createBuffer({ size: inc.data.byteLength, usage: GPUB.VERTEX | GPUB.COPY_DST });
  const lineVB = device.createBuffer({ size: sim.np * 12, usage: GPUB.VERTEX | GPUB.COPY_DST });
  const lineIB = buf(sim.lines, GPUB.INDEX);
  const lineF32 = new Float32Array(sim.np * 3);

  const bgl0 = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: VS | FS, buffer: { type: 'uniform' } },
    { binding: 1, visibility: FS, sampler: { type: 'filtering' } },
    { binding: 2, visibility: FS, sampler: { type: 'comparison' } }] });
  const tex = (binding, sampleType = 'float') => ({ binding, visibility: FS, texture: { sampleType } });
  const bglScene = device.createBindGroupLayout({ entries: [tex(0, 'depth'), tex(1), tex(2)] });
  const bglJelly = device.createBindGroupLayout({ entries: [tex(0, 'depth'), tex(1), tex(3), tex(4, 'unfilterable-float')] });
  const bglTone = device.createBindGroupLayout({ entries: [tex(5, 'unfilterable-float')] });
  const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });
  const plScene = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglScene] });
  const plJelly = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglJelly] });
  const plTone = device.createPipelineLayout({ bindGroupLayouts: [bgl0, bglTone] });

  const linear = device.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const cmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
  const g0 = device.createBindGroup({ layout: bgl0, entries: [{ binding: 0, resource: { buffer: ubuf } }, { binding: 1, resource: linear }, { binding: 2, resource: cmp }] });

  const jellyBuffers = [
    { arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] },
    { arrayStride: 12, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }] }];
  const HDR = 'rgba16float', MS = { count: 4 };
  const pipe = (o) => device.createRenderPipeline({
    layout: o.layout || pl0,
    vertex: { module, entryPoint: o.vs, buffers: o.buffers || [] },
    fragment: { module, entryPoint: o.fs, targets: [{ format: o.format || HDR, writeMask: o.writeMask ?? 0xF, blend: o.blend }] },
    primitive: { topology: o.topology || 'triangle-list', cullMode: o.cull || 'none' },
    depthStencil: o.depth ? { format: o.depth, depthWriteEnabled: o.dwrite ?? true, depthCompare: o.dcmp || 'less', depthBias: o.bias || 0, depthBiasSlopeScale: o.bias ? 2 : 0 } : undefined,
    multisample: o.ms ? MS : undefined,
  });
  const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
  const ALPHA = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
  const P = {
    shadowDepth: pipe({ vs: 'vs_shadow', fs: 'fs_shadow', buffers: jellyBuffers, format: 'r16float', writeMask: 0, depth: 'depth32float', bias: 2 }),
    shadowThick: pipe({ vs: 'vs_shadow', fs: 'fs_shadow', buffers: jellyBuffers, format: 'r16float', blend: ADD, depth: 'depth32float', dwrite: false, dcmp: 'always' }),
    height: pipe({ vs: 'vs_height', fs: 'fs_height', buffers: jellyBuffers, format: 'r16float', depth: 'depth24plus' }),
    cyc: pipe({ layout: plScene, vs: 'vs_cyc', fs: 'fs_cyc', ms: true, depth: 'depth24plus',
      buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }] }),
    cell: pipe({ layout: plScene, vs: 'vs_cell', fs: 'fs_cell', ms: true, depth: 'depth24plus', buffers: [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 64, stepMode: 'instance', attributes: [0, 1, 2, 3].map(k => ({ shaderLocation: k + 1, offset: k * 16, format: 'float32x4' })) }] }),
    back: pipe({ vs: 'vs_jelly', fs: 'fs_back', buffers: jellyBuffers, cull: 'front', depth: 'depth32float', dcmp: 'greater' }),
    bg: pipe({ layout: plJelly, vs: 'vs_full', fs: 'fs_bg', ms: true, depth: 'depth24plus', dwrite: false, dcmp: 'always' }),
    jelly: pipe({ layout: plJelly, vs: 'vs_jelly', fs: 'fs_jelly', buffers: jellyBuffers, cull: 'back', ms: true, depth: 'depth24plus' }),
    line: pipe({ vs: 'vs_line', fs: 'fs_line', topology: 'line-list', blend: ALPHA, ms: true, depth: 'depth24plus', dwrite: false, dcmp: 'always',
      buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] }),
    tone: pipe({ layout: plTone, vs: 'vs_full', fs: 'fs_tone', format }),
  };

  const mkTex = (w, h, fmt, usage, samples = 1) => device.createTexture({ size: [w, h], format: fmt, usage, sampleCount: samples });
  const RA = GPUT.RENDER_ATTACHMENT, TB = GPUT.TEXTURE_BINDING;
  const shadowDepthT = mkTex(1024, 1024, 'depth32float', RA | TB), shadowThickT = mkTex(1024, 1024, 'r16float', RA | TB);
  const heightT = mkTex(256, 256, 'r16float', RA | TB), heightDepthT = mkTex(256, 256, 'depth24plus', RA);
  const bgScene = device.createBindGroup({ layout: bglScene, entries: [
    { binding: 0, resource: shadowDepthT.createView() }, { binding: 1, resource: shadowThickT.createView() }, { binding: 2, resource: heightT.createView() }] });

  const passShadow = { colorAttachments: [{ view: shadowThickT.createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }],
    depthStencilAttachment: { view: shadowDepthT.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } };
  const passHeight = { colorAttachments: [{ view: heightT.createView(), clearValue: [9, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }],
    depthStencilAttachment: { view: heightDepthT.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } };
  let passScene, passBack, passJelly, passTone, bgJelly, bgTone, sized = [], W = 0, H = 0;

  function resize(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    for (const t of sized) t.destroy();
    const sceneMS = mkTex(w, h, HDR, RA, 4), sceneDepth = mkTex(w, h, 'depth24plus', RA, 4), sceneT = mkTex(w, h, HDR, RA | TB);
    const backT = mkTex(w, h, HDR, RA | TB), backDepth = mkTex(w, h, 'depth32float', RA);
    const hdrMS = mkTex(w, h, HDR, RA, 4), jellyDepth = mkTex(w, h, 'depth24plus', RA, 4), hdrT = mkTex(w, h, HDR, RA | TB);
    sized = [sceneMS, sceneDepth, sceneT, backT, backDepth, hdrMS, jellyDepth, hdrT];
    passScene = { colorAttachments: [{ view: sceneMS.createView(), resolveTarget: sceneT.createView(), clearValue: [0.4, 0.4, 0.4, 100], loadOp: 'clear', storeOp: 'discard' }],
      depthStencilAttachment: { view: sceneDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } };
    passBack = { colorAttachments: [{ view: backT.createView(), clearValue: [0, 0, 0, 0], loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: backDepth.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' } };
    passJelly = { colorAttachments: [{ view: hdrMS.createView(), resolveTarget: hdrT.createView(), clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'discard' }],
      depthStencilAttachment: { view: jellyDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' } };
    passTone = { colorAttachments: [{ view: null, clearValue: [0, 0, 0, 1], loadOp: 'clear', storeOp: 'store' }] };
    bgJelly = device.createBindGroup({ layout: bglJelly, entries: [
      { binding: 0, resource: shadowDepthT.createView() }, { binding: 1, resource: shadowThickT.createView() },
      { binding: 3, resource: sceneT.createView() }, { binding: 4, resource: backT.createView() }] });
    bgTone = device.createBindGroup({ layout: bglTone, entries: [{ binding: 5, resource: hdrT.createView() }] });
  }

  const scopeErr = await device.popErrorScope();
  if (scopeErr) throw new Error(scopeErr.message);
  device.lost.then(i => { if (i.reason !== 'destroyed') console.error('WebGPU device lost:', i.message); });

  function draw(showMesh, rp) {
    const q = device.queue;
    q.writeBuffer(ubuf, 0, uData);
    q.writeBuffer(jellyVB, 0, surf.vb);
    q.writeBuffer(instVB, 0, inc.data);
    if (showMesh) { lineF32.set(rp); q.writeBuffer(lineVB, 0, lineF32); }
    passTone.colorAttachments[0].view = ctx.getCurrentTexture().createView();
    const enc = device.createCommandEncoder();
    const jelly = (p) => { p.setVertexBuffer(0, jellyVB); p.setVertexBuffer(1, restVB); p.setIndexBuffer(jellyIB, 'uint32'); };
    let p = enc.beginRenderPass(passShadow);
    p.setBindGroup(0, g0); jelly(p);
    p.setPipeline(P.shadowDepth); p.drawIndexed(surf.idx.length);
    p.setPipeline(P.shadowThick); p.drawIndexed(surf.idx.length);
    p.end();
    p = enc.beginRenderPass(passHeight);
    p.setBindGroup(0, g0); jelly(p); p.setPipeline(P.height); p.drawIndexed(surf.idx.length); p.end();
    p = enc.beginRenderPass(passScene);
    p.setBindGroup(0, g0); p.setBindGroup(1, bgScene);
    p.setPipeline(P.cyc); p.setVertexBuffer(0, cycVB); p.setIndexBuffer(cycIB, 'uint32'); p.drawIndexed(cyc.i.length);
    p.setPipeline(P.cell); p.setVertexBuffer(0, sphVB); p.setVertexBuffer(1, instVB); p.setIndexBuffer(sphIB, 'uint32'); p.drawIndexed(sph.i.length, inc.n);
    p.end();
    p = enc.beginRenderPass(passBack);
    p.setBindGroup(0, g0); jelly(p); p.setPipeline(P.back); p.drawIndexed(surf.idx.length); p.end();
    p = enc.beginRenderPass(passJelly);
    p.setBindGroup(0, g0); p.setBindGroup(1, bgJelly);
    p.setPipeline(P.bg); p.draw(3);
    p.setPipeline(P.jelly); jelly(p); p.drawIndexed(surf.idx.length);
    if (showMesh) { p.setPipeline(P.line); p.setVertexBuffer(0, lineVB); p.setIndexBuffer(lineIB, 'uint32'); p.drawIndexed(sim.lines.length); }
    p.end();
    p = enc.beginRenderPass(passTone);
    p.setBindGroup(0, g0); p.setBindGroup(1, bgTone); p.setPipeline(P.tone); p.draw(3); p.end();
    q.submit([enc.finish()]);
  }
  return { device, uData, resize, draw };
}
