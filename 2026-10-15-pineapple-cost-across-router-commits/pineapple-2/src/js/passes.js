// Pipelines, bind groups and the per-frame pass order.
const P = {}, BG = {};
const SURF_LAYOUT = [
  { arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] },
  { arrayStride: 12, attributes: [{ shaderLocation: 2, offset: 0, format: 'float32x3' }] },
];
const POS_LAYOUT = [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }];

function shaderModule(...names) {
  return G.device.createShaderModule({ code: ['common', ...names].map(n => WGSL[n]).join('\n') });
}

function pipelinesInit() {
  const d = G.device, depth = (compare, write = true) => ({ format: 'depth32float', depthWriteEnabled: write, depthCompare: compare });
  const hdr = [{ format: 'rgba16float' }];
  const ms = { count: G.msaa };

  let m = shaderModule('shadow');
  P.shadow = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs', buffers: POS_LAYOUT },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: { ...depth('less'), depthBias: 2, depthBiasSlopeScale: 2 } });
  m = shaderModule('height');
  P.height = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs', buffers: POS_LAYOUT },
    primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: depth('less') });
  m = shaderModule('scene');
  P.floor = d.createRenderPipeline({ layout: 'auto',
    vertex: { module: m, entryPoint: 'vs', buffers: [{ arrayStride: 24, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }, { shaderLocation: 1, offset: 12, format: 'float32x3' }] }] },
    fragment: { module: m, entryPoint: 'fs', targets: hdr }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: depth('less'), multisample: ms });
  m = shaderModule('cells');
  P.cells = d.createRenderPipeline({ layout: 'auto',
    vertex: { module: m, entryPoint: 'vs', buffers: [
      { arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] },
      { arrayStride: 64, stepMode: 'instance', attributes: [0, 1, 2, 3].map(k => ({ shaderLocation: 1 + k, offset: k * 16, format: 'float32x4' })) }] },
    fragment: { module: m, entryPoint: 'fs', targets: hdr }, primitive: { topology: 'triangle-list', cullMode: 'none' }, depthStencil: depth('less'), multisample: ms });
  m = shaderModule('backface');
  P.back = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs', buffers: SURF_LAYOUT },
    fragment: { module: m, entryPoint: 'fs', targets: hdr }, primitive: { topology: 'triangle-list', cullMode: 'front' }, depthStencil: depth('less') });
  m = shaderModule('studio', 'jelly');
  P.jelly = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs', buffers: SURF_LAYOUT },
    fragment: { module: m, entryPoint: 'fs', targets: hdr }, primitive: { topology: 'triangle-list', cullMode: 'back' }, depthStencil: depth('less'), multisample: ms });
  m = shaderModule('overlay');
  P.overlay = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs', buffers: [{ arrayStride: 12, attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }] }] },
    fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: {
      color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }] },
    primitive: { topology: 'line-list' }, depthStencil: depth('always', false), multisample: ms });
  m = shaderModule('tonemap');
  P.tone = d.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' },
    fragment: { module: m, entryPoint: 'fs', targets: [{ format: G.format }] }, primitive: { topology: 'triangle-list' } });

  G.samp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  G.cmp = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' });
  const fb = { binding: 0, resource: { buffer: G.buf.frame } };
  const bg = (p, entries) => d.createBindGroup({ layout: p.getBindGroupLayout(0), entries });
  BG.shadow = bg(P.shadow, [fb]);
  BG.height = bg(P.height, [fb]);
  BG.floor = bg(P.floor, [fb, { binding: 1, resource: G.view.shadow }, { binding: 2, resource: G.cmp }, { binding: 3, resource: G.view.height }]);
  BG.cells = bg(P.cells, [fb]);
  BG.back = bg(P.back, [fb]);
  BG.overlay = bg(P.overlay, [fb]);
}

