// Pass 2: top-down height map of the jelly for contact AO.
const PassHeight = {
  init() {
    const m = makeModule(WGSL_HEIGHT);
    const min = { srcFactor: 'one', dstFactor: 'one', operation: 'min' };
    this.pipe = G.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: m, entryPoint: 'vs', buffers: [SURF_POS_LAYOUT] },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'r16float', blend: { color: min, alpha: min } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
    });
    this.bg = uniformGroup(this.pipe);
    this.desc = {
      colorAttachments: [{ view: G.view.height, clearValue: { r: 100, g: 100, b: 100, a: 100 }, loadOp: 'clear', storeOp: 'store' }],
    };
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
