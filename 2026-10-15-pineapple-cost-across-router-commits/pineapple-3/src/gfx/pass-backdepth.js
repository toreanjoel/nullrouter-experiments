// Pass 4: jelly back faces → distance to the exit surface (for view-ray thickness).
const PassBack = {
  init() {
    const m = makeModule(WGSL_BACK);
    this.pipe = G.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: m, entryPoint: 'vs', buffers: [SURF_POS_LAYOUT] },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'r16float' }] },
      primitive: { topology: 'triangle-list', cullMode: 'front', frontFace: 'ccw' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    });
    this.bg = uniformGroup(this.pipe);
    this.desc = {
      colorAttachments: [{ view: null, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
      depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    };
  },
  resize() {
    this.desc.colorAttachments[0].view = G.view.back;
    this.desc.depthStencilAttachment.view = G.view.backDepth;
  },
  encode(enc) {
    const p = enc.beginRenderPass(this.desc);
    p.setPipeline(this.pipe);
    p.setBindGroup(0, this.bg);
    p.setVertexBuffer(0, G.surfVB);
    p.setIndexBuffer(G.surfIB, 'uint32');
    p.drawIndexed(G.surfCount);
    p.end();
  },
};
