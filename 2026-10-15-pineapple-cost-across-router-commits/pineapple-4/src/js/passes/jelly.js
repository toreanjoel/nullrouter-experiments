// Jelly pass (MSAA HDR): copy the resolved scene in, draw the jelly (refraction, absorption, glow,
// reflections) over it, then the optional mesh overlay. Resolved into the HDR texture for tone mapping.
function createJellyPass(R) {
  const d = GPU.device;
  const depthOff = { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' };
  const ms = { count: MSAA };
  const mBlit = shaderModule('blit'), mJelly = shaderModule('jelly'), mLine = shaderModule('overlay');
  const blitPipe = d.createRenderPipeline({
    label: 'blit', layout: 'auto', multisample: ms, depthStencil: depthOff,
    vertex: { module: mBlit, entryPoint: 'vs' },
    fragment: { module: mBlit, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list' },
  });
  const jellyPipe = d.createRenderPipeline({
    label: 'jelly', layout: 'auto', multisample: ms,
    depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' },
    vertex: { module: mJelly, entryPoint: 'vs' },
    fragment: { module: mJelly, entryPoint: 'fs', targets: [{ format: HDR }] },
    primitive: { topology: 'triangle-list', cullMode: 'back' },
  });
  const linePipe = d.createRenderPipeline({
    label: 'overlay', layout: 'auto', multisample: ms, depthStencil: depthOff,
    vertex: { module: mLine, entryPoint: 'vs' },
    fragment: {
      module: mLine, entryPoint: 'fs',
      targets: [{ format: HDR, blend: { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }],
    },
    primitive: { topology: 'line-list' },
  });
  const samp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const lineBG = d.createBindGroup({
    layout: linePipe.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: R.frameBuf } }, { binding: 1, resource: { buffer: R.physBuf } }],
  });
  let blitBG = null, jellyBG = null;
  const desc = {
    colorAttachments: [{ view: null, resolveTarget: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'discard' }],
    depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'discard' },
  };
  return {
    resize() {
      blitBG = d.createBindGroup({ layout: blitPipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: GPU.v.scene }] });
      jellyBG = d.createBindGroup({
        layout: jellyPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: R.frameBuf } },
          { binding: 1, resource: { buffer: R.skinPos } },
          { binding: 2, resource: { buffer: R.skinNrm } },
          { binding: 3, resource: { buffer: R.restBuf } },
          { binding: 4, resource: GPU.v.scene },
          { binding: 5, resource: GPU.v.back },
          { binding: 6, resource: samp },
        ],
      });
      desc.colorAttachments[0].view = GPU.v.jellyMS;
      desc.colorAttachments[0].resolveTarget = GPU.v.hdr;
      desc.depthStencilAttachment.view = GPU.v.depthMS;
    },
    encode(enc, showMesh) {
      const p = enc.beginRenderPass(desc);
      p.setPipeline(blitPipe); p.setBindGroup(0, blitBG); p.draw(3);
      p.setPipeline(jellyPipe); p.setBindGroup(0, jellyBG);
      p.setIndexBuffer(R.surfIdx, 'uint32'); p.drawIndexed(R.nIdx);
      if (showMesh) {
        p.setPipeline(linePipe); p.setBindGroup(0, lineBG);
        p.setIndexBuffer(R.edgeIdx, 'uint32'); p.drawIndexed(R.nEdgeIdx);
      }
      p.end();
    },
  };
}
