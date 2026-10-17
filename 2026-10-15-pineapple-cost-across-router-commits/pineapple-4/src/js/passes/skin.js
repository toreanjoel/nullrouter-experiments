// Compute pass: skin the bevelled surface onto the tets, then rebuild its normals from the grid.
function createSkinPass(R) {
  const d = GPU.device;
  const skin = d.createComputePipeline({ label: 'skin', layout: 'auto', compute: { module: shaderModule('skin'), entryPoint: 'skin' } });
  const nrm = d.createComputePipeline({ label: 'normals', layout: 'auto', compute: { module: shaderModule('normals'), entryPoint: 'normals' } });
  const bgSkin = d.createBindGroup({
    layout: skin.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: R.physBuf } },
      { binding: 1, resource: { buffer: R.tetBuf } },
      { binding: 2, resource: { buffer: R.embedBuf } },
      { binding: 3, resource: { buffer: R.skinPos } },
    ],
  });
  const bgNrm = d.createBindGroup({
    layout: nrm.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: R.frameBuf } },
      { binding: 1, resource: { buffer: R.skinPos } },
      { binding: 2, resource: { buffer: R.skinNrm } },
    ],
  });
  const groups = Math.ceil(R.nV / 64);
  return {
    encode(enc) {
      const p = enc.beginComputePass();
      p.setPipeline(skin); p.setBindGroup(0, bgSkin); p.dispatchWorkgroups(groups);
      p.setPipeline(nrm); p.setBindGroup(0, bgNrm); p.dispatchWorkgroups(groups);
      p.end();
    },
  };
}
