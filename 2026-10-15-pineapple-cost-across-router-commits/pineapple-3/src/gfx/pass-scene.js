// Pass 3: scene (cyclorama floor with shadow and AO, juice cells, bubbles), MSAA,
// resolved into the scene texture the jelly refracts.
const PassScene = {
  init() {
    const d = G.device;
    const m = makeModule(WGSL_SCENE);
    this.cyc = d.createRenderPipeline({
      layout: 'auto',
      vertex: { module: m, entryPoint: 'vs' },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'always' },
      multisample: { count: MSAA },
    });
    const mc = makeModule(WGSL_CELLS);
    this.cells = d.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mc, entryPoint: 'vs',
        buffers: [
          { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
          {
            arrayStride: 32, stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x3' },
              { shaderLocation: 2, offset: 12, format: 'float32x3' },
              { shaderLocation: 3, offset: 24, format: 'float32' },
              { shaderLocation: 4, offset: 28, format: 'float32' },
            ],
          },
        ],
      },
      fragment: { module: mc, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      multisample: { count: MSAA },
    });
    this.bg0 = uniformGroup(this.cyc);
    this.bg1 = d.createBindGroup({
      layout: this.cyc.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: G.view.shThick },
        { binding: 1, resource: G.view.shDepth },
        { binding: 2, resource: G.view.height },
        { binding: 3, resource: G.linSamp },
      ],
    });
    this.bgCells = uniformGroup(this.cells);
    this.desc = {
      colorAttachments: [{ view: null, resolveTarget: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    };
  },
  resize() {
    this.desc.colorAttachments[0].view = G.view.msaaColor;
    this.desc.colorAttachments[0].resolveTarget = G.view.scene;
    this.desc.depthStencilAttachment.view = G.view.msaaDepth;
  },
  encode(enc) {
    const p = enc.beginRenderPass(this.desc);
    p.setPipeline(this.cyc);
    p.setBindGroup(0, this.bg0);
    p.setBindGroup(1, this.bg1);
    p.draw(3);
    p.setPipeline(this.cells);
    p.setBindGroup(0, this.bgCells);
    p.setVertexBuffer(0, G.sphereVB);
    p.setVertexBuffer(1, G.instVB);
    p.setIndexBuffer(G.sphereIB, 'uint32');
    p.drawIndexed(G.sphereCount, G.instCount);
    p.end();
  },
};
