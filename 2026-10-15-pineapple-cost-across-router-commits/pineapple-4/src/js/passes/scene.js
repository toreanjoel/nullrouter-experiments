// Scene pass (MSAA HDR): the studio cyclorama with the soft key shadow and contact AO, then the
// juice cells and bubbles riding inside the flesh. Resolved into the texture the jelly refracts.

// Floor sweeping up into a back wall: rows of (z, y, nz, ny), extruded along x.
function buildCyclorama() {
  const prof = [];
  for (const z of [16, 9, 5, 2.5, 0.5, -1.5, -3]) prof.push([z, 0, 0, 1]);
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2);
    prof.push([-3 - 3 * Math.sin(a), 3 - 3 * Math.cos(a), Math.sin(a), Math.cos(a)]);
  }
  prof.push([-6, 16, 1, 0]);
  const xs = [-18, -6, 0, 6, 18], nx = xs.length;
  const verts = new Float32Array(prof.length * nx * 6);
  let k = 0;
  for (const [z, y, nz, ny] of prof) for (const x of xs) { verts.set([x, y, z, 0, ny, nz], k); k += 6; }
  const index = [];
  for (let r = 0; r < prof.length - 1; r++) {
    for (let c = 0; c < nx - 1; c++) {
      const a = r * nx + c, b = a + 1, d = a + nx, e = d + 1;
      index.push(a, b, e, a, e, d);
    }
  }
  return { verts, index: Uint32Array.from(index) };
}

function buildSphere(nu, nv) {
  const pos = [], index = [];
  for (let j = 0; j <= nv; j++) {
    const t = (j / nv) * Math.PI;
    for (let i = 0; i <= nu; i++) {
      const p = (i / nu) * 2 * Math.PI;
      pos.push(Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p));
    }
  }
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + nu + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  return { verts: Float32Array.from(pos), index: Uint32Array.from(index) };
}

function createScenePass(R) {
  const d = GPU.device, VB = GPUBufferUsage.VERTEX, IB = GPUBufferUsage.INDEX;
  const cyc = buildCyclorama(), sph = buildSphere(18, 12);
  const cycVB = gpuBuffer(cyc.verts, VB), cycIB = gpuBuffer(cyc.index, IB), nCyc = cyc.index.length;
  const sphVB = gpuBuffer(sph.verts, VB), sphIB = gpuBuffer(sph.index, IB), nSph = sph.index.length;
  const shared = {
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    multisample: { count: MSAA },
  };
  const mScene = shaderModule('scene'), mCells = shaderModule('cells');
  const cycPipe = d.createRenderPipeline({
    label: 'cyclorama', layout: 'auto', ...shared,
    vertex: {
      module: mScene, entryPoint: 'vs',
      buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }],
    },
    fragment: { module: mScene, entryPoint: 'fs', targets: [{ format: HDR }] },
  });
  const cellPipe = d.createRenderPipeline({
    label: 'cells', layout: 'auto', ...shared,
    vertex: { module: mCells, entryPoint: 'vs', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
    fragment: { module: mCells, entryPoint: 'fs', targets: [{ format: HDR }] },
  });
  const cmp = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
  const cycBG = d.createBindGroup({
    layout: cycPipe.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: R.frameBuf } },
      { binding: 1, resource: R.shadowTex.createView() },
      { binding: 2, resource: cmp },
      { binding: 3, resource: R.heightTex.createView() },
    ],
  });
  const cellBG = d.createBindGroup({
    layout: cellPipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: R.frameBuf } }, { binding: 1, resource: { buffer: R.instBuf } }],
  });
  const desc = {
    colorAttachments: [{ view: null, resolveTarget: null, clearValue: { r: 0.4, g: 0.39, b: 0.37, a: 1 }, loadOp: 'clear', storeOp: 'discard' }],
    depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
  };
  return {
    resize() {
      desc.colorAttachments[0].view = GPU.v.sceneMS;
      desc.colorAttachments[0].resolveTarget = GPU.v.scene;
      desc.depthStencilAttachment.view = GPU.v.depthMS;
    },
    encode(enc) {
      const p = enc.beginRenderPass(desc);
      p.setPipeline(cycPipe); p.setBindGroup(0, cycBG);
      p.setVertexBuffer(0, cycVB); p.setIndexBuffer(cycIB, 'uint32'); p.drawIndexed(nCyc);
      p.setPipeline(cellPipe); p.setBindGroup(0, cellBG);
      p.setVertexBuffer(0, sphVB); p.setIndexBuffer(sphIB, 'uint32'); p.drawIndexed(nSph, R.nInst);
      p.end();
    },
  };
}
