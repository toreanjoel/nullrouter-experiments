// Pass 1: key-light shadow map (jelly thickness + nearest blocker depth).
const PassShadow = {
  init() {
    const m = makeModule(WGSL_SHADOW);
    const add = { srcFactor: 'one', dstFactor: 'one', operation: 'add' };
    const min = { srcFactor: 'one', dstFactor: 'one', operation: 'min' };
    this.pipe = G.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: m, entryPoint: 'vs', buffers: [SURF_POS_LAYOUT] },
      fragment: {
        module: m, entryPoint: 'fs',
        targets: [{ format: 'r16float', blend: { color: add, alpha: add } }, { format: 'r16float', blend: { color: min, alpha: min } }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none', frontFace: 'ccw' },
    });
    this.bg = uniformGroup(this.pipe);
    this.desc = {
      colorAttachments: [
        { view: G.view.shThick, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' },
        { view: G.view.shDepth, clearValue: { r: 1, g: 1, b: 1, a: 1 }, loadOp: 'clear', storeOp: 'store' },
      ],
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
