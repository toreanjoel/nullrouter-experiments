// Mesh overlay: the physics surface edges as thin translucent lines.
//#include common

@group(0) @binding(0) var<uniform> F: Frame;
@group(0) @binding(1) var<storage, read> phys: array<vec4f>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  return F.viewProj * vec4f(phys[vi].xyz, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(0.12, 0.08, 0.04, 0.55);
}
