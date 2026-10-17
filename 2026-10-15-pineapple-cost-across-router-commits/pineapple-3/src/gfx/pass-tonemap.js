// Pass 6: tone map the HDR frame onto the canvas.
const PassTonemap = {
  init() {
    const m = makeModule(WGSL_TONEMAP);
    this.pipe = G.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: m, entryPoint: 'vs' },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format: G.format }] },
      primitive: { topology: 'triangle-list' },
    });
    this.bg0 = uniformGroup(this.pipe);
    this.desc = { colorAttachments: [{ view: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] };
  },
  resize() {
    this.bg1 = G.device.createBindGroup({ layout: this.pipe.getBindGroupLayout(1), entries: [{ binding: 0, resource: G.view.hdr }] });
  },
  encode(enc) {
    this.desc.colorAttachments[0].view = G.ctx.getCurrentTexture().createView();
    const p = enc.beginRenderPass(this.desc);
    p.setPipeline(this.pipe);
    p.setBindGroup(0, this.bg0);
    p.setBindGroup(1, this.bg1);
    p.draw(3);
    p.end();
  },
};