function bindGroupsResize() {
  const d = G.device, fb = { binding: 0, resource: { buffer: G.buf.frame } };
  BG.jelly = d.createBindGroup({ layout: P.jelly.getBindGroupLayout(0), entries: [fb,
    { binding: 1, resource: G.view.scene }, { binding: 2, resource: G.samp }, { binding: 3, resource: G.view.back }] });
  BG.tone = d.createBindGroup({ layout: P.tone.getBindGroupLayout(0), entries: [fb, { binding: 1, resource: G.view.hdr }] });
  PD.scene.colorAttachments[0].view = G.view.msColor;
  PD.scene.colorAttachments[0].resolveTarget = G.view.scene;
  PD.scene.depthStencilAttachment.view = G.view.msDepth;
  PD.back.colorAttachments[0].view = G.view.back;
  PD.back.depthStencilAttachment.view = G.view.backDepth;
  PD.jelly.colorAttachments[0].view = G.view.msColor;
  PD.jelly.colorAttachments[0].resolveTarget = G.view.hdr;
  PD.jelly.depthStencilAttachment.view = G.view.msDepth;
}

// Pass descriptors are built once and reused every frame.
const PD = {
  shadow: { colorAttachments: [], depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } },
  height: { colorAttachments: [], depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } },
  scene: { colorAttachments: [{ view: null, resolveTarget: null, clearValue: { r: 0.3, g: 0.3, b: 0.3, a: 1 }, loadOp: 'clear', storeOp: 'store' }],
    depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } },
  back: { colorAttachments: [{ view: null, clearValue: { r: 0, g: 0, b: 0, a: 0 }, loadOp: 'clear', storeOp: 'store' }],
    depthStencilAttachment: { view: null, depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } },
  jelly: { colorAttachments: [{ view: null, resolveTarget: null, loadOp: 'load', storeOp: 'discard' }],
    depthStencilAttachment: { view: null, depthLoadOp: 'load', depthStoreOp: 'discard' } },
  tone: { colorAttachments: [{ view: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] },
};

function passesInit() {
  PD.shadow.depthStencilAttachment.view = G.view.shadow;
  PD.height.depthStencilAttachment.view = G.view.height;
}

function drawSurf(pass, withRest) {
  pass.setVertexBuffer(0, G.buf.surfDyn);
  if (withRest) pass.setVertexBuffer(1, G.buf.surfRest);
  pass.setIndexBuffer(G.buf.surfIdx, 'uint32');
  pass.drawIndexed(G.counts.surf);
}

function renderFrame(showMesh) {
  const d = G.device, q = d.queue, B = G.buf;
  q.writeBuffer(B.frame, 0, FU);
  q.writeBuffer(B.surfDyn, 0, SKIN_DYN);
  q.writeBuffer(B.inst, 0, INST);
  if (showMesh) q.writeBuffer(B.particles, 0, XR);
  const enc = d.createCommandEncoder();

  let p = enc.beginRenderPass(PD.shadow);
  p.setPipeline(P.shadow); p.setBindGroup(0, BG.shadow); drawSurf(p, false); p.end();

  p = enc.beginRenderPass(PD.height);
  p.setPipeline(P.height); p.setBindGroup(0, BG.height); drawSurf(p, false); p.end();

  p = enc.beginRenderPass(PD.scene);
  p.setPipeline(P.floor); p.setBindGroup(0, BG.floor);
  p.setVertexBuffer(0, B.floorV); p.setIndexBuffer(B.floorI, 'uint32'); p.drawIndexed(G.counts.floor);
  p.setPipeline(P.cells); p.setBindGroup(0, BG.cells);
  p.setVertexBuffer(0, B.sphereV); p.setVertexBuffer(1, B.inst); p.setIndexBuffer(B.sphereI, 'uint32');
  p.drawIndexed(G.counts.sphere, G.counts.inst);
  p.end();

  p = enc.beginRenderPass(PD.back);
  p.setPipeline(P.back); p.setBindGroup(0, BG.back); drawSurf(p, true); p.end();

  p = enc.beginRenderPass(PD.jelly);
  p.setPipeline(P.jelly); p.setBindGroup(0, BG.jelly); drawSurf(p, true);
  if (showMesh) {
    p.setPipeline(P.overlay); p.setBindGroup(0, BG.overlay);
    p.setVertexBuffer(0, B.particles); p.setIndexBuffer(B.edges, 'uint32'); p.drawIndexed(G.counts.edges);
  }
  p.end();

  PD.tone.colorAttachments[0].view = G.context.getCurrentTexture().createView();
  p = enc.beginRenderPass(PD.tone);
  p.setPipeline(P.tone); p.setBindGroup(0, BG.tone); p.draw(3); p.end();

  SUBMIT[0] = enc.finish();
  q.submit(SUBMIT);
}
const SUBMIT = [null];
