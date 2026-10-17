// Depth-only jelly surface for the shadow map and the height map (one view-projection per pass).
struct VP { m: mat4x4f };

@group(0) @binding(0) var<uniform> vp: VP;
@group(0) @binding(1) var<storage, read> skinPos: array<vec4f>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  return vp.m * vec4f(skinPos[vi].xyz, 1.0);
}
