// Back-face pass: distance from the camera to the jelly's nearest back face, for view-ray thickness.
function createBackPass(R) {
  const d = GPU.device, m = shaderModule('back');
  const pipe = d.createRenderPipeline({
    label: 'back', layout: 'auto',
    vertex: { module: m, entryPoint: 'vs' },
    fragment: { module: m, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list', cullMode: 'front' },
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
  });
  const bg = d.createBindGroup({
    layout: pipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: R.frameBuf } }, { binding: 1, resource: { buffer: R.skinPos } }],
  });
  const desc = {
    colorAttachments: [{ view: null, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
    depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
  };
  return {
    resize() {
      desc.colorAttachments[0].view = GPU.v.back;
      desc.depthStencilAttachment.view = GPU.v.backDepth;
    },
    encode(enc) {
      const p = enc.beginRenderPass(desc);
      p.setPipeline(pipe); p.setBindGroup(0, bg);
      p.setIndexBuffer(R.surfIdx, 'uint32'); p.drawIndexed(R.nIdx);
      p.end();
    },
  };
}
