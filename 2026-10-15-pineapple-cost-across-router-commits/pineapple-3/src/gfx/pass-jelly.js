// Pass 5: the jelly (refraction + absorption), MSAA over the scene, plus the mesh overlay.
const PassJelly = {
  init() {
    const m = makeModule(WGSL_JELLY);
    this.pipe = G.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: m, entryPoint: 'vs', buffers: SURF_FULL_LAYOUT },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format: HDR_FORMAT }] },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
      multisample: { count: MSAA },
    });
    this.bg0 = uniformGroup(this.pipe);
    this.desc = {
      colorAttachments: [{ view: null, resolveTarget: null, loadOp: 'load', storeOp: 'discard' }],
      depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
    };
  },
  resize() {
    this.bg1 = G.device.createBindGroup({
      layout: this.pipe.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: G.view.scene },
        { binding: 1, resource: G.view.back },
        { binding: 2, resource: G.linSamp },
      ],
    });
    this.desc.colorAttachments[0].view = G.view.msaaColor;
    this.desc.colorAttachments[0].resolveTarget = G.view.hdr;
    this.desc.depthStencilAttachment.view = G.view.msaaDepth;
  },
  encode(enc, overlay) {
    const p = enc.beginRenderPass(this.desc);
    p.setPipeline(this.pipe);
    p.setBindGroup(0, this.bg0);
    p.setBindGroup(1, this.bg1);
    p.setVertexBuffer(0, G.surfVB);
    p.setVertexBuffer(1, G.surfRestVB);
    p.setIndexBuffer(G.surfIB, 'uint32');
    p.drawIndexed(G.surfCount);
    if (overlay) PassOverlay.draw(p);
    p.end();
  },
};
