// Tone-map pass: exposure, Khronos PBR Neutral, sRGB encode and dither, straight to the canvas.
function createTonemapPass(R) {
  const d = GPU.device, m = shaderModule('tonemap');
  const pipe = d.createRenderPipeline({
    label: 'tonemap', layout: 'auto',
    vertex: { module: m, entryPoint: 'vs' },
    fragment: { module: m, entryPoint: 'fs', targets: [{ format: GPU.format }] },
    primitive: { topology: 'triangle-list' },
  });
  let bg = null;
  const desc = { colorAttachments: [{ view: null, clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: 'clear', storeOp: 'store' }] };
  return {
    resize() {
      bg = d.createBindGroup({
        layout: pipe.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: R.frameBuf } }, { binding: 1, resource: GPU.v.hdr }],
      });
    },
    encode(enc) {
      desc.colorAttachments[0].view = GPU.context.getCurrentTexture().createView();
      const p = enc.beginRenderPass(desc);
      p.setPipeline(pipe); p.setBindGroup(0, bg); p.draw(3);
      p.end();
    },
  };
}
