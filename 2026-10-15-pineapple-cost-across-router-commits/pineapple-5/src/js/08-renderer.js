// WebGPU renderer: shadow map → height map → scene (MSAA) → jelly back faces → jelly (MSAA) + mesh overlay → tone map.
const HDR = 'rgba16float';
const MSAA = 4;
const SHADOW_SIZE = 2048, HEIGHT_SIZE = 256;
const SHADOW_EXT = 3.6, HEIGHT_EXT = 4, HEIGHT_EYE = 6;

async function initGPU(canvas) {
  if (!navigator.gpu) throw new Error('WebGPU is not available in this browser.');
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error('No suitable GPU adapter was found.');
  const device = await adapter.requestDevice();
  const ctx = canvas.getContext('webgpu');
  const format = navigator.gpu.getPreferredCanvasFormat();
  ctx.configure({ device, format, alphaMode: 'opaque' });
  return { device, ctx, format };
}

function createRenderer(gpu, S, I, B) {
  const { device, ctx, format } = gpu;
  const U = GPUBufferUsage, T = GPUTextureUsage, SS = GPUShaderStage;
  const buf = (data, usage) => {
    const b = device.createBuffer({ size: (data.byteLength + 3) & ~3, usage: usage | U.COPY_DST });
    device.queue.writeBuffer(b, 0, data);
    return b;
  };
  const mod = (code) => device.createShaderModule({ code });
  const common = WGSL.common;

  // Geometry.
  const cyc = buildCyclorama(), sph = buildSphere(16, 10);
  const surfDyn = buf(S.dyn, U.VERTEX), surfRest = buf(S.restPos, U.VERTEX), surfIdx = buf(S.idx, U.INDEX);
  const cyclVB = buf(cyc.verts, U.VERTEX), cycIB = buf(cyc.idx, U.INDEX);
  const sphVB = buf(sph.verts, U.VERTEX), sphIB = buf(sph.idx, U.INDEX);
  const cellVB = buf(I.data, U.VERTEX);
  const linePos = new Float32Array(B.nv * 4);
  const lineVB = buf(linePos, U.VERTEX), lineIB = buf(B.mesh.edges, U.INDEX);

  // Uniforms.
  const frameData = new Float32Array(76), frameUB = buf(frameData, U.UNIFORM);
  const shadowData = new Float32Array(24), shadowUB = buf(shadowData, U.UNIFORM);
  const heightData = new Float32Array(24), heightUB = buf(heightData, U.UNIFORM);
  const postData = new Float32Array(4), postUB = buf(postData, U.UNIFORM);

  const shadowTex = device.createTexture({ size: [SHADOW_SIZE, SHADOW_SIZE], format: HDR, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  const heightTex = device.createTexture({ size: [HEIGHT_SIZE, HEIGHT_SIZE], format: HDR, usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING });
  const linSamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

  // Layouts.
  const bglFrame = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: SS.VERTEX | SS.FRAGMENT, buffer: { type: 'uniform' } },
    { binding: 1, visibility: SS.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 2, visibility: SS.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 3, visibility: SS.FRAGMENT, sampler: { type: 'filtering' } },
  ] });
  const bglJelly = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: SS.FRAGMENT, texture: { sampleType: 'float' } },
    { binding: 1, visibility: SS.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
  ] });
  const bglPass = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.VERTEX, buffer: { type: 'uniform' } }] });
  const bglPost = device.createBindGroupLayout({ entries: [
    { binding: 0, visibility: SS.FRAGMENT, buffer: { type: 'uniform' } },
    { binding: 1, visibility: SS.FRAGMENT, texture: { sampleType: 'float' } },
  ] });
  const layout = (...bgls) => device.createPipelineLayout({ bindGroupLayouts: bgls });

  const frameBG = device.createBindGroup({ layout: bglFrame, entries: [
    { binding: 0, resource: { buffer: frameUB } },
    { binding: 1, resource: shadowTex.createView() },
    { binding: 2, resource: heightTex.createView() },
    { binding: 3, resource: linSamp },
  ] });
  const shadowBG = device.createBindGroup({ layout: bglPass, entries: [{ binding: 0, resource: { buffer: shadowUB } }] });
  const heightBG = device.createBindGroup({ layout: bglPass, entries: [{ binding: 0, resource: { buffer: heightUB } }] });

  // Vertex layouts.
  const posOnly = [{ arrayStride: SURF_STRIDE * 4, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }];
  const surfLayout = [
    { arrayStride: SURF_STRIDE * 4, attributes: [
      { shaderLocation: 0, offset: 0, format: 'float32x4' },
      { shaderLocation: 1, offset: 16, format: 'float32x4' },
      { shaderLocation: 2, offset: 32, format: 'float32x4' },
    ] },
    { arrayStride: 16, attributes: [{ shaderLocation: 3, offset: 0, format: 'float32x4' }] },
  ];
  const depthMS = { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' };

  const pipe = (code, layoutObj, buffers, targets, extra) => {
    const m = mod(code);
    return device.createRenderPipeline(Object.assign({
      layout: layoutObj,
      vertex: { module: m, entryPoint: 'vs', buffers },
      fragment: { module: m, entryPoint: 'fs', targets },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    }, extra));
  };

  const depthmapPipe = pipe(WGSL.depthmap, layout(bglPass), posOnly, [{
    format: HDR,
    blend: { color: { operation: 'min', srcFactor: 'one', dstFactor: 'one' }, alpha: { operation: 'max', srcFactor: 'one', dstFactor: 'one' } },
  }], {});
  const cycPipe = pipe(common + WGSL.cyc, layout(bglFrame), [{ arrayStride: 24, attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' },
  ] }], [{ format: HDR }], { depthStencil: depthMS, multisample: { count: MSAA } });
  const cellPipe = pipe(common + WGSL.cells, layout(bglFrame), [
    { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
    { arrayStride: CELL_STRIDE * 4, stepMode: 'instance', attributes: [
      { shaderLocation: 1, offset: 0, format: 'float32x4' }, { shaderLocation: 2, offset: 16, format: 'float32x4' },
    ] },
  ], [{ format: HDR }], { depthStencil: depthMS, multisample: { count: MSAA } });
  const backPipe = pipe(common + WGSL.backface, layout(bglFrame), posOnly, [{ format: 'r32float' }], {
    depthStencil: depthMS, primitive: { topology: 'triangle-list', cullMode: 'front' },
  });
  const jellyPipe = pipe(common + WGSL.jelly, layout(bglFrame, bglJelly), surfLayout, [{ format: HDR }], {
    depthStencil: depthMS, multisample: { count: MSAA }, primitive: { topology: 'triangle-list', cullMode: 'back' },
  });
  const linePipe = pipe(common + WGSL.lines, layout(bglFrame), [{ arrayStride: 16, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x4' }] }], [{
    format: HDR,
    blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } },
  }], {
    depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
    multisample: { count: MSAA }, primitive: { topology: 'line-list' },
  });
  const tonePipe = pipe(WGSL.tonemap, layout(bglPost), [], [{ format }], {});

  // Size-dependent targets.
  const MAP_CLEAR = { r: 1000, g: 1000, b: 1000, a: 0 };
  const BG = { r: 0.3, g: 0.29, b: 0.28, a: 1 }, ZERO = { r: 0, g: 0, b: 0, a: 0 };
  const mapDesc = (t) => ({ colorAttachments: [{ view: t.createView(), clearValue: MAP_CLEAR, loadOp: 'clear', storeOp: 'store' }] });
  const shadowDesc = mapDesc(shadowTex), heightDesc = mapDesc(heightTex);
  const toneDesc = { colorAttachments: [{ view: null, clearValue: BG, loadOp: 'clear', storeOp: 'store' }] };
  const submitList = [null];
  let W = 0, H = 0, tex = null, jellyBG = null, postBG = null, sceneDesc = null, backDesc = null, jellyDesc = null;
  function resize(w, h) {
    if (w === W && h === H) return;
    W = w; H = h;
    if (tex) for (const t of Object.values(tex)) t.destroy();
    const mk = (format, usage, sampleCount = 1) => device.createTexture({ size: [w, h], format, usage, sampleCount });
    tex = {
      msColor: mk(HDR, T.RENDER_ATTACHMENT, MSAA),
      msDepth: mk('depth24plus', T.RENDER_ATTACHMENT, MSAA),
      scene: mk(HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING),
      back: mk('r32float', T.RENDER_ATTACHMENT | T.TEXTURE_BINDING),
      backDepth: mk('depth24plus', T.RENDER_ATTACHMENT),
      final: mk(HDR, T.RENDER_ATTACHMENT | T.TEXTURE_BINDING),
    };
    jellyBG = device.createBindGroup({ layout: bglJelly, entries: [
      { binding: 0, resource: tex.scene.createView() }, { binding: 1, resource: tex.back.createView() },
    ] });
    postBG = device.createBindGroup({ layout: bglPost, entries: [
      { binding: 0, resource: { buffer: postUB } }, { binding: 1, resource: tex.final.createView() },
    ] });
    // Pass descriptors are built once per size and reused every frame.
    const msColor = tex.msColor.createView(), msDepth = tex.msDepth.createView();
    sceneDesc = {
      colorAttachments: [{ view: msColor, resolveTarget: tex.scene.createView(), clearValue: BG, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: msDepth, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    };
    backDesc = {
      colorAttachments: [{ view: tex.back.createView(), clearValue: ZERO, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: tex.backDepth.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' },
    };
    jellyDesc = {
      colorAttachments: [{ view: msColor, resolveTarget: tex.final.createView(), loadOp: 'load', storeOp: 'store' }],
      depthStencilAttachment: { view: msDepth, depthLoadOp: 'load', depthStoreOp: 'discard' },
    };
  }

  // Camera and light matrices (all preallocated).
  const view = M4.create(), proj = M4.create(), vp = M4.create();
  const lv = M4.create(), lp = M4.create(), hv = M4.create(), hp = M4.create();
  const eye = [0, 0, 0], at = [0, 0, 0], lat = [0, 0, 0], leye = [0, 0, 0], heye = [0, 0, 0];
  const UP = [0, 1, 0], NORTH = [0, 0, -1];
  const lightDir = (() => { const l = [-0.55, 1.0, 0.5], n = Math.hypot(...l); return l.map((v) => v / n); })();
  const invVP = M4.create();
  const centroid = new Float64Array(3);

  const cam = { yaw: 0.0, pitch: 0.62, dist: 6.2, target: [0, 0.35, 0], right: [1, 0, 0], fwd: [0, 0, -1], eye };

  function updateCamera(aspect) {
    const cp = Math.cos(cam.pitch);
    eye[0] = cam.target[0] + Math.sin(cam.yaw) * cp * cam.dist;
    eye[1] = cam.target[1] + Math.sin(cam.pitch) * cam.dist;
    eye[2] = cam.target[2] + Math.cos(cam.yaw) * cp * cam.dist;
    at[0] = cam.target[0]; at[1] = cam.target[1]; at[2] = cam.target[2];
    M4.lookAt(view, eye, at, UP);
    M4.perspective(proj, aspect < 1 ? 0.95 : 0.62, aspect, 0.1, 80);
    M4.mul(vp, proj, view);
    M4.invert(invVP, vp);
    cam.right[0] = view[0]; cam.right[1] = view[4]; cam.right[2] = view[8];
    cam.fwd[0] = -view[2]; cam.fwd[1] = -view[6]; cam.fwd[2] = -view[10];
  }

  // Ray through a canvas pixel (CSS px) → origin o, unit direction d.
  function rayAt(px, py, cw, ch, o, d) {
    const nx = (px / cw) * 2 - 1, ny = 1 - (py / ch) * 2;
    const m = invVP;
    const unproj = (z, out) => {
      const x = m[0] * nx + m[4] * ny + m[8] * z + m[12], y = m[1] * nx + m[5] * ny + m[9] * z + m[13];
      const zz = m[2] * nx + m[6] * ny + m[10] * z + m[14], w = m[3] * nx + m[7] * ny + m[11] * z + m[15];
      out[0] = x / w; out[1] = y / w; out[2] = zz / w;
    };
    unproj(0, o); unproj(1, d);
    d[0] -= o[0]; d[1] -= o[1]; d[2] -= o[2];
    const l = Math.hypot(d[0], d[1], d[2]); d[0] /= l; d[1] /= l; d[2] /= l;
  }

  function writeFrame(tint, time, exposure, showMesh) {
    bodyCentroid(B, centroid);
    const cx = centroid[0], cz = centroid[2];
    leye[0] = cx + lightDir[0] * 10; leye[1] = lightDir[1] * 10; leye[2] = cz + lightDir[2] * 10;
    lat[0] = cx; lat[1] = 0; lat[2] = cz;
    M4.lookAt(lv, leye, lat, UP);
    M4.ortho(lp, -SHADOW_EXT, SHADOW_EXT, -SHADOW_EXT, SHADOW_EXT, 0.1, 30);
    M4.mul(lp, lp, lv);
    heye[0] = cx; heye[1] = HEIGHT_EYE; heye[2] = cz;
    M4.lookAt(hv, heye, lat, NORTH);
    M4.ortho(hp, -HEIGHT_EXT, HEIGHT_EXT, -HEIGHT_EXT, HEIGHT_EXT, 0.1, 20);
    M4.mul(hp, hp, hv);

    const f = frameData;
    f.set(vp, 0); f.set(lp, 16); f.set(hp, 32);
    f[48] = eye[0]; f[49] = eye[1]; f[50] = eye[2]; f[51] = 1;
    f[52] = lightDir[0]; f[53] = lightDir[1]; f[54] = lightDir[2]; f[55] = 0;
    f[56] = leye[0]; f[57] = leye[1]; f[58] = leye[2]; f[59] = 1;
    f[60] = tint.absorb[0]; f[61] = tint.absorb[1]; f[62] = tint.absorb[2]; f[63] = 1;
    f[64] = tint.color[0]; f[65] = tint.color[1]; f[66] = tint.color[2]; f[67] = 1;
    f[68] = time; f[69] = exposure; f[70] = W; f[71] = H;
    f[72] = HEIGHT_EYE; f[73] = HEIGHT_EXT; f[74] = showMesh ? 1 : 0; f[75] = 0;
    device.queue.writeBuffer(frameUB, 0, f);

    shadowData.set(lp, 0);
    shadowData[16] = leye[0]; shadowData[17] = leye[1]; shadowData[18] = leye[2]; shadowData[19] = 1;
    shadowData[20] = -lightDir[0]; shadowData[21] = -lightDir[1]; shadowData[22] = -lightDir[2]; shadowData[23] = 0;
    device.queue.writeBuffer(shadowUB, 0, shadowData);
    heightData.set(hp, 0);
    heightData[16] = heye[0]; heightData[17] = heye[1]; heightData[18] = heye[2]; heightData[19] = 1;
    heightData[20] = 0; heightData[21] = -1; heightData[22] = 0; heightData[23] = 0;
    device.queue.writeBuffer(heightUB, 0, heightData);
    postData[0] = exposure; postData[1] = time % 64;
    device.queue.writeBuffer(postUB, 0, postData);
  }

  function render(opts) {
    updateCamera(W / H);
    writeFrame(opts.tint, opts.time, opts.exposure, opts.showMesh);
    device.queue.writeBuffer(surfDyn, 0, S.dyn);
    device.queue.writeBuffer(cellVB, 0, I.data);
    if (opts.showMesh) {
      for (let i = 0; i < B.nv; i++) {
        linePos[4 * i] = B.x[3 * i]; linePos[4 * i + 1] = B.x[3 * i + 1]; linePos[4 * i + 2] = B.x[3 * i + 2]; linePos[4 * i + 3] = 1;
      }
      device.queue.writeBuffer(lineVB, 0, linePos);
    }
    const enc = device.createCommandEncoder();
    const nIdx = S.idx.length;

    let p = enc.beginRenderPass(shadowDesc);
    p.setPipeline(depthmapPipe); p.setBindGroup(0, shadowBG);
    p.setVertexBuffer(0, surfDyn); p.setIndexBuffer(surfIdx, 'uint32'); p.drawIndexed(nIdx);
    p.end();
    p = enc.beginRenderPass(heightDesc);
    p.setPipeline(depthmapPipe); p.setBindGroup(0, heightBG);
    p.setVertexBuffer(0, surfDyn); p.setIndexBuffer(surfIdx, 'uint32'); p.drawIndexed(nIdx);
    p.end();

    p = enc.beginRenderPass(sceneDesc);
    p.setBindGroup(0, frameBG);
    p.setPipeline(cycPipe); p.setVertexBuffer(0, cyclVB); p.setIndexBuffer(cycIB, 'uint32'); p.drawIndexed(cyc.idx.length);
    p.setPipeline(cellPipe); p.setVertexBuffer(0, sphVB); p.setVertexBuffer(1, cellVB); p.setIndexBuffer(sphIB, 'uint16');
    p.drawIndexed(sph.idx.length, I.n);
    p.end();

    p = enc.beginRenderPass(backDesc);
    p.setPipeline(backPipe); p.setBindGroup(0, frameBG);
    p.setVertexBuffer(0, surfDyn); p.setIndexBuffer(surfIdx, 'uint32'); p.drawIndexed(nIdx);
    p.end();

    p = enc.beginRenderPass(jellyDesc);
    p.setPipeline(jellyPipe); p.setBindGroup(0, frameBG); p.setBindGroup(1, jellyBG);
    p.setVertexBuffer(0, surfDyn); p.setVertexBuffer(1, surfRest); p.setIndexBuffer(surfIdx, 'uint32'); p.drawIndexed(nIdx);
    if (opts.showMesh) {
      p.setPipeline(linePipe); p.setBindGroup(0, frameBG);
      p.setVertexBuffer(0, lineVB); p.setIndexBuffer(lineIB, 'uint32'); p.drawIndexed(B.mesh.edges.length);
    }
    p.end();

    toneDesc.colorAttachments[0].view = ctx.getCurrentTexture().createView();
    p = enc.beginRenderPass(toneDesc);
    p.setPipeline(tonePipe); p.setBindGroup(0, postBG); p.draw(3);
    p.end();
    submitList[0] = enc.finish();
    device.queue.submit(submitList);
  }

  return { resize, render, rayAt, cam, updateCamera: () => updateCamera(W / H) };
}
