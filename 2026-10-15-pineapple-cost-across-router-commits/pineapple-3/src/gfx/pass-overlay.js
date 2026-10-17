// Optional mesh overlay, drawn inside the jelly pass: tet edges as lines.
const PassOverlay = {
  init() {
    const m = makeModule(WGSL_OVERLAY);
    const blend = { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' };
    this.pipe = G.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: m, entryPoint: 'vs', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
      fragment: { module: m, entryPoint: 'fs', targets: [{ format: HDR_FORMAT, blend: { color: blend, alpha: blend } }] },
      primitive: { topology: 'line-list' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' },
      multisample: { count: MSAA },
    });
    this.bg = uniformGroup(this.pipe);
  },
  draw(p) {
    p.setPipeline(this.pipe);
    p.setBindGroup(0, this.bg);
    p.setVertexBuffer(0, G.physVB);
    p.setIndexBuffer(G.edgeIB, 'uint32');
    p.drawIndexed(G.edgeCount);
  },
};
