// Depth-only passes: the key-light shadow map and the vertical height map (lowest jelly surface
// above each floor point, seen from under the floor) used for contact AO.
const SHADOW_SIZE = 2048, HEIGHT_SIZE = 256;

function createDepthPasses(R) {
  const d = GPU.device;
  const RA = GPUTextureUsage.RENDER_ATTACHMENT, TB = GPUTextureUsage.TEXTURE_BINDING;
  const pipe = d.createRenderPipeline({
    label: 'depth', layout: 'auto',
    vertex: { module: shaderModule('depth'), entryPoint: 'vs' },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
    depthStencil: { format: 'depth32float', depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 2 },
  });
  R.shadowTex = d.createTexture({ size: [SHADOW_SIZE, SHADOW_SIZE], format: 'depth32float', usage: RA | TB });
  R.heightTex = d.createTexture({ size: [HEIGHT_SIZE, HEIGHT_SIZE], format: 'depth32float', usage: RA | TB });
  const mk = (tex, vpBuf) => ({
    bg: d.createBindGroup({
      layout: pipe.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: vpBuf } }, { binding: 1, resource: { buffer: R.skinPos } }],
    }),
    desc: { colorAttachments: [], depthStencilAttachment: { view: tex.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } },
  });
  const passes = [mk(R.shadowTex, R.shadowVPBuf), mk(R.heightTex, R.heightVPBuf)];
  return {
    encode(enc) {
      for (let i = 0; i < passes.length; i++) {
        const rp = enc.beginRenderPass(passes[i].desc);
        rp.setPipeline(pipe); rp.setBindGroup(0, passes[i].bg);
        rp.setIndexBuffer(R.surfIdx, 'uint32'); rp.drawIndexed(R.nIdx);
        rp.end();
      }
    },
  };
}
